import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

export const db = {
    query: (text: string, params?: any[]) => pool.query(text, params),
    pool,
};
