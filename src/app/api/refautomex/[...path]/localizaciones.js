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

// Forma que escribe Asignacion de productos: anaquel, nivel y seccion (01A05),
// o anaquel y un nivel especial sin seccion (01ENC), guion e indice. El indice
// empieza en 0 y no lleva cero a la izquierda (0-99: 01A05-0, 01A05-12). Es mas
// estricta que la de edit-register, que tambien deja pasar '01A0512' o
// '01A05--'. El cliente la repite en stock/locations.js para decidir que esta
// "por ubicar".
//
// La seccion es de dos digitos: con letras, un codigo como 01USB se leia como
// nivel U y seccion SB, que es justo como se colaban los niveles especiales.
export const NIVELES_ESPECIALES = ['ENC', 'EXT', 'OBS', 'INT'];
const ESPECIAL = NIVELES_ESPECIALES.join('|');
export const UBICACION_VALIDA = new RegExp(`^[0-9]{2}(?:${ESPECIAL}|[A-Z][0-9]{2})-(?:0|[1-9][0-9]?)$`);

// Nivel de una cadena de ubicacion, aunque no sea valida ('01A0512' -> 'A'):
// para saber si un nivel del anaquel todavia tiene productos.
const NIVEL_DE = new RegExp(`^[0-9]{2}(${ESPECIAL}|[A-Z])`);
export const nivelDe = (texto) => NIVEL_DE.exec(texto || '')?.[1] ?? null;
export const NIVEL_VALIDO = new RegExp(`^(?:${ESPECIAL}|[A-Z])$`);

// Niveles de cada anaquel (Asignacion de productos). Se crea al escribir por
// primera vez y tiene que ser identica a `anaquel_niveles` en
// lib/db/schema.pg.js. La llave es de una columna ("<idsucursal>:<anaquel>")
// porque el respaldo CSV solo maneja esas.
export const TABLA_NIVELES = `CREATE TABLE IF NOT EXISTS anaquel_niveles (
  id varchar(20) PRIMARY KEY NOT NULL,
  idsucursal integer NOT NULL,
  anaquel varchar(2) NOT NULL,
  niveles varchar(200) NOT NULL
)`;

// "Por ubicar": la misma marca que ya usan la sucursal WEB y los registros
// viejos sin ubicacion. La comparten muchos productos a proposito.
export const POR_UBICAR = '0';

// Serializa los cambios de ubicacion de una sucursal hasta que termina la
// transaccion. Sin esto, dos personas asignando a la vez pasan las dos la
// revision de "esta libre" y quedan en el mismo lugar.
export const bloquearUbicaciones = (tx, idsucursal) =>
  tx.consultar('SELECT pg_advisory_xact_lock(hashtext(?))', [`ubicaciones:${idsucursal}`]);

// La copia desde MySQL (o una restauracion parecida) puede dejar detalles
// apuntando a ids que no estan en el catalogo, con la secuencia por debajo de
// ellos. Entonces cada fila nueva toma uno de esos ids y el producto perdido
// aparece en esa ubicacion: el hueco libre donde se asigno queda en conflicto.
// Antes de crear filas, la secuencia se adelanta hasta despues de cualquier id
// que ya use un detalle. Despues de la primera vez solo lee.
export const adelantarSecuencia = (tx) =>
  tx.consultar(
    `SELECT setval(s.secuencia, t.tope)
       FROM (SELECT pg_get_serial_sequence('localizacion', 'idlocalizacion')::regclass AS secuencia) s,
            (SELECT GREATEST((SELECT max(idlocalizacion) FROM detalle),
                             (SELECT max(idlocalizacion) FROM localizacion)) AS tope) t
      WHERE t.tope > COALESCE(pg_sequence_last_value(s.secuencia), 0)`
  );

// Id de la fila con ese texto; la crea si no existe.
export const idDeLocalizacion = async (tx, texto) => {
  const filas = await tx.consultar(
    'SELECT idlocalizacion FROM localizacion WHERE localizacion = ? ORDER BY idlocalizacion LIMIT 1',
    [texto]
  );
  if (filas.length > 0) return filas[0].idlocalizacion;

  await adelantarSecuencia(tx);
  const nuevas = await tx.consultar(
    'INSERT INTO localizacion (localizacion) VALUES (?) RETURNING idlocalizacion',
    [texto]
  );
  return nuevas[0].idlocalizacion;
};

