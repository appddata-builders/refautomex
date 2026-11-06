// La app, Drizzle y las auditorias deben apuntar a la misma base. En local
// se llega por el tunel SSH; en produccion, por la red interna de Docker.
export const getPgDatabaseUrl = () =>
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

export const requirePgDatabaseUrl = () => {
  const url = getPgDatabaseUrl();
  if (!url) throw new Error('Falta DATABASE_URL_UNPOOLED o DATABASE_URL para PostgreSQL.');
  return url;
};
