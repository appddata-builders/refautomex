/**
 * /api/vacaciones - dias de vacaciones de los empleados.
 *
 *   GET                         lo propio: { hoy, anios: { 2026: { asignados, usados } }, dias: [...] }
 *   GET ?idsucursal=N           (admin) ademas `sucursal`: [{ fecha, idusuario, nombre }]
 *   GET ?vista=resumen          (admin) { anio, empleados: [{ idusuario, asignados, usados }] }
 *   POST { agregar, quitar }    el empleado pone o quita sus dias; cada dia descuenta uno
 *   PUT { idusuario, dias }     (admin) dias que le tocan a un empleado este ano
 *
 * Los dias asignados son por ano calendario y se arrastran: si no se fijaron
 * para 2027 valen los de 2026. Los usados son los dias marcados en ese ano.
 * El empleado solo mueve dias de hoy en adelante (no puede devolver uno que ya
 * tomo) y hasta fin del ano siguiente.
 */
import { NextResponse } from 'next/server';

import { exigirAdmin, exigirEmpleado } from '@/app/lib/respaldos-auth';
import { consultar, enTransaccion } from '@/app/lib/refautomex-db';
import { perfilDeCategoria } from '@/app/lib/permisos-menu';
import { fechaTienda } from '@/app/lib/avisos';

export const dynamic = 'force-dynamic';

const MAX_DIAS_ANIO = 60;
const MAX_POR_ENVIO = 62;

// Se crean al escribir por primera vez y tienen que ser identicas a
// `vacacion` y `vacacion_dias` en lib/db/schema.pg.js. Las llaves son de una
// columna ("<idusuario>:<fecha>", "<idusuario>:<anio>") porque el respaldo CSV
// solo maneja esas, y de paso impiden repetir un dia.
const TABLAS = [
  `CREATE TABLE IF NOT EXISTS vacacion (
     id varchar(30) PRIMARY KEY NOT NULL,
     idusuario integer NOT NULL,
     fecha date NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS vacacion_dias (
     id varchar(20) PRIMARY KEY NOT NULL,
     idusuario integer NOT NULL,
     anio integer NOT NULL,
     dias integer DEFAULT 0 NOT NULL
   )`,
];

class SinSaldo extends Error {
  constructor(anio, restan) {
    super('Sin saldo de vacaciones.');
    this.anio = anio;
    this.restan = restan;
  }
}

const sinAcceso = (acceso) => NextResponse.json({ error: acceso.mensaje }, { status: acceso.estado });
const sinTabla = (error) => error?.code === '42P01';
const anioDe = (fecha) => Number(fecha.slice(0, 4));

const esFecha = (valor) =>
  typeof valor === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(valor)
  && new Date(`${valor}T00:00:00Z`).toISOString().startsWith(valor);

const SQL_ASIGNADOS = `COALESCE((SELECT d.dias FROM vacacion_dias d
                                 WHERE d.idusuario = u.idusuario AND d.anio <= ?
                                 ORDER BY d.anio DESC LIMIT 1), 0)`;
const SQL_USADOS = `(SELECT count(*)::int FROM vacacion v
                     WHERE v.idusuario = u.idusuario
                       AND v.fecha >= make_date(?, 1, 1) AND v.fecha < make_date(? + 1, 1, 1))`;

const saldo = async (q, idusuario, anio) => {
  const [fila] = await q(
    `SELECT ${SQL_ASIGNADOS} AS asignados, ${SQL_USADOS} AS usados FROM usuario u WHERE u.idusuario = ?`,
    [anio, anio, anio, idusuario]
  );
  return { asignados: Number(fila?.asignados ?? 0), usados: Number(fila?.usados ?? 0) };
};

const leerPropio = async (q, idusuario) => {
  const hoy = fechaTienda(0);
  const anio = anioDe(hoy);
  const dias = await q(
    `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM vacacion
      WHERE idusuario = ? AND fecha >= make_date(?, 1, 1) ORDER BY fecha`,
    [idusuario, anio - 1]
  );
  return {
    hoy,
    anios: { [anio]: await saldo(q, idusuario, anio), [anio + 1]: await saldo(q, idusuario, anio + 1) },
    dias: dias.map((d) => d.fecha),
  };
};

const vacio = () => {
  const hoy = fechaTienda(0);
  const anio = anioDe(hoy);
  const cero = { asignados: 0, usados: 0 };
  return { hoy, anios: { [anio]: cero, [anio + 1]: cero }, dias: [], sucursal: [] };
};

export async function GET(request) {
  const acceso = await exigirEmpleado(request);
  if (!acceso.usuario) return sinAcceso(acceso);
  const { usuario } = acceso;
  const admin = perfilDeCategoria(usuario.categoria) === 'admin';
  const params = request.nextUrl.searchParams;

  try {
    if (params.get('vista') === 'resumen') {
      if (!admin) return NextResponse.json({ error: 'Solo administradores.' }, { status: 403 });
      const anio = anioDe(fechaTienda(0));
      try {
        const empleados = await consultar(
          `SELECT u.idusuario, ${SQL_ASIGNADOS} AS asignados, ${SQL_USADOS} AS usados
             FROM usuario u WHERE u.empleado = 1`,
          [anio, anio, anio]
        );
        return NextResponse.json({ anio, empleados });
      } catch (error) {
        if (sinTabla(error)) return NextResponse.json({ anio, empleados: [] });
        throw error;
      }
    }

    let datos;
    try {
      datos = await leerPropio(consultar, usuario.idusuario);
      const idsucursal = Number(params.get('idsucursal'));
      datos.sucursal = admin && Number.isInteger(idsucursal) && idsucursal > 0
        ? await consultar(
          `SELECT to_char(v.fecha, 'YYYY-MM-DD') AS fecha, v.idusuario,
                  trim(concat_ws(' ', u.nombre, split_part(u.apellido, ' ', 1))) AS nombre
             FROM vacacion v JOIN usuario u ON u.idusuario = v.idusuario
            WHERE u.idsucursal = ? AND u.empleado = 1 AND v.fecha >= ?::date - 366
            ORDER BY v.fecha`,
          [idsucursal, datos.hoy]
        )
        : [];
    } catch (error) {
      if (!sinTabla(error)) throw error;
      datos = vacio();
    }
    return NextResponse.json(datos);
  } catch (error) {
    console.error('[vacaciones]', error);
    return NextResponse.json({ error: 'No se pudieron leer las vacaciones.' }, { status: 500 });
  }
}

