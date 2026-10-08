/**
 * Ubicaciones de los detalles de producto.
 *
 * `localizacion` es un catalogo de cadenas SIN sucursal, y una misma fila la
 * comparten varios detalles: newProductDetail reutiliza la fila si la cadena
 * ya existe (igual que InsertDetailsOfProduct en MySQL), y la sucursal WEB
 * guarda todos sus productos en '0'.
 *
 * Por eso una ubicacion NUNCA se renombra con `UPDATE localizacion`. Renombrar
 * la fila movia a la vez a todos los detalles que la compartian, de cualquier
 * sucursal: corregir un producto de mostrador que estaba en '0' mandaba a todo
 * el catalogo WEB a esa misma ubicacion. Mover un producto es cambiar a que
 * fila apunta su detalle.
 *
 * Las filas que se quedan sin detalles no se borran: no estorban, porque todas
 * las validaciones comparan por cadena y por sucursal a traves de `detalle`.
 */

// Forma que escribe Asignacion de productos: un contenedor, guion e indice sin
// cero a la izquierda (1-99). El contenedor es una matriz de anaquel (01A05-3) o
// un nivel especial que no tiene anaquel ni seccion (ENC, EXT, OBS, INT: ENC-3).
// Es mas estricta que la de edit-register, que tambien deja pasar '01A0512' o
// '01A05--'. El cliente la repite en stock/locations.js para decidir que esta
// "por ubicar".
export const UBICACION_VALIDA = /^(?:[0-9]{2}[A-Z][0-9A-Z]{2}|ENC|EXT|OBS|INT)-[1-9][0-9]?$/;

// "Por ubicar": la misma marca que ya usan la sucursal WEB y los registros
// viejos sin ubicacion. La comparten muchos productos a proposito.
export const POR_UBICAR = '0';

// Serializa los cambios de ubicacion de una sucursal hasta que termina la
// transaccion. Sin esto, dos personas asignando a la vez pasan las dos la
// revision de "esta libre" y quedan en el mismo lugar.
export const bloquearUbicaciones = (tx, idsucursal) =>
  tx.consultar('SELECT pg_advisory_xact_lock(hashtext(?))', [`ubicaciones:${idsucursal}`]);

// Id de la fila con ese texto; la crea si no existe.
export const idDeLocalizacion = async (tx, texto) => {
  const filas = await tx.consultar(
    'SELECT idlocalizacion FROM localizacion WHERE localizacion = ? ORDER BY idlocalizacion LIMIT 1',
    [texto]
  );
  if (filas.length > 0) return filas[0].idlocalizacion;

  const nuevas = await tx.consultar(
    'INSERT INTO localizacion (localizacion) VALUES (?) RETURNING idlocalizacion',
    [texto]
  );
  return nuevas[0].idlocalizacion;
};

// Apunta el detalle (num_parte, idsucursal) a `localizacion`.
//
// No escribe nada si el producto no tiene detalle en esa sucursal o si ya esta
// en esa ubicacion, y asi no deja en el catalogo cadenas que nadie usa (la
// tabla del almacen manda '—' para los productos sin detalle). Sin texto
// tampoco toca la ubicacion: antes un null tronaba por NOT NULL y una cadena
// vacia renombraba la fila compartida a ''.
export const reubicarDetalle = async (tx, { num_parte, idsucursal, localizacion }) => {
  const texto = localizacion === null || localizacion === undefined ? '' : String(localizacion);
  if (texto.trim() === '') return;

  const actuales = await tx.consultar(
    `SELECT l.localizacion
       FROM detalle d
       LEFT JOIN localizacion l USING (idlocalizacion)
      WHERE d.num_parte = ? AND d.idsucursal = ?`,
    [num_parte, idsucursal]
  );
  if (actuales.length === 0) return;
  if (actuales.every((fila) => fila.localizacion === texto)) return;

  const id = await idDeLocalizacion(tx, texto);
  await tx.escribir(
    'UPDATE detalle SET idlocalizacion = ? WHERE num_parte = ? AND idsucursal = ?',
    [id, num_parte, idsucursal]
  );
};
