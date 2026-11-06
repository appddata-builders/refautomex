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
 * venta."idVenta" es integer. concepto.idventa / pedidos.idventa eran varchar
 * y guardaban folios ('T0001') o ids; scripts/db-pg-llaves.mjs cambia los
 * folios por su id y las pasa a integer. Cada join contra venta compara como
 * texto (MISMA_VENTA), que funciona con las dos: un folio no empata con
 * ningun id, igual que en MySQL, donde la cadena se volvia 0.
 *
 * SOBRE LAS CLAVES DEL JSON
 * MySQL devuelve el nombre tal como se escribe en la consulta. Algunos
 * procedimientos escriben `v.idVenta` y otros `v.idventa`, asi que la clave
 * cambia entre endpoints. Los alias de aqui replican cada caso al pie de la
 * letra; no unificarlos es deliberado.
 */

import { consultar, escribir, enTransaccion, okPacket } from '@/app/lib/refautomex-db';
import {
  NIVEL_VALIDO,
  POR_UBICAR,
  TABLA_NIVELES,
  UBICACION_VALIDA,
  adelantarSecuencia,
  bloquearUbicaciones,
  SOLO_ACTIVOS,
  idDeLocalizacion,
  liberarInactivos,
  lugarParaDesplazado,
  nivelDe,
  reubicarDetalle,
  reubicarPorId,
} from './localizaciones';

const faltan = (detalle) => ({ estado: 400, cuerpo: { error: 'Bad Request', details: detalle } });

