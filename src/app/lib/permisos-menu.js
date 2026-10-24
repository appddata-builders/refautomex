/**
 * Permisos de menu por perfil (Permisos > Permisos de perfil).
 *
 * Cada modulo es un `load` de /productivity. Aqui se define cuales existen,
 * que ve cada perfil mientras no se haya guardado nada (lo mismo que antes
 * decia `adminOnly` en navbar-panel.jsx) y cuales no se pueden cambiar. Lo
 * comparten el menu, la pagina y /api/permisos-menu, asi que agregar un modulo
 * nuevo es agregarlo aqui.
 *
 * El perfil sale de `usuario.categoria` (ver perfilDeCategoria).
 *
 * Esto decide que se ve y que se pinta; no protege los datos: /api/refautomex
 * no pide sesion. Lo que si exige administrador (respaldos, guardar estos
 * permisos) lo revisa el servidor con el token.
 */

export const PERFILES = ['admin', 'supervisor', 'empleado'];

// `usuario.categoria` de cada perfil; Permisos > Empleados la cambia.
export const CATEGORIA_DE_PERFIL = { admin: 'A', supervisor: 'S', empleado: 'E' };

// 'G' es la que tenian todos los empleados antes de que hubiera supervisores:
// siguen siendo supervisores hasta que un admin les cambie el rol. Cualquier
// otra cosa se trata como empleado, el perfil con menos permisos.
export const perfilDeCategoria = (categoria) => {
  const clave = String(categoria || '').toUpperCase();
  if (clave === 'A') return 'admin';
  if (clave === 'S' || clave === 'G') return 'supervisor';
  return 'empleado';
};

// Lo que un perfil puede hacer en un modulo, de menos a mas. En la base se
// guarda el indice (permisos-menu-db.js).
//   - no:      no le sale en el menu.
//   - lectura: lo ve, pero sin los botones ni campos que guardan.
//   - total:   todo lo que el modulo permite en su sucursal.
export const NIVELES = ['no', 'lectura', 'total'];

// Solo lectura existe para Empleado y en los modulos con `lectura: true`, que
// son los que saben pintarse sin editar. En cualquier otro caso un modulo
// visible es completo.
export const PERFIL_LECTURA = 'empleado';

export const admiteLectura = (modulo, perfil) => Boolean(modulo.lectura) && perfil === PERFIL_LECTURA;

// `seccion` y `texto` son keys de panel.nav.* (texto por defecto = clave).
// `fijo` es el valor que la pantalla muestra bloqueado:
//   - Inicio y Configuracion son a donde se cae cuando un modulo no se permite.
//   - Permisos es solo de admin: ahi se activan cuentas, se cambian
//     sucursales y roles, y se devuelven estos permisos.
//   - Respaldos lo valida /api/respaldos contra categoria 'A'; darselo a otro
//     perfil solo le mostraria errores.
// Supervisor tiene lo que tenia el empleado antes de que hubiera supervisores;
// Empleado lo mismo, pero en solo lectura donde se puede.
export const MODULOS = [
  { clave: 'tickets', seccion: 'sales', admin: 'total', supervisor: 'total', empleado: 'total' },
  { clave: 'devolution', seccion: 'sales', admin: 'total', supervisor: 'no', empleado: 'no' },
  { clave: 'history', seccion: 'sales', admin: 'total', supervisor: 'no', empleado: 'no' },
  { clave: 'inventories', seccion: 'stock', admin: 'total', supervisor: 'no', empleado: 'no' },
  // En solo lectura se buscan productos e imprimen rotulos y listas, pero no
  // se editan, guardan ni migran matrices.
  { clave: 'warehouse', seccion: 'stock', lectura: true, admin: 'total', supervisor: 'total', empleado: 'lectura' },
  // Mueve inventario real al momento. Se le puede dar al almacenista desde
  // Permisos de perfil; quien no es admin solo ve y asigna en su sucursal.
  { clave: 'assignment', seccion: 'stock', admin: 'total', supervisor: 'no', empleado: 'no' },
  { clave: 'missing', seccion: 'stock', admin: 'total', supervisor: 'total', empleado: 'total' },
  { clave: 'capture', seccion: 'purchases', admin: 'total', supervisor: 'no', empleado: 'no' },
  { clave: 'providers', seccion: 'purchases', admin: 'total', supervisor: 'no', empleado: 'no' },
  // Quien no es admin ve el calendario de su sucursal sin editarlo (lo exige
  // /api/calendario) y marca ahi sus vacaciones; quien lo arma es un admin.
  { clave: 'calendar', seccion: 'services', admin: 'total', supervisor: 'total', empleado: 'total' },
  { clave: 'invoice', seccion: 'services', admin: 'total', supervisor: 'no', empleado: 'no' },
  { clave: 'site', seccion: 'orders', admin: 'total', supervisor: 'total', empleado: 'total' },
  { clave: 'delivery', seccion: 'orders', admin: 'total', supervisor: 'no', empleado: 'no' },
  {
    clave: 'home', admin: 'total', supervisor: 'total', empleado: 'total',
    fijo: { admin: 'total', supervisor: 'total', empleado: 'total' },
  },
  {
    clave: 'user-settings', texto: 'settings', admin: 'total', supervisor: 'total', empleado: 'total',
    fijo: { admin: 'total', supervisor: 'total', empleado: 'total' },
  },
  {
    clave: 'personal', admin: 'total', supervisor: 'no', empleado: 'no',
    fijo: { admin: 'total', supervisor: 'no', empleado: 'no' },
  },
  {
    clave: 'backups', admin: 'total', supervisor: 'no', empleado: 'no',
    fijo: { admin: 'total', supervisor: 'no', empleado: 'no' },
  },
];

export const esNivel = (valor) => NIVELES.includes(valor);

export const esFijo = (modulo, perfil) => esNivel(modulo.fijo?.[perfil]);

/**
 * { modulo: { admin, supervisor, empleado } } completo. Lo que no venga en
 * `guardados` (nunca se guardo, o es un modulo nuevo) toma el valor de
 * siempre; los fijos ganan sobre lo guardado, las claves desconocidas se
 * ignoran y una solo lectura donde no existe se vuelve completa.
 */
export const completarPermisos = (guardados = {}) =>
  Object.fromEntries(MODULOS.map((modulo) => {
    const fila = guardados?.[modulo.clave] || {};
    const valores = PERFILES.map((perfil) => {
      if (esFijo(modulo, perfil)) return [perfil, modulo.fijo[perfil]];
      const nivel = esNivel(fila[perfil]) ? fila[perfil] : modulo[perfil];
      return [perfil, nivel === 'lectura' && !admiteLectura(modulo, perfil) ? 'total' : nivel];
    });
    return [modulo.clave, Object.fromEntries(valores)];
  }));

export const PERMISOS_DE_SIEMPRE = completarPermisos();

export const nivelDe = (permisos, modulo, perfil) => permisos?.[modulo]?.[perfil] ?? 'no';

export const puedeVer = (permisos, modulo, perfil) => nivelDe(permisos, modulo, perfil) !== 'no';

/** Si el modulo le deja guardar cambios; con solo lectura, no. */
export const puedeEditar = (permisos, modulo, perfil) => nivelDe(permisos, modulo, perfil) === 'total';
