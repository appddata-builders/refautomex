/**
 * Promociones de la tienda: las reglas que comparten el panel (Servicios ->
 * Promociones), la tienda y el cobro. Sin dependencias: corre en el navegador
 * y en el servidor. Lo que lee y escribe la base esta en promociones-db.js.
 *
 * Una promocion tiene foto de temporada, inicio y fin (fecha y hora) y sus
 * productos. Cada producto lleva su descuento como porcentaje o como precio
 * fijo, siempre sobre el precio de WEB: si el precio de WEB cambia durante la
 * promocion, un porcentaje sigue valiendo y un precio fijo se queda.
 */

export const TIPOS_DESCUENTO = ['porcentaje', 'precio'];
export const MAX_PORCENTAJE = 90;
export const MAX_PRODUCTOS = 200;
export const MAX_TITULO = 120;
export const MAX_DESCRIPCION = 500;
// La foto se sube a S3 en promocion/<id>/; mas de esto es una foto sin
// comprimir y tarda en cargar en el celular.
export const MAX_FOTO_MB = 8;
export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];

const centavos = (valor) => Math.round(Number(valor) * 100) / 100;

/**
 * El precio con descuento de un producto, o null si el descuento no sirve:
 * un porcentaje fuera de 1..90, o un precio fijo que no baja el de WEB.
 */
export const precioPromocion = (regular, tipo, valor) => {
    const base = Number(regular);
    const cantidad = Number(valor);
    if (!(base > 0) || !Number.isFinite(cantidad)) return null;
    if (tipo === 'porcentaje') {
        if (cantidad < 1 || cantidad > MAX_PORCENTAJE) return null;
        return centavos(base * (1 - cantidad / 100));
    }
    if (tipo === 'precio') {
        const precio = centavos(cantidad);
        return precio > 0 && precio < base ? precio : null;
    }
    return null;
};

// Cuanto se ahorra el cliente, en porcentaje entero (para la etiqueta "-15 %").
export const ahorroPorcentaje = (regular, oferta) =>
    Number(regular) > 0 ? Math.round((1 - Number(oferta) / Number(regular)) * 100) : 0;

/**
 * 'pausada' (la apago un admin), 'programada' (aun no empieza), 'vigente' o
 * 'terminada'. `ahora` en milisegundos.
 */
export const estadoPromocion = (promocion, ahora = Date.now()) => {
    if (!promocion?.activa) return 'pausada';
    const inicio = Date.parse(promocion.inicio);
    const fin = Date.parse(promocion.fin);
    if (ahora < inicio) return 'programada';
    if (ahora >= fin) return 'terminada';
    return 'vigente';
};

/** Dias, horas, minutos y segundos que faltan para `fin` (0 si ya paso). */
export const tiempoRestante = (fin, ahora = Date.now()) => {
    const total = Math.max(0, Date.parse(fin) - ahora);
    const segundos = Math.floor(total / 1000);
    return {
        total,
        dias: Math.floor(segundos / 86400),
        horas: Math.floor((segundos % 86400) / 3600),
        minutos: Math.floor((segundos % 3600) / 60),
        segundos: segundos % 60,
    };
};

/**
 * Errores de los datos de una promocion antes de guardar: { campo: clave }.
 * El servidor repite la revision; aqui es para avisar al llenar el formulario.
 */
export const validarPromocion = ({ titulo, descripcion, inicio, fin, productos }, { nueva = false, ahora = Date.now() } = {}) => {
    const errores = {};
    const limpio = String(titulo ?? '').trim();
    if (!limpio) errores.titulo = 'titleRequired';
    else if (limpio.length > MAX_TITULO) errores.titulo = 'titleTooLong';
    if (String(descripcion ?? '').length > MAX_DESCRIPCION) errores.descripcion = 'descriptionTooLong';
    const desde = Date.parse(inicio);
    const hasta = Date.parse(fin);
    if (!Number.isFinite(desde)) errores.inicio = 'startRequired';
    if (!Number.isFinite(hasta)) errores.fin = 'endRequired';
    else if (Number.isFinite(desde) && hasta <= desde) errores.fin = 'endBeforeStart';
    else if (nueva && hasta <= ahora) errores.fin = 'endInPast';
    if (!Array.isArray(productos) || productos.length === 0) errores.productos = 'productsRequired';
    else if (productos.length > MAX_PRODUCTOS) errores.productos = 'tooManyProducts';
    return errores;
};
