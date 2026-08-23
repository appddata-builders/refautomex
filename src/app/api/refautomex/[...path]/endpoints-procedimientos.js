/**
 * Endpoints que en MySQL se resolvian con `CALL <procedimiento>`.
 *
 * DECISION DE DISENO: no se recrean los procedimientos en Postgres. La logica
 * pasa al handler, en JavaScript.
 *
 * Tres razones:
 *   1. Queda versionada en git. Un procedimiento vive dentro de la base: no
 *      aparece en un diff, no se revisa en un PR y no se despliega con la app.
 *   2. Los procedimientos de MySQL devuelven varios result sets y una funcion
 *      de Postgres solo puede devolver uno. Ejecutando las consultas por
 *      separado desde aqui, el problema desaparece en vez de esquivarse.
 *   3. Una migracion menos: no hay DDL de funciones que mantener sincronizado
 *      entre entornos.
 *
 * El original de cada uno esta en .apirefautomex (el Express) y en el volcado
 * de rutinas de MySQL. Los comentarios marcan donde la traduccion NO es literal.
 *
 * DIFERENCIAS MySQL -> POSTGRES QUE APARECIERON AQUI
 *   - JSON_ARRAYAGG(x)          ->  json_agg(x)
 *   - FIELD(col,'P','E')        ->  CASE ... (Postgres no tiene FIELD)
 *   - UPDATE a JOIN b SET a.x,b.y -> Postgres no actualiza dos tablas en una
 *                                  sentencia: se parte en varias.
 *   - GROUP BY laxo             ->  Postgres exige TODA columna no agregada
 *                                  en el GROUP BY. MySQL las permite fuera.
 */

import { consultar, llamar, escribir, enTransaccion, okPacket } from '@/app/lib/refautomex-db';

const faltan = (detalle) => ({
  estado: 400,
  cuerpo: { error: 'Bad Request', details: detalle },
});

// ---------------------------------------------------------------------------
// Un solo result set  ->  se devuelve anidado, como hacia el driver mysql
// ---------------------------------------------------------------------------

// webProducts()
//
// El FILTER no es cosmetico: con el LEFT JOIN a `imagenes`, un producto sin
// fotos hacia que json_agg devolviera [null] en vez de []. El frontend tomaba
// ese null como la ruta principal y pedia a S3 `.../undefined`.
const getProducts = async () => ({
  cuerpo: await llamar(
    `SELECT p.num_parte, p.descripcion, d.precio, g.grupo, g.idgrupo, d.existencia,
            COALESCE(json_agg(i.ruta) FILTER (WHERE i.ruta IS NOT NULL), '[]'::json) AS rutas
       FROM producto p
       INNER JOIN grupo g USING (idgrupo)
       INNER JOIN detalle d USING (num_parte)
       INNER JOIN sucursal s USING (idsucursal)
       LEFT JOIN imagenes i USING (num_parte)
      WHERE p.status = 'A' AND p.idgrupo > 0 AND sucursal = 'WEB'
      GROUP BY p.num_parte, p.descripcion, d.precio, g.grupo, g.idgrupo, d.existencia`
  ),
});

// GetAllExistingUsers()
const getAllUsers = async () => ({
  cuerpo: await llamar('SELECT * FROM usuario LEFT JOIN sucursal USING (idsucursal)'),
});

// invoicesCaptured()
const getInvoicesCaptured = async () => ({
  cuerpo: await llamar(
    `SELECT * FROM compra c
       INNER JOIN proveedor p USING (idproveedor)
      WHERE c.status = 'P'`
  ),
});

// GetInvoices()
const getInvoices = async () => ({
  cuerpo: await llamar(
    `SELECT f.idfactura, f.folio, f.idcfdi, f.idregimen, f.idusuario, f.idcliente,
            f.emitida, v.total_venta, v.fecha_venta, v.status AS venta_status,
            cf.cfdi, r.regimen,
            COALESCE(u.nombre, c.nombre)       AS nombre,
            COALESCE(u.email, c.email)         AS email,
            COALESCE(u.telefono, c.telefono)   AS telefono,
            COALESCE(u.rfc, c.rfc)             AS rfc,
            COALESCE(u.domicilio, c.domicilio) AS domicilio
       FROM factura f
       LEFT JOIN venta   v  ON v.folio = f.folio
       LEFT JOIN usuario u  ON f.idusuario = u.idusuario
       LEFT JOIN cliente c  ON f.idcliente = c.idcliente
       LEFT JOIN cfdi    cf ON f.idcfdi = cf.idcfdi
       LEFT JOIN regimen r  ON f.idregimen = r.idregimen
      ORDER BY f.idfactura DESC`
  ),
});

