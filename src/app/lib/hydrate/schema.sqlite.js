import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Espejo de la tabla `hydrate` que define appdda en db/project-schema.ts.
 *
 * Solo se lee desde aqui: appdda es el dueno del schema y quien corre las
 * migraciones (`npm run db:push`). Si cambian columnas alla, hay que reflejarlo
 * en este archivo.
 */
export const hydrate = sqliteTable(
  'hydrate',
  {
    id: text('id').primaryKey(),
    projectSlug: text('project_slug').notNull(),
    contentKey: text('content_key').notNull(),
    contentValue: text('content_value').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index('hydrate_project_slug_idx').on(table.projectSlug),
    uniqueIndex('hydrate_project_slug_content_key_uidx').on(table.projectSlug, table.contentKey),
  ]
);
