/**
 * Decide de donde se leen los textos de hidratacion.
 *
 * Postgres (produccion) si hay URL de conexion; SQLite local (desarrollo) si no.
 * `HYDRATE_DB_DRIVER` fuerza cualquiera de los dos.
 *
 * `APPSTRACT_DATABASE_URL` existe para el caso en que refautomex llegue a tener
 * su propia base: la hidratacion siempre apunta a la base `appstract`, no a la
 * que use el resto de la app.
 */

export const getPgDatabaseUrl = () =>
  process.env.APPSTRACT_DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  undefined;

export const shouldUseSqlite = () => {
  if (process.env.HYDRATE_DB_DRIVER === 'postgres') return false;
  if (process.env.HYDRATE_DB_DRIVER === 'sqlite') return true;
  const url = getPgDatabaseUrl() ?? '';
  return !(url.startsWith('postgres://') || url.startsWith('postgresql://'));
};

export const isPgRuntime = () => !shouldUseSqlite() && Boolean(getPgDatabaseUrl());
