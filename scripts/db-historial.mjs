// Historial del sistema anterior (isaacodr_refautomex, el de PHP) para el
// analisis de Faltantes: sus compras, polizas y ventas de 2020-05 a 2024-11.
// El dump de 2024 de esta base no trae compras ni polizas, y sus ventas de 2024
// son solo una parte de las que registro el sistema anterior.
//
//   node scripts/db-historial.mjs                    solo lee el dump y reporta
//   node scripts/db-historial.mjs --aplicar          carga las tablas historial_*
//   ... --dir <carpeta>                              otra carpeta del dump
//   ... --sucursal <id>                              a quien atribuir las ventas
//
// Con --aplicar, en una transaccion:
//   1. Crea historial_poliza, historial_compra, historial_registro e
//      historial_venta (el DDL de lib/db/schema.pg.js) si no existen, y las
//      vacia: volver a correrlo deja lo mismo.
//   2. Agrega a `banco` los bancos del sistema anterior que falten, por nombre.
//   3. Llena las tablas. Los proveedores se empatan por nombre (los 32 son los
//      mismos con otro id); si alguno no empata, no carga nada.
//   4. A los productos que tienen proveedor NINGUNO les pone el de su ultima
//      compra en el historial. No toca los que ya tienen otro.
//
// Conexion: DATABASE_URL_UNPOOLED o DATABASE_URL (.env.local), como los demas
// scripts db:pg:*. Contra produccion es por el tunel (npm run db:tunnel).
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import nextEnv from '@next/env';
import pg from 'pg';
import { requirePgDatabaseUrl } from '../src/app/lib/db/runtime-driver.mjs';

nextEnv.loadEnvConfig(process.cwd());

const argumento = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? null : process.argv[i + 1];
};
const APLICAR = process.argv.includes('--aplicar');
const DIR = argumento('--dir') || process.env.HISTORIAL_DUMP_DIR
  || join(homedir(), 'Desktop', 'React', 'All DIY', 'DumpRefautomex_20241123');
const SUCURSAL = argumento('--sucursal');
const LOTE = 1000;

// Los INSERT de mysqldump: `INSERT INTO `t` VALUES (1,'a\'b',NULL),(2,...);`
// Cada renglon sale como arreglo, en el orden de las columnas del CREATE TABLE.
const ESCAPES = { 0: '\0', n: '\n', r: '\r', t: '\t', Z: '\x1a' };
const valor = (texto, esCadena) => {
  if (esCadena) return texto;
  const limpio = texto.trim();
  return limpio === 'NULL' ? null : Number(limpio);
};

const leerTabla = async (tabla) => {
  const texto = await readFile(join(DIR, `isaacodr_refautomex_${tabla}.sql`), 'utf8');
  const marca = `INSERT INTO \`${tabla}\` VALUES `;
  const filas = [];
  let i = texto.indexOf(marca);
  while (i !== -1) {
    let fila = null;
    let actual = '';
    let esCadena = false;
    let enCadena = false;
    for (i += marca.length; i < texto.length; i += 1) {
      const c = texto[i];
      if (enCadena) {
        if (c === '\\') {
          i += 1;
          actual += ESCAPES[texto[i]] ?? texto[i];
        } else if (c === "'") {
          enCadena = false;
        } else {
          actual += c;
        }
      } else if (c === "'") {
        enCadena = true;
        esCadena = true;
      } else if (c === '(' && !fila) {
        fila = [];
      } else if ((c === ',' || c === ')') && fila) {
        fila.push(valor(actual, esCadena));
        actual = '';
        esCadena = false;
        if (c === ')') {
          filas.push(fila);
          fila = null;
        }
      } else if (c === ';' && !fila) {
        break;
      } else if (fila) {
        actual += c;
      }
    }
    i = texto.indexOf(marca, i);
  }
  return filas;
};

