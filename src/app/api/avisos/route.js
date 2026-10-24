/**
 * /api/avisos - la campana del panel (ver lib/avisos.js).
 *
 *   GET                         { perfil, avisos: [{ clave, nivel, modulo, datos, firma, nuevo }] }
 *   POST { vistos: [{ clave, firma }] }   marca esos avisos como vistos
 *
 * Pide sesion de empleado activo: los avisos dependen de quien pregunta (su
 * perfil, su sucursal, su cumpleanos) y traen nombres de companeros.
 */
import { NextResponse } from 'next/server';

import { exigirEmpleado } from '@/app/lib/respaldos-auth';
import { leerPermisos } from '@/app/lib/permisos-menu-db';
import { calcularAvisos, leerVistos, marcarVistos } from '@/app/lib/avisos';
import { perfilDeCategoria } from '@/app/lib/permisos-menu';

export const dynamic = 'force-dynamic';

const sinAcceso = (acceso) => NextResponse.json({ error: acceso.mensaje }, { status: acceso.estado });

export async function GET(request) {
  const acceso = await exigirEmpleado(request);
  if (!acceso.usuario) return sinAcceso(acceso);
  const { usuario } = acceso;

  try {
    const [permisos, vistos] = await Promise.all([leerPermisos(), leerVistos(usuario.idusuario)]);
    const avisos = await calcularAvisos(usuario, permisos, vistos);
    return NextResponse.json({
      perfil: perfilDeCategoria(usuario.categoria),
      avisos: avisos.map((aviso) => ({ ...aviso, nuevo: vistos[aviso.clave] !== aviso.firma })),
    });
  } catch (error) {
    console.error('[avisos]', error);
    return NextResponse.json({ error: 'No se pudieron calcular los avisos.' }, { status: 500 });
  }
}

export async function POST(request) {
  const acceso = await exigirEmpleado(request);
  if (!acceso.usuario) return sinAcceso(acceso);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = null;
  }
  if (!Array.isArray(cuerpo?.vistos)) {
    return NextResponse.json({ error: 'Faltan los avisos vistos.' }, { status: 400 });
  }

  try {
    const marcados = await marcarVistos(acceso.usuario.idusuario, cuerpo.vistos.slice(0, 20));
    return NextResponse.json({ marcados });
  } catch (error) {
    console.error('[avisos]', error);
    return NextResponse.json({ error: 'No se pudieron marcar los avisos.' }, { status: 500 });
  }
}
