import { getHydratedResources } from '@/app/lib/hydrate/texts';

/**
 * Version de `t` para los Server Components (metadata de las paginas).
 *
 * `useTranslation` es un hook de cliente y `generateMetadata` corre en el
 * servidor, asi que los titulos y descripciones quedarian en duro. Esta funcion
 * lee el mismo arbol de la tabla `hydrate` para que tambien salgan de la base.
 */

const LOCALES = ['es', 'en'];
const DEFAULT_LOCALE = 'es';

const lookup = (tree, key) => {
  let node = tree;

  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[segment];
  }

  return typeof node === 'string' ? node : undefined;
};

/**
 * Devuelve un `t(key)` ya atado al locale pedido.
 *
 * No acepta texto por defecto a proposito: el contenido vive en la tabla
 * `hydrate` (o en el JSON de respaldo), nunca en la linea que lo consume.
 */
export const getServerT = async (rawLocale) => {
  const locale = LOCALES.includes(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const resources = await getHydratedResources();

  return (key) => {
    const value = lookup(resources[locale], key);
    if (value !== undefined) return value;

    const spanish = lookup(resources[DEFAULT_LOCALE], key);
    if (spanish !== undefined) return spanish;

    return '';
  };
};

/** Normaliza el `?lang=` que llega por searchParams. */
export const resolveLocale = (raw) => (LOCALES.includes(raw) ? raw : DEFAULT_LOCALE);
