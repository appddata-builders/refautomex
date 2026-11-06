-- Recorta y anonimiza la base local despues de restaurar el respaldo de S3.
-- Lo corre scripts/db-local.sh cargar; nunca toca produccion.
--
-- Que se queda:
--   - Catalogos, productos, inventario, ubicaciones e imagenes: completos. Son
--     el centro del panel y no tienen datos personales.
--   - Empleados: tal cual, para entrar con la misma cuenta de Cognito.
--   - Ventas: las :ventas mas recientes (2000 por omision) con sus conceptos,
--     pedidos y facturas. Por numero y no por fecha: en el historial hay un
--     hueco de 2024-11 a 2026-10 y una ventana de dias dejaria casi nada.
--   - Compras: las de los ultimos 365 dias antes del respaldo, con sus renglones.
--
-- Que se anonimiza: clientes (el directorio `cliente` y las cuentas que no son
-- de empleado), y los datos de contacto de pedidos y facturas. Los correos van
-- a @local.test, que no existe: desde local no se le escribe a nadie real, y
-- en Permisos se ve de inmediato que la base no es la de produccion.
--
-- Las dos llaves de `detalle` que en produccion estan NOT VALID (renglones
-- huerfanos) se quedan igual: la base local se porta como la de produccion.

\if :{?ventas}
\else
  \set ventas 2000
\endif

BEGIN;

CREATE TEMP TABLE ventas_fuera ON COMMIT DROP AS
  SELECT "idVenta" AS idventa FROM venta
   ORDER BY fecha_venta DESC, "idVenta" DESC
  OFFSET :ventas;

DELETE FROM concepto WHERE idventa IN (SELECT idventa FROM ventas_fuera);
DELETE FROM pedidos WHERE idventa IN (SELECT idventa FROM ventas_fuera);
DELETE FROM factura WHERE idventa IN (SELECT idventa FROM ventas_fuera);
DELETE FROM venta WHERE "idVenta" IN (SELECT idventa FROM ventas_fuera);

CREATE TEMP TABLE compras_fuera ON COMMIT DROP AS
  SELECT idcompra FROM compra
   WHERE fecha_compra < :'fecha_respaldo'::date - 365;

DELETE FROM registro WHERE idcompra IN (SELECT idcompra FROM compras_fuera);
DELETE FROM compra WHERE idcompra IN (SELECT idcompra FROM compras_fuera);
DELETE FROM poliza p
 WHERE p.fecha_poliza < :'fecha_respaldo'::date - 365
   AND NOT EXISTS (SELECT 1 FROM compra c WHERE c.idpoliza = p.idpoliza);

-- ------------------------------------------------------------ anonimizar ---

UPDATE usuario
   SET email = 'usuario-' || idusuario || '@local.test',
       cognitoid = 'local-' || idusuario,
       nombre = 'Cliente',
       apellido = 'Local ' || idusuario,
       telefono = '0000000000',
       rfc = 'XAXX010101000',
       domicilio = '',
       f_nacimiento = NULL
 WHERE empleado <> 1;

UPDATE cliente
   SET email = 'cliente-' || idcliente || '@local.test',
       nombre = 'Cliente local ' || idcliente,
       telefono = '0000000000',
       rfc = CASE WHEN rfc IS NULL THEN NULL ELSE 'XAXX010101000' END,
       domicilio = NULL;

UPDATE pedidos
   SET email = 'pedido-' || idpedido || '@local.test',
       nombre = 'Cliente pedido ' || idpedido,
       telefono = '0000000000';

UPDATE factura
   SET nombre = CASE WHEN nombre IS NULL THEN NULL ELSE 'Cliente factura ' || idfactura END,
       rfc = CASE WHEN rfc IS NULL THEN NULL ELSE 'XAXX010101000' END,
       email = CASE WHEN email IS NULL THEN NULL ELSE 'factura-' || idfactura || '@local.test' END,
       telefono = CASE WHEN telefono IS NULL THEN NULL ELSE '0000000000' END,
       domicilio = NULL,
       cp = NULL;

-- ---------------------------------------------------------------- origen ---

-- En su propio esquema: db:pg:push y los respaldos CSV de la app solo miran
-- `public`, asi que esta tabla no les estorba.
CREATE SCHEMA entorno;
CREATE TABLE entorno.carga AS
SELECT 'localhost (desarrollo), no es produccion'::text AS base,
       's3://appddata-logs/Dump/' || :'fecha_respaldo' || '/refautomex/schemadata/refautomex.dump' AS respaldo,
       now() AS cargada,
       (SELECT count(*) FROM venta) AS ventas,
       (SELECT min(fecha_venta) FROM venta) AS ventas_desde,
       (SELECT count(*) FROM usuario WHERE empleado = 1) AS empleados,
       (SELECT count(*) FROM usuario WHERE empleado <> 1) + (SELECT count(*) FROM cliente) AS clientes_anonimizados;

COMMIT;

VACUUM ANALYZE;
