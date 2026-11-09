import path from 'node:path';
import { existsSync } from 'node:fs';

import { getPgDatabaseUrl, isPgRuntime } from './runtime-driver';
import * as schemaPg from './schema.pg';
import * as schemaSqlite from './schema.sqlite';

/**
 * Conexion de solo lectura a la base `appstract` de appdda.
 *
 * En produccion es Postgres (159.203.90.92, base `appstract`); en local, el
 * archivo SQLite que appdda usa como `local.db`. Si ninguna de las dos esta
 * disponible devuelve null y el sitio usa el JSON local de respaldo.
 */

const DEFAULT_SQLITE_PATH = path.join(process.cwd(), '..', 'appstract', 'local.db');
const RETRY_INTERVAL_MS = 30_000;

let cachedDb = null;
let lastAttemptAt = 0;

const openPg = () => {
  const { drizzle } = require('drizzle-orm/postgres-js');
  const postgres = require('postgres');
  // max bajo: solo se leen textos, no hace falta un pool grande.
  const client = postgres(getPgDatabaseUrl(), { max: 3, connect_timeout: 10 });
  return drizzle(client, { schema: schemaPg });
};

const openSqlite = () => {
  const dbPath = process.env.APPSTRACT_DB_PATH || DEFAULT_SQLITE_PATH;
  if (!existsSync(dbPath)) return null;
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const Database = require('better-sqlite3');
  const raw = new Database(dbPath, { readonly: true, fileMustExist: true });
  return drizzle(raw, { schema: schemaSqlite });
};

export const getHydrateDb = () => {
  if (cachedDb) return cachedDb;

  // No reintentar en cada request cuando la base no esta disponible.
  const now = Date.now();
  if (lastAttemptAt && now - lastAttemptAt < RETRY_INTERVAL_MS) return null;
  lastAttemptAt = now;

  try {
    cachedDb = isPgRuntime() ? openPg() : openSqlite();
    return cachedDb;
  } catch (error) {
    console.info('Base de hidratacion no disponible; se usara el JSON local:', error.message);
    return null;
  }
};
