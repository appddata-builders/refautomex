// Llaves foraneas de refautomex: el estado de cada una y, con --aplicar, su
// creacion en una base que ya tiene datos. --revertir la deja como estaba.
//
// Las define schema.pg.js (cada `.references()`). La base reconstruida en
// 2026-10 no trae ninguna y tiene renglones huerfanos, asi que `db:pg:push` no
// puede crearlas: fallaria al validarlas. Con --aplicar, en una transaccion:
//
//   1. concepto.idventa y pedidos.idventa: cambia cada folio ('T0001', los de
//      2024) por el idVenta de su venta y pasa la columna a integer. Los
//      renglones cuyo folio no tiene venta (el dump de 2024 los trajo sin
//      ella, y ninguna pantalla los mostraba) se mueven a
//      respaldo_llaves.<tabla>_sin_venta.
//   2. factura.idventa: la llena desde el folio.
//   3. Crea las llaves que faltan como NOT VALID: desde ese momento toda
//      escritura nueva se revisa, y los huerfanos que ya estaban se quedan.
//   4. Valida las que no tienen huerfanos.
//
// Todo lo que cambia o mueve queda antes en el esquema `respaldo_llaves`,
// fuera de `public`: push, el respaldo CSV y db:pg:check no lo ven.
// --revertir quita las llaves y los indices de schema.pg.js, regresa idventa a
// varchar con sus folios, devuelve los renglones movidos y borra el esquema.
//
// Sin argumentos es de solo lectura. Volver a correr --aplicar no repite nada:
// solo valida las que se hayan limpiado. Despues va `npm run db:pg:push`, que
// crea los indices y ya no ve diferencias en las llaves (drizzle-kit no
// compara NOT VALID).
import nextEnv from '@next/env';
import pg from 'pg';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../src/app/lib/db/schema.pg.js';
import { requirePgDatabaseUrl } from '../src/app/lib/db/runtime-driver.mjs';

nextEnv.loadEnvConfig(process.cwd());

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');
const ident = (nombre) => `"${nombre.replace(/"/g, '""')}"`;
const ACCION = { 'no action': 'NO ACTION', restrict: 'RESTRICT', cascade: 'CASCADE', 'set null': 'SET NULL', 'set default': 'SET DEFAULT' };
const RESPALDO = 'respaldo_llaves';
// Las dos tablas cuyo idventa guardaba folios, con su llave primaria.
const CON_FOLIO = { concepto: 'idconcepto', pedidos: 'idpedido' };

const tablas = Object.values(schema).filter((valor) => is(valor, PgTable)).map(getTableConfig);
const llaves = tablas.flatMap((config) => config.foreignKeys.map((fk) => {
  const { columns, foreignColumns } = fk.reference();
  return {
    nombre: fk.getName(),
    tabla: config.name,
    columna: columns[0].name,
    padre: getTableConfig(foreignColumns[0].table).name,
    columnaPadre: foreignColumns[0].name,
    onDelete: ACCION[fk.onDelete ?? 'no action'],
    onUpdate: ACCION[fk.onUpdate ?? 'no action'],
  };
}));
const indices = tablas.flatMap((config) => config.indexes.map((i) => i.config.name));

// Una venta por folio. Un folio repetido no se puede traducir a un id, y se
// trata igual que uno sin venta.
const FOLIO_UNICO = `(SELECT folio, min("idVenta") AS id FROM venta GROUP BY folio HAVING count(*) = 1)`;

