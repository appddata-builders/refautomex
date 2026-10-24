/**
 * Resolucion de las fotos de producto contra el bucket de S3.
 *
 * POR QUE EXISTE ESTE MODULO
 * Las imagenes viven en S3 bajo `refautomex/productos/<num_parte>/<archivo>` y
 * la base solo guarda esa llave relativa en `imagenes.ruta`. La URL publica se
 * arma pegando NEXT_PUBLIC_S3 delante. Hasta aqui, nada nuevo.
 *
 * Lo que cambio con la migracion a Postgres es la FORMA en que /getProducts
 * entrega esas llaves:
 *
 *   MySQL    JSON_ARRAYAGG(ruta)  ->  '["productos/a.jpg"]'   (string)
 *   Postgres json_agg(ruta)       ->   ["productos/a.jpg"]    (array ya parseado)
 *
 * El frontend hacia `JSON.parse(p.rutas)`. Con un array, JSON.parse recibe
 * "productos/a.jpg" (el toString del array), truena, y el catch devolvia [].
 * Resultado: TODOS los productos caian al placeholder no-img.png aunque su
 * foto estuviera en S3. De ahi que la seccion se viera sin imagenes.
 *
 * `parseProductRoutes` acepta las dos formas -- la de Postgres y la de MySQL --
 * porque los carritos guardados en localStorage traen la vieja.
 */

const S3_BASE = process.env.NEXT_PUBLIC_S3 || '';

export const PRODUCT_FALLBACK_IMAGE = `${S3_BASE}productos/no-img.png`;

/**
 * Normaliza `rutas` a un array de llaves de S3.
 *
 * json_agg sobre un LEFT JOIN sin filas devuelve [null], no []: el filtro de
 * vacios no es cosmetico, sin el un producto sin fotos entrega una "ruta" nula
 * que termina como `${base}undefined`.
 */
export const parseProductRoutes = (raw) => {
  const limpiar = (lista) =>
    lista
      .filter((r) => r !== null && r !== undefined && String(r).trim() !== '')
      .map((r) => String(r));

  if (Array.isArray(raw)) return limpiar(raw);

  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? limpiar(parsed) : limpiar([parsed]);
    } catch {
      // Una sola ruta guardada en plano, sin envoltura JSON.
      return limpiar([raw]);
    }
  }

  return [];
};

/** Llave de S3 -> URL absoluta. Una ruta que ya es http se respeta tal cual. */
export const resolveProductImage = (ruta) => {
  if (!ruta) return PRODUCT_FALLBACK_IMAGE;
  const valor = String(ruta);
  return valor.startsWith('http') ? valor : `${S3_BASE}${valor}`;
};

/** Todas las URLs de un producto; al menos el placeholder. */
export const resolveProductImages = (raw) => {
  const urls = parseProductRoutes(raw).map(resolveProductImage);
  return urls.length ? urls : [PRODUCT_FALLBACK_IMAGE];
};

/**
 * Primera foto de un producto, venga como venga.
 *
 * Un item del carrito guardado antes de este arreglo trae `rutasParsed: []`
 * (el parse roto) junto al `rutas` bueno, asi que se revisan ambos.
 */
export const resolveMainProductImage = (product) => {
  const candidatos = [
    product?.image,
    product?.mainImage,
    parseProductRoutes(product?.rutasParsed)[0],
    parseProductRoutes(product?.rutas)[0],
    product?.ruta,
  ];
  const ruta = candidatos.find((c) => c !== null && c !== undefined && String(c).trim() !== '');
  return resolveProductImage(ruta);
};