// GetAllProducts(idsucursal)
const getAllProducts = async ({ body }) => {
  const idsucursal = body?.idsucursal ? Number.parseInt(body.idsucursal, 10) : null;
  const sucursal = Number.isNaN(idsucursal) ? null : idsucursal;

  // El GROUP BY lleva idcategoria, categoria y empresa, que el original NO
  // listaba. MySQL lo permite; Postgres exige toda columna no agregada. Sin
  // esto la consulta ni siquiera se ejecuta.
  return {
    cuerpo: await llamar(
      `SELECT p.num_parte, p.descripcion, d.precio, d.costo, g.grupo, g.idgrupo,
              c.idcategoria, c.categoria, d.existencia, l.localizacion,
              s.sucursal, s.idsucursal, p.mod_ini, p.mod_fin, ma.marca, ma.idmarca,
              d.utilidad, pr.empresa AS ultimo,
              COALESCE(json_agg(i.ruta) FILTER (WHERE i.ruta IS NOT NULL), '[]'::json) AS rutas
         FROM producto p
         INNER JOIN detalle d USING (num_parte)
         INNER JOIN localizacion l USING (idlocalizacion)
         INNER JOIN categoria c USING (idcategoria)
         INNER JOIN sucursal s USING (idsucursal)
         LEFT JOIN imagenes i USING (num_parte)
         INNER JOIN grupo g USING (idgrupo)
         INNER JOIN proveedor pr USING (idproveedor)
         INNER JOIN marca ma USING (idmarca)
        WHERE p.status = 'A'
          AND (?::int IS NULL OR s.idsucursal = ?::int)
        GROUP BY p.num_parte, p.descripcion, d.precio, d.costo, g.grupo, g.idgrupo,
                 c.idcategoria, c.categoria, d.existencia, l.localizacion,
                 s.sucursal, s.idsucursal, d.utilidad, p.mod_ini, p.mod_fin,
                 ma.marca, ma.idmarca, pr.empresa`,
      [sucursal, sucursal]
    ),
  };
};

// webHistorySales(idusuario) - el Express devolvia sales[0], o sea el array plano
const getUserHistory = async ({ query }) => {
  const id = query.get('id');
  if (!id) return faltan('Missing id parameter');

  return {
    cuerpo: await consultar(
      "SELECT * FROM venta WHERE idusuario = ? AND folio LIKE 'W%'",
      [id]
    ),
  };
};

// GetSaleDetailsByIdVenta(idVenta) - el Express devolvia details[0], plano
const getSaleDetails = async ({ query }) => {
  const idVenta = query.get('idVenta');
  if (!idVenta) return faltan('Missing idVenta parameter');

  return { cuerpo: await consultar(SQL_DETALLE_VENTA, [idVenta]) };
};

const SQL_DETALLE_VENTA = `
  SELECT c.num_parte, c.cantidad, c.monto_venta, c.precio_venta,
         p.descripcion, c.concepto_comodin
    FROM concepto c
    LEFT JOIN producto p USING (num_parte)
   WHERE c.idventa = ?`;

// ---------------------------------------------------------------------------
// Varios result sets  ->  una consulta por conjunto, ensambladas en orden
// ---------------------------------------------------------------------------

// GetCaptureWithDetails(idCompra): cabecera + detalle
const getCaptureWithDetails = async ({ query }) => {
  const id = Number.parseInt(query.get('id'), 10);
  if (!id) return { estado: 400, cuerpo: { success: false, message: 'Parámetro id inválido.' } };

  const cabecera = await consultar(
    `SELECT c.*, p.empresa, p.descuento, p.plazo_dias
       FROM compra c
       INNER JOIN proveedor p USING (idproveedor)
      WHERE c.idcompra = ?`,
    [id]
  );

  if (cabecera.length === 0) {
    return { estado: 404, cuerpo: { success: false, message: 'Captura no encontrada.' } };
  }

  const detalle = await consultar(
    `SELECT r.*, prod.descripcion, det.existencia
       FROM registro r
       INNER JOIN producto prod USING (num_parte)
       LEFT JOIN detalle det USING (num_parte)
      WHERE r.idcompra = ?`,
    [id]
  );

  // El Express armaba {success, header, detail} a partir de result[0][0] y
  // result[1]; aqui se arma igual pero sin el anidado intermedio.
  return { cuerpo: { success: true, header: cabecera[0], detail: detalle } };
};

