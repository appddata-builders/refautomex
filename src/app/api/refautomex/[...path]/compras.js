/**
 * Compras: la captura de facturas de proveedor, las polizas que las pagan, los
 * bancos y el analisis de Faltantes (que pedir y a quien).
 *
 * La captura vivia repartida en endpoints-escrituras.js y
 * endpoints-procedimientos.js y no funcionaba:
 *   - Capturar 5 piezas de algo con 10 en existencia la dejaba en 5: el
 *     cliente mandaba `exis` = lo comprado y `cant` = la existencia final, y el
 *     servidor los usaba al reves.
 *   - Escribia la existencia en todas las sucursales del producto, WEB
 *     incluida: la compra no sabia que sucursal la recibia.
 *   - Borrar una captura restaba la existencia final, no lo comprado, y "devolvia"
 *     el costo de lista de la factura en lugar del costo que el producto tenia.
 *   - getInvoicesCaptured devolvia [compras] y la pantalla leia
 *     [compras, polizas]: las polizas nunca se veian, y no habia como crearlas.
 *
 * Ahora la compra lleva su sucursal (compra.idsucursal) y cada renglon guarda
 * lo comprado y el costo que tenia el producto antes (registro.ultimo_costo),
 * que es lo que permite deshacerla. Los totales los calcula el servidor.
 */

import { consultar, enTransaccion, okPacket } from '@/app/lib/refautomex-db';
import { POR_UBICAR, idDeLocalizacion } from './localizaciones';

const faltan = (detalle) => ({ estado: 400, cuerpo: { error: 'Bad Request', details: detalle } });
const conflicto = (detalle) => ({ estado: 409, cuerpo: { error: 'Conflict', details: detalle } });

