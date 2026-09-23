import { spawnSync } from 'node:child_process';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { createClient } from 'redis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const containersEnabled = process.env.RUN_TESTCONTAINERS === '1';

describe.skipIf(!containersEnabled)('Postgres and Redis API integration', () => {
  let postgres: StartedTestContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let app: (typeof import('../server'))['app'];
  let databasePool: (typeof import('../db'))['db']['pool'];

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'radiotedu_test',
        POSTGRES_USER: 'radiotedu_test',
        POSTGRES_PASSWORD: 'radiotedu_test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
      .start();

    redis = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start();

    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'integration-test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'integration-test-refresh-secret';
    process.env.CORS_ORIGINS = 'http://controller.test,http://kiosk.test';
    process.env.DATABASE_URL = `postgres://radiotedu_test:radiotedu_test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/radiotedu_test`;
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;

    const migration = spawnSync(process.execPath, ['src/db/migrate.js'], {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
    });
    if (migration.status !== 0) {
      throw new Error(`Database migration failed: ${migration.stderr || migration.stdout || migration.error?.message}`);
    }

    const [{ app: apiApp }, { db }] = await Promise.all([
      import('../server'),
      import('../db'),
    ]);
    app = apiApp;
    databasePool = db.pool;

    const redisClient = createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
    expect(await redisClient.ping()).toBe('PONG');
    await redisClient.quit();
  }, 120_000);

  afterAll(async () => {
    await databasePool?.end();
    await Promise.all([postgres?.stop(), redis?.stop()]);
  }, 30_000);

  it('serves health and applies the configured CORS origin', async () => {
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const preflight = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://controller.test')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://controller.test');
  });

  it('registers a user in Postgres and authenticates the returned token', async () => {
    const email = `integration-${Date.now()}@radiotedu.com`;
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: 'integration-pass-123', display_name: 'Integration User' });

    expect(registration.status).toBe(201);
    expect(registration.body.success).toBe(true);
    expect(registration.body.data.user.email).toBe(email);
    expect(registration.body.data.user).not.toHaveProperty('password_hash');

    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registration.body.data.access_token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.email).toBe(email);
  });

  it('creates a guest account and enforces auth and role checks over HTTP', async () => {
    const guest = await request(app)
      .post('/api/v1/auth/guest')
      .send({ display_name: 'Integration Guest' });

    expect(guest.status).toBe(201);
    expect(guest.body.data.user.role).toBe('guest');
    expect(guest.body.data.user).not.toHaveProperty('password_hash');

    const anonymousProfile = await request(app).get('/api/v1/profile');
    expect(anonymousProfile.status).toBe(401);

    const forbiddenAdminAction = await request(app)
      .post('/api/v1/podcast-feeds')
      .set('Authorization', `Bearer ${guest.body.data.access_token}`)
      .send({ feed_url: 'https://example.com/feed.xml' });
    expect(forbiddenAdminAction.status).toBe(403);
  });
});
