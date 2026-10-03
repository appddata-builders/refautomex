/**
 * /api/respaldos - modulo Configuracion > Respaldos.
 *
 *   GET                  descarga DB_Daily_Backup_Refautomex.csv (todas las tablas)
 *   POST ?modo=revisar   recibe ese CSV y devuelve que cambiaria, sin tocar nada
 *   POST ?modo=aplicar   lo mismo, y escribe los cambios
 *
 * Solo administradores con sesion valida (ver respaldos-auth.js). Va aparte de
 * /api/refautomex porque ese despachador responde JSON y no pide sesion.
 */
import { NextResponse } from 'next/server';

import { exigirAdmin } from '@/app/lib/respaldos-auth';
import {
  ARCHIVO_RESPALDO, ErrorDeRespaldo, LIMITE_BYTES, generarCsv, procesarCsv,
} from '@/app/lib/respaldos-db';

export const dynamic = 'force-dynamic';

const sinAcceso = (acceso) => NextResponse.json({ error: acceso.mensaje }, { status: acceso.estado });

export async function GET(request) {
  const acceso = await exigirAdmin(request);
  if (!acceso.usuario) return sinAcceso(acceso);

  const csv = await generarCsv();
  console.info(`[respaldos] descarga de ${acceso.usuario.email} (${csv.length} caracteres)`);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${ARCHIVO_RESPALDO}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request) {
  const acceso = await exigirAdmin(request);
  if (!acceso.usuario) return sinAcceso(acceso);

  const aplicar = request.nextUrl.searchParams.get('modo') === 'aplicar';

  if (Number(request.headers.get('content-length') || 0) > LIMITE_BYTES) {
    return NextResponse.json({ error: 'El archivo es demasiado grande.' }, { status: 413 });
  }
  const texto = await request.text();
  if (texto.length > LIMITE_BYTES) {
    return NextResponse.json({ error: 'El archivo es demasiado grande.' }, { status: 413 });
  }

  try {
    const resultado = await procesarCsv(texto, { aplicar });
    if (aplicar) {
      const nuevos = resultado.tablas.reduce((s, t) => s + (t.nuevos || 0), 0);
      const cambiados = resultado.tablas.reduce((s, t) => s + (t.cambiados || 0), 0);
      console.info(`[respaldos] carga aplicada por ${acceso.usuario.email}: ${nuevos} nuevos, ${cambiados} renglones cambiados`);
    }
    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof ErrorDeRespaldo) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Un error de Postgres al aplicar (llave repetida, columna obligatoria
    // vacia en un renglon nuevo) viene del contenido del archivo: se muestra
    // tal cual para que se pueda corregir.
    if (error?.code) {
      return NextResponse.json({ error: `La base rechazó el cambio: ${error.message}` }, { status: 422 });
    }
    console.error('[respaldos]', error);
    return NextResponse.json({ error: 'No se pudo procesar el archivo.' }, { status: 500 });
  }
}
