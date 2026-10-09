/**
 * Respaldo diario a la computadora del administrador (lado del navegador).
 *
 * POR QUE ASI
 * Una pagina web no puede escribir sola en el Escritorio. Lo mas cercano es la
 * File System Access API (Chrome y Edge): el usuario elige la carpeta una vez,
 * el navegador recuerda el permiso, y desde ahi la app puede reescribir el
 * mismo archivo sin preguntar. El handle de la carpeta se guarda en IndexedDB
 * para que sobreviva a cerrar el navegador.
 *
 * La app no corre con el navegador cerrado: el respaldo se hace a las 3 pm si
 * el panel esta abierto a esa hora. No se recupera al entrar despues: se pidio
 * que el panel no pregunte nada al iniciar sesion. Para no repetir permiso
 * cada dia, al autorizar hay que elegir "Permitir en cada visita" (Chrome 122+).
 * Safari y Firefox no tienen esta API; ahi el archivo se descarga a Descargas.
 */
import { userPool } from '@/app/lib/cognito-manager';

export const ARCHIVO_RESPALDO = 'DB_Daily_Backup_Refautomex.csv';
export const HORA_RESPALDO = 15;

const CLAVE_ULTIMO = 'respaldo:ultimo';
const EVENTO = 'respaldo:actualizado';
const CLAVE_PENDIENTE = 'respaldo:pendiente';
const EVENTO_PENDIENTE = 'respaldo:pendiente';

const dos = (n) => String(n).padStart(2, '0');

export const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

// getSession() renueva el ID token con el refresh token si ya vencio (dura
// una hora). El que esta guardado en localStorage puede estar viejo.
export const obtenerIdToken = () => new Promise((resolve, reject) => {
  const usuario = userPool.getCurrentUser();
  if (!usuario) {
    reject(new Error('No hay sesión iniciada.'));
    return;
  }
  usuario.getSession((error, sesion) => {
    if (error || !sesion?.isValid()) reject(error || new Error('La sesión venció. Vuelve a entrar.'));
    else resolve(sesion.getIdToken().getJwtToken());
  });
});

export const llamarRespaldos = async (opciones = {}, modo = '') => {
  const token = await obtenerIdToken();
  const respuesta = await fetch(`/api/respaldos${modo ? `?modo=${modo}` : ''}`, {
    ...opciones,
    cache: 'no-store',
    headers: { ...(opciones.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) {
    let mensaje = `Error ${respuesta.status}`;
    try {
      mensaje = (await respuesta.json()).error || mensaje;
    } catch { /* la respuesta no era JSON */ }
    throw new Error(mensaje);
  }
  return respuesta;
};

// --------------------------------------------------------------- carpeta ---

export const soportaCarpeta = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const abrirIndexedDb = () => new Promise((resolve, reject) => {
  const peticion = indexedDB.open('refautomex-respaldos', 1);
  peticion.onupgradeneeded = () => peticion.result.createObjectStore('handles');
  peticion.onsuccess = () => resolve(peticion.result);
  peticion.onerror = () => reject(peticion.error);
});

const guardarHandle = async (handle) => {
  const db = await abrirIndexedDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'carpeta');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
};

export const carpetaGuardada = async () => {
  if (!soportaCarpeta()) return null;
  const db = await abrirIndexedDb();
  return new Promise((resolve, reject) => {
    const peticion = db.transaction('handles').objectStore('handles').get('carpeta');
    peticion.onsuccess = () => resolve(peticion.result || null);
    peticion.onerror = () => reject(peticion.error);
  });
};

export const elegirCarpeta = async () => {
  const handle = await window.showDirectoryPicker({
    id: 'refautomex-respaldos',
    mode: 'readwrite',
    startIn: 'desktop',
  });
  await guardarHandle(handle);
  return handle;
};

// requestPermission solo funciona dentro de un clic del usuario; por eso el
// respaldo automatico nunca pide, solo pregunta.
const tienePermiso = async (handle, pedir) => {
  const opciones = { mode: 'readwrite' };
  if ((await handle.queryPermission(opciones)) === 'granted') return true;
  if (!pedir) return false;
  return (await handle.requestPermission(opciones)) === 'granted';
};

const escribirEnCarpeta = async (handle, blob) => {
  const archivo = await handle.getFileHandle(ARCHIVO_RESPALDO, { create: true });
  const escritor = await archivo.createWritable();
  await escritor.write(blob);
  await escritor.close();
};

const descargarArchivo = (blob) => {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = ARCHIVO_RESPALDO;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

// -------------------------------------------------------------- respaldo ---

export const ultimoRespaldo = () => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ULTIMO));
  } catch {
    return null;
  }
};

