/**
 * `permiso_menu` en la base (solo servidor). Lo usan /api/permisos-menu, que
 * los muestra y los guarda, y /api/avisos, que no le da a nadie avisos de un
 * modulo que su perfil no tiene.
 */
import { consultar, enTransaccion } from '@/app/lib/refautomex-db';
import { MODULOS, NIVELES, PERFILES, completarPermisos } from '@/app/lib/permisos-menu';

// El despliegue no corre `db:pg:push`, asi que la tabla se crea al guardar por
// primera vez. Tiene que ser identica a `permiso_menu` en lib/db/schema.pg.js
// para que un push posterior no vea diferencias.
//
// Cada columna es el indice en NIVELES (0 no, 1 lectura, 2 total). Antes solo
// existian admin y empleado, con 0/1: `supervisor` se agrega al guardar y va
// al final para que la tabla nueva y la que se altera queden iguales.
const CREAR_TABLA = `
  CREATE TABLE IF NOT EXISTS permiso_menu (
    modulo varchar(45) PRIMARY KEY NOT NULL,
    admin integer DEFAULT 0 NOT NULL,
    empleado integer DEFAULT 0 NOT NULL,
    supervisor integer DEFAULT 0 NOT NULL
  )`;

const AGREGAR_SUPERVISOR = 'ALTER TABLE permiso_menu ADD COLUMN IF NOT EXISTS supervisor integer DEFAULT 0 NOT NULL';

// Un indice fuera de NIVELES queda sin valor y completarPermisos pone el de
// siempre.
const nivelDeColumna = (valor) => NIVELES[Number(valor)];

/**
 * Permisos completos; mientras nadie haya guardado, los de siempre.
 *
 * Una tabla de antes no tiene `supervisor`: lo que se habia marcado para
 * empleado era para los que hoy son supervisores, asi que vale para los dos.
 * Su 1 ("lo ve") se lee como solo lectura, y completarPermisos lo vuelve
 * completo donde no la hay: solo Almacen de Empleado queda en solo lectura.
 */
export const leerPermisos = async () => {
  try {
    const filas = await consultar('SELECT * FROM permiso_menu');
    return completarPermisos(Object.fromEntries(filas.map((f) => [
      f.modulo,
      {
        admin: nivelDeColumna(f.admin),
        supervisor: nivelDeColumna(f.supervisor ?? f.empleado),
        empleado: nivelDeColumna(f.empleado),
      },
    ])));
  } catch (error) {
    if (error?.code === '42P01') return completarPermisos();
    throw error;
  }
};

/**
 * Guarda lo recibido y devuelve lo que quedo. completarPermisos descarta
 * modulos desconocidos y vuelve a poner los fijos: el navegador no puede darle
 * Permisos ni Respaldos a otro perfil.
 */
export const escribirPermisos = async (recibidos) => {
  const permisos = completarPermisos(recibidos);
  await enTransaccion(async (tx) => {
    await tx.escribir(CREAR_TABLA);
    await tx.escribir(AGREGAR_SUPERVISOR);
    for (const { clave } of MODULOS) {
      await tx.escribir(
        `INSERT INTO permiso_menu (modulo, ${PERFILES.join(', ')}) VALUES (?, ?, ?, ?)
         ON CONFLICT (modulo) DO UPDATE SET ${PERFILES.map((p) => `${p} = EXCLUDED.${p}`).join(', ')}`,
        [clave, ...PERFILES.map((perfil) => NIVELES.indexOf(permisos[clave][perfil]))]
      );
    }
  });
  return permisos;
};
