'use client';

import { useEffect, useState } from 'react';

import { obtenerIdToken } from '@/app/lib/respaldo-diario';
import { PERMISOS_DE_SIEMPRE, completarPermisos } from '@/app/lib/permisos-menu';

/**
 * Permisos de menu del lado del navegador. Se vuelven a pedir al montar cada
 * pantalla que los usa, al cambiar de modulo (productivity/page.jsx) y al
 * volver a la pestana, como pilates los revisa en cada navegacion: un cambio
 * hecho por un admin le llega al empleado sin recargar. Si varias pantallas
 * los piden a la vez se hace una sola peticion.
 *
 * Cada respuesta (y cada guardado) se publica a todos los que los usan, y la
 * ultima queda en localStorage para que la siguiente carga no pinte primero
 * los de siempre.
 */

const CLAVE_LOCAL = 'permisos-menu';
const EVENTO = 'permisos-menu:actualizado';

let enMemoria = null;
// Solo la peticion en curso. Antes se guardaba la primera para siempre, y una
// pantalla que se montaba despues de guardar recibia esos permisos viejos:
// la matriz volvia a mostrar las casillas como estaban.
let peticion = null;
// Sube con cada guardado. Una lectura que empezo antes de guardar trae lo de
// antes y no debe pisar lo recien guardado.
let generacion = 0;

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
  if (peticion) return peticion;
  const inicio = generacion;
  peticion = fetch('/api/permisos-menu', { cache: 'no-store' })
    .then(async (respuesta) => {
      if (!respuesta.ok) throw new Error(await leerError(respuesta));
      const { permisos } = await respuesta.json();
      return inicio === generacion ? publicar(permisos) : enMemoria;
    })
    .finally(() => {
      peticion = null;
    });
  return peticion;
};

export const refrescarPermisos = () => {
  cargarPermisos().catch((error) => console.error('Error al leer permisos de menú:', error));
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
  generacion += 1;
  return publicar((await respuesta.json()).permisos);
};

export function usePermisosMenu() {
  const [permisos, setPermisos] = useState(
    () => enMemoria ?? (typeof window === 'undefined' ? null : leerLocal()) ?? PERMISOS_DE_SIEMPRE
  );

  useEffect(() => {
    const alCambiar = (e) => setPermisos(e.detail);
    const alVolver = () => {
      if (!document.hidden) refrescarPermisos();
    };
    window.addEventListener(EVENTO, alCambiar);
    document.addEventListener('visibilitychange', alVolver);
    // Lo que se publico mientras esta pantalla no estaba montada.
    if (enMemoria) setPermisos(enMemoria);
    refrescarPermisos();
    return () => {
      window.removeEventListener(EVENTO, alCambiar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);

  return permisos;
}
