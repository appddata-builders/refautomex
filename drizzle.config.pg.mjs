import { defineConfig } from 'drizzle-kit';
// Import con nombre: drizzle-kit carga este archivo como CommonJS y ahi el
// default de @next/env llega undefined.
import { loadEnvConfig } from '@next/env';
import { requirePgDatabaseUrl } from './src/app/lib/db/runtime-driver.mjs';

loadEnvConfig(process.cwd());

// Solo la base propia de refautomex. `hydrate` vive en la de appddata y la
// administra appddata: incluirla aqui haria que un push la creara tambien en
// esta base.
const url = requirePgDatabaseUrl();

export default defineConfig({
  schema: './src/app/lib/db/schema.pg.js',
  out: './drizzle-pg',
  dialect: 'postgresql',
  // Solo `public`: el esquema respaldo_llaves (scripts/db-pg-llaves.mjs) no es
  // de la app y push no debe tocarlo.
  schemaFilter: ['public'],
  dbCredentials: { url },
});