const IVA = 1.16;
// Tope de existencia del original: los selectores de cantidad llegan a 300.
const TOPE_EXISTENCIA = 300;
const UTILIDAD_POR_OMISION = 1.3;
export const FORMAS_DE_PAGO = ['TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'EFECTIVO'];

const redondo = (n) => Math.round(Number(n || 0) * 100) / 100;
// Las fechas salen como texto: un `date` de pg llega como Date a medianoche UTC
// y en el navegador (UTC-6) se veia el dia anterior.
const FECHA = (columna) => `to_char(${columna}, 'YYYY-MM-DD') AS ${columna.split('.').pop()}`;
const esWeb = `(s.idsucursal = 1 OR upper(trim(s.sucursal)) = 'WEB')`;
// Los productos comodin con que se vendia lo que no estaba en el catalogo
// (REFACCION NUEVA 11000-11004, REFACCION USADA 10000-10005) y los apartados de
// ubicaciones (DISPONI 04B07-25...). Venden mucho y no se piden a nadie.
const COMODIN = `p.descripcion ~* '^\\s*(REFACCION (NUEVA|USADA)|DISPONI)'`;

// Las columnas que no vinieron de `drizzle-kit pull` (ver lib/db/schema.pg.js).
// Se agregan una vez por proceso, antes de la primera consulta de compras: la
// base de produccion no las tiene hasta que alguien entra a Captura.
const COLUMNAS_COMPRAS = [
  'ALTER TABLE compra ADD COLUMN IF NOT EXISTS idsucursal integer',
  `DO $$ BEGIN
     ALTER TABLE compra ADD CONSTRAINT compra_idsucursal_sucursal_idsucursal_fk
       FOREIGN KEY (idsucursal) REFERENCES sucursal (idsucursal);
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  'ALTER TABLE poliza ADD COLUMN IF NOT EXISTS referencia varchar(60)',
];

let columnasListas = null;
const conColumnas = () => {
  columnasListas ??= (async () => {
    for (const sql of COLUMNAS_COMPRAS) await consultar(sql);
  })().catch((error) => {
    columnasListas = null;
    throw error;
  });
  return columnasListas;
};

// Las tablas historial_* las crea scripts/db-historial.mjs. Sin ellas el
// analisis trabaja solo con las ventas y compras de esta base.
const hayHistorial = async () =>
  (await consultar("SELECT to_regclass('historial_venta') IS NOT NULL AND to_regclass('historial_compra') IS NOT NULL AS si"))[0].si;

// ---------------------------------------------------------------------------
// Capturas
// ---------------------------------------------------------------------------

// Lo que llega del cliente por renglon: { num_parte, cantidad, costo (unitario
// ya con descuentos), costo_lista (antes de descuentos), utilidad, d1, d2, d3 }.
const leerDetalle = (detalle) => {
  if (!Array.isArray(detalle) || !detalle.length) return { error: 'La captura no tiene refacciones.' };
  const vistos = new Set();
  const renglones = [];
  for (const d of detalle) {
    const parte = String(d?.num_parte ?? '').trim();
    const cantidad = Number(d?.cantidad);
    const costo = Number(d?.costo);
    const lista = Number(d?.costo_lista ?? d?.costo);
    if (!parte) return { error: 'Hay un renglon sin numero de parte.' };
    if (vistos.has(parte)) return { error: `${parte} esta dos veces en la captura.` };
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 999) return { error: `La cantidad de ${parte} debe ser un entero de 1 a 999.` };
    if (!(costo > 0) || !(lista > 0)) return { error: `El costo de ${parte} debe ser mayor a 0.` };
    const descuentos = [d.d1, d.d2, d.d3].map((v) => Number(v) || 0);
    if (descuentos.some((v) => v < 0 || v >= 1)) return { error: `Los descuentos de ${parte} van de 0 a 0.99.` };
    vistos.add(parte);
    renglones.push({
      num_parte: parte,
      cantidad,
      costo: redondo(costo),
      lista: redondo(lista),
      utilidad: Number(d.utilidad) > 0 ? Number(d.utilidad) : null,
      descuentos,
    });
  }
  return { renglones };
};

const totalesDe = (renglones) => {
  const neto = redondo(renglones.reduce((acc, r) => acc + r.lista * r.cantidad, 0));
  const subtotal = redondo(renglones.reduce((acc, r) => acc + r.costo * r.cantidad, 0));
  return { neto, subtotal, descuento: redondo(neto - subtotal), total: redondo(subtotal * IVA) };
};

// La sucursal que recibe: una fisica que exista.
const sucursalFisica = async (tx, idsucursal) => {
  const [fila] = await tx.consultar(`SELECT s.idsucursal, ${esWeb} AS web FROM sucursal s WHERE s.idsucursal = ?`, [idsucursal]);
  return fila && !fila.web ? fila.idsucursal : null;
};

// Suma lo comprado a la existencia de la sucursal que recibe y pone el costo
// nuevo, con el precio que da la utilidad de cada renglon, en todas las
// sucursales del producto (WEB vende con ese mismo precio). Si el producto no
// estaba en esa sucursal, entra "por ubicar". `ultimoCosto` es el costo de
// antes de la compra; al editar viene del renglon que se reemplaza.
const aplicarRenglon = async (tx, { idcompra, idsucursal, idproveedor, fecha, r, ultimoCosto }) => {
  const [actual] = await tx.consultar(
    `SELECT iddetalle, costo FROM detalle WHERE num_parte = ? AND idsucursal = ?
      ORDER BY iddetalle LIMIT 1 FOR UPDATE`,
    [r.num_parte, idsucursal]
  );
  const [cualquiera] = actual ? [actual] : await tx.consultar(
    'SELECT costo, utilidad FROM detalle WHERE num_parte = ? ORDER BY iddetalle LIMIT 1',
    [r.num_parte]
  );

  await tx.escribir(
    `INSERT INTO registro (idcompra, num_parte, cantidad_solicitada, ultimo_costo, costo_actual,
                           descuento_uno, descuento_dos, descuento_tres, importe, neto)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [idcompra, r.num_parte, r.cantidad, ultimoCosto ?? cualquiera?.costo ?? r.costo, r.costo,
      ...r.descuentos, redondo(r.costo * r.cantidad), redondo(r.lista * r.cantidad)]
  );

  if (actual) {
    await tx.escribir(
      `UPDATE detalle SET existencia = LEAST(existencia + ?, ${TOPE_EXISTENCIA}), fecha_compra = ? WHERE iddetalle = ?`,
      [r.cantidad, fecha, actual.iddetalle]
    );
  } else {
    const utilidad = r.utilidad ?? (Number(cualquiera?.utilidad) || UTILIDAD_POR_OMISION);
    await tx.escribir(
      `INSERT INTO detalle (num_parte, idsucursal, idlocalizacion, existencia, costo, aiva, precio, utilidad, fecha_compra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.num_parte, idsucursal, await idDeLocalizacion(tx, POR_UBICAR), Math.min(r.cantidad, TOPE_EXISTENCIA),
        r.costo, redondo(r.costo * utilidad), redondo(r.costo * utilidad * IVA), utilidad, fecha]
    );
    await tx.escribir("UPDATE producto SET status = 'A' WHERE num_parte = ? AND status = 'E'", [r.num_parte]);
  }

  await tx.escribir(
    `UPDATE detalle
        SET costo = ?::numeric,
            aiva = ROUND(?::numeric * utilidad::numeric, 2),
            precio = ROUND(?::numeric * utilidad::numeric * ${IVA}, 2)
      WHERE num_parte = ?`,
    [r.costo, r.costo, r.costo, r.num_parte]
  );
  // El "ultimo proveedor" que muestran el buscador y Faltantes.
  await tx.escribir('UPDATE producto SET idproveedor = ? WHERE num_parte = ?', [idproveedor, r.num_parte]);
};

// Lo contrario de aplicarRenglon para todos los renglones de una compra: resta
// lo comprado en la sucursal que lo recibio y, donde el costo sigue siendo el
// de esta compra (ninguna otra lo cambio despues), regresa el de antes. Las
// capturas anteriores a compra.idsucursal no sabian su sucursal: de esas solo
// se borran los renglones.
const revertirRenglones = async (tx, compra) => {
  const renglones = await tx.consultar(
    'SELECT num_parte, cantidad_solicitada, ultimo_costo, costo_actual FROM registro WHERE idcompra = ?',
    [compra.idcompra]
  );
  if (compra.idsucursal) {
    for (const r of renglones) {
      await tx.escribir(
        `UPDATE detalle SET existencia = GREATEST(existencia - ?, 0)
          WHERE iddetalle = (SELECT min(iddetalle) FROM detalle WHERE num_parte = ? AND idsucursal = ?)`,
        [r.cantidad_solicitada ?? 0, r.num_parte, compra.idsucursal]
      );
      if (r.ultimo_costo > 0) {
        await tx.escribir(
          `UPDATE detalle
              SET costo = ?::numeric,
                  aiva = ROUND(?::numeric * utilidad::numeric, 2),
                  precio = ROUND(?::numeric * utilidad::numeric * ${IVA}, 2)
            WHERE num_parte = ? AND abs(costo - ?) < 0.005`,
          [r.ultimo_costo, r.ultimo_costo, r.ultimo_costo, r.num_parte, r.costo_actual]
        );
      }
    }
  }
  await tx.escribir('DELETE FROM registro WHERE idcompra = ?', [compra.idcompra]);
  return renglones;
};

const leerCabecera = (body) => ({
  idproveedor: Number(body?.idProveedor),
  idsucursal: Number(body?.idSucursal),
  factura: String(body?.numFactura ?? '').trim().toUpperCase(),
  fecha: String(body?.fechaCompra ?? '').slice(0, 10),
});

const validarCabecera = async (tx, cab, idcompra = null) => {
  if (!cab.idproveedor || !cab.factura || !/^\d{4}-\d{2}-\d{2}$/.test(cab.fecha)) {
    return 'Faltan proveedor, numero de factura o fecha.';
  }
  if (!(await sucursalFisica(tx, cab.idsucursal))) return 'Elige la sucursal que recibe la compra.';
  const dup = await tx.consultar(
    'SELECT 1 FROM compra WHERE idproveedor = ? AND upper(num_factura) = ? AND idcompra <> COALESCE(?::int, -1) LIMIT 1',
    [cab.idproveedor, cab.factura, idcompra]
  );
  if (dup.length) return `La factura ${cab.factura} de este proveedor ya esta capturada.`;
  return null;
};

const newCapture = async ({ body }) => {
  await conColumnas();
  const cab = leerCabecera(body);
  const { renglones, error } = leerDetalle(body?.detalle);
  if (error) return faltan(error);

  return enTransaccion(async (tx) => {
    // FOR UPDATE: dos capturas del mismo proveedor a la vez no pasan las dos la
    // revision de factura repetida.
    const [prov] = await tx.consultar(
      'SELECT COALESCE(plazo_dias, 0) AS plazo FROM proveedor WHERE idproveedor = ? FOR UPDATE',
      [cab.idproveedor]
    );
    if (!prov) return faltan('Ese proveedor no existe.');
    const problema = await validarCabecera(tx, cab);
    if (problema) return conflicto(problema);

    const totales = totalesDe(renglones);
    const [nueva] = await tx.consultar(
      `INSERT INTO compra (num_factura, fecha_compra, fecha_pago, neto_total, descuento_total,
                           subtotal, total, status, idproveedor, idsucursal)
       VALUES (?, ?::date, ?::date + ?::int, ?, ?, ?, ?, 'P', ?, ?)
       RETURNING idcompra`,
      [cab.factura, cab.fecha, cab.fecha, prov.plazo, totales.neto, totales.descuento,
        totales.subtotal, totales.total, cab.idproveedor, cab.idsucursal]
    );
    for (const r of renglones) {
      await aplicarRenglon(tx, { idcompra: nueva.idcompra, ...cab, r });
    }
    return { cuerpo: { success: true, data: { idcompra: nueva.idcompra, ...totales } } };
  });
};

// Editar es deshacer la compra y volver a aplicarla, con el mismo "costo de
// antes" por refaccion. Solo mientras no este pagada.
const patchCapture = async ({ body }) => {
  await conColumnas();
  const idcompra = Number(body?.idCompra);
  if (!idcompra) return newCapture({ body });
  const cab = leerCabecera(body);
  const { renglones, error } = leerDetalle(body?.detalle);
  if (error) return faltan(error);

  return enTransaccion(async (tx) => {
    const [compra] = await tx.consultar('SELECT * FROM compra WHERE idcompra = ? FOR UPDATE', [idcompra]);
    if (!compra) return { estado: 404, cuerpo: { error: 'Not Found', details: 'La compra ya no existe.' } };
    if (compra.status !== 'P' || compra.idpoliza) return conflicto('La compra ya esta pagada: cancela su poliza para poder editarla.');
    const [prov] = await tx.consultar('SELECT COALESCE(plazo_dias, 0) AS plazo FROM proveedor WHERE idproveedor = ?', [cab.idproveedor]);
    if (!prov) return faltan('Ese proveedor no existe.');
    const problema = await validarCabecera(tx, cab, idcompra);
    if (problema) return conflicto(problema);

    const anteriores = await revertirRenglones(tx, compra);
    const costoDeAntes = new Map(anteriores.map((r) => [r.num_parte, r.ultimo_costo]));
    const totales = totalesDe(renglones);
    await tx.escribir(
      `UPDATE compra
          SET idproveedor = ?, idsucursal = ?, num_factura = ?, fecha_compra = ?::date,
              fecha_pago = ?::date + ?::int, neto_total = ?, descuento_total = ?, subtotal = ?, total = ?
        WHERE idcompra = ?`,
      [cab.idproveedor, cab.idsucursal, cab.factura, cab.fecha, cab.fecha, prov.plazo, totales.neto,
        totales.descuento, totales.subtotal, totales.total, idcompra]
    );
    for (const r of renglones) {
      await aplicarRenglon(tx, { idcompra, ...cab, r, ultimoCosto: costoDeAntes.get(r.num_parte) });
    }
    return { cuerpo: { success: true, data: { idcompra, ...totales } } };
  });
};

const deleteCapture = async ({ body, query }) => {
  await conColumnas();
  const id = Number.parseInt(body?.id ?? query.get('id'), 10);
  if (!id) return { estado: 400, cuerpo: { success: false, message: 'Parámetro id inválido.' } };

  return enTransaccion(async (tx) => {
    const [compra] = await tx.consultar('SELECT * FROM compra WHERE idcompra = ? FOR UPDATE', [id]);
    if (!compra) return { estado: 404, cuerpo: { success: false, message: 'La compra indicada no existe.' } };
    if (compra.status !== 'P' || compra.idpoliza) {
      return { estado: 409, cuerpo: { success: false, message: `Está pagada en la póliza ${compra.idpoliza}: cancela la póliza para poder borrarla.` } };
    }
    await revertirRenglones(tx, compra);
    const r = await tx.escribir('DELETE FROM compra WHERE idcompra = ?', [id]);
    return { cuerpo: { success: true, data: okPacket(r), sinSucursal: !compra.idsucursal } };
  });
};

// Las compras por pagar y las polizas, en el orden que espera Captura.
const getInvoicesCaptured = async () => {
  await conColumnas();
  const pendientes = await consultar(
    `SELECT c.idcompra, c.num_factura, ${FECHA('c.fecha_compra')}, ${FECHA('c.fecha_pago')}, c.total, c.subtotal,
            c.descuento_total, c.neto_total, c.status, c.idproveedor, p.empresa, p.plazo_dias,
            c.idsucursal, s.sucursal,
            (SELECT count(*)::int FROM registro r WHERE r.idcompra = c.idcompra) AS renglones
       FROM compra c
       JOIN proveedor p USING (idproveedor)
       LEFT JOIN sucursal s ON s.idsucursal = c.idsucursal
      WHERE c.status = 'P' AND c.idpoliza IS NULL
      ORDER BY c.fecha_pago NULLS LAST, c.idcompra`
  );
  return { cuerpo: [pendientes, await polizasDe('poliza', 'compra')] };
};

// Polizas con sus compras: las de ahora (poliza/compra) o las del sistema
// anterior (historial_poliza/historial_compra), que tienen las mismas columnas.
const polizasDe = async (tablaPoliza, tablaCompra, idpoliza = null) => consultar(
  `SELECT po.idpoliza, ${FECHA('po.fecha_poliza')}, po.importe, po.tipo, po.idbanco, b.banco,
          ${tablaPoliza === 'poliza' ? 'po.referencia' : 'NULL::varchar AS referencia'},
          min(c.idproveedor) AS idproveedor, min(p.empresa) AS empresa,
          COALESCE(json_agg(json_build_object(
            'idcompra', c.idcompra, 'num_factura', c.num_factura, 'fecha_compra', c.fecha_compra,
            'fecha_pago', c.fecha_pago, 'total', c.total
          ) ORDER BY c.fecha_compra, c.idcompra) FILTER (WHERE c.idcompra IS NOT NULL), '[]') AS compras
     FROM ${tablaPoliza} po
     LEFT JOIN banco b ON b.idbanco = po.idbanco
     LEFT JOIN ${tablaCompra} c ON c.idpoliza = po.idpoliza
     LEFT JOIN proveedor p ON p.idproveedor = c.idproveedor
    WHERE (?::int IS NULL OR po.idpoliza = ?::int)
    GROUP BY po.idpoliza, b.banco
    ORDER BY po.fecha_poliza DESC, po.idpoliza DESC`,
  [idpoliza, idpoliza]
);

const getPolicyHistory = async () => {
  if (!(await hayHistorial())) return { cuerpo: [] };
  // Sin las que no pagan ninguna factura: la 0 era un registro de arranque y
  // las demas son repetidas (mismo importe y fecha que la siguiente).
  return { cuerpo: (await polizasDe('historial_poliza', 'historial_compra')).filter((p) => p.compras.length > 0) };
};

const getCaptureWithDetails = async ({ query }) => {
  await conColumnas();
  const id = Number.parseInt(query.get('id'), 10);
  if (!id) return { estado: 400, cuerpo: { success: false, message: 'Parámetro id inválido.' } };

  const [cabecera] = await consultar(
    `SELECT c.idcompra, c.num_factura, ${FECHA('c.fecha_compra')}, ${FECHA('c.fecha_pago')}, c.total,
            c.descuento_total, c.subtotal, c.neto_total, c.status, c.idproveedor, c.idpoliza, c.idsucursal,
            p.empresa, p.descuento, p.plazo_dias, s.sucursal
       FROM compra c
       JOIN proveedor p USING (idproveedor)
       LEFT JOIN sucursal s ON s.idsucursal = c.idsucursal
      WHERE c.idcompra = ?`,
    [id]
  );
  if (!cabecera) return { estado: 404, cuerpo: { success: false, message: 'Captura no encontrada.' } };

  // La existencia y la utilidad son las de la sucursal que recibio la compra.
  const detalle = await consultar(
    `SELECT r.*, prod.descripcion, det.existencia, det.utilidad
       FROM registro r
       LEFT JOIN producto prod USING (num_parte)
       LEFT JOIN LATERAL (
         SELECT d.existencia, d.utilidad FROM detalle d
          WHERE d.num_parte = r.num_parte AND d.idsucursal = ?::int
          ORDER BY d.iddetalle LIMIT 1
       ) det ON true
      WHERE r.idcompra = ?
      ORDER BY r.idregistro`,
    [cabecera.idsucursal, id]
  );
  return { cuerpo: { success: true, header: cabecera, detail: detalle } };
};

// ---------------------------------------------------------------------------
// Polizas y bancos
// ---------------------------------------------------------------------------

// Una poliza paga una o varias compras pendientes de UN proveedor. Las pasa a
// 'F' (pagadas) y devuelve la poliza completa para imprimir el comprobante.
const newPolicy = async ({ body }) => {
  await conColumnas();
  const ids = [...new Set((body?.compras ?? []).map(Number).filter(Number.isInteger))];
  const tipo = String(body?.tipo ?? '').toUpperCase();
  const idbanco = body?.idbanco ? Number(body.idbanco) : null;
  const fecha = String(body?.fecha ?? '').slice(0, 10);
  const referencia = String(body?.referencia ?? '').trim().toUpperCase().slice(0, 60) || null;

  if (!ids.length) return faltan('Elige las facturas que paga la póliza.');
  if (!FORMAS_DE_PAGO.includes(tipo)) return faltan('Forma de pago no válida.');
  if (tipo !== 'EFECTIVO' && !idbanco) return faltan('Elige el banco del pago.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return faltan('Fecha no válida.');

  return enTransaccion(async (tx) => {
    const compras = await tx.consultar(
      'SELECT idcompra, idproveedor, status, idpoliza, num_factura, total FROM compra WHERE idcompra = ANY(?::int[]) FOR UPDATE',
      [ids]
    );
    if (compras.length !== ids.length) return conflicto('Alguna de las facturas ya no existe: actualiza la lista.');
    const pagada = compras.find((c) => c.status !== 'P' || c.idpoliza);
    if (pagada) return conflicto(`La factura ${pagada.num_factura} ya está pagada.`);
    if (new Set(compras.map((c) => c.idproveedor)).size > 1) return conflicto('Una póliza paga facturas de un solo proveedor.');
    if (idbanco && tipo !== 'EFECTIVO') {
      const [banco] = await tx.consultar('SELECT 1 FROM banco WHERE idbanco = ?', [idbanco]);
      if (!banco) return faltan('Ese banco no existe.');
    }

    const importe = redondo(compras.reduce((acc, c) => acc + Number(c.total), 0));
    const [poliza] = await tx.consultar(
      `INSERT INTO poliza (fecha_poliza, importe, tipo, idbanco, referencia)
       VALUES (?::date, ?, ?, ?, ?) RETURNING idpoliza`,
      [fecha, importe, tipo, tipo === 'EFECTIVO' ? null : idbanco, referencia]
    );
    await tx.escribir("UPDATE compra SET idpoliza = ?, status = 'F' WHERE idcompra = ANY(?::int[])", [poliza.idpoliza, ids]);
    return { cuerpo: { ok: true, idpoliza: poliza.idpoliza, importe } };
  }).then(async (resultado) => {
    if (!resultado.cuerpo?.ok) return resultado;
    const [completa] = await polizasDe('poliza', 'compra', resultado.cuerpo.idpoliza);
    return { cuerpo: { ...resultado.cuerpo, poliza: completa } };
  });
};

// Cancelar una poliza: sus compras vuelven a quedar por pagar.
const deletePolicy = async ({ body }) => {
  const idpoliza = Number(body?.idpoliza);
  if (!idpoliza) return faltan('Missing idpoliza.');
  return enTransaccion(async (tx) => {
    const [poliza] = await tx.consultar('SELECT idpoliza FROM poliza WHERE idpoliza = ? FOR UPDATE', [idpoliza]);
    if (!poliza) return { estado: 404, cuerpo: { error: 'Not Found', details: 'Esa póliza ya no existe.' } };
    const r = await tx.escribir("UPDATE compra SET idpoliza = NULL, status = 'P' WHERE idpoliza = ?", [idpoliza]);
    await tx.escribir('DELETE FROM poliza WHERE idpoliza = ?', [idpoliza]);
    return { cuerpo: { ok: true, compras: r.rowCount } };
  });
};

const getBanks = async () => ({
  cuerpo: await consultar('SELECT idbanco, banco FROM banco ORDER BY banco'),
});

const newBank = async ({ body }) => {
  const nombre = String(body?.banco ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (nombre.length < 2 || nombre.length > 100) return faltan('El nombre del banco debe tener entre 2 y 100 caracteres.');
  return enTransaccion(async (tx) => {
    await tx.consultar("SELECT pg_advisory_xact_lock(hashtext('bancos'))");
    const [existe] = await tx.consultar('SELECT idbanco, banco FROM banco WHERE upper(trim(banco)) = ?', [nombre]);
    if (existe) return conflicto(`${nombre} ya está en la lista.`);
    // Una base restaurada puede traer la secuencia por debajo de los ids.
    await tx.consultar(
      `SELECT setval(s.secuencia, t.tope)
         FROM (SELECT pg_get_serial_sequence('banco', 'idbanco')::regclass AS secuencia) s,
              (SELECT max(idbanco) AS tope FROM banco) t
        WHERE t.tope > COALESCE(pg_sequence_last_value(s.secuencia), 0)`
    );
    const [nuevo] = await tx.consultar('INSERT INTO banco (banco) VALUES (?) RETURNING idbanco, banco', [nombre]);
    return { cuerpo: nuevo };
  });
};

// ---------------------------------------------------------------------------
// Faltantes
// ---------------------------------------------------------------------------

/**
 * Que conviene pedir en una sucursal y a quien. Devuelve los datos y el
 * cliente decide la cantidad (depende de cuantos meses quiere cubrir).
 *
 * Ventas: historial_venta hasta su ultima fecha y `venta` despues (en 2024 las
 * dos tienen las mismas ventas; ver lib/db/schema.pg.js). La demanda se mide en
 * los ultimos 12 meses CON ventas, no de calendario: entre 2024-12 y 2026-09 no
 * hay datos (se perdieron con la base) y contarlos como meses en cero haria
 * parecer que nada se vende. El mes en curso no cuenta mientras haya meses
 * completos: a mitad de mes subestima.
 *
 * Compras: historial_registro y `registro`, por refaccion y proveedor: cuantas
 * veces, cuando fue la ultima, a que costo (ya con descuento) y cuanto se
 * suele pedir.
 *
 * `alcance=todas` mide la demanda de todas las sucursales; sirve para una
 * sucursal nueva, que todavia no tiene ventas propias.
 */
const getReorderAnalysis = async ({ query }) => {
  await conColumnas();
  const idsucursal = Number.parseInt(query.get('idsucursal'), 10);
  if (!idsucursal) return faltan('Missing idsucursal.');
  const todas = query.get('alcance') === 'todas';
  const historial = await hayHistorial();

  const corte = historial ? "(SELECT COALESCE(max(fecha), '-infinity'::date) FROM historial_venta)" : "'-infinity'::date";
  const base = `
    WITH ventas AS (
      ${historial ? 'SELECT fecha, num_parte, cantidad, idsucursal FROM historial_venta UNION ALL' : ''}
      SELECT v.fecha_venta::date AS fecha, c.num_parte, c.cantidad, v.idsucursal
        FROM venta v
        JOIN concepto c ON c.idventa::text = v."idVenta"::text
       WHERE v.status = 'A' AND c.cantidad > 0 AND v.fecha_venta::date > ${corte}
    ),
    alcance AS (
      SELECT fecha, num_parte, cantidad, date_trunc('month', fecha)::date AS mes
        FROM ventas WHERE ?::boolean OR idsucursal = ?::int
    ),
    completos AS (SELECT DISTINCT mes FROM alcance WHERE mes < date_trunc('month', current_date)),
    meses AS (
      SELECT mes, row_number() OVER (ORDER BY mes DESC) AS n
        FROM (SELECT mes FROM completos
              UNION SELECT DISTINCT mes FROM alcance WHERE NOT EXISTS (SELECT 1 FROM completos)) m
       ORDER BY mes DESC LIMIT 12
    )`;
  const params = [todas, idsucursal];

  const meses = await consultar(`${base} SELECT to_char(mes, 'YYYY-MM') AS mes FROM meses ORDER BY mes`, params);

  const productos = await consultar(
    `${base},
    por_mes AS (
      SELECT a.num_parte, a.mes, m.n, sum(a.cantidad)::int AS unidades
        FROM alcance a JOIN meses m USING (mes)
       GROUP BY a.num_parte, a.mes, m.n
    ),
    demanda AS (
      SELECT num_parte,
             COALESCE(sum(unidades) FILTER (WHERE n <= 3), 0)::int AS u3,
             sum(unidades)::int AS u12,
             count(*)::int AS meses_con_venta,
             json_object_agg(to_char(mes, 'YYYY-MM'), unidades) AS serie
        FROM por_mes GROUP BY num_parte
    ),
    ultima AS (SELECT num_parte, max(fecha) AS ultima_venta FROM alcance GROUP BY num_parte),
    compras AS (
      ${historial ? `SELECT hc.fecha_compra AS fecha, hr.num_parte, hc.idproveedor, hr.cantidad, hr.costo_nuevo AS costo
                       FROM historial_registro hr JOIN historial_compra hc USING (idcompra) UNION ALL` : ''}
      SELECT c.fecha_compra AS fecha, r.num_parte, c.idproveedor, r.cantidad_solicitada AS cantidad, r.costo_actual AS costo
        FROM registro r JOIN compra c USING (idcompra)
    ),
    por_proveedor AS (
      SELECT num_parte, idproveedor, count(*)::int AS veces, max(fecha) AS ultima,
             (array_agg(costo ORDER BY fecha DESC))[1] AS ultimo_costo,
             min(costo) AS costo_minimo,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY cantidad) AS cantidad_tipica
        FROM compras WHERE costo > 0 AND cantidad > 0
       GROUP BY num_parte, idproveedor
    ),
    proveedores AS (
      SELECT num_parte, json_agg(json_build_object(
               'idproveedor', idproveedor, 'veces', veces, 'ultima', ultima,
               'ultimo_costo', round(ultimo_costo::numeric, 2), 'costo_minimo', round(costo_minimo::numeric, 2),
               'cantidad_tipica', cantidad_tipica
             ) ORDER BY ultima DESC) AS compras
        FROM por_proveedor GROUP BY num_parte
    ),
    inventario AS (
      SELECT d.num_parte,
             COALESCE(sum(d.existencia) FILTER (WHERE d.idsucursal = ?::int), 0)::int AS existencia,
             COALESCE(sum(d.existencia) FILTER (WHERE d.idsucursal <> ?::int AND NOT ${esWeb}), 0)::int AS en_otras,
             bool_or(d.idsucursal = ?::int) AS en_sucursal,
             max(d.costo) FILTER (WHERE d.idsucursal = ?::int) AS costo,
             max(d.costo) AS costo_cualquiera,
             max(d.precio) FILTER (WHERE d.idsucursal = ?::int) AS precio,
             max(d.precio) AS precio_cualquiera,
             max(l.localizacion) FILTER (WHERE d.idsucursal = ?::int) AS localizacion
        FROM detalle d
        JOIN sucursal s USING (idsucursal)
        LEFT JOIN localizacion l USING (idlocalizacion)
       GROUP BY d.num_parte
    )
    SELECT p.num_parte, p.descripcion, p.idproveedor,
           (SELECT im.ruta FROM imagenes im WHERE im.num_parte = p.num_parte ORDER BY im."idImagen" LIMIT 1) AS ruta,
           COALESCE(i.existencia, 0) AS existencia, COALESCE(i.en_otras, 0) AS en_otras,
           COALESCE(i.en_sucursal, false) AS en_sucursal, i.localizacion,
           round(COALESCE(i.costo, i.costo_cualquiera, 0)::numeric, 2) AS costo,
           round(COALESCE(i.precio, i.precio_cualquiera, 0)::numeric, 2) AS precio,
           COALESCE(d.u3, 0) AS u3, COALESCE(d.u12, 0) AS u12,
           COALESCE(d.meses_con_venta, 0) AS meses_con_venta, d.serie,
           to_char(u.ultima_venta, 'YYYY-MM-DD') AS ultima_venta, pr.compras
      FROM producto p
      LEFT JOIN inventario i USING (num_parte)
      LEFT JOIN demanda d USING (num_parte)
      LEFT JOIN ultima u USING (num_parte)
      LEFT JOIN proveedores pr USING (num_parte)
     WHERE p.status = 'A' AND (i.en_sucursal OR d.u12 > 0) AND NOT ${COMODIN}
     ORDER BY p.num_parte`,
    [...params, idsucursal, idsucursal, idsucursal, idsucursal, idsucursal, idsucursal]
  );

  const proveedores = await consultar('SELECT idproveedor, empresa, descuento, plazo_dias FROM proveedor ORDER BY empresa');
  const [ultimas] = await consultar(
    `SELECT ${historial ? "(SELECT to_char(max(fecha), 'YYYY-MM-DD') FROM historial_venta)" : 'NULL'} AS historial_hasta,
            (SELECT to_char(max(fecha_venta), 'YYYY-MM-DD') FROM venta WHERE status = 'A') AS ventas_hasta`
  );

  return {
    cuerpo: {
      alcance: todas ? 'todas' : 'sucursal',
      historial,
      meses: meses.map((m) => m.mes),
      ...ultimas,
      productos,
      proveedores,
    },
  };
};

export const COMPRAS = {
  GET: {
    getInvoicesCaptured,
    getCaptureWithDetails,
    getPolicyHistory,
    getBanks,
    getReorderAnalysis,
  },
  POST: {
    newCapture,
    newPolicy,
    newBank,
  },
  PATCH: {
    patchCapture,
  },
  DELETE: {
    deleteCapture,
    deletePolicy,
  },
  PUT: {},
};
