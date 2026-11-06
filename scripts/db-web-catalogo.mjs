// Catalogo de la tienda en linea: la sucursal WEB con los productos que tienen
// foto en S3. --revertir la deja como estaba.
//
// La tienda (/section/products, getProducts) solo muestra lo que tiene renglon
// en la sucursal WEB, y la base reconstruida en 2026-10 no trajo ninguno ahi:
// la tienda salia vacia. Con --aplicar, en una transaccion, cada producto
// activo que tenga al menos una foto que de verdad exista en S3 (un HEAD a
// NEXT_PUBLIC_S3 + ruta; S3 contesta 403 cuando el archivo no existe) y que no
// tenga ya renglon en WEB recibe uno, copiado del suyo en TLALNEPANTLA: precio,
// costo, IVA, utilidad y existencia. La ubicacion es '0' (por ubicar): WEB es
// un canal de venta, no un anaquel.
//
// Lo que crea queda anotado en respaldo_web.detalle_creado, fuera de `public`
// (push, el respaldo CSV y db:pg:check no lo ven); --revertir borra
// exactamente esos renglones y el esquema.
//
// Sin argumentos es de solo lectura: dice cuantos agregaria y cuantos de ellos
// se verian en la tienda, que ademas pide categoria (idgrupo > 0). Volver a
// correr --aplicar solo agrega los que falten.
//
// Apunta a DATABASE_URL: con .env.local tal cual, la base local. Contra
// produccion, con `npm run db:tunnel` abierto en otra terminal:
//   DATABASE_URL=<la de produccion> node scripts/db-web-catalogo.mjs [--aplicar]
import nextEnv from '@next/env';
import pg from 'pg';
import { requirePgDatabaseUrl } from '../src/app/lib/db/runtime-driver.mjs';

nextEnv.loadEnvConfig(process.cwd());

const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');
const RESPALDO = 'respaldo_web';
const S3 = process.env.NEXT_PUBLIC_S3;
const EN_PARALELO = 16;

const existeEnS3 = async (ruta) => {
  const url = /^https?:\/\//.test(ruta) ? ruta : `${S3}${ruta}`;
  for (let intento = 0; intento < 3; intento += 1) {
    try {
      return (await fetch(url, { method: 'HEAD' })).ok;
    } catch {
      // Un corte de red no dice si existe: se vuelve a preguntar.
    }
  }
  throw new Error(`S3 no contesto por ${url}`);
};

const conFotoEnS3 = async (rutas) => {
  const existen = new Set();
  for (let i = 0; i < rutas.length; i += EN_PARALELO) {
    const lote = rutas.slice(i, i + EN_PARALELO);
    const respuestas = await Promise.all(lote.map((r) => existeEnS3(r.ruta)));
    lote.forEach((r, j) => respuestas[j] && existen.add(r.num_parte));
  }
  return [...existen].sort();
};

const main = async () => {
  if (!S3) throw new Error('Falta NEXT_PUBLIC_S3 para revisar las fotos.');
  const url = requirePgDatabaseUrl();
  const { hostname, port, pathname } = new URL(url);
  console.log(`Base: ${pathname.slice(1)} en ${hostname}:${port || 5432}`);

  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  const q = async (sql, params) => (await cliente.query(sql, params)).rows;

  try {
    const [web] = await q(`SELECT idsucursal FROM sucursal WHERE sucursal = 'WEB'`);
    const [origen] = await q(`SELECT idsucursal FROM sucursal WHERE sucursal = 'TLALNEPANTLA'`);
    const [porUbicar] = await q(`SELECT idlocalizacion FROM localizacion WHERE localizacion = '0'`);
    if (!web || !origen || !porUbicar) {
      throw new Error("Faltan la sucursal WEB, la TLALNEPANTLA o la ubicacion '0'.");
    }

    if (REVERTIR) {
      const [{ tabla }] = await q(`SELECT to_regclass('${RESPALDO}.detalle_creado') AS tabla`);
      if (!tabla) {
        console.log('No hay nada que revertir.');
        return;
      }
      await q('BEGIN');
      const borrados = await q(
        `DELETE FROM detalle d USING ${RESPALDO}.detalle_creado c WHERE d.iddetalle = c.iddetalle RETURNING d.iddetalle`
      );
      await q(`DROP SCHEMA ${RESPALDO} CASCADE`);
      await q('COMMIT');
      console.log(`Revertido: ${borrados.length} renglones de WEB borrados.`);
      return;
    }

    const rutas = await q(
      `SELECT i.num_parte, i.ruta
         FROM imagenes i JOIN producto p USING (num_parte)
        WHERE p.status = 'A'
          AND NOT EXISTS (SELECT 1 FROM detalle w WHERE w.num_parte = i.num_parte AND w.idsucursal = $1)`,
      [web.idsucursal]
    );
    const conFoto = await conFotoEnS3(rutas);
    const sinFoto = new Set(rutas.map((r) => r.num_parte)).size - conFoto.length;

    // Un renglon por producto: si en TLALNEPANTLA hubiera varios, el de mas existencia.
    const fuente = `SELECT DISTINCT ON (d.num_parte) d.*
                      FROM detalle d
                     WHERE d.idsucursal = $1 AND d.num_parte = ANY($2)
                     ORDER BY d.num_parte, d.existencia DESC, d.iddetalle`;
    const [resumen] = await q(
      `SELECT count(*)::int AS copiables, count(*) FILTER (WHERE p.idgrupo > 0)::int AS visibles
         FROM (${fuente}) d JOIN producto p USING (num_parte)`,
      [origen.idsucursal, conFoto]
    );
    console.log(`Productos activos sin renglon en WEB con foto registrada: ${conFoto.length + sinFoto}`);
    console.log(`  con al menos una foto que existe en S3: ${conFoto.length} (${sinFoto} sin ninguna)`);
    console.log(`  con renglon en TLALNEPANTLA para copiar: ${resumen.copiables}`);
    console.log(`  de esos, con categoria (los que se veran en la tienda): ${resumen.visibles}`);

    if (!APLICAR) {
      console.log('Solo lectura. Con --aplicar se agregan.');
      return;
    }

    await q('BEGIN');
    await q(`CREATE SCHEMA IF NOT EXISTS ${RESPALDO}`);
    await q(`CREATE TABLE IF NOT EXISTS ${RESPALDO}.detalle_creado (
               iddetalle integer PRIMARY KEY,
               num_parte varchar(100) NOT NULL,
               creado timestamptz NOT NULL DEFAULT now())`);
    const creados = await q(
      `WITH nuevos AS (
         INSERT INTO detalle (existencia, costo, aiva, precio, utilidad, fecha_compra, idsucursal, num_parte, idlocalizacion)
         SELECT d.existencia, d.costo, d.aiva, d.precio, d.utilidad, d.fecha_compra, $3, d.num_parte, $4
           FROM (${fuente}) d
         RETURNING iddetalle, num_parte)
       INSERT INTO ${RESPALDO}.detalle_creado (iddetalle, num_parte)
       SELECT iddetalle, num_parte FROM nuevos
       RETURNING iddetalle`,
      [origen.idsucursal, conFoto, web.idsucursal, porUbicar.idlocalizacion]
    );
    await q('COMMIT');
    console.log(`Agregados ${creados.length} renglones a WEB (anotados en ${RESPALDO}.detalle_creado).`);
  } catch (error) {
    await q('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await cliente.end();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
