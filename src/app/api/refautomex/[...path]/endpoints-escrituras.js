/**
 * Los 13 endpoints que quedaban: transacciones, cursores, tablas temporales y
 * JSON. Son los que mas se alejan de una traduccion literal.
 *
 * EQUIVALENCIAS QUE SE USAN AQUI
 *   LAST_INSERT_ID()        ->  RETURNING <columna>
 *   SIGNAL SQLSTATE '45000' ->  throw new Error(...)  (el despachador lo
 *                               convierte en 500 con `details`, igual que
 *                               hacia el Express con error.sqlMessage)
 *   CURSOR + LOOP           ->  una sola sentencia de conjunto. Un cursor que
 *                               solo recorre para actualizar es un UPDATE con
 *                               FROM, y ademas es mucho mas rapido.
 *   TEMPORARY TABLE         ->  CTE (WITH ...). Vive lo que dura la consulta y
 *                               no deja basura si algo falla a mitad.
 *   JSON_TABLE / JSON_EXTRACT -> se parsea en JavaScript, que ya recibe el
 *                               objeto y no necesita volver a serializarlo.
 *   DATE_FORMAT(x,'%Y-%m')  ->  to_char(x,'YYYY-MM')
 *   YEAR(x) / MONTH(x)      ->  EXTRACT(YEAR FROM x) / EXTRACT(MONTH FROM x)
 *   FIELD(col,'P','E')      ->  CASE ... (Postgres no tiene FIELD)
 *   CONCAT_WS               ->  concat_ws (existe igual)
 *
 * SOBRE LOS TIPOS
 * venta."idVenta" es integer y concepto.idventa / pedidos.idventa son varchar.
 * MySQL comparaba coercionando; Postgres no. Cada join contra venta lleva la
 * guarda `CASE WHEN ... ~ '^[0-9]+$'`, que reproduce el resultado de MySQL
 * (una cadena no numerica se volvia 0 y no empataba con nada).
 *
 * SOBRE LAS CLAVES DEL JSON
 * MySQL devuelve el nombre tal como se escribe en la consulta. Algunos
 * procedimientos escriben `v.idVenta` y otros `v.idventa`, asi que la clave
 * cambia entre endpoints. Los alias de aqui replican cada caso al pie de la
 * letra; no unificarlos es deliberado.
 */

import { consultar, escribir, enTransaccion, okPacket } from '@/app/lib/refautomex-db';

const faltan = (detalle) => ({ estado: 400, cuerpo: { error: 'Bad Request', details: detalle } });

// Guarda reutilizable: convierte una columna varchar a int solo si es numerica.
const NUM = (col) => `CASE WHEN ${col} ~ '^[0-9]+$' THEN ${col}::int END`;

// FIELD(col,'P','E') DESC  ->  E primero, luego P, luego el resto.
const ORDEN_PE = (col) => `CASE ${col} WHEN 'P' THEN 1 WHEN 'E' THEN 2 ELSE 0 END DESC`;

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