// GetWarehouseProducts(): sin detalle (status E) + con detalle (status A)
const getWarehouseProducts = async () => {
  const sinDetalle = await consultar(
    `SELECT p.num_parte, p.descripcion, p.mod_ini, p.mod_fin, p.idgrupo, p.idmarca, p.status
       FROM producto p
      WHERE p.status = 'E'`
  );

  const conDetalle = await consultar(
    `SELECT p.num_parte, p.descripcion, p.mod_ini, p.mod_fin, p.idgrupo, g.grupo,
            c.categoria, p.idmarca, p.status, d.idsucursal, s.sucursal,
            l.localizacion, d.existencia, d.costo, d.precio, d.aiva, d.utilidad
       FROM producto p
       INNER JOIN grupo g USING (idgrupo)
       INNER JOIN categoria c USING (idcategoria)
       INNER JOIN detalle d USING (num_parte)
       INNER JOIN sucursal s USING (idsucursal)
       LEFT JOIN localizacion l USING (idlocalizacion)
      WHERE p.status = 'A'`
  );

  return { cuerpo: [sinDetalle, conDetalle] };
};

// GetFolioHistory(folio): venta + conceptos
const getFolioHistory = async ({ query }) => {
  const folio = query.get('id');
  if (!folio) return faltan('Missing id parameter (folio expected)');

  // v."idVenta" va entre comillas y con alias, y las dos cosas importan.
  //
  // La columna se llama idVenta con V mayuscula. MySQL es insensible a
  // mayusculas en identificadores, asi que `v.idventa` funcionaba; Postgres
  // pasa a minusculas todo identificador sin comillas y no encuentra nada.
  //
  // El alias reproduce la clave del JSON: MySQL devuelve el nombre tal como se
  // escribe en la consulta, no como esta definido en la tabla. Verificado
  // contra el origen - `SELECT v.idventa` alli devuelve la clave `idventa`.
  // Sin el alias, Postgres devolveria `idVenta` y el frontend leeria undefined.
  const venta = await consultar(
    `SELECT v."idVenta" AS idventa, v.folio, v.fecha_venta, p.f_entrega, p.f_pedido,
            p.nombre, p.telefono, v.nota, s.sucursal, v.total_venta, p.status
       FROM venta v
       LEFT JOIN pedidos p
              ON v."idVenta" = CASE WHEN p.idventa ~ '^[0-9]+$'
                                    THEN p.idventa::int END
             AND p.status IN ('P','F')
       LEFT JOIN sucursal s USING (idsucursal)
      WHERE v.folio = ?
      ORDER BY p.f_pedido DESC
      LIMIT 1`,
    [folio]
  );

  // Dos traducciones no literales en esta consulta:
  //
  // 1. FIELD(c.pedido,'P','E') DESC en MySQL da 1 para 'P', 2 para 'E' y 0
  //    para cualquier otro; al ordenar DESC quedan E, luego P, luego el resto.
  //    Postgres no tiene FIELD y se reproduce con un CASE.
  //
  // 2. El join contra venta lleva un CASE con una guarda de formato, y no es
  //    defensa preventiva: concepto.idventa es varchar y guarda DOS cosas
  //    distintas. 25,568 filas tienen un folio ('T0001') y 5,555 un idVenta
  //    numerico. venta."idVenta" es integer.
  //
  //    MySQL comparaba int = varchar coercionando la cadena a numero, asi que
  //    'T0001' se volvia 0 y no empataba con nada: el join YA descartaba en
  //    silencio el 78% de los conceptos. Postgres directamente falla con
  //    "operator does not exist", y un cast a secas reventaria con esas filas.
  //
  //    La guarda reproduce el resultado de MySQL exactamente. NO es el
  //    comportamiento correcto - es el comportamiento actual, que es lo que
  //    debe preservar una migracion. Arreglar el modelo (que concepto apunte
  //    a la venta por una sola via) es un cambio aparte y deliberado.
  const conceptos = await consultar(
    `SELECT c.idventa, c.num_parte, c.concepto_comodin, pr.descripcion,
            c.precio_venta, c.cantidad, c.pedido AS status_producto
       FROM concepto c
       LEFT JOIN venta v
              ON v."idVenta" = CASE WHEN c.idventa ~ '^[0-9]+$'
                                    THEN c.idventa::int END
       LEFT JOIN pedidos p USING (idventa)
       LEFT JOIN producto pr USING (num_parte)
      WHERE v.folio = ?
      ORDER BY CASE c.pedido WHEN 'P' THEN 1 WHEN 'E' THEN 2 ELSE 0 END DESC`,
    [folio]
  );

  // El Express exigia al menos 2 conjuntos antes de responder 200.
  if (venta.length === 0) {
    return { estado: 404, cuerpo: { error: 'Not Found', details: `No results for folio ${folio}` } };
  }

  return { cuerpo: [venta, conceptos] };
};

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