const normalizarIdventa = async (q, tipos) => {
  for (const [tabla, pk] of Object.entries(CON_FOLIO)) {
    if (tipos[`${tabla}.idventa`] !== 'character varying') continue;
    const [antes] = await q(
      `SELECT count(*) FILTER (WHERE u.id IS NOT NULL)::int AS con_venta,
              count(*) FILTER (WHERE u.id IS NULL)::int AS sin_venta,
              (array_agg(DISTINCT t.idventa) FILTER (WHERE u.id IS NULL))[1:5] AS ejemplos
         FROM ${tabla} t LEFT JOIN ${FOLIO_UNICO} u ON u.folio = t.idventa
        WHERE t.idventa !~ '^[0-9]+$'`);
    console.log(`${tabla}.idventa: ${antes.con_venta} renglones con folio de una venta, `
      + `${antes.sin_venta} con folio sin venta${antes.sin_venta ? ` (${antes.ejemplos.join(', ')}...) que se mueven a ${RESPALDO}.${tabla}_sin_venta` : ''}`);
    if (!APLICAR) continue;

    await q(`CREATE TABLE IF NOT EXISTS ${RESPALDO}.${tabla}_idventa (id integer PRIMARY KEY, idventa varchar(100) NOT NULL)`);
    await q(`INSERT INTO ${RESPALDO}.${tabla}_idventa SELECT ${pk}, idventa FROM ${tabla}
              WHERE idventa !~ '^[0-9]+$' ON CONFLICT (id) DO NOTHING`);
    await q(`CREATE TABLE IF NOT EXISTS ${RESPALDO}.${tabla}_sin_venta (LIKE ${tabla})`);
    await q(`WITH movidos AS (
               DELETE FROM ${tabla} t WHERE t.idventa !~ '^[0-9]+$'
                  AND NOT EXISTS (SELECT 1 FROM ${FOLIO_UNICO} u WHERE u.folio = t.idventa)
               RETURNING t.*)
             INSERT INTO ${RESPALDO}.${tabla}_sin_venta SELECT * FROM movidos`);
    await q(`UPDATE ${tabla} t SET idventa = u.id::text FROM ${FOLIO_UNICO} u
              WHERE t.idventa !~ '^[0-9]+$' AND u.folio = t.idventa`);
    await q(`ALTER TABLE ${tabla} ALTER COLUMN idventa TYPE integer USING idventa::integer`);
    tipos[`${tabla}.idventa`] = 'integer';
  }
};

const llenarIdventaDeFactura = async (q) => {
  const [{ n }] = await q(
    `SELECT count(*)::int AS n FROM factura f JOIN ${FOLIO_UNICO} u ON u.folio = f.folio WHERE f.idventa IS NULL`);
  console.log(`factura.idventa: ${n} facturas sin idventa que se llenan desde el folio`);
  if (!APLICAR || !n) return;
  await q(`CREATE TABLE IF NOT EXISTS ${RESPALDO}.factura_idventa (id integer PRIMARY KEY)`);
  await q(`INSERT INTO ${RESPALDO}.factura_idventa
           SELECT f.idfactura FROM factura f JOIN ${FOLIO_UNICO} u ON u.folio = f.folio
            WHERE f.idventa IS NULL ON CONFLICT (id) DO NOTHING`);
  await q(`UPDATE factura f SET idventa = u.id FROM ${FOLIO_UNICO} u WHERE f.idventa IS NULL AND u.folio = f.folio`);
};

// Lo contrario de --aplicar, con lo que guardo en respaldo_llaves.
const revertir = async (q) => {
  const existe = async (tabla) => (await q('SELECT to_regclass($1) AS r', [tabla]))[0].r !== null;

  for (const { nombre, tabla } of llaves) {
    if (await existe(`public.${tabla}`)) await q(`ALTER TABLE ${ident(tabla)} DROP CONSTRAINT IF EXISTS ${ident(nombre)}`);
  }
  for (const nombre of indices) await q(`DROP INDEX IF EXISTS ${ident(nombre)}`);
  console.log(`quitadas ${llaves.length} llaves y ${indices.length} indices`);

  for (const [tabla, pk] of Object.entries(CON_FOLIO)) {
    await q(`ALTER TABLE ${tabla} ALTER COLUMN idventa TYPE varchar(100) USING idventa::text`);
    if (await existe(`${RESPALDO}.${tabla}_idventa`)) {
      const r = await client.query(`UPDATE ${tabla} t SET idventa = r.idventa FROM ${RESPALDO}.${tabla}_idventa r WHERE r.id = t.${pk}`);
      console.log(`${tabla}: ${r.rowCount} folios de vuelta en idventa`);
    }
    if (await existe(`${RESPALDO}.${tabla}_sin_venta`)) {
      const r = await client.query(`INSERT INTO ${tabla} SELECT * FROM ${RESPALDO}.${tabla}_sin_venta`);
      console.log(`${tabla}: ${r.rowCount} renglones sin venta de vuelta`);
    }
  }
  if (await existe(`${RESPALDO}.factura_idventa`)) {
    const r = await client.query(`UPDATE factura SET idventa = NULL WHERE idfactura IN (SELECT id FROM ${RESPALDO}.factura_idventa)`);
    console.log(`factura: ${r.rowCount} idventa vaciados`);
  }
  await q(`DROP SCHEMA IF EXISTS ${RESPALDO} CASCADE`);
};