export const alCambiarRespaldo = (fn) => {
  const manejador = (e) => fn(e.detail);
  window.addEventListener(EVENTO, manejador);
  return () => window.removeEventListener(EVENTO, manejador);
};

/** Las 3 pm mas recientes: hoy si ya pasaron, si no las de ayer. */
const ultimasTres = (ahora) => {
  const marca = new Date(ahora);
  marca.setHours(HORA_RESPALDO, 0, 0, 0);
  if (marca > ahora) marca.setDate(marca.getDate() - 1);
  return marca;
};

/**
 * Entre `antes` y `ahora` dieron las 3 pm y desde entonces no se ha
 * respaldado. Solo el cruce cuenta: abrir el panel a las 5 pm no respalda ni
 * pide nada. El archivo se sobrescribe a las 3 pm aunque en la manana se haya
 * respaldado a mano.
 */
export const tocaRespaldo = (antes, ahora = new Date()) => {
  const marca = ultimasTres(ahora);
  if (antes >= marca) return false;
  const ultimo = ultimoRespaldo()?.momento;
  return !ultimo || new Date(ultimo) < marca;
};

export class FaltaPermiso extends Error {}
export class FaltaCarpeta extends Error {}

// ------------------------------------------------------------- pendiente ---

// Si el respaldo de las 3 pm no se pudo hacer, la campana de avisos lo muestra
// el resto del dia ('carpeta' | 'permiso' | 'error'). Se guarda en esta
// computadora porque el respaldo tambien es de esta computadora.
export const respaldoPendiente = () => {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_PENDIENTE));
    return guardado?.fecha === fechaLocal() ? guardado.motivo : null;
  } catch {
    return null;
  }
};

export const marcarRespaldoPendiente = (motivo) => {
  try {
    if (motivo) localStorage.setItem(CLAVE_PENDIENTE, JSON.stringify({ fecha: fechaLocal(), motivo }));
    else localStorage.removeItem(CLAVE_PENDIENTE);
  } catch { /* sin almacenamiento el aviso dura lo que la pestana */ }
  window.dispatchEvent(new CustomEvent(EVENTO_PENDIENTE, { detail: motivo || null }));
};

export const alCambiarPendiente = (fn) => {
  const manejador = (e) => fn(e.detail);
  window.addEventListener(EVENTO_PENDIENTE, manejador);
  return () => window.removeEventListener(EVENTO_PENDIENTE, manejador);
};

/**
 * Descarga el respaldo del servidor y lo guarda: en la carpeta elegida si el
 * navegador lo permite, o en Descargas si no.
 */
export const respaldarAhora = async ({ pedirPermiso = false } = {}) => {
  let handle = null;
  if (soportaCarpeta()) {
    handle = await carpetaGuardada();
    if (!handle) throw new FaltaCarpeta('Elige la carpeta donde se guarda el respaldo.');
    if (!(await tienePermiso(handle, pedirPermiso))) {
      throw new FaltaPermiso('El navegador necesita que vuelvas a autorizar la carpeta.');
    }
  }

  const blob = await (await llamarRespaldos()).blob();

  if (handle) await escribirEnCarpeta(handle, blob);
  else descargarArchivo(blob);

  const info = {
    fecha: fechaLocal(),
    momento: new Date().toISOString(),
    destino: handle ? handle.name : 'Descargas',
    bytes: blob.size,
  };
  localStorage.setItem(CLAVE_ULTIMO, JSON.stringify(info));
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: info }));
  marcarRespaldoPendiente(null);
  return info;
};
