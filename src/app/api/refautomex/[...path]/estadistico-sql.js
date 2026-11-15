/**
 * SQL de Almacen -> Estadistico (estadistico.js). Aparte y sin imports para
 * poder correrlo tal cual contra una base local.
 *
 * Una venta cuenta como en Faltantes (compras.js): estado A y cantidad
 * positiva, historial_venta hasta su ultima fecha y `venta` despues. Cada
 * renglon se clasifica:
 *   - generico: los comodines escritos a mano (concepto_comodin, NEW-n) y los
 *     productos REFACCION NUEVA/USADA/PEDIDA y DISPONI. En caja se usan para lo
 *     que no esta dado de alta; venden mucho y no son un producto.
 *   - fuera: partes que ya no estan en el catalogo activo con detalle.
 *   - catalogo: lo demas. Es lo unico que entra al ranking, y son los mismos
 *     productos que getAllProducts, asi que el buscador los encuentra todos.
 */

// Mismo criterio que isWebBranch (inventory-model) y precios-web.js.
const ES_WEB = `(s.idsucursal = 1 OR upper(trim(s.sucursal)) = 'WEB')`;
const GENERICO = `p.descripcion ~* '^\\s*(REFACCION\\s+(NUEVA|USADA|PEDIDA)|DISPONI)'`;

/**
 * Las CTE que comparten todas las consultas: `clasificadas` (todo lo vendido,
 * con su tipo), `vc` (solo catalogo, con su mes) y `meses` (los meses con
 * ventas de catalogo, n = 1 el mas reciente). El mes en curso no cuenta
 * mientras haya meses completos, como en Faltantes: a mitad de mes subestima.
 */
export const baseVentas = (historial) => {
  const corte = historial ? "(SELECT COALESCE(max(fecha), '-infinity'::date) FROM historial_venta)" : "'-infinity'::date";
  return `
    WITH ventas AS (
      ${historial ? `SELECT h.fecha, 'H' || h.folio AS ticket, h.num_parte, h.cantidad,
                            (h.cantidad * h.precio)::float8 AS monto, false AS comodin
                       FROM historial_venta h
                      WHERE h.cantidad > 0
                     UNION ALL` : ''}
      SELECT v.fecha_venta::date AS fecha, 'V' || v."idVenta" AS ticket, c.num_parte, c.cantidad,
             c.monto_venta::float8 AS monto,
             (c.concepto_comodin IS NOT NULL OR c.num_parte ~ '^NEW-') AS comodin
        FROM venta v
        JOIN concepto c ON c.idventa::text = v."idVenta"::text
       WHERE v.status = 'A' AND c.cantidad > 0 AND v.fecha_venta::date > ${corte}
    ),
    con_detalle AS (SELECT DISTINCT num_parte FROM detalle),
    clasificadas AS (
      SELECT ve.fecha, ve.ticket, ve.num_parte, ve.cantidad, ve.monto,
             CASE
               WHEN ve.comodin OR COALESCE(${GENERICO}, false) THEN 'generico'
               WHEN p.num_parte IS NULL OR p.status <> 'A' OR cd.num_parte IS NULL THEN 'fuera'
               ELSE 'catalogo'
             END AS tipo
        FROM ventas ve
        LEFT JOIN producto p USING (num_parte)
        LEFT JOIN con_detalle cd USING (num_parte)
    ),
    vc AS (
      SELECT fecha, ticket, num_parte, cantidad, monto, date_trunc('month', fecha)::date AS mes
        FROM clasificadas
       WHERE tipo = 'catalogo' AND monto > 0
    ),
    meses_venta AS (SELECT DISTINCT mes FROM vc),
    completos AS (SELECT mes FROM meses_venta WHERE mes < date_trunc('month', current_date)),
    meses AS (
      SELECT mes, row_number() OVER (ORDER BY mes DESC)::int AS n
        FROM (SELECT mes FROM completos
              UNION SELECT mes FROM meses_venta WHERE NOT EXISTS (SELECT 1 FROM completos)) m
    )`;
};

// El orden del ranking: el de los pares (top 50) tiene que ser el mismo.
const ORDEN = (t) => `${t}piezas DESC, ${t}ingreso DESC, ${t}num_parte`;

/**
 * Un renglon por producto vendido, en orden de ranking (lugar 1 = mas
 * piezas). u12 y u12_previo son las piezas de los 12 meses con ventas mas
 * recientes y de los 12 anteriores; `serie`, las de cada uno de esos 12 meses,
 * del mas viejo al mas nuevo. Existencia, precio y costo son de las sucursales
 * fisicas (sin WEB).
 */
