import 'dotenv/config';
import { Pool, PoolClient } from 'pg';
import { normalizeText } from '../utils/textNormalization';

const SUSPICIOUS_PATTERN = /[\u00C2\u00C3\u00C4\u00C5\u00E2\u251C\u2524\u252C\u2534\u253C\u2502\u2500\u2592]|\uFFFD/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F-\u009F]/g;

type RepairTarget = {
  table: 'devices' | 'songs' | 'users';
  column: 'location' | 'title' | 'album' | 'file_url' | 'display_name';
  primaryKey: 'id';
};

type RepairStats = {
  scanned: number;
  updated: number;
  unchanged: number;
  skipped: number;
};

const REPAIR_TARGETS: RepairTarget[] = [
  { table: 'devices', column: 'location', primaryKey: 'id' },
  { table: 'devices', column: 'name', primaryKey: 'id' },
  { table: 'songs', column: 'title', primaryKey: 'id' },
  { table: 'songs', column: 'artist', primaryKey: 'id' },
  { table: 'songs', column: 'album', primaryKey: 'id' },
  { table: 'songs', column: 'file_url', primaryKey: 'id' },
  { table: 'users', column: 'display_name', primaryKey: 'id' },
];

function countMatches(value: string, pattern: RegExp): number {
  const matches = value.match(pattern);
  return matches ? matches.length : 0;
}

function scoreCandidate(value: string): number {
  const suspicious = countMatches(value, SUSPICIOUS_PATTERN);
  const controlChars = countMatches(value, CONTROL_CHAR_PATTERN);
  const replacement = value.includes('\uFFFD') ? 1 : 0;

  return suspicious * 10 + controlChars * 25 + replacement * 20;
}

export function repairTextIfImproved(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }

  const normalized = normalizeText(value);
  if (normalized === value) {
    return value;
  }

  return scoreCandidate(normalized) < scoreCandidate(value) ? normalized : value;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function columnExists(client: PoolClient, table: string, column: string): Promise<boolean> {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [table, column],
  );

  return result.rowCount > 0;
}

async function repairColumn(client: PoolClient, target: RepairTarget): Promise<RepairStats> {
  const stats: RepairStats = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  };

  if (!(await columnExists(client, target.table, target.column))) {
    console.log(`[repair:text] Skipping ${target.table}.${target.column} because the column does not exist.`);
    return stats;
  }

  const tableName = quoteIdentifier(target.table);
  const columnName = quoteIdentifier(target.column);
  const primaryKey = quoteIdentifier(target.primaryKey);
  const selectSql = `SELECT ${primaryKey} AS id, ${columnName} AS value FROM ${tableName} WHERE ${columnName} IS NOT NULL ORDER BY ${primaryKey}`;
  const rows = await client.query(selectSql);

  for (const row of rows.rows) {
    stats.scanned += 1;

    const originalValue = row.value as string | null;
    const repairedValue = repairTextIfImproved(originalValue);

    if (repairedValue === originalValue) {
      stats.unchanged += 1;
      continue;
    }

    const updateSql = `UPDATE ${tableName} SET ${columnName} = $1 WHERE ${primaryKey} = $2 AND ${columnName} = $3`;
    const updated = await client.query(updateSql, [repairedValue, row.id, originalValue]);

    if (updated.rowCount > 0) {
      stats.updated += 1;
    } else {
      stats.skipped += 1;
    }
  }

  console.log(
    `[repair:text] ${target.table}.${target.column} scanned=${stats.scanned} updated=${stats.updated} unchanged=${stats.unchanged} skipped=${stats.skipped}`,
  );

  return stats;
}

export async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    console.log('[repair:text] DATABASE_URL is not set; skipping text repair.');
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();

  try {
    let totalScanned = 0;
    let totalUpdated = 0;
    let totalUnchanged = 0;
    let totalSkipped = 0;

    for (const target of REPAIR_TARGETS) {
      const stats = await repairColumn(client, target);
      totalScanned += stats.scanned;
      totalUpdated += stats.updated;
      totalUnchanged += stats.unchanged;
      totalSkipped += stats.skipped;
    }

    console.log(
      `[repair:text] done scanned=${totalScanned} updated=${totalUpdated} unchanged=${totalUnchanged} skipped=${totalSkipped}`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[repair:text] failed:', error);
    process.exitCode = 1;
  });
}
