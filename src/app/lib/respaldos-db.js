/**
 * Respaldo de toda la base de refautomex en UN solo CSV, y la carga de vuelta.
 * Lo usa /api/respaldos (modulo Configuracion > Respaldos).
 *
 * FORMATO
 * Un CSV no tiene "hojas", asi que todas las tablas van en el mismo archivo:
 * la primera columna, `tabla`, dice a que tabla pertenece el renglon, y despues
 * vienen todas las columnas de todas las tablas. Cada renglon solo llena las
 * de su tabla. En Excel se filtra por `tabla` y se edita como cualquier hoja.
 * Va en UTF-8 con BOM: sin el, Excel abre "CIGUEÑAL" como "CIGUEÃ‘AL".
 *
 * CARGA
 * Cada renglon se compara contra la base por su llave primaria:
 *   - llave que no existe     -> renglon nuevo, se inserta
 *   - llave que existe        -> se actualizan las celdas que cambiaron
 *   - renglon solo en la base -> se reporta y NO se borra nunca
 * Antes de tocar nada se valida cada celda contra el tipo de su columna
 * (pg_input_is_valid). Con un solo error no se aplica nada, y todo corre en una
 * transaccion: o entra completo o no entra.
 *
 * Excel suele guardar las fechas como 22/11/2024; con datestyle DMY esas se
 * leen bien, y las del respaldo (2024-11-22) tambien.
 */
import { consultar, enTransaccion } from '@/app/lib/refautomex-db';

export const ARCHIVO_RESPALDO = 'DB_Daily_Backup_Refautomex.csv';

// El respaldo completo pesa unos 10 MB; esto deja margen sin aceptar
// cualquier cosa.
export const LIMITE_BYTES = 40 * 1024 * 1024;

const MAX_CAMBIOS = 1000;
const MAX_ERRORES = 200;

/** Errores del archivo (no del servidor): se responden con 400. */
export class ErrorDeRespaldo extends Error {}

const ident = (nombre) => `"${String(nombre).replace(/"/g, '""')}"`;
const literal = (texto) => `'${String(texto).replace(/'/g, "''")}'`;

const leerEsquema = async (q) => {
  const columnas = await q(`
    SELECT c.table_name AS tabla, c.column_name AS columna,
           format_type(a.atttypid, a.atttypmod) AS tipo,
           c.is_nullable = 'YES' AS nulo,
           c.data_type IN ('text', 'character varying', 'character') AS texto,
           c.is_identity = 'YES' AS identidad
      FROM information_schema.columns c
      JOIN pg_namespace n ON n.nspname = c.table_schema
      JOIN pg_class k ON k.relnamespace = n.oid AND k.relname = c.table_name
      JOIN pg_attribute a ON a.attrelid = k.oid AND a.attname = c.column_name
     WHERE c.table_schema = 'public' AND k.relkind = 'r'
     ORDER BY c.table_name, c.ordinal_position`);

  const llaves = await q(`
    SELECT tc.table_name AS tabla, kcu.column_name AS columna
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'`);

  const esquema = {};
  for (const c of columnas) (esquema[c.tabla] ??= { columnas: [], llave: null }).columnas.push(c);
  for (const l of llaves) if (esquema[l.tabla]) esquema[l.tabla].llave = l.columna;
  return esquema;
};

// ---------------------------------------------------------------- exportar ---

const celda = (valor) => {
  if (valor === null || valor === undefined) return '';
  const s = String(valor);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const linea = (valores) => valores.map(celda).join(',');

export const generarCsv = async () => {
  const esquema = await leerEsquema(consultar);
  const tablas = Object.keys(esquema).filter((t) => esquema[t].llave).sort();

  const encabezado = ['tabla'];
  for (const t of tablas) {
    for (const c of esquema[t].columnas) {
      if (!encabezado.includes(c.columna)) encabezado.push(c.columna);
    }
  }

  const partes = [`﻿${linea(encabezado)}`];

  for (const t of tablas) {
    const { columnas, llave } = esquema[t];
    const presentes = new Set(columnas.map((c) => c.columna));
    // ::text para que fechas y numeros salgan tal como los escribe Postgres
    // (2024-11-22, 431.03), que es justo lo que la carga sabe leer.
    const filas = await consultar(
      `SELECT ${columnas.map((c) => `${ident(c.columna)}::text AS ${ident(c.columna)}`).join(', ')}
         FROM ${ident(t)} ORDER BY ${ident(llave)}`
    );
    for (const f of filas) {
      partes.push(linea(encabezado.map((c) => (c === 'tabla' ? t : presentes.has(c) ? f[c] : null))));
    }
  }

  return `${partes.join('\r\n')}\r\n`;
};

// ------------------------------------------------------------------ cargar ---

/**
 * CSV a arreglo de renglones. Soporta comillas con saltos de linea dentro,
 * comillas dobladas, CRLF y el `;` que usa Excel en algunas configuraciones.
 */
export const parsearCsv = (texto) => {
  const s = String(texto).replace(/^﻿/, '');
  const finPrimera = s.search(/\r?\n/);
  const primera = finPrimera === -1 ? s : s.slice(0, finPrimera);
  const sep = !primera.includes(',') && primera.includes(';') ? ';' : ',';

  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (entreComillas) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += ch;
      }
    } else if (ch === '"' && campo === '') {
      entreComillas = true;
    } else if (ch === sep) {
      fila.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += ch;
    }
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((c) => c !== ''));
};