export const sqlRanking = (historial) => `
  ${baseVentas(historial)},
  por_parte AS (
    SELECT num_parte, sum(cantidad)::int AS piezas, count(DISTINCT ticket)::int AS tickets, sum(monto) AS ingreso,
           min(fecha) AS primera, max(fecha) AS ultima, count(DISTINCT mes)::int AS meses_con_venta
      FROM vc GROUP BY num_parte
  ),
  por_mes AS (
    SELECT num_parte, mes, sum(cantidad)::int AS piezas, sum(monto) AS monto
      FROM vc GROUP BY num_parte, mes
  ),
  recientes AS (
    SELECT pm.num_parte,
           COALESCE(sum(pm.piezas) FILTER (WHERE m.n <= 12), 0)::int AS u12,
           COALESCE(sum(pm.piezas) FILTER (WHERE m.n BETWEEN 13 AND 24), 0)::int AS u12_previo
      FROM por_mes pm JOIN meses m USING (mes)
     GROUP BY pm.num_parte
  ),
  serie AS (
    SELECT pp.num_parte, array_agg(COALESCE(pm.piezas, 0) ORDER BY m.mes) AS serie
      FROM por_parte pp
     CROSS JOIN (SELECT mes FROM meses WHERE n <= 12) m
      LEFT JOIN por_mes pm ON pm.num_parte = pp.num_parte AND pm.mes = m.mes
     GROUP BY pp.num_parte
  ),
  ultimo AS (
    SELECT DISTINCT ON (num_parte) num_parte, to_char(mes, 'YYYY-MM') AS mes_ultimo_precio,
           monto / NULLIF(piezas, 0) AS ultimo_precio
      FROM por_mes ORDER BY num_parte, mes DESC
  ),
  inventario AS (
    SELECT d.num_parte,
           COALESCE(sum(d.existencia) FILTER (WHERE NOT ${ES_WEB}), 0)::int AS existencia,
           max(d.precio) FILTER (WHERE NOT ${ES_WEB}) AS precio, max(d.costo) FILTER (WHERE NOT ${ES_WEB}) AS costo,
           max(d.precio) AS precio_cualquiera, max(d.costo) AS costo_cualquiera
      FROM detalle d JOIN sucursal s USING (idsucursal)
     GROUP BY d.num_parte
  )
  SELECT row_number() OVER (ORDER BY ${ORDEN('pp.')})::int AS lugar,
         row_number() OVER (ORDER BY pp.ingreso DESC, pp.num_parte)::int AS lugar_ingreso,
         pp.num_parte, p.descripcion, pp.piezas, pp.tickets,
         round(pp.ingreso::numeric, 2)::float8 AS ingreso,
         round((pp.ingreso / pp.piezas)::numeric, 2)::float8 AS precio_prom,
         to_char(pp.primera, 'YYYY-MM-DD') AS primera, to_char(pp.ultima, 'YYYY-MM-DD') AS ultima,
         pp.meses_con_venta, COALESCE(r.u12, 0) AS u12, COALESCE(r.u12_previo, 0) AS u12_previo,
         COALESCE(s.serie, '{}') AS serie,
         round(u.ultimo_precio::numeric, 2)::float8 AS ultimo_precio, u.mes_ultimo_precio,
         COALESCE(i.existencia, 0) AS existencia,
         round(COALESCE(i.precio, i.precio_cualquiera)::numeric, 2)::float8 AS precio_catalogo,
         round(COALESCE(i.costo, i.costo_cualquiera)::numeric, 2)::float8 AS costo
    FROM por_parte pp
    JOIN producto p USING (num_parte)
    LEFT JOIN recientes r USING (num_parte)
    LEFT JOIN serie s USING (num_parte)
    LEFT JOIN ultimo u USING (num_parte)
    LEFT JOIN inventario i USING (num_parte)
   ORDER BY lugar`;

/**
 * Cada mes del calendario, del primero con ventas al ultimo, tambien los que no
 * tienen: el hueco se tiene que ver. Ingreso de catalogo, de genericos y de
 * partes que ya no estan.
 */