// insertSale + insercion de conceptos + descuento de existencias.
//
// En el original la venta se creaba dentro del procedimiento (con su propia
// transaccion) y los conceptos se insertaban DESPUES, desde Node, fuera de
// ella. Un fallo a media carga dejaba una venta con la mitad de sus renglones
// y el inventario descuadrado. Aqui todo va en UNA transaccion.
const newSale = async ({ body }) => {
  const { fecha_venta, total_venta, idusuario, idsucursal, tipo, idmetodo, items,
    telefono, email, fecha_entrega, fecha_pedido, nombre_cliente, isOrder, notas } = body || {};

  if (!fecha_venta || !total_venta || !idusuario || !idsucursal || !tipo || !idmetodo ||
      !items || items.length === 0) {
    return faltan('Missing parameters or no items provided.');
  }

  const folio = await enTransaccion(async (tx) => {
    // El folio se arma con el id, que no existe hasta insertar. El original
    // guardaba 'PENDING' y luego actualizaba; se conserva igual para que un
    // registro a medio crear se reconozca por ese valor.
    const creada = await tx.consultar(
      `INSERT INTO venta (folio, fecha_venta, total_venta, idusuario, status, idmetodo, nota, idsucursal)
       VALUES ('PENDING', ?, ?, ?, 'A', ?, ?, ?)
       RETURNING "idVenta" AS idventa`,
      [fecha_venta, total_venta, idusuario, idmetodo, notas ?? null, Number(idsucursal) || null]
    );

    const idventa = creada[0].idventa;
    const sufijo = Math.floor(1000 + Math.random() * 9000);
    const nuevoFolio = `${tipo}-${idventa}${sufijo}`;

    await tx.escribir('UPDATE venta SET folio = ? WHERE "idVenta" = ?', [nuevoFolio, idventa]);

    for (const item of items) {
      if (!item.precio || !item.monto || !item.cantidad || !item.refaccion) {
        throw new Error(`Missing required item properties: ${JSON.stringify(item)}`);
      }

      await tx.escribir(
        `INSERT INTO concepto (precio_venta, monto_venta, cantidad, num_parte, type, pedido, concepto_comodin, idventa)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number.parseFloat(item.precio).toFixed(2),
          Number.parseFloat(item.monto).toFixed(2),
          item.cantidad,
          item.refaccion,
          item.isSeminew,
          item.isPedido ? 'P' : 'E',
          item.isEditable ? item.descripcion : null,
          String(idventa),
        ]
      );

      // Un pedido todavia no sale del almacen, asi que no descuenta.
      if (!item.isPedido) {
        await tx.escribir(
          'UPDATE detalle SET existencia = existencia - ? WHERE num_parte = ? AND idsucursal = ?',
          [item.cantidad, item.refaccion, idsucursal]
        );
      }
    }

    if (isOrder) {
      await tx.escribir(
        `INSERT INTO pedidos (idventa, idusuario, f_pedido, f_entrega, nombre, telefono, status, email)
         VALUES (?, ?, ?, ?, ?, ?, 'P', ?)`,
        // `||` y no `??` en las fechas: el ticket manda '' cuando no se elige
        // fecha de entrega, y Postgres no acepta '' como fecha.
        [String(idventa), idusuario, fecha_pedido || null, fecha_entrega || null,
          nombre_cliente ?? null, telefono ?? null, email ?? null]
      );
    }

    return nuevoFolio;
  });

  return { cuerpo: { folio } };
};

// UpdateHistoryStatus: marca un renglon y recalcula el estado del pedido.
const patchHistoryStatus = async ({ body }) => {
  const { folio, status, idventa, num_parte } = body || {};

  return {
    cuerpo: await enTransaccion(async (tx) => {
      const r = await tx.escribir(
        'UPDATE concepto SET pedido = ? WHERE num_parte = ? AND idventa = ?',
        [status ?? null, num_parte ?? null, idventa ?? null]
      );

      const pendientes = await tx.consultar(
        "SELECT COUNT(*)::int AS n FROM concepto WHERE idventa = ? AND pedido = 'P'",
        [idventa ?? null]
      );

      await tx.escribir('UPDATE pedidos SET status = ? WHERE idventa = ?', [
        pendientes[0].n === 0 ? 'F' : 'P',
        idventa ?? null,
      ]);

      return okPacket(r);
    }),
  };
};

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

// InsertDetailsOfProduct: busca o crea la localizacion y agrega el detalle.
const newProductDetail = async ({ body }) => {
  const { refaccion, idsucursal, localizacion, existencia, costo, precio, aiva,
    utilidad, status = 'A' } = body || {};

  if (!refaccion || !idsucursal || !localizacion) {
    return faltan('Missing required fields for product detail.');
  }

  return {
    cuerpo: await enTransaccion(async (tx) => {
      let filas = await tx.consultar(
        'SELECT idlocalizacion FROM localizacion WHERE localizacion = ? LIMIT 1',
        [localizacion]
      );

      if (filas.length === 0) {
        filas = await tx.consultar(
          'INSERT INTO localizacion (localizacion) VALUES (?) RETURNING idlocalizacion',
          [localizacion]
        );
      }

      const r = await tx.escribir(
        `INSERT INTO detalle (num_parte, idsucursal, idlocalizacion, existencia, costo, precio, aiva, utilidad)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [refaccion, idsucursal, filas[0].idlocalizacion, existencia ?? null,
          costo ?? null, precio ?? null, aiva ?? null, utilidad ?? null]
      );

      await tx.escribir('UPDATE producto SET status = ? WHERE num_parte = ?', [status, refaccion]);
      return okPacket(r);
    }),
  };
};