const pool = new pg.Pool({ connectionString: requirePgDatabaseUrl(), max: 1, connectionTimeoutMillis: 8000 });
const client = await pool.connect().catch((error) => {
  console.error(`No hay conexion con la base (${error.code}): ${error.message}`);
  process.exit(1);
});
const q = async (sql, params) => (await client.query(sql, params)).rows;
try {
  await q(APLICAR || REVERTIR ? 'BEGIN' : 'BEGIN READ ONLY');
  // Esperar un candado detras de una venta en curso esta bien; quedarse
  // colgado bloqueando a la tienda, no.
  await q("SET LOCAL lock_timeout = '10s'");

  if (REVERTIR) {
    await revertir(q);
    await q('COMMIT');
    console.log('revertido');
  } else {
    if (APLICAR) await q(`CREATE SCHEMA IF NOT EXISTS ${RESPALDO}`);
    const tipos = Object.fromEntries((await q(
      `SELECT table_name || '.' || column_name AS llave, data_type AS tipo
         FROM information_schema.columns WHERE table_schema = 'public'`)).map((c) => [c.llave, c.tipo]));
    const existentes = Object.fromEntries((await q(
      `SELECT conname AS nombre, convalidated AS valida
         FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`)).map((c) => [c.nombre, c.valida]));

    await normalizarIdventa(q, tipos);
    await llenarIdventaDeFactura(q);

    const reporte = [];
    for (const llave of llaves) {
      const { nombre, tabla, columna, padre, columnaPadre } = llave;
      const fila = { llave: `${tabla}.${columna} -> ${padre}.${columnaPadre}`, estado: '', huerfanos: '', ejemplos: '' };
      reporte.push(fila);

      const tipoHijo = tipos[`${tabla}.${columna}`];
      const tipoPadre = tipos[`${padre}.${columnaPadre}`];
      if (!tipoHijo || !tipoPadre) {
        fila.estado = 'sin tabla (la crea push o la app, con su llave)';
        continue;
      }

      // Con idventa todavia varchar, los folios ya se contaron arriba: aqui
      // solo los ids que no tienen venta.
      const C = `h.${ident(columna)}`;
      const [h] = await q(
        `SELECT count(*)::int AS n, (array_agg(DISTINCT ${C}::text))[1:5] AS ejemplos
           FROM ${ident(tabla)} h
          WHERE ${C} IS NOT NULL
            ${tipoHijo === tipoPadre ? '' : `AND ${C} ~ '^[0-9]+$'`}
            AND NOT EXISTS (SELECT 1 FROM ${ident(padre)} p
                             WHERE p.${ident(columnaPadre)}::text = ${C}::text)`);
      fila.huerfanos = h.n;
      fila.ejemplos = (h.ejemplos ?? []).join(', ');

      if (tipoHijo !== tipoPadre) {
        fila.estado = 'falta (idventa se convierte)';
        continue;
      }

      let valida = existentes[nombre];
      if (valida === undefined && APLICAR) {
        await q(`ALTER TABLE ${ident(tabla)} ADD CONSTRAINT ${ident(nombre)}
                 FOREIGN KEY (${ident(columna)}) REFERENCES ${ident(padre)} (${ident(columnaPadre)})
                 ON DELETE ${llave.onDelete} ON UPDATE ${llave.onUpdate} NOT VALID`);
        valida = false;
      }
      if (valida === false && h.n === 0 && APLICAR) {
        await q(`ALTER TABLE ${ident(tabla)} VALIDATE CONSTRAINT ${ident(nombre)}`);
        valida = true;
      }
      fila.estado = valida === undefined ? 'falta' : valida ? 'valida' : 'sin validar (huerfanos)';
    }

    console.table(reporte);
    const validas = reporte.filter((f) => f.estado === 'valida').length;
    console.log(`${validas} de ${reporte.length} llaves validas${APLICAR ? '' : ' (solo lectura: --aplicar para crearlas)'}`);
    if (validas < reporte.length) process.exitCode = 1;

    await q(APLICAR ? 'COMMIT' : 'ROLLBACK');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`No se pudieron ${REVERTIR ? 'revertir' : 'revisar'} las llaves (${error.code || 'LLAVES_FAILED'}): ${error.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