export const sqlMensual = (historial) => `
  ${baseVentas(historial)},
  rango AS (
    SELECT min(date_trunc('month', fecha))::date AS desde, max(date_trunc('month', fecha))::date AS hasta
      FROM clasificadas
  ),
  calendario AS (
    SELECT generate_series(desde, hasta, interval '1 month')::date AS mes FROM rango WHERE desde IS NOT NULL
  ),
  agregado AS (
    SELECT date_trunc('month', fecha)::date AS mes,
           count(DISTINCT ticket) FILTER (WHERE tipo = 'catalogo')::int AS tickets,
           COALESCE(sum(cantidad) FILTER (WHERE tipo = 'catalogo'), 0)::int AS piezas,
           COALESCE(sum(monto) FILTER (WHERE tipo = 'catalogo'), 0) AS ingreso,
           COALESCE(sum(monto) FILTER (WHERE tipo = 'generico'), 0) AS ingreso_generico,
           COALESCE(sum(monto) FILTER (WHERE tipo = 'fuera'), 0) AS ingreso_fuera
      FROM clasificadas
     GROUP BY 1
  )
  SELECT to_char(c.mes, 'YYYY-MM') AS mes, a.mes IS NOT NULL AS con_ventas,
         COALESCE(a.tickets, 0) AS tickets, COALESCE(a.piezas, 0) AS piezas,
         round(COALESCE(a.ingreso, 0)::numeric, 2)::float8 AS ingreso,
         round(COALESCE(a.ingreso_generico, 0)::numeric, 2)::float8 AS ingreso_generico,
         round(COALESCE(a.ingreso_fuera, 0)::numeric, 2)::float8 AS ingreso_fuera
    FROM calendario c
    LEFT JOIN agregado a USING (mes)
   ORDER BY c.mes`;

/** Los 24 meses con ventas que compara la tendencia (n 1-12 contra 13-24). */
export const sqlMeses = (historial) => `
  ${baseVentas(historial)}
  SELECT to_char(mes, 'YYYY-MM') AS mes, n FROM meses WHERE n <= 24 ORDER BY mes`;

/** Pares del top 50 que salen en el mismo ticket al menos 3 veces. */
export const sqlPares = (historial) => `
  ${baseVentas(historial)},
  top AS (
    SELECT num_parte
      FROM (SELECT num_parte, sum(cantidad) AS piezas, sum(monto) AS ingreso FROM vc GROUP BY num_parte) x
     ORDER BY ${ORDEN('')} LIMIT 50
  ),
  tt AS (SELECT DISTINCT vc.ticket, vc.num_parte FROM vc JOIN top USING (num_parte))
  SELECT a.num_parte AS a, b.num_parte AS b, count(*)::int AS tickets
    FROM tt a JOIN tt b ON a.ticket = b.ticket AND a.num_parte < b.num_parte
   GROUP BY 1, 2
  HAVING count(*) >= 3
   ORDER BY 3 DESC, 1, 2
   LIMIT 20`;

/** Hasta donde llega cada fuente. */
export const sqlFuentes = (historial) => `
  SELECT ${historial ? "(SELECT to_char(min(fecha), 'YYYY-MM-DD') FROM historial_venta)" : 'NULL'} AS historial_desde,
         ${historial ? "(SELECT to_char(max(fecha), 'YYYY-MM-DD') FROM historial_venta)" : 'NULL'} AS historial_hasta,
         (SELECT to_char(min(fecha_venta), 'YYYY-MM-DD') FROM venta WHERE status = 'A') AS ventas_desde,
         (SELECT to_char(max(fecha_venta), 'YYYY-MM-DD') FROM venta WHERE status = 'A') AS ventas_hasta`;

/**
 * Un producto mes a mes, sobre el mismo calendario de la tienda (asi su
 * grafica muestra el mismo hueco). Un parametro: num_parte.
 */
export const sqlProductoMensual = (historial) => `
  ${baseVentas(historial)},
  rango AS (SELECT min(mes) AS desde, max(mes) AS hasta FROM vc),
  calendario AS (
    SELECT generate_series(desde, hasta, interval '1 month')::date AS mes FROM rango WHERE desde IS NOT NULL
  ),
  del_producto AS (
    SELECT mes, sum(cantidad)::int AS piezas, count(DISTINCT ticket)::int AS tickets, sum(monto) AS monto
      FROM vc WHERE num_parte = ? GROUP BY mes
  )
  SELECT to_char(c.mes, 'YYYY-MM') AS mes, COALESCE(d.piezas, 0) AS piezas, COALESCE(d.tickets, 0) AS tickets,
         round(COALESCE(d.monto, 0)::numeric, 2)::float8 AS ingreso,
         CASE WHEN d.piezas > 0 THEN round((d.monto / d.piezas)::numeric, 2)::float8 END AS precio_prom
    FROM calendario c
    LEFT JOIN del_producto d USING (mes)
   ORDER BY c.mes`;

/** Con que otros productos sale en el mismo ticket. Dos parametros: num_parte, num_parte. */
export const sqlAcompanantes = (historial) => `
  ${baseVentas(historial)},
  suyos AS (SELECT DISTINCT ticket FROM vc WHERE num_parte = ?)
  SELECT vc.num_parte, p.descripcion, count(DISTINCT vc.ticket)::int AS tickets,
         (SELECT count(*) FROM suyos)::int AS de
    FROM vc
    JOIN suyos USING (ticket)
    JOIN producto p USING (num_parte)
   WHERE vc.num_parte <> ?
   GROUP BY vc.num_parte, p.descripcion
   ORDER BY 3 DESC, 1
   LIMIT 6`;
