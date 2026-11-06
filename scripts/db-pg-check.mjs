import nextEnv from '@next/env';
import pg from 'pg';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../src/app/lib/db/schema.pg.js';
import { requirePgDatabaseUrl } from '../src/app/lib/db/runtime-driver.mjs';

nextEnv.loadEnvConfig(process.cwd());

const normalizeType = (value) => value.replace('character varying', 'varchar').replace(/\s/g, '');
const normalizeDefault = (value) => value == null ? null : String(value).replace(/::[\w\s]+$/, '').replace(/^'(.*)'$/, '$1');

const pool = new pg.Pool({ connectionString: requirePgDatabaseUrl(), max: 1, connectionTimeoutMillis: 8000 });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");
    const { rows: columns } = await client.query(`
      SELECT c.relname AS table_name, a.attname AS column_name,
             format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
             a.attidentity AS identity, pg_get_expr(d.adbin, d.adrelid) AS default_value,
             EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid
                     AND i.indisprimary AND a.attnum = ANY(i.indkey)) AS primary_key
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND a.attnum > 0 AND NOT a.attisdropped`);
    const actual = new Map(columns.map(c => [`${c.table_name}.${c.column_name}`, c]));
    const differences = [];
    let tableCount = 0;
    let columnCount = 0;
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const table = getTableConfig(value);
      tableCount++;
      for (const column of table.columns) {
        columnCount++;
        const key = `${table.name}.${column.name}`;
        const db = actual.get(key);
        if (!db) { differences.push({ column: key, issue: 'missing' }); continue; }
        const expected = {
          type: normalizeType(column.getSQLType()), not_null: column.notNull,
          primary_key: column.primary,
          identity: column.generatedIdentity?.type === 'byDefault' ? 'd' : column.generatedIdentity ? 'a' : '',
          default_value: normalizeDefault(column.default),
        };
        const received = { ...db, type: normalizeType(db.type), default_value: normalizeDefault(db.default_value) };
        for (const [field, wanted] of Object.entries(expected)) {
          if (received[field] !== wanted) differences.push({ column: key, field, expected: wanted, actual: received[field] });
        }
        actual.delete(key);
      }
    }
    for (const key of actual.keys()) differences.push({ column: key, issue: 'not-in-drizzle' });
    const { rows: branches } = await client.query(`
      SELECT s.idsucursal, s.sucursal, count(d.iddetalle)::int AS inventory_rows,
             count(d.iddetalle) FILTER (WHERE p.status = 'A')::int AS active_inventory_rows
        FROM sucursal s LEFT JOIN detalle d USING (idsucursal)
        LEFT JOIN producto p USING (num_parte)
       GROUP BY s.idsucursal, s.sucursal ORDER BY s.idsucursal`);
    console.log(JSON.stringify({ tables: tableCount, columns: columnCount, differences, branches }, null, 2));
    if (differences.length) process.exitCode = 1;
    await client.query('ROLLBACK');
  } finally { client.release(); }
} catch (error) {
  console.error(`No se pudo completar la auditoría PostgreSQL (${error.code || 'AUDIT_FAILED'}).`);
  process.exitCode = 1;
} finally { await pool.end(); }