/**
 * Compara el CSV contra la base y, con `aplicar`, escribe los cambios.
 * Sin `aplicar` no modifica nada: es la vista previa.
 */
export const procesarCsv = async (texto, { aplicar = false } = {}) => {
  const filas = parsearCsv(texto);
  if (filas.length < 2) throw new ErrorDeRespaldo('El archivo está vacío.');

  const [encabezado, ...datos] = filas;
  const nombres = encabezado.map((h) => h.trim());
  const posicion = new Map(nombres.map((n, i) => [n, i]));
  const iTabla = posicion.get('tabla');

  if (iTabla === undefined) {
    throw new ErrorDeRespaldo('El archivo no tiene la columna "tabla": no parece un respaldo de refautomex.');
  }
  if (posicion.size !== nombres.length) {
    throw new ErrorDeRespaldo('El encabezado tiene columnas repetidas.');
  }

  const porTabla = new Map();
  for (const f of datos) {
    const t = String(f[iTabla] ?? '').trim();
    if (!porTabla.has(t)) porTabla.set(t, []);
    porTabla.get(t).push(f);
  }

  return enTransaccion(async (tx) => {
    await tx.escribir("SET LOCAL datestyle = 'ISO, DMY'");
    const esquema = await leerEsquema(tx.consultar);

    const tablas = [];
    const cambios = [];
    const errores = [];
    const avisos = [];
    let totalCambios = 0;
    let n = 0;

    for (const [tabla, filasTabla] of porTabla) {
      const def = esquema[tabla];
      if (!def || !def.llave) {
        avisos.push(`Se ignoraron ${filasTabla.length} renglones de "${tabla || '(sin tabla)'}": no es una tabla de la base.`);
        continue;
      }

      const cols = def.columnas.filter((c) => posicion.has(c.columna));
      const llave = def.columnas.find((c) => c.columna === def.llave);
      if (!cols.includes(llave)) {
        errores.push({ tabla, columna: def.llave, mensaje: `Falta la columna llave "${def.llave}".` });
        continue;
      }

      const tmp = `_respaldo_${n}`;
      n += 1;
      await tx.escribir(
        `CREATE TEMP TABLE ${tmp} (${cols.map((c) => `${ident(c.columna)} text`).join(', ')}) ON COMMIT DROP`
      );
      const objetos = filasTabla.map((f) =>
        Object.fromEntries(cols.map((c) => [c.columna, f[posicion.get(c.columna)] ?? '']))
      );
      await tx.escribir(
        `INSERT INTO ${tmp} SELECT * FROM json_populate_recordset(NULL::${tmp}, ?::json)`,
        [JSON.stringify(objetos)]
      );

      // ------------------------------------------------------ validacion ---
      const L = ident(def.llave);
      const erroresTabla = [];

      const llavesMalas = await tx.consultar(
        `SELECT ${L} AS llave, count(*)::int AS veces FROM ${tmp}
          GROUP BY 1 HAVING coalesce(${L}, '') = '' OR count(*) > 1 LIMIT 20`
      );
      for (const m of llavesMalas) {
        erroresTabla.push({
          tabla, llave: m.llave || '(vacía)', columna: def.llave,
          mensaje: m.veces > 1 ? `La llave aparece ${m.veces} veces.` : 'La llave está vacía.',
        });
      }

      for (const c of cols) {
        const C = ident(c.columna);
        const invalidos = await tx.consultar(
          `SELECT ${L} AS llave, ${C} AS valor FROM ${tmp}
            WHERE ${C} <> '' AND NOT pg_input_is_valid(${C}, ?) LIMIT 20`,
          [c.tipo]
        );
        for (const r of invalidos) {
          erroresTabla.push({
            tabla, llave: r.llave, columna: c.columna, valor: r.valor,
            mensaje: `No es un valor válido (${c.tipo}).`,
          });
        }
        if (!c.nulo && !c.texto) {
          const vacios = await tx.consultar(
            `SELECT ${L} AS llave FROM ${tmp} WHERE coalesce(${C}, '') = '' LIMIT 20`
          );
          for (const r of vacios) {
            erroresTabla.push({ tabla, llave: r.llave, columna: c.columna, mensaje: 'No puede ir vacío.' });
          }
        }
      }

      if (erroresTabla.length) {
        errores.push(...erroresTabla);
        tablas.push({ tabla, filas: filasTabla.length, conErrores: true });
        continue;
      }

      // ----------------------------------------------------- comparacion ---
      // Vacio y NULL valen lo mismo en texto: el CSV no distingue entre los
      // dos, y marcarlos como cambio llenaria la vista previa de falsos.
      const convertir = (c) => {
        const v = `i.${ident(c.columna)}`;
        if (c.texto && !c.nulo) return `coalesce(${v}, '')::${c.tipo}`;
        return `NULLIF(${v}, '')::${c.tipo}`;
      };
      const distinto = (c) => (c.texto
        ? `coalesce(t.${ident(c.columna)}::text, '') IS DISTINCT FROM coalesce(i.${ident(c.columna)}, '')`
        : `t.${ident(c.columna)} IS DISTINCT FROM ${convertir(c)}`);

      const T = ident(tabla);
      const une = `t.${L} = ${convertir(llave)}`;
      const otras = cols.filter((c) => c !== llave);
      const algunCambio = otras.length ? otras.map(distinto).join(' OR ') : 'false';

      const [conteo] = await tx.consultar(
        `SELECT count(*) FILTER (WHERE t.${L} IS NULL)::int AS nuevos,
                count(*) FILTER (WHERE t.${L} IS NOT NULL AND (${algunCambio}))::int AS cambiados,
                count(*) FILTER (WHERE t.${L} IS NOT NULL AND NOT (${algunCambio}))::int AS sin_cambio
           FROM ${tmp} i LEFT JOIN ${T} t ON ${une}`
      );
      const [{ solo_base: soloEnBase }] = await tx.consultar(
        `SELECT count(*)::int AS solo_base FROM ${T} t
          WHERE NOT EXISTS (SELECT 1 FROM ${tmp} i WHERE ${une})`
      );
      const nuevosEjemplo = conteo.nuevos
        ? (await tx.consultar(
          `SELECT i.${L} AS llave FROM ${tmp} i LEFT JOIN ${T} t ON ${une} WHERE t.${L} IS NULL LIMIT 10`
        )).map((r) => r.llave)
        : [];

      if (conteo.cambiados) {
        const union = otras.map((c) => `
          SELECT i.${L} AS llave, ${literal(c.columna)} AS columna,
                 t.${ident(c.columna)}::text AS antes, NULLIF(i.${ident(c.columna)}, '') AS despues
            FROM ${tmp} i JOIN ${T} t ON ${une}
           WHERE ${distinto(c)}`).join(' UNION ALL ');
        const [{ celdas }] = await tx.consultar(`SELECT count(*)::int AS celdas FROM (${union}) x`);
        totalCambios += celdas;
        if (cambios.length < MAX_CAMBIOS) {
          const filasCambio = await tx.consultar(
            `SELECT * FROM (${union}) x LIMIT ${MAX_CAMBIOS - cambios.length}`
          );
          cambios.push(...filasCambio.map((r) => ({ tabla, ...r })));
        }
      }

      tablas.push({
        tabla,
        filas: filasTabla.length,
        nuevos: conteo.nuevos,
        cambiados: conteo.cambiados,
        sinCambio: conteo.sin_cambio,
        soloEnBase,
        nuevosEjemplo,
      });

      // --------------------------------------------------------- aplicar ---
      if (!aplicar) continue;

      if (conteo.cambiados && otras.length) {
        await tx.escribir(
          `UPDATE ${T} t
              SET ${otras.map((c) => `${ident(c.columna)} = ${convertir(c)}`).join(', ')}
             FROM ${tmp} i
            WHERE ${une} AND (${algunCambio})`
        );
      }

      if (conteo.nuevos) {
        await tx.escribir(
          `INSERT INTO ${T} (${cols.map((c) => ident(c.columna)).join(', ')})
           SELECT ${cols.map(convertir).join(', ')} FROM ${tmp} i
            WHERE NOT EXISTS (SELECT 1 FROM ${T} t WHERE ${une})`
        );
        // Los ids nuevos llegaron explicitos: sin esto, la siguiente venta
        // capturada en el panel chocaria contra uno de ellos.
        for (const c of def.columnas.filter((col) => col.identidad)) {
          await tx.consultar(
            `SELECT setval(pg_get_serial_sequence(?, ?),
                           coalesce((SELECT max(${ident(c.columna)}) FROM ${T}), 0) + 1, false)`,
            [T, c.columna]
          );
        }
      }
    }

    // La transaccion se revierte entera: lo de las tablas sin error tampoco
    // entra. Aplicar a medias dejaria la base distinta del archivo.
    if (aplicar && errores.length) {
      throw new ErrorDeRespaldo(`El archivo tiene ${errores.length} errores; no se aplicó nada.`);
    }

    return {
      aplicado: aplicar,
      tablas,
      cambios,
      totalCambios,
      errores: errores.slice(0, MAX_ERRORES),
      totalErrores: errores.length,
      avisos,
    };
  });
};
