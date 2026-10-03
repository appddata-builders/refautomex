#!/usr/bin/env node
/**
 * Siembra la tabla `hydrate` de la base `appstract` con los textos del sitio.
 *
 * El JSON `src/app/lib/hydrate/fallback.refautomex.json` es la fuente: cada
 * entrada `"<locale>.<key>": "<texto>"` se vuelve una fila
 * (project_slug, content_key, content_value). A partir de ahi los textos se
 * editan desde IMIN y el sitio los lee en runtime; el JSON solo queda como
 * respaldo si la base no responde.
 *
 * Es idempotente: hace UPSERT por (project_slug, content_key), asi que correrlo
 * dos veces deja el mismo resultado. Por defecto NO pisa filas existentes -
 * una edicion hecha desde IMIN vale mas que el JSON del repo. Con --overwrite
 * se fuerza el valor del JSON en todas las filas.
 *
 *   node scripts/seed-hydrate.mjs              # inserta solo las que faltan
 *   node scripts/seed-hydrate.mjs --overwrite  # ademas pisa las existentes
 *   node scripts/seed-hydrate.mjs --dry-run    # solo reporta, no escribe
 *
 * Conexion: APPSTRACT_DATABASE_URL (o DATABASE_URL_UNPOOLED / DATABASE_URL),
 * las mismas variables que usa el runtime en src/app/lib/hydrate/runtime-driver.js.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';

const HERE = dirname(fileURLToPath(import.meta.url));
const FALLBACK = join(HERE, '..', 'src', 'app', 'lib', 'hydrate', 'fallback.refautomex.json');

const PROJECT_SLUG = process.env.APPSTRACT_PROJECT_SLUG || 'refautomex';
const SUPPORTED_LOCALES = ['es', 'en'];

const overwrite = process.argv.includes('--overwrite');
const dryRun = process.argv.includes('--dry-run');

const loadEnvFile = () => {
  // El script se corre a mano, fuera de Next, asi que .env.local no esta cargado.
  try {
    const raw = readFileSync(join(HERE, '..', '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Sin .env.local se espera que las variables vengan del entorno.
  }
};

const getDatabaseUrl = () =>
  process.env.APPSTRACT_DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;

const readRows = () => {
  const content = JSON.parse(readFileSync(FALLBACK, 'utf8'));
  const rows = [];
  const skipped = [];

  for (const [contentKey, contentValue] of Object.entries(content)) {
    const locale = contentKey.split('.')[0];
    // Mismo filtro que texts.js: una fila con un prefijo desconocido no se
    // veria nunca en el sitio, asi que tampoco vale la pena sembrarla.
    if (!SUPPORTED_LOCALES.includes(locale) || contentKey.split('.').length < 2) {
      skipped.push(contentKey);
      continue;
    }
    rows.push({ contentKey, contentValue: String(contentValue) });
  }

  return { rows, skipped };
};

const main = async () => {
  loadEnvFile();

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('Falta APPSTRACT_DATABASE_URL (o DATABASE_URL) para llegar a la base appstract.');
    process.exit(1);
  }

  const { rows, skipped } = readRows();
  console.log(`Proyecto : ${PROJECT_SLUG}`);
  console.log(`Textos   : ${rows.length} filas leidas del JSON de respaldo`);
  if (skipped.length) {
    console.log(`Ignoradas: ${skipped.length} claves sin locale valido`);
  }

  if (dryRun) {
    console.log('--dry-run: no se escribio nada.');
    return;
  }

  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 });

  try {
    const existing = await sql`
      select content_key from hydrate where project_slug = ${PROJECT_SLUG}
    `;
    const known = new Set(existing.map((row) => row.content_key));
    const toInsert = rows.filter((row) => !known.has(row.contentKey));
    const toUpdate = overwrite ? rows.filter((row) => known.has(row.contentKey)) : [];

    const payload = [...toInsert, ...toUpdate].map((row) => ({
      id: randomUUID(),
      project_slug: PROJECT_SLUG,
      content_key: row.contentKey,
      content_value: row.contentValue,
    }));

    if (payload.length === 0) {
      console.log('Nada que escribir: la base ya tiene todas las claves.');
      return;
    }

    // En lotes: un INSERT de ~1600 filas de golpe pasa del limite de parametros.
    const BATCH = 200;
    for (let i = 0; i < payload.length; i += BATCH) {
      const batch = payload.slice(i, i + BATCH);
      await sql`
        insert into hydrate ${sql(batch, 'id', 'project_slug', 'content_key', 'content_value')}
        on conflict (project_slug, content_key) do update
          set content_value = excluded.content_value,
              updated_at = now()
      `;
    }

    console.log(`Insertadas: ${toInsert.length}`);
    console.log(`Actualizadas: ${toUpdate.length}${overwrite ? '' : ' (usa --overwrite para pisar las existentes)'}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
};

main().catch((error) => {
  console.error('Fallo la siembra:', error.message);
  process.exit(1);
});