const MAX_INDICE = 99;
const indiceDe = (texto) => Number(texto.slice(texto.lastIndexOf('-') + 1));

// Solo los renglones de productos activos juegan en el mapa. Los de productos
// dados de baja, o cuyo numero de parte ya no esta en el catalogo, no ocupan
// lugar: getWarehouseMap no los muestra, y al poner ahi un producto activo se
// liberan a "por ubicar" (liberarInactivos).
export const SOLO_ACTIVOS = `JOIN producto p ON p.num_parte = d.num_parte AND p.status = 'A'`;

// A donde va el renglon que desplaza un intercambio. Al lugar que deja el que
// se mueve, si ese lugar queda libre; si no (venia de "por ubicar", o de un
// conflicto donde se queda otro renglon), a la primera posicion libre del
// contenedor destino. Mandarlo siempre al lugar que se deja duplicaba el indice
// al resolver un conflicto: el desplazado caia junto al otro renglon.
// Devuelve null si el contenedor ya no tiene posicion libre (0-99).
export const lugarParaDesplazado = async (tx, { idsucursal, iddetalle, ocupante, origen, destino }) => {
  if (UBICACION_VALIDA.test(origen)) {
    const [{ otros }] = await tx.consultar(
      `SELECT count(*)::int AS otros
         FROM detalle d
         JOIN localizacion l USING (idlocalizacion)
         ${SOLO_ACTIVOS}
        WHERE d.idsucursal = ? AND l.localizacion = ? AND d.iddetalle <> ?`,
      [idsucursal, origen, iddetalle]
    );
    if (otros === 0) return origen;
  }

  const contenedor = destino.slice(0, destino.lastIndexOf('-'));
  const ocupados = new Set([indiceDe(destino)]);
  const filas = await tx.consultar(
    `SELECT l.localizacion
       FROM detalle d
       JOIN localizacion l USING (idlocalizacion)
       ${SOLO_ACTIVOS}
      WHERE d.idsucursal = ? AND l.localizacion LIKE ? AND d.iddetalle NOT IN (?, ?)`,
    [idsucursal, `${contenedor}-%`, iddetalle, ocupante]
  );
  for (const { localizacion } of filas) {
    if (UBICACION_VALIDA.test(localizacion)) ocupados.add(indiceDe(localizacion));
  }
  for (let indice = 0; indice <= MAX_INDICE; indice += 1) {
    if (!ocupados.has(indice)) return `${contenedor}-${indice}`;
  }
  return null;
};

// Apunta un solo renglon de inventario a `texto`. Asignacion de productos mueve
// por `iddetalle` y no por num_parte: si un producto quedo dos veces en la
// misma sucursal (dos detalles), mover uno no debe arrastrar al otro.
export const reubicarPorId = async (tx, iddetalle, texto) => {
  const id = await idDeLocalizacion(tx, texto);
  await tx.escribir('UPDATE detalle SET idlocalizacion = ? WHERE iddetalle = ?', [id, iddetalle]);
};

// Manda a "por ubicar" los renglones que no son de productos activos y estan en
// `patron` (una ubicacion exacta, o un prefijo con %: '01A05%'), para que un
// producto activo pueda ocupar ese lugar. Devuelve cuantos libero.
export const liberarInactivos = async (tx, idsucursal, patron) => {
  const filas = await tx.consultar(
    `SELECT d.iddetalle
       FROM detalle d
       JOIN localizacion l USING (idlocalizacion)
       LEFT JOIN producto p ON p.num_parte = d.num_parte
      WHERE d.idsucursal = ? AND l.localizacion LIKE ? AND COALESCE(p.status, '') <> 'A'`,
    [idsucursal, patron]
  );
  for (const { iddetalle } of filas) await reubicarPorId(tx, iddetalle, POR_UBICAR);
  return filas.length;
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