// InsertProduct(...)
const newProduct = async ({ body }) => {
  const { refaccion, descripcion, mod_ini, mod_fin, idgrupo, idcategoria, idmarca,
    idproveedor, status = 'E' } = body || {};

  if (!refaccion || !descripcion || !idgrupo || !idmarca || !idproveedor || !idcategoria) {
    return faltan('Missing required fields for new product.');
  }

  return {
    cuerpo: await escribir(
      `INSERT INTO producto (num_parte, descripcion, mod_ini, mod_fin, idgrupo,
                             idcategoria, idmarca, status, idproveedor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [refaccion, descripcion, mod_ini ?? null, mod_fin ?? null, idgrupo,
        idcategoria, idmarca, status, idproveedor]
    ),
  };
};

// UpdateSaleStatus(folio, status)
const patchSaleStatus = async ({ body }) => ({
  cuerpo: await escribir('UPDATE venta SET status = ? WHERE folio = ?', [
    body?.status ?? null,
    body?.folio ?? null,
  ]),
});

// DeleteProductCascade(refaccion): borra detalles y da de baja el producto
const deleteProductCascade = async ({ body }) => {
  if (!body?.refaccion) return faltan('Missing refaccion parameter.');

  return {
    cuerpo: await enTransaccion(async (tx) => {
      await tx.escribir('DELETE FROM detalle WHERE num_parte = ?', [body.refaccion]);
      const r = await tx.escribir("UPDATE producto SET status = 'B' WHERE num_parte = ?", [
        body.refaccion,
      ]);
      return okPacket(r);
    }),
  };
};

// DeleteProductDetail(refaccion, idsucursal): borra un detalle y, si era el
// ultimo, devuelve el producto al estado 'E' (existente sin detalle).
const deleteProductDetail = async ({ body }) => {
  const { refaccion, idsucursal } = body || {};
  if (!refaccion || !idsucursal) return faltan('Missing refaccion or idsucursal.');

  return {
    cuerpo: await enTransaccion(async (tx) => {
      const r = await tx.escribir(
        'DELETE FROM detalle WHERE num_parte = ? AND idsucursal = ?',
        [refaccion, idsucursal]
      );

      const quedan = await tx.consultar(
        'SELECT COUNT(*)::int AS n FROM detalle WHERE num_parte = ?',
        [refaccion]
      );

      if (quedan[0].n === 0) {
        await tx.escribir("UPDATE producto SET status = 'E' WHERE num_parte = ?", [refaccion]);
      }

      return okPacket(r);
    }),
  };
};

// UpdateTableProducts(...)
//
// El original hacia un UPDATE sobre dos tablas a la vez:
//   UPDATE detalle d INNER JOIN localizacion l USING (idlocalizacion)
//      SET d.existencia = ..., l.localizacion = ...
// Postgres no puede actualizar dos tablas en una sentencia. Se parte en tres,
// dentro de una transaccion para conservar la atomicidad que daba MySQL.
const patchTableProducts = async ({ body }) => {
  const { refaccion, idsucursal, existencia, localizacion, descripcion, costo, precio, aiva } =
    body || {};

  return {
    cuerpo: await enTransaccion(async (tx) => {
      await tx.escribir('UPDATE producto SET descripcion = ? WHERE num_parte = ?', [
        descripcion ?? null,
        refaccion,
      ]);

      const r = await tx.escribir(
        `UPDATE detalle
            SET existencia = ?, costo = ?, aiva = ?, precio = ?
          WHERE num_parte = ? AND idsucursal = ?`,
        [existencia ?? null, costo ?? null, aiva ?? null, precio ?? null, refaccion, idsucursal]
      );

      await tx.escribir(
        `UPDATE localizacion
            SET localizacion = ?
          WHERE idlocalizacion IN (
            SELECT idlocalizacion FROM detalle
             WHERE num_parte = ? AND idsucursal = ?)`,
        [localizacion ?? null, refaccion, idsucursal]
      );

      return okPacket(r);
    }),
  };
};

export const PROCEDIMIENTOS = {
  GET: {
    getProducts,
    getAllUsers,
    getInvoicesCaptured,
    getInvoices,
    getUserHistory,
    getSaleDetails,
    getCaptureWithDetails,
    getWarehouseProducts,
    getFolioHistory,
  },
  POST: {
    getAllProducts,
    newProduct,
  },
  PATCH: {
    patchSaleStatus,
    patchTableProducts,
  },
  DELETE: {
    deleteProductCascade,
    deleteProductDetail,
  },
  PUT: {},
};