export async function POST(request) {
  const acceso = await exigirEmpleado(request);
  if (!acceso.usuario) return sinAcceso(acceso);
  const idusuario = acceso.usuario.idusuario;

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = null;
  }
  const lista = (valor) => (Array.isArray(valor) ? [...new Set(valor)] : null);
  const agregar = lista(cuerpo?.agregar ?? []);
  const quitar = lista(cuerpo?.quitar ?? []);
  if (!agregar || !quitar || agregar.length + quitar.length === 0
    || agregar.length > MAX_POR_ENVIO || quitar.length > MAX_POR_ENVIO
    || ![...agregar, ...quitar].every(esFecha) || agregar.some((f) => quitar.includes(f))) {
    return NextResponse.json({ error: 'Fechas no válidas.' }, { status: 400 });
  }

  const hoy = fechaTienda(0);
  const limite = `${anioDe(hoy) + 1}-12-31`;
  if ([...agregar, ...quitar].some((f) => f < hoy || f > limite)) {
    return NextResponse.json({ error: 'Solo se mueven días de hoy en adelante.', codigo: 'fuera' }, { status: 400 });
  }

  try {
    const datos = await enTransaccion(async (tx) => {
      for (const sql of TABLAS) await tx.escribir(sql);
      // Dos pestanas guardando a la vez no deben pasarse del saldo.
      await tx.consultar('SELECT idusuario FROM usuario WHERE idusuario = ? FOR UPDATE', [idusuario]);

      if (quitar.length) {
        await tx.escribir('DELETE FROM vacacion WHERE idusuario = ? AND fecha = ANY(?::date[])', [idusuario, quitar]);
      }

      const existentes = new Set((await tx.consultar(
        `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM vacacion
          WHERE idusuario = ? AND fecha = ANY(?::date[])`,
        [idusuario, agregar]
      )).map((f) => f.fecha));
      const nuevos = agregar.filter((f) => !existentes.has(f));

      const porAnio = {};
      for (const f of nuevos) porAnio[anioDe(f)] = (porAnio[anioDe(f)] || 0) + 1;
      for (const [anio, cuantos] of Object.entries(porAnio)) {
        const { asignados, usados } = await saldo(tx.consultar, idusuario, Number(anio));
        if (usados + cuantos > asignados) throw new SinSaldo(Number(anio), Math.max(0, asignados - usados));
      }

      for (const f of nuevos) {
        await tx.escribir(
          'INSERT INTO vacacion (id, idusuario, fecha) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING',
          [`${idusuario}:${f}`, idusuario, f]
        );
      }
      return leerPropio(tx.consultar, idusuario);
    });
    return NextResponse.json(datos);
  } catch (error) {
    if (error instanceof SinSaldo) {
      return NextResponse.json(
        { error: 'No quedan días suficientes.', codigo: 'saldo', anio: error.anio, restan: error.restan },
        { status: 409 }
      );
    }
    console.error('[vacaciones]', error);
    return NextResponse.json({ error: 'No se pudieron guardar las vacaciones.' }, { status: 500 });
  }
}

export async function PUT(request) {
  const acceso = await exigirAdmin(request, 'Solo un administrador asigna días de vacaciones.');
  if (!acceso.usuario) return sinAcceso(acceso);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = null;
  }
  const idusuario = Number(cuerpo?.idusuario);
  const dias = Number(cuerpo?.dias);
  if (!Number.isInteger(idusuario) || idusuario <= 0
    || !Number.isInteger(dias) || dias < 0 || dias > MAX_DIAS_ANIO) {
    return NextResponse.json({ error: `Los días van de 0 a ${MAX_DIAS_ANIO}.` }, { status: 400 });
  }
  const anio = anioDe(fechaTienda(0));

  try {
    const resultado = await enTransaccion(async (tx) => {
      for (const sql of TABLAS) await tx.escribir(sql);
      const [empleado] = await tx.consultar(
        'SELECT idusuario FROM usuario WHERE idusuario = ? AND empleado = 1 FOR UPDATE',
        [idusuario]
      );
      if (!empleado) return { estado: 404, cuerpo: { error: 'El empleado no existe o no está activo.' } };

      // No se le puede asignar menos de lo que ya tomo: quedaria en negativo.
      const { usados } = await saldo(tx.consultar, idusuario, anio);
      if (dias < usados) {
        return { estado: 409, cuerpo: { error: 'Ya usó más días.', codigo: 'usados', usados } };
      }

      await tx.escribir(
        `INSERT INTO vacacion_dias (id, idusuario, anio, dias) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET dias = EXCLUDED.dias`,
        [`${idusuario}:${anio}`, idusuario, anio, dias]
      );
      return { cuerpo: { idusuario, anio, asignados: dias, usados } };
    });
    return NextResponse.json(resultado.cuerpo, { status: resultado.estado ?? 200 });
  } catch (error) {
    console.error('[vacaciones]', error);
    return NextResponse.json({ error: 'No se pudieron guardar los días.' }, { status: 500 });
  }
}