// UpdateProductAndDetail: el UPDATE con JOIN se parte, y el JSON_TABLE de
// rutas se resuelve en JavaScript.
const patchProduct = async ({ body }) => {
  const { refaccion, idsucursal, localizacion, descripcion, existencia, costo, precio,
    utilidad, mod_ini, mod_fin, idmarca, idgrupo, idcategoria, rutas } = body || {};

  return {
    cuerpo: await enTransaccion(async (tx) => {
      const r = await tx.escribir(
        `UPDATE producto
            SET descripcion = ?, idmarca = ?, idgrupo = ?, idcategoria = ?, mod_ini = ?, mod_fin = ?
          WHERE num_parte = ?`,
        [descripcion ?? null, idmarca ?? null, idgrupo ?? null, idcategoria ?? null,
          mod_ini ?? null, mod_fin ?? null, refaccion]
      );

      await tx.escribir(
        `UPDATE detalle SET existencia = ?, costo = ?, precio = ?, utilidad = ?
          WHERE num_parte = ? AND idsucursal = ?`,
        [existencia ?? null, costo ?? null, precio ?? null, utilidad ?? null, refaccion, idsucursal]
      );

      await tx.escribir(
        `UPDATE localizacion SET localizacion = ?
          WHERE idlocalizacion IN (
            SELECT idlocalizacion FROM detalle WHERE num_parte = ? AND idsucursal = ?)`,
        [localizacion ?? null, refaccion, idsucursal]
      );

      // El original filtraba nulos y cadenas vacias dentro del JSON_TABLE.
      if (rutas !== null && rutas !== undefined) {
        const lista = (Array.isArray(rutas) ? rutas : JSON.parse(rutas))
          .filter((x) => x !== null && x !== undefined && String(x).trim() !== '');

        await tx.escribir('DELETE FROM imagenes WHERE num_parte = ?', [refaccion]);

        for (const ruta of lista) {
          await tx.escribir('INSERT INTO imagenes (num_parte, ruta) VALUES (?, ?)', [
            refaccion,
            String(ruta),
          ]);
        }
      }

      return okPacket(r);
    }),
  };
};

// MigrateMatrixProducts: el cursor recorria ubicaciones para renombrarlas una
// por una. Es un solo UPDATE con concatenacion, y las validaciones previas se
// conservan en el mismo orden porque definen que mensaje de error ve el usuario.
const patchMigrate = async ({ body }) => {
  const { source, target, idsucursal } = body || {};
  if (idsucursal === null || idsucursal === undefined) throw new Error('idsucursal es requerido.');

  return {
    cuerpo: await enTransaccion(async (tx) => {
      const hayOrigen = await tx.consultar(
        'SELECT 1 FROM localizacion WHERE localizacion LIKE ? LIMIT 1', [`${source}%`]
      );
      if (hayOrigen.length === 0) throw new Error('No hay ubicaciones con ese prefijo origen.');

      const hayDestino = await tx.consultar(
        'SELECT 1 FROM localizacion WHERE localizacion LIKE ? LIMIT 1', [`${target}%`]
      );
      if (hayDestino.length > 0) throw new Error('El prefijo destino ya existe.');

      const ocupada = await tx.consultar(
        `SELECT 1 FROM detalle d
           JOIN localizacion l ON l.idlocalizacion = d.idlocalizacion
          WHERE d.idsucursal = ? AND l.localizacion LIKE ? LIMIT 1`,
        [idsucursal, `${target}%`]
      );
      if (ocupada.length > 0) throw new Error('La matriz destino no está vacía.');

      // `?::int` y no `?` a secas: sin el tipo, Postgres toma la otra forma de
      // substring, `substring(texto FROM patron)`, busca '10' como expresion
      // regular, devuelve NULL y el UPDATE truena por NOT NULL.
      const r = await tx.escribir(
        `UPDATE localizacion
            SET localizacion = ? || substring(localizacion FROM ?::int)
          WHERE localizacion LIKE ?`,
        [target, String(source).length + 1, `${source}%`]
      );

      return okPacket(r);
    }),
  };
};

// ---------------------------------------------------------------------------
// Compras (capturas)
// ---------------------------------------------------------------------------

