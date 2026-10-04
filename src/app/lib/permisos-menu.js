/**
 * Permisos de menu por perfil (Permisos > Permisos de perfil).
 *
 * Cada modulo es un `load` de /productivity. Aqui se define cuales existen,
 * que ve cada perfil mientras no se haya guardado nada (lo mismo que antes
 * decia `adminOnly` en navbar-panel.jsx) y cuales no se pueden cambiar. Lo
 * comparten el menu, la pagina y /api/permisos-menu, asi que agregar un modulo
 * nuevo es agregarlo aqui.
 *
 * El perfil sale de `usuario.categoria`: 'A' es administrador y cualquier otra
 * ('G') es empleado.
 *
 * Esto decide que se ve y que se pinta; no protege los datos: /api/refautomex
 * no pide sesion. Lo que si exige administrador (respaldos, guardar estos
 * permisos) lo revisa el servidor con el token.
 */

export const PERFILES = ['admin', 'empleado'];

export const perfilDeCategoria = (categoria) =>
  String(categoria || '').toUpperCase() === 'A' ? 'admin' : 'empleado';

// `seccion` y `texto` son keys de panel.nav.* (texto por defecto = clave).
// `fijo` es el valor que la pantalla muestra bloqueado:
//   - Inicio y Configuracion son a donde se cae cuando un modulo no se permite.
//   - Permisos es solo de admin: ahi se activan cuentas, se cambian
//     sucursales y roles, y se devuelven estos permisos.
//   - Respaldos lo valida /api/respaldos contra categoria 'A'; darselo a un
//     empleado solo le mostraria errores.
export const MODULOS = [
  { clave: 'tickets', seccion: 'sales', admin: true, empleado: true },
  { clave: 'devolution', seccion: 'sales', admin: true, empleado: false },
  { clave: 'history', seccion: 'sales', admin: true, empleado: false },
  { clave: 'inventories', seccion: 'stock', admin: true, empleado: false },
  { clave: 'warehouse', seccion: 'stock', admin: true, empleado: true },
  { clave: 'missing', seccion: 'stock', admin: true, empleado: true },
  { clave: 'capture', seccion: 'purchases', admin: true, empleado: false },
  { clave: 'providers', seccion: 'purchases', admin: true, empleado: false },
  { clave: 'calendar', seccion: 'services', admin: true, empleado: false },
  { clave: 'invoice', seccion: 'services', admin: true, empleado: false },
  { clave: 'site', seccion: 'orders', admin: true, empleado: true },
  { clave: 'delivery', seccion: 'orders', admin: true, empleado: false },
  { clave: 'home', admin: true, empleado: true, fijo: { admin: true, empleado: true } },
  { clave: 'user-settings', texto: 'settings', admin: true, empleado: true, fijo: { admin: true, empleado: true } },
  { clave: 'personal', admin: true, empleado: false, fijo: { admin: true, empleado: false } },
  { clave: 'backups', admin: true, empleado: false, fijo: { admin: true, empleado: false } },
];

export const esFijo = (modulo, perfil) => typeof modulo.fijo?.[perfil] === 'boolean';

/**
 * { modulo: { admin, empleado } } completo. Lo que no venga en `guardados`
 * (nunca se guardo, o es un modulo nuevo) toma el valor de siempre; los fijos
 * ganan sobre lo guardado y las claves desconocidas se ignoran.
 */
export const completarPermisos = (guardados = {}) =>
  Object.fromEntries(MODULOS.map((modulo) => {
    const fila = guardados?.[modulo.clave] || {};
    const valores = PERFILES.map((perfil) => {
      if (esFijo(modulo, perfil)) return [perfil, modulo.fijo[perfil]];
      return [perfil, typeof fila[perfil] === 'boolean' ? fila[perfil] : modulo[perfil]];
    });
    return [modulo.clave, Object.fromEntries(valores)];
  }));

export const PERMISOS_DE_SIEMPRE = completarPermisos();

export const puedeVer = (permisos, modulo, perfil) => permisos?.[modulo]?.[perfil] === true;
