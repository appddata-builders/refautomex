'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Provee los textos del sitio directamente desde la tabla `hydrate`.
 *
 * Reemplaza a i18next conservando su misma superficie de API (`t`, `i18n.language`,
 * `i18n.changeLanguage`) para no tener que reescribir las ~268 llamadas repartidas
 * en los componentes: solo cambia de donde se importa `useTranslation`.
 *
 * La base es la fuente principal. Si no responde o no tiene filas para el
 * proyecto, el servidor entrega el JSON local de respaldo.
 */

const LOCALES = ['es', 'en'];
const DEFAULT_LOCALE = 'es';

const TextContext = createContext(null);

/** Resuelve una key con puntos ("navbar.home") contra el arbol del locale. */
const lookup = (tree, key) => {
  let node = tree;

  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[segment];
  }

  return typeof node === 'string' ? node : undefined;
};

export function TextProvider({ resources, children }) {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);

  const changeLanguage = useCallback((next) => {
    // Se ignoran los idiomas que no manejamos. Sin esta guarda, un segmento de
    // ruta cualquiera podria dejar el sitio sin textos.
    if (!LOCALES.includes(next)) return;
    setLocale(next);
  }, []);

  const value = useMemo(
    () => ({ resources: resources || {}, locale, changeLanguage }),
    [resources, locale, changeLanguage]
  );

  return <TextContext.Provider value={value}>{children}</TextContext.Provider>;
}

export function useTranslation() {
  const context = useContext(TextContext);

  if (!context) {
    throw new Error('useTranslation debe usarse dentro de <TextProvider>');
  }

  const { resources, locale, changeLanguage } = context;

  const t = useCallback(
    (key, options) => {
      if (typeof key !== 'string') return '';

      const value = lookup(resources[locale], key);
      if (value !== undefined) return value;

      if (options && typeof options.defaultValue === 'string') {
        return options.defaultValue;
      }

      return key;
    },
    [resources, locale]
  );

  const i18n = useMemo(
    () => ({ language: locale, changeLanguage }),
    [locale, changeLanguage]
  );

  return { t, i18n };
}
