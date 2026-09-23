const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const DEFAULT_SCHEMA_SQL_PATH = path.resolve(process.cwd(), 'src/db/schema.sql');

function resolveSchemaSqlPath(schemaPath = process.env.SCHEMA_SQL_PATH || DEFAULT_SCHEMA_SQL_PATH) {
    return path.resolve(schemaPath);
}

function loadSchemaSql(schemaPath = resolveSchemaSqlPath()) {
    return fs.readFileSync(schemaPath, 'utf8');
}

async function applySchemaSql(client, schemaSql) {
    await client.query("SET client_encoding TO 'UTF8'");
    await client.query('BEGIN');

    try {
        // The bootstrap schema is intentionally idempotent and owns all table creation.
        await client.query(schemaSql);
        await client.query('COMMIT');
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // Ignore rollback failures and surface the original error.
        }

        throw error;
    }
}

function createMigrationPool() {
    const connectionString = process.env.DATABASE_URL || '';
    if (connectionString.includes('neon.tech')) {
        const { Pool: NeonPool, neonConfig } = require('@neondatabase/serverless');
        const ws = require('ws');
        neonConfig.webSocketConstructor = globalThis.WebSocket || ws;
        return new NeonPool({ connectionString });
    }
    return new Pool({
        connectionString,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
}

async function runSchemaMigration(options = {}) {
    const ownsPool = !options.pool;
    const pool = options.pool || createMigrationPool();
    const logger = options.logger || console;
    const schemaPath = resolveSchemaSqlPath(options.schemaPath);

    logger.log('Starting database migration...');
    logger.log(`--- Applying schema from ${schemaPath} ---`);

    const client = await pool.connect();

    try {
        const schemaSql = loadSchemaSql(schemaPath);
        await applySchemaSql(client, schemaSql);
        logger.log('Schema migration completed successfully.');
    } finally {
        client.release();
        if (ownsPool) {
            await pool.end().catch(() => undefined);
        }
    }
}

async function main() {
    await runSchemaMigration();
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = {
    DEFAULT_SCHEMA_SQL_PATH,
    resolveSchemaSqlPath,
    loadSchemaSql,
    applySchemaSql,
    runSchemaMigration,
    main,
};
