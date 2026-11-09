import { isPgRuntime } from './runtime-driver';
import { hydrate as hydratePg } from './schema.pg';
import { hydrate as hydrateSqlite } from './schema.sqlite';

/**
 * Tabla `hydrate` del dialecto que toque en runtime. Ambas versiones exponen
 * los mismos nombres de columna, asi que la query de texts.js es identica.
 */
export const hydrate = isPgRuntime() ? hydratePg : hydrateSqlite;