// Detalle compartido por newCapture y patchCapture. En MySQL esto vivia en una
// tabla temporal MEMORY que se llenaba con un WHILE sobre el JSON.
const guardarDetalleCompra = async (tx, idcompra, detalle, fechaCompra) => {
  for (const d of detalle) {
    await tx.escribir(
      `INSERT INTO registro (idcompra, num_parte, costo_actual, ultimo_costo,
                             cantidad_solicitada, descuento_uno, descuento_dos,
                             descuento_tres, importe, neto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [idcompra, d.ref, d.costo ?? null, d.costo_a ?? null, d.cant ?? null,
        d.d1 ?? null, d.d2 ?? null, d.d3 ?? null, d.importe ?? null, d.neto ?? null]
    );

    // LEAST(x,300) es tope de existencia del original. El ROUND necesita
    // ::numeric porque costo es float y round(double,int) no existe en Postgres.
    await tx.escribir(
      `UPDATE detalle
          SET existencia = LEAST(?::int, 300),
              costo = ?,
              aiva = ROUND((?::numeric) * (?::numeric), 2),
              precio = ROUND((?::numeric) * (?::numeric) * 1.16, 2),
              fecha_compra = ?
        WHERE num_parte = ?`,
      [d.exis ?? 0, d.costo ?? null, d.costo ?? 0, d.ut ?? 0, d.costo ?? 0, d.ut ?? 0,
        fechaCompra, d.ref]
    );
  }
};

// insertNewCapture
const newCapture = async ({ body }) => {
  const { idProveedor, numFactura, fechaCompra, netoTotal, descuentoTotal, subtotal,
    total, detalle } = body || {};

  if (!idProveedor || !numFactura || !fechaCompra || !Array.isArray(detalle) || !detalle.length) {
    return { estado: 400, cuerpo: { success: false, message: 'Parámetros incompletos para capturar la compra.' } };
  }

  try {
    const data = await enTransaccion(async (tx) => {
      const dup = await tx.consultar(
        'SELECT 1 FROM compra WHERE idproveedor = ? AND num_factura = ? LIMIT 1',
        [idProveedor, numFactura]
      );
      if (dup.length > 0) throw new Error('FACTURA_DUPLICADA');

      // FOR UPDATE se conserva: bloquea al proveedor para que dos capturas
      // simultaneas no calculen la fecha de pago con plazos distintos.
      const prov = await tx.consultar(
        'SELECT COALESCE(plazo_dias, 0) AS plazo FROM proveedor WHERE idproveedor = ? FOR UPDATE',
        [idProveedor]
      );
      const plazo = prov[0]?.plazo ?? 0;

      const cab = await tx.consultar(
        `INSERT INTO compra (num_factura, fecha_compra, fecha_pago, neto_total,
                             descuento_total, subtotal, total, status, idproveedor)
         VALUES (?, ?, ?::date + (? || ' days')::interval, ?, ?, ?, ?, 'P', ?)
         RETURNING idcompra`,
        [numFactura, fechaCompra, fechaCompra, plazo, netoTotal ?? 0,
          descuentoTotal ?? 0, subtotal ?? 0, total ?? 0, idProveedor]
      );

      await guardarDetalleCompra(tx, cab[0].idcompra, detalle, fechaCompra);
      return { idcompra: cab[0].idcompra };
    });

    return { cuerpo: { success: true, data } };
  } catch (error) {
    return { estado: 500, cuerpo: { success: false, message: error.message } };
  }
};

// UpdateCapture.
//
// OJO: en MySQL este procedimiento esta ROTO. Su rama de actualizacion llama a
// `insertCaptureDetail`, que no existe en la base (verificado: 0 rutinas con
// ese nombre), asi que editar una captura falla hoy en produccion.
// Aqui se implementa lo que evidentemente pretendia hacer: actualizar la
// cabecera, borrar el detalle y volver a insertarlo con la misma logica que
// usa newCapture.
const patchCapture = async ({ body }) => {
  const { idCompra, idProveedor, numFactura, fechaCompra, netoTotal, descuentoTotal,
    subtotal, total, detalle } = body || {};

  if (!idCompra) return newCapture({ body });

  try {
    const data = await enTransaccion(async (tx) => {
      await tx.escribir(
        `UPDATE compra
            SET idproveedor = ?, num_factura = ?, fecha_compra = ?, neto_total = ?,
                descuento_total = ?, subtotal = ?, total = ?
          WHERE idcompra = ?`,
        [idProveedor, numFactura, fechaCompra, netoTotal ?? 0, descuentoTotal ?? 0,
          subtotal ?? 0, total ?? 0, idCompra]
      );

      await tx.escribir('DELETE FROM registro WHERE idcompra = ?', [idCompra]);
      await guardarDetalleCompra(tx, idCompra, detalle ?? [], fechaCompra);
      return { idcompra: idCompra };
    });

    return { cuerpo: { success: true, data } };
  } catch (error) {
    return { estado: 500, cuerpo: { success: false, message: error.message } };
  }
};

// DeleteCaptureAndStock: el cursor recorria los renglones para devolver stock.
// Un UPDATE ... FROM hace lo mismo en una sentencia.
const deleteCapture = async ({ body, query }) => {
  const id = Number.parseInt(body?.id ?? query.get('id'), 10);
  if (!id) return { estado: 400, cuerpo: { success: false, message: 'Parámetro id inválido.' } };

  try {
    const data = await enTransaccion(async (tx) => {
      const existe = await tx.consultar('SELECT 1 FROM compra WHERE idcompra = ? LIMIT 1', [id]);
      if (existe.length === 0) throw new Error('La compra indicada no existe.');

      await tx.escribir(
        `UPDATE detalle d
            SET existencia = GREATEST(d.existencia - COALESCE(r.cantidad_solicitada, 0), 0),
                costo = COALESCE(r.ultimo_costo, d.costo),
                aiva  = COALESCE(r.costo_actual, d.aiva)
           FROM registro r
          WHERE r.num_parte = d.num_parte
            AND r.idcompra = ?`,
        [id]
      );

      await tx.escribir('DELETE FROM registro WHERE idcompra = ?', [id]);
      const r = await tx.escribir('DELETE FROM compra WHERE idcompra = ?', [id]);
      return okPacket(r);
    });

    return { cuerpo: { success: true, data } };
  } catch (error) {
    return { estado: 500, cuerpo: { success: false, message: error.message } };
  }
};

// ---------------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------------

// InsertInvoice: valida folio, evita duplicado, y liga a usuario o a cliente.
const addInvoice = async ({ body }) => {
  const { name, rfc, email, phone, placeId, CFDI, regime, ticket } = body || {};

  return {
    cuerpo: await enTransaccion(async (tx) => {
      const folioExiste = await tx.consultar('SELECT 1 FROM venta WHERE folio = ? LIMIT 1', [ticket]);
      if (folioExiste.length === 0) throw new Error('Folio not found in table venta.');

      const yaFacturado = await tx.consultar('SELECT 1 FROM factura WHERE folio = ? LIMIT 1', [ticket]);
      if (yaFacturado.length > 0) throw new Error('An invoice for this folio already exists.');

      // Se prefiere la cuenta de usuario sobre el cliente suelto.
      const usuario = await tx.consultar('SELECT idusuario FROM usuario WHERE email = ? LIMIT 1', [email]);

      if (usuario.length > 0) {
        const f = await tx.consultar(
          `INSERT INTO factura (idregimen, idcfdi, folio, idusuario, idcliente, emitida)
           VALUES (?, ?, ?, ?, NULL, 'P') RETURNING idfactura`,
          [regime, CFDI, ticket, usuario[0].idusuario]
        );
        return [{
          idfactura: f[0].idfactura,
          folio: ticket,
          idusuario_usado: usuario[0].idusuario,
          idcliente_usado: null,
        }];
      }

      let cliente = await tx.consultar('SELECT idcliente FROM cliente WHERE email = ? LIMIT 1', [email]);
      if (cliente.length === 0) {
        cliente = await tx.consultar(
          `INSERT INTO cliente (email, nombre, telefono, rfc, domicilio)
           VALUES (?, ?, ?, ?, ?) RETURNING idcliente`,
          [email, name, phone, rfc, placeId]
        );
      }

      const f = await tx.consultar(
        `INSERT INTO factura (idregimen, idcfdi, folio, idusuario, idcliente, emitida)
         VALUES (?, ?, ?, NULL, ?, 'P') RETURNING idfactura`,
        [regime, CFDI, ticket, cliente[0].idcliente]
      );

      return [{
        idfactura: f[0].idfactura,
        folio: ticket,
        idusuario_usado: null,
        idcliente_usado: cliente[0].idcliente,
      }];
    }),
  };
};

// ---------------------------------------------------------------------------
// Historial y pendientes (varios result sets)
// ---------------------------------------------------------------------------

// Columnas comunes de las consultas de historial. El alias "idVenta" conserva
// la mayuscula porque el procedimiento la escribia asi.
const COLS_VENTA = `
  v.folio, v."idVenta" AS "idVenta", u.idusuario, v.idsucursal, s.sucursal,
  u.nombre AS empleado, m.metodopago, v.nota, v.status, v.fecha_venta, v.total_venta`;

const DESDE_VENTA = `
  FROM venta v
  LEFT JOIN usuario u USING (idusuario)
  LEFT JOIN sucursal s ON s.idsucursal = v.idsucursal
  INNER JOIN metodo m USING (idmetodo)`;

// GetSalesHistorySummary + detalle por venta
const getHistory = async ({ query }) => {
  const fecha = query.get('id');
  if (!fecha) return faltan('Missing date parameter');

  const sales = await consultar(
    `SELECT ${COLS_VENTA} ${DESDE_VENTA} WHERE v.fecha_venta::date = ?::date`, [fecha]
  );

  const monthDaily = await consultar(
    `SELECT v.fecha_venta::date AS sale_key, v.idsucursal, s.sucursal, SUM(v.total_venta) AS total
       FROM venta v
       LEFT JOIN usuario u USING (idusuario)
       LEFT JOIN sucursal s ON s.idsucursal = v.idsucursal
      WHERE EXTRACT(YEAR FROM v.fecha_venta) = EXTRACT(YEAR FROM ?::date)
        AND EXTRACT(MONTH FROM v.fecha_venta) = EXTRACT(MONTH FROM ?::date)
        AND v.status = 'A'
      GROUP BY v.fecha_venta::date, v.idsucursal, s.sucursal
      ORDER BY sale_key`,
    [fecha, fecha]
  );

  const yearMonthly = await consultar(
    `SELECT to_char(v.fecha_venta, 'YYYY-MM') AS sale_key, v.idsucursal, s.sucursal,
            SUM(v.total_venta) AS total
       FROM venta v
       LEFT JOIN usuario u USING (idusuario)
       LEFT JOIN sucursal s ON s.idsucursal = v.idsucursal
      WHERE EXTRACT(YEAR FROM v.fecha_venta) = EXTRACT(YEAR FROM ?::date)
        AND v.status = 'A'
      GROUP BY to_char(v.fecha_venta, 'YYYY-MM'), v.idsucursal, s.sucursal
      ORDER BY sale_key`,
    [fecha]
  );

  const salesIndex = await consultar(
    `SELECT ${COLS_VENTA} ${DESDE_VENTA}
      WHERE EXTRACT(YEAR FROM v.fecha_venta) = EXTRACT(YEAR FROM ?::date)
      ORDER BY v.fecha_venta DESC`,
    [fecha]
  );

  // El quinto conjunto del procedimiento traia el detalle de todo el anio; el
  // Express lo ignoraba y volvia a pedir el detalle venta por venta. Aqui se
  // trae de una sola vez y se reparte en memoria: mismo resultado, sin N+1.
  const detalles = await consultar(
    `SELECT c.idventa, c.num_parte, c.cantidad, c.monto_venta, c.precio_venta,
            p.descripcion, c.concepto_comodin
       FROM concepto c
       INNER JOIN venta v ON v."idVenta" = ${NUM('c.idventa')}
       LEFT JOIN producto p USING (num_parte)
      WHERE EXTRACT(YEAR FROM v.fecha_venta) = EXTRACT(YEAR FROM ?::date)`,
    [fecha]
  );

  const porVenta = new Map();
  for (const d of detalles) {
    const k = String(d.idventa);
    if (!porVenta.has(k)) porVenta.set(k, []);
    porVenta.get(k).push(d);
  }
  for (const s of sales) {
    s.details = porVenta.get(String(s.idVenta)) ?? [];
  }

  return { cuerpo: { sales, monthDaily, yearMonthly, salesIndex } };
};

// GetSalesHistorySearch
const getHistorySearch = async ({ query }) => {
  const term = query.get('term');
  const mode = query.get('mode');
  if (!term || !mode) return faltan('Missing term or mode parameter');

  const modo = String(mode).toLowerCase();
  if (!['folio', 'employee'].includes(modo)) return faltan('Invalid mode parameter');

  const campo = modo === 'folio' ? 'v.folio' : 'u.nombre';

  return {
    cuerpo: await consultar(
      `SELECT ${COLS_VENTA} ${DESDE_VENTA}
        WHERE ${campo} LIKE '%' || ? || '%'
        ORDER BY v.fecha_venta DESC`,
      [String(term).trim()]
    ),
  };
};

// pendingSiteRequests: la tabla temporal pasa a CTE.
const getSiteRequests = async () => {
  const pendientes = await consultar(
    `SELECT v."idVenta" AS idventa, v.folio, v.fecha_venta, p.f_entrega, p.f_pedido,
            p.nombre, p.telefono, v.nota, v.total_venta, p.status, v.idusuario, u.idsucursal
       FROM venta v
       INNER JOIN pedidos p ON v."idVenta" = ${NUM('p.idventa')}
       LEFT JOIN usuario u ON u.idusuario = v.idusuario
      WHERE v.folio LIKE 'T%' AND p.status IN ('P','F')
      ORDER BY CASE p.status WHEN 'P' THEN 1 WHEN 'F' THEN 2 ELSE 3 END, p.f_pedido DESC`
  );

  const conceptos = await consultar(
    `WITH tpr AS (
       SELECT v."idVenta" AS idventa, p.status
         FROM venta v
         INNER JOIN pedidos p ON v."idVenta" = ${NUM('p.idventa')}
        WHERE v.folio LIKE 'T%' AND p.status IN ('P','F')
     )
     SELECT c.idventa, c.num_parte, c.concepto_comodin, pr.descripcion,
            c.precio_venta, c.cantidad, c.pedido AS status_producto,
            tpr.status AS status_pedido
       FROM concepto c
       INNER JOIN tpr ON tpr.idventa = ${NUM('c.idventa')}
       LEFT JOIN producto pr USING (num_parte)
      ORDER BY tpr.status, c.idventa, ${ORDEN_PE('c.pedido')}`
  );

  return { cuerpo: [pendientes, conceptos] };
};

// pendingWebDelivery: misma idea, tracking_web en vez de pedidos.status.
const getWebDelivery = async () => {
  const cabeceras = await consultar(
    `SELECT v."idVenta" AS idventa, v.folio, v.fecha_venta, v.total_venta, v.tracking_web,
            v.status AS status_venta, u.idusuario,
            concat_ws(' ', u.nombre, u.apellido) AS cliente,
            u.telefono, u.email, u.domicilio, u.categoria, u.empleado
       FROM venta v
       INNER JOIN usuario u ON u.idusuario = v.idusuario
      WHERE v.folio LIKE 'W%' AND v.tracking_web IN ('P','F')
      ORDER BY CASE v.tracking_web WHEN 'P' THEN 1 WHEN 'F' THEN 2 ELSE 3 END, v.fecha_venta DESC`
  );

  const detalle = await consultar(
    `WITH t AS (
       SELECT v."idVenta" AS idventa, v.tracking_web
         FROM venta v
         INNER JOIN usuario u ON u.idusuario = v.idusuario
        WHERE v.folio LIKE 'W%' AND v.tracking_web IN ('P','F')
     )
     SELECT c.idventa, c.num_parte,
            COALESCE(p.descripcion, c.concepto_comodin) AS descripcion,
            c.cantidad, c.precio_venta, c.pedido AS status_producto,
            t.tracking_web AS status_pedido
       FROM concepto c
       INNER JOIN t ON t.idventa = ${NUM('c.idventa')}
       LEFT JOIN producto p USING (num_parte)
      ORDER BY CASE t.tracking_web WHEN 'P' THEN 1 WHEN 'F' THEN 2 ELSE 3 END,
               c.idventa, ${ORDEN_PE('c.pedido')}`
  );

  return { cuerpo: [cabeceras, detalle] };
};

export const ESCRITURAS = {
  GET: {
    getHistory,
    getHistorySearch,
    getSiteRequests,
    getWebDelivery,
  },
  POST: {
    newSale,
    newCapture,
    newProductDetail,
    addInvoice,
  },
  PATCH: {
    patchHistoryStatus,
    patchProduct,
    patchMigrate,
    patchCapture,
  },
  DELETE: {
    deleteCapture,
  },
  PUT: {},
};