const nombre = (texto) => String(texto ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const redondo = (n) => Math.round(Number(n || 0) * 100) / 100;
// El sistema anterior: 1 era pago con banco y 2 en efectivo (banco "N/A").
const TIPO_POLIZA = { 1: 'TRANSFERENCIA', 2: 'EFECTIVO' };

const DDL = [
  `CREATE TABLE IF NOT EXISTS historial_poliza (
    idpoliza integer PRIMARY KEY NOT NULL,
    fecha_poliza date NOT NULL,
    importe real NOT NULL,
    tipo varchar(20) NOT NULL,
    idbanco integer,
    CONSTRAINT historial_poliza_idbanco_banco_idbanco_fk FOREIGN KEY (idbanco) REFERENCES banco (idbanco)
  )`,
  `CREATE TABLE IF NOT EXISTS historial_compra (
    idcompra integer PRIMARY KEY NOT NULL,
    num_factura varchar(100) NOT NULL,
    fecha_compra date NOT NULL,
    fecha_pago date,
    total real NOT NULL,
    subtotal real NOT NULL,
    descuento_total real NOT NULL,
    neto_total real NOT NULL,
    idproveedor integer NOT NULL,
    idpoliza integer,
    CONSTRAINT historial_compra_idproveedor_proveedor_idproveedor_fk FOREIGN KEY (idproveedor) REFERENCES proveedor (idproveedor),
    CONSTRAINT historial_compra_idpoliza_historial_poliza_idpoliza_fk FOREIGN KEY (idpoliza) REFERENCES historial_poliza (idpoliza)
  )`,
  'CREATE INDEX IF NOT EXISTS historial_compra_idproveedor_idx ON historial_compra USING btree (idproveedor)',
  `CREATE TABLE IF NOT EXISTS historial_registro (
    idregistro integer PRIMARY KEY NOT NULL,
    idcompra integer NOT NULL,
    num_parte varchar(100) NOT NULL,
    existencia integer NOT NULL,
    cantidad integer NOT NULL,
    costo_anterior real NOT NULL,
    costo_nuevo real NOT NULL,
    descuento real NOT NULL,
    importe real NOT NULL,
    neto real NOT NULL,
    CONSTRAINT historial_registro_idcompra_historial_compra_idcompra_fk FOREIGN KEY (idcompra) REFERENCES historial_compra (idcompra)
  )`,
  'CREATE INDEX IF NOT EXISTS historial_registro_idcompra_idx ON historial_registro USING btree (idcompra)',
  'CREATE INDEX IF NOT EXISTS historial_registro_num_parte_idx ON historial_registro USING btree (num_parte)',
  `CREATE TABLE IF NOT EXISTS historial_venta (
    idregistro integer PRIMARY KEY NOT NULL,
    folio varchar(100) NOT NULL,
    fecha date NOT NULL,
    num_parte varchar(100) NOT NULL,
    cantidad integer NOT NULL,
    precio real NOT NULL,
    idsucursal integer
  )`,
  'CREATE INDEX IF NOT EXISTS historial_venta_fecha_idx ON historial_venta USING btree (fecha)',
  'CREATE INDEX IF NOT EXISTS historial_venta_num_parte_idx ON historial_venta USING btree (num_parte)',
];

const insertar = async (q, tabla, columnas, filas) => {
  for (let inicio = 0; inicio < filas.length; inicio += LOTE) {
    const lote = filas.slice(inicio, inicio + LOTE);
    const marcas = lote.map((_, f) => `(${columnas.map((__, c) => `$${f * columnas.length + c + 1}`).join(', ')})`);
    await q(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES ${marcas.join(', ')}`, lote.flat());
  }
};

console.log(`Dump: ${DIR}`);
const [proveedores, bancos, polizas, compras, renglones, ventas, vendidos] = await Promise.all(
  ['proveedores', 'bancos', 'polizas', 'compras', 'compra_detalle', 'ventas', 'detalle'].map(leerTabla)
).catch((error) => {
  console.error(`No se pudo leer el dump: ${error.message}`);
  process.exit(1);
});

const pool = new pg.Pool({ connectionString: requirePgDatabaseUrl(), max: 1, connectionTimeoutMillis: 8000 });
const client = await pool.connect().catch((error) => {
  console.error(`No hay conexion con la base: ${error.message}`);
  process.exit(1);
});
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

try {
  await client.query('BEGIN');

  // Proveedores: id del sistema anterior -> id de esta base, por nombre.
  const actuales = new Map((await q('SELECT idproveedor, empresa FROM proveedor')).map((p) => [nombre(p.empresa), p.idproveedor]));
  const proveedorDe = new Map();
  const sinEmpatar = [];
  for (const [id, empresa] of proveedores) {
    const actual = actuales.get(nombre(empresa));
    if (actual) proveedorDe.set(id, actual);
    else sinEmpatar.push(`${id} ${empresa}`);
  }
  console.log(`proveedores: ${proveedorDe.size} empatados por nombre${sinEmpatar.length ? `, sin empatar: ${sinEmpatar.join(', ')}` : ''}`);

  // Bancos: los que falten se agregan; "N/A" era el efectivo y no es un banco.
  const bancosActuales = new Map((await q('SELECT idbanco, banco FROM banco')).map((b) => [nombre(b.banco), b.idbanco]));
  const bancosNuevos = bancos.filter(([, banco]) => nombre(banco) !== 'N/A' && !bancosActuales.has(nombre(banco)));
  console.log(`bancos: ${bancos.length - 1} en el dump, ${bancosNuevos.length} por agregar a banco${bancosNuevos.length ? ` (${bancosNuevos.map(([, b]) => b).join(', ')})` : ''}`);

  const ventaDe = new Map(ventas.map(([idVenta, fecha, , , , , status]) => [idVenta, { fecha, status }]));
  const vendidosActivos = vendidos.filter(([, idVenta]) => ventaDe.get(idVenta)?.status === 'A');
  const fechas = vendidosActivos.map(([, idVenta]) => ventaDe.get(idVenta).fecha).sort();
  const [{ n: catalogo }] = await q('SELECT count(*)::int AS n FROM producto');
  const partes = new Set((await q('SELECT num_parte FROM producto')).map((p) => p.num_parte));
  const partesCompradas = new Set(renglones.map((r) => r[2]));
  console.log(`compras: ${compras.length} facturas, ${renglones.length} renglones de ${partesCompradas.size} refacciones `
    + `(${[...partesCompradas].filter((p) => partes.has(p)).length} siguen en el catalogo de ${catalogo})`);
  console.log(`polizas: ${polizas.length}`);
  console.log(`ventas: ${vendidosActivos.length} renglones de ventas activas, de ${fechas[0]} a ${fechas.at(-1)}`);

  let idsucursal = SUCURSAL ? Number(SUCURSAL) : null;
  if (!idsucursal) {
    // La que mas ventas tiene; el sistema anterior era esa misma tienda.
    const [masVentas] = await q(`SELECT idsucursal FROM venta WHERE idsucursal IS NOT NULL
                                  GROUP BY idsucursal ORDER BY count(*) DESC LIMIT 1`);
    const [fisica] = await q("SELECT idsucursal FROM sucursal WHERE idsucursal <> 1 AND upper(sucursal) <> 'WEB' ORDER BY idsucursal LIMIT 1");
    idsucursal = masVentas?.idsucursal ?? fisica?.idsucursal ?? null;
  }
  const [suc] = idsucursal ? await q('SELECT sucursal FROM sucursal WHERE idsucursal = $1', [idsucursal]) : [];
  if (!suc) throw new Error(`La sucursal ${idsucursal} no existe: pasa --sucursal <id>.`);
  console.log(`las ventas del historial se atribuyen a ${suc.sucursal} (${idsucursal})`);

  const existe = (await q("SELECT to_regclass('historial_venta') AS r"))[0].r !== null;
  if (existe) {
    const [antes] = await q(`SELECT (SELECT count(*) FROM historial_compra)::int AS compras,
                                    (SELECT count(*) FROM historial_venta)::int AS ventas`);
    console.log(`en la base ya hay ${antes.compras} compras y ${antes.ventas} renglones de venta del historial: se reemplazan`);
  }

  // Ultimo proveedor de cada refaccion, para las que hoy dicen NINGUNO.
  const compraDe = new Map(compras.map((c) => [c[0], c]));
  const ultimo = new Map();
  for (const [, idCompra, parte] of renglones) {
    const compra = compraDe.get(idCompra);
    if (!compra || !proveedorDe.has(compra[7])) continue;
    const previa = ultimo.get(parte);
    if (!previa || compra[1] > previa.fecha) ultimo.set(parte, { fecha: compra[1], idproveedor: proveedorDe.get(compra[7]) });
  }
  const ninguno = actuales.get('NINGUNO');
  const sinProveedor = new Set((await q('SELECT num_parte FROM producto WHERE idproveedor = $1', [ninguno ?? -1])).map((p) => p.num_parte));
  const porAsignar = [...ultimo].filter(([parte, u]) => sinProveedor.has(parte) && u.idproveedor !== ninguno);
  console.log(`producto.idproveedor: ${porAsignar.length} de ${sinProveedor.size} productos con proveedor NINGUNO toman el de su ultima compra`);

  if (!APLICAR) {
    console.log('\nSolo lectura. Para cargar: node scripts/db-historial.mjs --aplicar');
    await client.query('ROLLBACK');
  } else {
    if (sinEmpatar.length) throw new Error('Hay proveedores sin empatar: agregalos en Proveedores con el mismo nombre y vuelve a correrlo.');

    for (const sql of DDL) await q(sql);
    await q('TRUNCATE historial_venta, historial_registro, historial_compra, historial_poliza');

    for (const [, banco] of bancosNuevos) {
      const [nuevo] = await q('INSERT INTO banco (banco) VALUES ($1) RETURNING idbanco', [nombre(banco)]);
      bancosActuales.set(nombre(banco), nuevo.idbanco);
    }
    const bancoDe = new Map(bancos.map(([id, banco]) => [id, bancosActuales.get(nombre(banco)) ?? null]));

    await insertar(q, 'historial_poliza', ['idpoliza', 'fecha_poliza', 'importe', 'tipo', 'idbanco'],
      polizas.map(([id, importe, idBanco, fecha, tipo]) => [id, fecha, redondo(importe), TIPO_POLIZA[tipo] ?? 'OTRO', bancoDe.get(idBanco) ?? null]));

    const conPoliza = new Set(polizas.map((p) => p[0]));
    await insertar(q, 'historial_compra',
      ['idcompra', 'num_factura', 'fecha_compra', 'fecha_pago', 'total', 'subtotal', 'descuento_total', 'neto_total', 'idproveedor', 'idpoliza'],
      compras.map(([id, fechaCompra, fechaPago, total, subtotal, descuento, neto, idProveedor, factura, , idPoliza]) => [
        id, nombre(factura), fechaCompra, fechaPago, redondo(total), redondo(subtotal), redondo(descuento), redondo(neto),
        proveedorDe.get(idProveedor), conPoliza.has(idPoliza) ? idPoliza : null,
      ]));

    await insertar(q, 'historial_registro',
      ['idregistro', 'idcompra', 'num_parte', 'existencia', 'cantidad', 'costo_anterior', 'costo_nuevo', 'descuento', 'importe', 'neto'],
      renglones.filter((r) => compraDe.has(r[1])).map(([id, idCompra, parte, existencia, cantidad, anterior, nuevo, d1, d2, d3, importe, neto]) => [
        id, idCompra, parte, existencia, cantidad, redondo(anterior), redondo(nuevo), redondo(d1 + d2 + d3), redondo(importe), redondo(neto),
      ]));

    await insertar(q, 'historial_venta', ['idregistro', 'folio', 'fecha', 'num_parte', 'cantidad', 'precio', 'idsucursal'],
      vendidosActivos.map(([id, idVenta, parte, , precio, cantidad]) => [
        id, String(idVenta), ventaDe.get(idVenta).fecha, parte, cantidad, redondo(precio), idsucursal,
      ]));

    for (const [parte, { idproveedor }] of porAsignar) {
      await q('UPDATE producto SET idproveedor = $1 WHERE num_parte = $2 AND idproveedor = $3', [idproveedor, parte, ninguno]);
    }

    await client.query('COMMIT');
    console.log('\nCargado.');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\nNo se cargo nada: ${error.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
