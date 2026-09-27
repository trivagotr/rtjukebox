import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const databaseUrlSchema = z.string().url();

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  HEALTHCHECK_TOKEN: z.string().min(32).optional(),
  JWT_ISSUER: z.string().min(1).default('radiotedu-api'),
  JWT_AUDIENCE: z.string().min(1).default('radiotedu-client'),
  JWT_ALLOW_LEGACY_TOKENS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  RADIO_STREAM_URL: z.string().url().optional(),
  UPLOAD_DIRECTORY: z.string().trim().min(1).default('./uploads'),
  FFPROBE_PATH: z.string().trim().min(1).default('ffprobe'),
  SPOTIFY_CLIENT_ID: z.string().trim().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().trim().optional(),
  SPOTIFY_REDIRECT_URI: z.string().url().optional(),
  SPOTIFY_ENCRYPTION_KEY: z.string().min(32).optional(),
  PUBLIC_BASE_PATH: z.string().default('/jukebox').transform((value) => {
    const normalized = value.trim();
    if (!normalized || normalized === '/') return '';
    return `/${normalized.replace(/^\/+|\/+$/g, '')}`;
  }),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  return environmentSchema.parse(process.env);
}

export function getDatabaseUrl(): string {
  return databaseUrlSchema.parse(process.env.DATABASE_URL);
}
