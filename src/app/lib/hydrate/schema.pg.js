import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Espejo de la tabla `hydrate` de Postgres definida en appdda (db/schema.pg.ts).
 * appdda es el dueno del schema y quien corre las migraciones; aqui solo se lee.
 */
export const hydrate = pgTable(
  'hydrate',
  {
    id: text('id').primaryKey(),
    projectSlug: text('project_slug').notNull(),
    contentKey: text('content_key').notNull(),
    contentValue: text('content_value').notNull(),
    createdAt: timestamp('created_at', { precision: 3, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('hydrate_project_slug_idx').on(table.projectSlug),
    uniqueIndex('hydrate_project_slug_content_key_uidx').on(table.projectSlug, table.contentKey),
  ]
);