// Join de un idventa de concepto o pedidos con el de venta (ver SOBRE LOS TIPOS).
const MISMA_VENTA = (a, b) => `${a}::text = ${b}::text`;

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
      const idlocalizacion = await idDeLocalizacion(tx, localizacion);

      const r = await tx.escribir(
        `INSERT INTO detalle (num_parte, idsucursal, idlocalizacion, existencia, costo, precio, aiva, utilidad)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [refaccion, idsucursal, idlocalizacion, existencia ?? null,
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
  const { refaccion, idsucursal, localizacion, descripcion, existencia, costo, precio, aiva,
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

      // El precio sin IVA acompana al precio (lo manda la edicion del almacen);
      // quien no lo manda deja el que estaba.
      await tx.escribir(
        `UPDATE detalle SET existencia = ?, costo = ?, precio = ?, aiva = COALESCE(?, aiva), utilidad = ?
          WHERE num_parte = ? AND idsucursal = ?`,
        [existencia ?? null, costo ?? null, precio ?? null, aiva ?? null, utilidad ?? null, refaccion, idsucursal]
      );

      await reubicarDetalle(tx, { num_parte: refaccion, idsucursal, localizacion });

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

// MigrateMatrixProducts: mueve los productos de una matriz (01A05) a otra
// dentro de UNA sucursal, conservando el indice: 01A05-3 -> 02B10-3.
//
// El original renombraba las filas de `localizacion` con LIKE y sin sucursal,
// asi que la matriz se movia en todas las sucursales que la usaban, y bastaba
// con que el destino existiera en cualquiera de ellas (o como fila suelta del
// catalogo) para rechazar la migracion con 'El prefijo destino ya existe'. Esa
// validacion ya no aplica: ahora se cambia a que fila apunta cada detalle de
// esta sucursal (ver localizaciones.js), y lo unico que impide migrar es que
// la matriz destino tenga productos AQUI.
//
// `?::int` y no `?` a secas: sin el tipo, Postgres toma la otra forma de
// substring, `substring(texto FROM patron)`, busca '6' como expresion regular
// y devuelve NULL.
const patchMigrate = async ({ body }) => {
  const { source, target, idsucursal } = body || {};
  if (idsucursal === null || idsucursal === undefined) throw new Error('idsucursal es requerido.');
  // Sin esto un origen vacio seria LIKE '%' y moveria la sucursal entera.
  if (!source || !target) throw new Error('Indica la matriz origen y la matriz destino.');

  const desde = String(source).length + 1;

  return {
    cuerpo: await enTransaccion(async (tx) => {
      await bloquearUbicaciones(tx, idsucursal);

      // Solo cuentan los productos activos; lo demas (baja, fuera del catalogo)
      // no juega en el mapa y se libera a "por ubicar" en vez de migrarse o de
      // impedir la migracion.
      const hayOrigen = await tx.consultar(
        `SELECT 1 FROM detalle d
           JOIN localizacion l ON l.idlocalizacion = d.idlocalizacion
           ${SOLO_ACTIVOS}
          WHERE d.idsucursal = ? AND l.localizacion LIKE ? LIMIT 1`,
        [idsucursal, `${source}%`]
      );
      if (hayOrigen.length === 0) throw new Error('No hay ubicaciones con ese prefijo origen.');

      const ocupada = await tx.consultar(
        `SELECT 1 FROM detalle d
           JOIN localizacion l ON l.idlocalizacion = d.idlocalizacion
           ${SOLO_ACTIVOS}
          WHERE d.idsucursal = ? AND l.localizacion LIKE ? LIMIT 1`,
        [idsucursal, `${target}%`]
      );
      if (ocupada.length > 0) throw new Error('La matriz destino no está vacía.');

      await liberarInactivos(tx, idsucursal, `${source}%`);
      await liberarInactivos(tx, idsucursal, `${target}%`);

      await adelantarSecuencia(tx);
      await tx.escribir(
        `WITH nuevas AS (
           SELECT DISTINCT ?::text || substring(l.localizacion FROM ?::int) AS texto
             FROM detalle d
             JOIN localizacion l ON l.idlocalizacion = d.idlocalizacion
            WHERE d.idsucursal = ? AND l.localizacion LIKE ?
         )
         INSERT INTO localizacion (localizacion)
         SELECT texto FROM nuevas
          WHERE NOT EXISTS (SELECT 1 FROM localizacion x WHERE x.localizacion = nuevas.texto)`,
        [target, desde, idsucursal, `${source}%`]
      );

      const r = await tx.escribir(
        `UPDATE detalle d
            SET idlocalizacion = (
                  SELECT MIN(x.idlocalizacion) FROM localizacion x
                   WHERE x.localizacion = ?::text || substring(l.localizacion FROM ?::int))
           FROM localizacion l
          WHERE l.idlocalizacion = d.idlocalizacion
            AND d.idsucursal = ? AND l.localizacion LIKE ?`,
        [target, desde, idsucursal, `${source}%`]
      );

      return okPacket(r);
    }),
  };
};

// Asignacion de productos: pone un renglon de inventario (`iddetalle`) en una
// ubicacion exacta de su sucursal (01A05-3), o lo manda a "por ubicar" con '0'.
//
// Va por iddetalle y no por num_parte: si un producto quedo dos veces en la
// sucursal (dos detalles en la misma ubicacion, un conflicto), mover uno por
// num_parte arrastraba al otro y el conflicto aparecia en el nuevo indice.
//
// Nunca deja dos renglones en el mismo lugar. Si el destino esta ocupado por un
// producto activo responde 409 con el ocupante y la pantalla ofrece moverlo:
// con `intercambiar`, el ocupante toma el lugar que deja el renglon si ese lugar
// queda libre, y si no, la primera posicion libre del contenedor
// (lugarParaDesplazado). Lo que no es un producto activo (baja, o fuera del
// catalogo) no bloquea: se libera a "por ubicar" (liberarInactivos). Devuelve
// los movimientos hechos para que la pantalla los pinte y pueda deshacerlos.
const patchAssignLocation = async ({ body }) => {
  const { idsucursal, iddetalle, localizacion, intercambiar = false } = body || {};
  if (!idsucursal || !iddetalle || !localizacion) {
    return faltan('Faltan idsucursal, iddetalle o localizacion.');
  }

  const destino = String(localizacion).trim().toUpperCase();
  if (destino !== POR_UBICAR && !UBICACION_VALIDA.test(destino)) {
    return faltan(`La ubicación ${destino} no tiene la forma 01A05-0 o 01ENC-0.`);
  }

  return enTransaccion(async (tx) => {
    await bloquearUbicaciones(tx, idsucursal);

    const [actual] = await tx.consultar(
      `SELECT d.num_parte, COALESCE(l.localizacion, '') AS localizacion
         FROM detalle d
         LEFT JOIN localizacion l USING (idlocalizacion)
        WHERE d.iddetalle = ? AND d.idsucursal = ?`,
      [iddetalle, idsucursal]
    );
    if (!actual) {
      return {
        estado: 404,
        cuerpo: { error: 'Not Found', details: 'Ese renglón de inventario no existe en esta sucursal.' },
      };
    }

    const origen = actual.localizacion;
    if (origen === destino) return { cuerpo: { ok: true, movimientos: [] } };

    const movimientos = [{ iddetalle: Number(iddetalle), num_parte: actual.num_parte, de: origen, a: destino }];
    // Renglones de productos no activos que estorbaban y se mandaron a por ubicar.
    let liberados = 0;

    if (destino !== POR_UBICAR) {
      // Solo un producto activo ocupa el lugar; lo demas se libera abajo.
      const ocupantes = await tx.consultar(
        `SELECT d.iddetalle, d.num_parte
           FROM detalle d
           JOIN localizacion l USING (idlocalizacion)
           ${SOLO_ACTIVOS}
          WHERE d.idsucursal = ? AND l.localizacion = ? AND d.iddetalle <> ?
          ORDER BY d.iddetalle`,
        [idsucursal, destino, iddetalle]
      );
      const partes = ocupantes.map((fila) => fila.num_parte);

      if (ocupantes.length > 1) {
        return {
          estado: 409,
          cuerpo: {
            error: 'Conflict',
            details: `${destino} ya tiene ${ocupantes.length} productos; mueve uno antes de usarla.`,
            ocupantes: partes,
          },
        };
      }

      if (ocupantes.length === 1) {
        const [ocupante] = ocupantes;
        if (!intercambiar) {
          return {
            estado: 409,
            cuerpo: { error: 'Conflict', details: `${destino} ya la ocupa ${ocupante.num_parte}.`, ocupantes: partes },
          };
        }

        const lugarQueDeja = await lugarParaDesplazado(tx, {
          idsucursal, iddetalle, ocupante: ocupante.iddetalle, origen, destino,
        });
        if (!lugarQueDeja) {
          return {
            estado: 409,
            cuerpo: {
              error: 'Conflict',
              details: `No queda posición libre en ${destino.slice(0, destino.lastIndexOf('-'))} para ${ocupante.num_parte}.`,
              ocupantes: partes,
            },
          };
        }
        if (lugarQueDeja !== POR_UBICAR) liberados += await liberarInactivos(tx, idsucursal, lugarQueDeja);
        await reubicarPorId(tx, ocupante.iddetalle, lugarQueDeja);
        movimientos.push({ iddetalle: ocupante.iddetalle, num_parte: ocupante.num_parte, de: destino, a: lugarQueDeja });
      }

      liberados += await liberarInactivos(tx, idsucursal, destino);
    }

    await reubicarPorId(tx, iddetalle, destino);
    return { cuerpo: { ok: true, movimientos, liberados } };
  });
};

// Asignacion de productos: los niveles que tiene un anaquel (A, B... y los
// especiales ENC, EXT, OBS, INT). Sin registro, el mapa los deduce de las
// ubicaciones; con registro se ven estos, mas cualquiera que tenga productos.
// Se guarda la lista completa, y no se acepta si deja fuera un nivel que
// todavia tiene productos: primero hay que moverlos.
const patchShelfLevels = async ({ body }) => {
  const { idsucursal, anaquel, niveles } = body || {};
  if (!idsucursal || !/^[0-9]{2}$/.test(String(anaquel ?? '')) || !Array.isArray(niveles)) {
    return faltan('Faltan idsucursal, anaquel (dos dígitos) o la lista de niveles.');
  }

  const lista = [...new Set(niveles.map((nivel) => String(nivel).trim().toUpperCase()))];
  const invalidos = lista.filter((nivel) => !NIVEL_VALIDO.test(nivel));
  if (invalidos.length) return faltan(`Niveles no válidos: ${invalidos.join(', ')}.`);

  return enTransaccion(async (tx) => {
    // El mismo bloqueo que las asignaciones: nadie ubica en un nivel mientras se quita.
    await bloquearUbicaciones(tx, idsucursal);
    await tx.escribir(TABLA_NIVELES);

    // Solo los productos activos cuentan: lo demas no juega en el mapa.
    const ubicaciones = await tx.consultar(
      `SELECT DISTINCT l.localizacion
         FROM detalle d
         JOIN localizacion l USING (idlocalizacion)
         ${SOLO_ACTIVOS}
        WHERE d.idsucursal = ? AND l.localizacion LIKE ?`,
      [idsucursal, `${anaquel}%`]
    );
    const conProductos = new Set(ubicaciones.map((fila) => nivelDe(fila.localizacion)).filter(Boolean));
    const ocupados = [...conProductos].filter((nivel) => !lista.includes(nivel)).sort();
    if (ocupados.length) {
      return {
        estado: 409,
        cuerpo: {
          error: 'Conflict',
          details: `El anaquel ${anaquel} tiene productos en ${ocupados.join(', ')}: muévelos antes de quitar el nivel.`,
        },
      };
    }

    await tx.escribir(
      `INSERT INTO anaquel_niveles (id, idsucursal, anaquel, niveles) VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET niveles = EXCLUDED.niveles`,
      [`${idsucursal}:${anaquel}`, idsucursal, anaquel, lista.join(',')]
    );
    return { cuerpo: { ok: true, anaquel, niveles: lista } };
  });
};

// ---------------------------------------------------------------------------
// Compras (capturas): newCapture, patchCapture y deleteCapture viven en
// compras.js desde 2026-11, con las polizas y el analisis de Faltantes.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------------

// InsertInvoice: valida el folio y guarda los datos fiscales en la factura tal
// como los escribio el cliente. Antes se tomaban del perfil de la cuenta o del
// primer registro de ese correo: facturar a una empresa desde la cuenta
// personal, o con un RFC nuevo, salia con los datos viejos y sin codigo postal.
// La cuenta o el cliente solo quedan para saber quien la pidio.
const addInvoice = async ({ body }) => {
  const { name, rfc, email, phone, placeId, CP, CFDI, regime, ticket } = body || {};
  const datos = {
    nombre: String(name ?? '').trim().toUpperCase(),
    rfc: String(rfc ?? '').trim().toUpperCase(),
    email: String(email ?? '').trim(),
    telefono: String(phone ?? '').replace(/\D/g, ''),
    domicilio: String(placeId ?? '').trim(),
    cp: String(CP ?? '').trim(),
  };

  if (!ticket || !datos.nombre || !datos.rfc || !datos.email || !CFDI || !regime) {
    return faltan('Missing invoice data.');
  }
  // El CFDI 4.0 exige el codigo postal del domicilio fiscal.
  if (!/^\d{5}$/.test(datos.cp)) return faltan('Invalid postal code.');

  const resultado = await enTransaccion(async (tx) => {
    const [venta] = await tx.consultar(
      'SELECT "idVenta" AS idventa, status FROM venta WHERE folio = ? LIMIT 1',
      [ticket]
    );
    if (!venta) return { rechazo: 'Folio not found in table venta.' };
    // Una venta cancelada (C), devuelta (D) o con error (E) no se factura.
    if (venta.status !== 'A') return { rechazo: 'The sale for this folio is not active.' };

    const yaFacturado = await tx.consultar('SELECT 1 FROM factura WHERE folio = ? LIMIT 1', [ticket]);
    if (yaFacturado.length > 0) return { rechazo: 'An invoice for this folio already exists.' };

    // Se prefiere la cuenta de usuario sobre el cliente suelto.
    const [usuario] = await tx.consultar('SELECT idusuario FROM usuario WHERE email = ? LIMIT 1', [datos.email]);
    let idcliente = null;
    if (!usuario) {
      let [cliente] = await tx.consultar('SELECT idcliente FROM cliente WHERE email = ? LIMIT 1', [datos.email]);
      cliente ??= (await tx.consultar(
        `INSERT INTO cliente (email, nombre, telefono, rfc, domicilio)
         VALUES (?, ?, ?, ?, ?) RETURNING idcliente`,
        [datos.email, datos.nombre, datos.telefono, datos.rfc, datos.domicilio]
      ))[0];
      idcliente = cliente.idcliente;
    }

    const [factura] = await tx.consultar(
      `INSERT INTO factura (idregimen, idcfdi, folio, idventa, idusuario, idcliente, emitida,
                            nombre, rfc, email, telefono, domicilio, cp)
       VALUES (?, ?, ?, ?, ?, ?, 'P', ?, ?, ?, ?, ?, ?) RETURNING idfactura`,
      [regime, CFDI, ticket, venta.idventa, usuario?.idusuario ?? null, idcliente,
        datos.nombre, datos.rfc, datos.email, datos.telefono, datos.domicilio, datos.cp]
    );

    return {
      fila: {
        idfactura: factura.idfactura,
        folio: ticket,
        idusuario_usado: usuario?.idusuario ?? null,
        idcliente_usado: idcliente,
      },
    };
  });

  // Un folio que no se puede facturar no es un error del servidor.
  if (resultado.rechazo) {
    return { estado: 409, cuerpo: { error: 'Conflict', details: resultado.rechazo } };
  }
  return { cuerpo: [resultado.fila] };
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
       INNER JOIN venta v ON ${MISMA_VENTA('v."idVenta"', 'c.idventa')}
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
       INNER JOIN pedidos p ON ${MISMA_VENTA('v."idVenta"', 'p.idventa')}
       LEFT JOIN usuario u ON u.idusuario = v.idusuario
      WHERE v.folio LIKE 'T%' AND p.status IN ('P','F')
      ORDER BY CASE p.status WHEN 'P' THEN 1 WHEN 'F' THEN 2 ELSE 3 END, p.f_pedido DESC`
  );

  const conceptos = await consultar(
    `WITH tpr AS (
       SELECT v."idVenta" AS idventa, p.status
         FROM venta v
         INNER JOIN pedidos p ON ${MISMA_VENTA('v."idVenta"', 'p.idventa')}
        WHERE v.folio LIKE 'T%' AND p.status IN ('P','F')
     )
     SELECT c.idventa, c.num_parte, c.concepto_comodin, pr.descripcion,
            c.precio_venta, c.cantidad, c.pedido AS status_producto,
            tpr.status AS status_pedido
       FROM concepto c
       INNER JOIN tpr ON ${MISMA_VENTA('tpr.idventa', 'c.idventa')}
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
       INNER JOIN t ON ${MISMA_VENTA('t.idventa', 'c.idventa')}
       LEFT JOIN producto p USING (num_parte)
      ORDER BY CASE t.tracking_web WHEN 'P' THEN 1 WHEN 'F' THEN 2 ELSE 3 END,
               c.idventa, ${ORDEN_PE('c.pedido')}`
  );

  return { cuerpo: [cabeceras, detalle] };
};

