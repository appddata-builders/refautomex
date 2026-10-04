'use client';

import { useEffect, useState } from 'react';

import { obtenerIdToken } from '@/app/lib/respaldo-diario';
import { PERMISOS_DE_SIEMPRE, completarPermisos } from '@/app/lib/permisos-menu';

/**
 * Permisos de menu del lado del navegador. El menu y la pagina los piden al
 * mismo tiempo; se hace una sola peticion por carga y la ultima respuesta se
 * guarda en localStorage para que la siguiente carga no pinte primero los de
 * siempre. Al guardar desde Permisos de perfil se avisa a todos los que los
 * usan, para que el menu cambie sin recargar.
 */

const CLAVE_LOCAL = 'permisos-menu';
const EVENTO = 'permisos-menu:actualizado';

let enMemoria = null;
let peticion = null;

const leerLocal = () => {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_LOCAL));
    return guardado ? completarPermisos(guardado) : null;
  } catch {
    return null;
  }
};

const publicar = (permisos) => {
  enMemoria = completarPermisos(permisos);
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(enMemoria));
  } catch { /* sin almacenamiento solo se pierde el atajo de la siguiente carga */ }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: enMemoria }));
  return enMemoria;
};

const leerError = async (respuesta) => {
  try {
    return (await respuesta.json()).error || `Error ${respuesta.status}`;
  } catch {
    return `Error ${respuesta.status}`;
  }
};

export const cargarPermisos = () => {
  peticion ??= fetch('/api/permisos-menu', { cache: 'no-store' })
    .then(async (respuesta) => {
      if (!respuesta.ok) throw new Error(await leerError(respuesta));
      return publicar((await respuesta.json()).permisos);
    })
    .catch((error) => {
      peticion = null;
      throw error;
    });
  return peticion;
};

export const guardarPermisos = async (permisos) => {
  const token = await obtenerIdToken();
  const respuesta = await fetch('/api/permisos-menu', {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ permisos }),
  });
  if (!respuesta.ok) throw new Error(await leerError(respuesta));
  return publicar((await respuesta.json()).permisos);
};

export function usePermisosMenu() {
  const [permisos, setPermisos] = useState(
    () => enMemoria ?? (typeof window === 'undefined' ? null : leerLocal()) ?? PERMISOS_DE_SIEMPRE
  );

  useEffect(() => {
    const alCambiar = (e) => setPermisos(e.detail);
    window.addEventListener(EVENTO, alCambiar);
    cargarPermisos()
      .then(setPermisos)
      .catch((error) => console.error('Error al leer permisos de menú:', error));
    return () => window.removeEventListener(EVENTO, alCambiar);
  }, []);

  return permisos;
}
