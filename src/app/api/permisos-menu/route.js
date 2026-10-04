/**
 * /api/permisos-menu - Permisos > Permisos de perfil.
 *
 *   GET   { permisos }  lo que ve cada perfil; lo pide el menu de cualquier empleado
 *   PUT   { permisos }  lo guarda; solo un administrador con sesion valida
 *
 * Se guarda en la tabla `permiso_menu`, un renglon por modulo. Mientras no
 * exista (nadie ha guardado) se responde con los permisos de siempre.
 */
import { NextResponse } from 'next/server';

import { exigirAdmin } from '@/app/lib/respaldos-auth';
import { consultar, enTransaccion } from '@/app/lib/refautomex-db';
import { MODULOS, completarPermisos } from '@/app/lib/permisos-menu';

export const dynamic = 'force-dynamic';

// El despliegue no corre `db:pg:push`, asi que la tabla se crea al guardar por
// primera vez. Tiene que ser identica a `permiso_menu` en lib/db/schema.pg.js
// para que un push posterior no vea diferencias.
const CREAR_TABLA = `
  CREATE TABLE IF NOT EXISTS permiso_menu (
    modulo varchar(45) PRIMARY KEY NOT NULL,
    admin integer DEFAULT 0 NOT NULL,
    empleado integer DEFAULT 0 NOT NULL
  )`;

const leerGuardados = async () => {
  try {
    const filas = await consultar('SELECT modulo, admin, empleado FROM permiso_menu');
    return Object.fromEntries(filas.map((f) => [
      f.modulo,
      { admin: Number(f.admin) === 1, empleado: Number(f.empleado) === 1 },
    ]));
  } catch (error) {
    if (error?.code === '42P01') return {};
    throw error;
  }
};

export async function GET() {
  try {
    return NextResponse.json({ permisos: completarPermisos(await leerGuardados()) });
  } catch (error) {
    console.error('[permisos-menu]', error);
    return NextResponse.json({ error: 'No se pudieron leer los permisos.' }, { status: 500 });
  }
}

export async function PUT(request) {
  const acceso = await exigirAdmin(request, 'Solo un administrador puede cambiar los permisos.');
  if (!acceso.usuario) return NextResponse.json({ error: acceso.mensaje }, { status: acceso.estado });

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = null;
  }
  if (!cuerpo?.permisos || typeof cuerpo.permisos !== 'object') {
    return NextResponse.json({ error: 'Faltan los permisos.' }, { status: 400 });
  }

  // completarPermisos descarta modulos desconocidos y vuelve a poner los fijos:
  // el navegador no puede darle Permisos ni Respaldos a un empleado.
  const permisos = completarPermisos(cuerpo.permisos);

  try {
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
  } catch (error) {
    console.error('[permisos-menu]', error);
    return NextResponse.json({ error: 'No se pudieron guardar los permisos.' }, { status: 500 });
  }

  console.info(`[permisos-menu] guardados por ${acceso.usuario.email}`);
  return NextResponse.json({ permisos });
}