// ---------------------------------------------------------------------------
// Sucursales
// ---------------------------------------------------------------------------

// No venian del Express: Inventarios > Sucursales da de alta y borra
// sucursales. Solo se borra una que nunca se uso: sin renglones de inventario
// (aunque el producto ya este dado de baja), sin ventas y sin empleados. WEB
// es la del sitio y no se borra nunca.
const esWeb = (fila) => Number(fila.idsucursal) === 1 || String(fila.sucursal || '').trim().toUpperCase() === 'WEB';

// Lo que ata a una sucursal. Lo comparten la lista (el candado de cada
// tarjeta) y deleteSucursal, que lo vuelve a revisar dentro de la transaccion.
const USO_DE_SUCURSAL = `
  (SELECT count(*)::int FROM detalle d WHERE d.idsucursal = s.idsucursal) AS productos,
  (SELECT count(*)::int FROM venta v WHERE v.idsucursal = s.idsucursal) AS ventas,
  (SELECT count(*)::int FROM usuario u WHERE u.idsucursal = s.idsucursal AND u.empleado = 1) AS empleados`;

const getSucursalUsage = async () => ({
  cuerpo: await consultar(`SELECT s.*, ${USO_DE_SUCURSAL} FROM sucursal s ORDER BY s.idsucursal`),
});

