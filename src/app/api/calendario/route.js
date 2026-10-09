/**
 * /api/calendario - Servicios > Calendario: las fechas de cada sucursal
 * (juntas de avance, convivencias...).
 *
 *   GET ?idsucursal=N              { idsucursal, editable, eventos }
 *   PUT { idsucursal, eventos }    deja esa sucursal exactamente con esos eventos
 *
 * Solo un admin escribe. Un empleado lee, y solo su sucursal: se ignora la que
 * pida.
 *
 * El navegador manda la lista completa de la sucursal en cada cambio. Al
 * arrastrar, el calendario junta y parte rangos de dias, y mandar el resultado
 * es mas simple y seguro que reconstruir cada diferencia. Los ids los genera
 * el navegador y no cambian entre guardados.
 */
import { NextResponse } from 'next/server';

import { exigirAdmin, exigirEmpleado } from '@/app/lib/respaldos-auth';
import { consultar, enTransaccion } from '@/app/lib/refautomex-db';
import { perfilDeCategoria } from '@/app/lib/permisos-menu';
import { ETIQUETAS_CALENDARIO } from '@/app/lib/calendario';

export const dynamic = 'force-dynamic';

const MAX_EVENTOS = 500;

// El despliegue no corre `db:pg:push`: la tabla se crea al guardar por primera
// vez y tiene que ser identica a `calendario_evento` en lib/db/schema.pg.js.
// `fin` es el ultimo dia del evento (inclusivo), para que se lea igual en el
// respaldo CSV. `creado` no se toca al editar: con el la campana avisa de las
// fechas nuevas.
const CREAR_TABLA = `
  CREATE TABLE IF NOT EXISTS calendario_evento (
    id varchar(40) PRIMARY KEY NOT NULL,
    idsucursal integer NOT NULL,
    etiqueta varchar(30) NOT NULL,
    titulo varchar(120) NOT NULL,
    nota varchar(500),
    inicio date NOT NULL,
    fin date NOT NULL,
    actualizado_por integer,
    creado timestamp(3) DEFAULT now() NOT NULL
  )`;

const sinAcceso = (acceso) => NextResponse.json({ error: acceso.mensaje }, { status: acceso.estado });

const esFecha = (valor) =>
  typeof valor === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(valor)
  && new Date(`${valor}T00:00:00Z`).toISOString().startsWith(valor);

const eventoValido = (e) =>
  e
  && typeof e.id === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(e.id)
  && ETIQUETAS_CALENDARIO.includes(e.etiqueta)
  && typeof e.titulo === 'string' && e.titulo.trim().length > 0 && e.titulo.trim().length <= 120
  && (e.nota == null || (typeof e.nota === 'string' && e.nota.length <= 500))
  && esFecha(e.inicio) && esFecha(e.fin) && e.fin >= e.inicio;

const leerEventos = async (idsucursal) => {
  try {
    return await consultar(
      `SELECT id, etiqueta, titulo, nota,
              to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(fin, 'YYYY-MM-DD') AS fin
         FROM calendario_evento WHERE idsucursal = ? ORDER BY inicio, id`,
      [idsucursal]
    );
  } catch (error) {
    if (error?.code === '42P01') return [];
    throw error;
  }
};

export async function GET(request) {
  const acceso = await exigirEmpleado(request);
  if (!acceso.usuario) return sinAcceso(acceso);
  const { usuario } = acceso;
  const editable = perfilDeCategoria(usuario.categoria) === 'admin';

  const pedida = Number(request.nextUrl.searchParams.get('idsucursal'));
  const idsucursal = editable ? pedida : Number(usuario.idsucursal);
  if (!Number.isInteger(idsucursal) || idsucursal <= 0) {
    return NextResponse.json({ idsucursal: null, editable, eventos: [] });
  }

  try {
    return NextResponse.json({ idsucursal, editable, eventos: await leerEventos(idsucursal) });
  } catch (error) {
    console.error('[calendario]', error);
    return NextResponse.json({ error: 'No se pudo leer el calendario.' }, { status: 500 });
  }
}

export async function PUT(request) {
  const acceso = await exigirAdmin(request, 'Solo un administrador puede cambiar el calendario.');
  if (!acceso.usuario) return sinAcceso(acceso);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = null;
  }
  const idsucursal = Number(cuerpo?.idsucursal);
  const eventos = cuerpo?.eventos;
  if (!Number.isInteger(idsucursal) || idsucursal <= 0 || !Array.isArray(eventos)) {
    return NextResponse.json({ error: 'Faltan la sucursal o los eventos.' }, { status: 400 });
  }
  if (eventos.length > MAX_EVENTOS || !eventos.every(eventoValido)) {
    return NextResponse.json({ error: 'Hay eventos con datos no válidos.' }, { status: 400 });
  }
  if (new Set(eventos.map((e) => e.id)).size !== eventos.length) {
    return NextResponse.json({ error: 'Hay eventos repetidos.' }, { status: 400 });
  }

  try {
    const [sucursal] = await consultar('SELECT 1 AS existe FROM sucursal WHERE idsucursal = ?', [idsucursal]);
    if (!sucursal) return NextResponse.json({ error: 'La sucursal no existe.' }, { status: 400 });

    await enTransaccion(async (tx) => {
      await tx.escribir(CREAR_TABLA);
      await tx.escribir('ALTER TABLE calendario_evento ADD COLUMN IF NOT EXISTS creado timestamp(3) DEFAULT now() NOT NULL');
      await tx.escribir(
        'DELETE FROM calendario_evento WHERE idsucursal = ? AND NOT (id = ANY(?::varchar[]))',
        [idsucursal, eventos.map((e) => e.id)]
      );
      for (const e of eventos) {
        // El WHERE evita que un id de otra sucursal se mueva a esta.
        await tx.escribir(
          `INSERT INTO calendario_evento (id, idsucursal, etiqueta, titulo, nota, inicio, fin, actualizado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE
              SET etiqueta = EXCLUDED.etiqueta, titulo = EXCLUDED.titulo, nota = EXCLUDED.nota,
                  inicio = EXCLUDED.inicio, fin = EXCLUDED.fin, actualizado_por = EXCLUDED.actualizado_por
            WHERE calendario_evento.idsucursal = EXCLUDED.idsucursal`,
          [e.id, idsucursal, e.etiqueta, e.titulo.trim(), e.nota?.trim() || null, e.inicio, e.fin,
            acceso.usuario.idusuario]
        );
      }
    });
    return NextResponse.json({ guardados: eventos.length });
  } catch (error) {
    console.error('[calendario]', error);
    return NextResponse.json({ error: 'No se pudo guardar el calendario.' }, { status: 500 });
  }
}
