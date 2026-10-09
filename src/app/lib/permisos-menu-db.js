/**
 * `permiso_menu` en la base (solo servidor). Lo usan /api/permisos-menu, que
 * los muestra y los guarda, y /api/avisos, que no le da a nadie avisos de un
 * modulo que su perfil no tiene.
 */
import { consultar, enTransaccion } from '@/app/lib/refautomex-db';
import { MODULOS, completarPermisos } from '@/app/lib/permisos-menu';

// El despliegue no corre `db:pg:push`, asi que la tabla se crea al guardar por
// primera vez. Tiene que ser identica a `permiso_menu` en lib/db/schema.pg.js
// para que un push posterior no vea diferencias.
const CREAR_TABLA = `
  CREATE TABLE IF NOT EXISTS permiso_menu (
    modulo varchar(45) PRIMARY KEY NOT NULL,
    admin integer DEFAULT 0 NOT NULL,
    empleado integer DEFAULT 0 NOT NULL
  )`;

/** Permisos completos; mientras nadie haya guardado, los de siempre. */
export const leerPermisos = async () => {
  try {
    const filas = await consultar('SELECT modulo, admin, empleado FROM permiso_menu');
    return completarPermisos(Object.fromEntries(filas.map((f) => [
      f.modulo,
      { admin: Number(f.admin) === 1, empleado: Number(f.empleado) === 1 },
    ])));
  } catch (error) {
    if (error?.code === '42P01') return completarPermisos();
    throw error;
  }
};

/**
 * Guarda lo recibido y devuelve lo que quedo. completarPermisos descarta
 * modulos desconocidos y vuelve a poner los fijos: el navegador no puede darle
 * Permisos ni Respaldos a un empleado.
 */
export const escribirPermisos = async (recibidos) => {
  const permisos = completarPermisos(recibidos);
  await enTransaccion(async (tx) => {
    await tx.escribir(CREAR_TABLA);
    for (const { clave } of MODULOS) {
      await tx.escribir(
        `INSERT INTO permiso_menu (modulo, admin, empleado) VALUES (?, ?, ?)
         ON CONFLICT (modulo) DO UPDATE SET admin = EXCLUDED.admin, empleado = EXCLUDED.empleado`,
        [clave, permisos[clave].admin ? 1 : 0, permisos[clave].empleado ? 1 : 0]
      );
    }
  });
  return permisos;
};
