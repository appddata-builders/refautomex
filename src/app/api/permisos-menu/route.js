/**
 * /api/permisos-menu - Permisos > Permisos de perfil.
 *
 *   GET   { permisos }  lo que ve cada perfil; lo pide el menu de cualquier usuario del panel
 *   PUT   { permisos }  lo guarda; solo un administrador con sesion valida
 *
 * Se guarda en la tabla `permiso_menu`, un renglon por modulo (ver
 * permisos-menu-db.js). Mientras no exista se responde con los de siempre.
 *
 * Cada valor es un nivel ('no', 'lectura', 'total'). Una pestana abierta antes
 * de que hubiera niveles manda true/false; completarPermisos los ignoraria y
 * guardaria los de siempre encima de lo que el admin habia marcado, asi que se
 * rechaza.
 */
import { NextResponse } from 'next/server';

import { exigirAdmin } from '@/app/lib/respaldos-auth';
import { esNivel } from '@/app/lib/permisos-menu';
import { escribirPermisos, leerPermisos } from '@/app/lib/permisos-menu-db';

export const dynamic = 'force-dynamic';

// Un modulo o perfil que no venga lo completa escribirPermisos.
const sonNiveles = (permisos) =>
  Object.values(permisos).every((fila) =>
    fila && typeof fila === 'object' && Object.values(fila).every(esNivel));

export async function GET() {
  try {
    return NextResponse.json({ permisos: await leerPermisos() });
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
  if (!sonNiveles(cuerpo.permisos)) {
    return NextResponse.json({ error: 'Los permisos no son válidos; recarga la página.' }, { status: 400 });
  }

  try {
    const permisos = await escribirPermisos(cuerpo.permisos);
    console.info(`[permisos-menu] guardados por ${acceso.usuario.email}`);
    return NextResponse.json({ permisos });
  } catch (error) {
    console.error('[permisos-menu]', error);
    return NextResponse.json({ error: 'No se pudieron guardar los permisos.' }, { status: 500 });
  }
}