// Mayusculas y un solo espacio, como las que ya existen (TLALNEPANTLA).
const nombreDeSucursal = (texto) => String(texto ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

const newSucursal = async ({ body }) => {
  const nombre = nombreDeSucursal(body?.sucursal);
  if (nombre.length < 2 || nombre.length > 45) return faltan('El nombre debe tener entre 2 y 45 caracteres.');

  return enTransaccion(async (tx) => {
    // Dos altas con el mismo nombre al mismo tiempo pasarian las dos la revision.
    await tx.consultar("SELECT pg_advisory_xact_lock(hashtext('sucursales'))");

    const repetida = await tx.consultar(
      'SELECT idsucursal FROM sucursal WHERE upper(trim(sucursal)) = ?',
      [nombre]
    );
    if (repetida.length || nombre === 'WEB') {
      return { estado: 409, cuerpo: { error: 'Conflict', details: `Ya existe una sucursal llamada ${nombre}.` } };
    }

    // Igual que adelantarSecuencia (localizaciones.js): una base restaurada
    // puede traer la secuencia por debajo de los ids que ya existen.
    await tx.consultar(
      `SELECT setval(s.secuencia, t.tope)
         FROM (SELECT pg_get_serial_sequence('sucursal', 'idsucursal')::regclass AS secuencia) s,
              (SELECT max(idsucursal) AS tope FROM sucursal) t
        WHERE t.tope > COALESCE(pg_sequence_last_value(s.secuencia), 0)`
    );

    const [nueva] = await tx.consultar(
      "INSERT INTO sucursal (sucursal, telefono_uno, telefono_dos, whats_uno, whats_dos, direccion) VALUES (?, '', '', '', '', '') RETURNING idsucursal, sucursal",
      [nombre]
    );
    return { cuerpo: { ok: true, ...nueva } };
  });
};

// Los niveles de anaquel y el calendario de la sucursal se van con ella (ON
// DELETE CASCADE en schema.pg.js). Los usuarios que no son empleados y la
// tenian se quedan sin sucursal.
const deleteSucursal = async ({ body }) => {
  if (!body?.idsucursal) return faltan('Missing idsucursal.');

  return enTransaccion(async (tx) => {
    // FOR UPDATE: un detalle o una venta que llegue mientras tanto espera a
    // que esto termine, y la llave foranea lo rechaza si la sucursal ya no esta.
    const [fila] = await tx.consultar(
      `SELECT s.idsucursal, s.sucursal, ${USO_DE_SUCURSAL} FROM sucursal s WHERE s.idsucursal = ? FOR UPDATE`,
      [body.idsucursal]
    );
    if (!fila) return { estado: 404, cuerpo: { error: 'Not Found', details: 'Esa sucursal ya no existe.' } };

    if (esWeb(fila)) {
      return { estado: 409, cuerpo: { error: 'Conflict', details: 'WEB es la sucursal del sitio y no se puede eliminar.' } };
    }
    const usos = [
      fila.productos && `${fila.productos} productos`,
      fila.ventas && `${fila.ventas} ventas`,
      fila.empleados && `${fila.empleados} empleados`,
    ].filter(Boolean);
    if (usos.length) {
      return {
        estado: 409,
        cuerpo: { error: 'Conflict', details: `${fila.sucursal} tiene ${usos.join(', ')}: no se puede eliminar.` },
      };
    }

    await tx.escribir('UPDATE usuario SET idsucursal = NULL WHERE idsucursal = ?', [fila.idsucursal]);
    const r = await tx.escribir('DELETE FROM sucursal WHERE idsucursal = ?', [fila.idsucursal]);
    return { cuerpo: okPacket(r) };
  });
};

export const ESCRITURAS = {
  GET: {
    getHistory,
    getHistorySearch,
    getSiteRequests,
    getWebDelivery,
    getSucursalUsage,
  },
  POST: {
    newSale,
    newProductDetail,
    addInvoice,
    newSucursal,
  },
  PATCH: {
    patchHistoryStatus,
    patchProduct,
    patchMigrate,
    patchAssignLocation,
    patchShelfLevels,
  },
  DELETE: {
    deleteSucursal,
  },
  PUT: {},
};
