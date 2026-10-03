import { defineConfig } from 'drizzle-kit';

// Solo la base propia de refautomex. `hydrate` vive en la de appddata y la
// administra appddata: incluirla aqui haria que un push la creara tambien en
// esta base.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL o DATABASE_URL_UNPOOLED es obligatorio para drizzle-kit sobre Postgres');
}

export default defineConfig({
  schema: './src/app/lib/db/schema.pg.js',
  out: './drizzle-pg',
  dialect: 'postgresql',
  dbCredentials: { url },
});
