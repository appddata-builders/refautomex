import { defineConfig } from 'drizzle-kit';
import nextEnv from '@next/env';
import { requirePgDatabaseUrl } from './src/app/lib/db/runtime-driver.mjs';

nextEnv.loadEnvConfig(process.cwd());

// Solo la base propia de refautomex. `hydrate` vive en la de appddata y la
// administra appddata: incluirla aqui haria que un push la creara tambien en
// esta base.
const url = requirePgDatabaseUrl();

export default defineConfig({
  schema: './src/app/lib/db/schema.pg.js',
  out: './drizzle-pg',
  dialect: 'postgresql',
  dbCredentials: { url },
});
