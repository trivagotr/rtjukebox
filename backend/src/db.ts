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
    async transaction<T>(work: (client: { query: (text: string, params?: any[]) => Promise<any> }) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // Preserve the original operation error.
            }
            throw error;
        } finally {
            client.release();
        }
    },
};
