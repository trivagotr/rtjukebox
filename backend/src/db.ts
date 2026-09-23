import { Pool as PgPool } from 'pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

function createPool(): any {
    const connectionString = process.env.DATABASE_URL || '';
    if (connectionString.includes('neon.tech')) {
        neonConfig.webSocketConstructor = globalThis.WebSocket || ws;
        return new NeonPool({ connectionString });
    }
    return new PgPool({
        connectionString,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
}

const pool = createPool();

export const db = {
    query: (text: string, params?: any[]) => pool.query(text, params),
    pool,
};
