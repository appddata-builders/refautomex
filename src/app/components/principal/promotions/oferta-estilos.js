/**
 * Los colores de las promociones en la tienda, tomados de los componentes que
 * ya tiene el sitio: salen de las variables del tema (--color-galaxy es dorado
 * en claro y azul en oscuro), asi que cambian solos con el modo y no hace falta
 * `dark:`. Juntos aqui para no repetir las clases en cada componente.
 *
 * "Hasta 15 % de descuento" no los usa: va ambar en los dos modos.
 */
export const OFERTA = {
    // Los botones "Agregar" / "Ver la promocion": el mismo de "Productos" y
    // "Enterate" del inicio (improve.jsx, beginning.jsx).
    boton: 'bg-gradient-to-bl hover:bg-gradient-to-tr from-[rgb(var(--color-galaxy))] to-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))]',
    // La banda OFERTA y la etiqueta junto al precio: el acento del tema.
    banda: 'bg-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))]',
    // El precio con descuento: el verde de los precios del catalogo.
    precio: 'text-[rgb(var(--color-success))]',
    // El "-15 %" sobre la foto: como las insignias de iconos del sitio.
    etiqueta: 'bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))]',
    // Los numeros del conteo y los iconos: el acento del tema.
    acento: 'text-[rgb(var(--color-galaxy))]',
    // El contorno de la tarjeta en oferta del catalogo (como el menu activo).
    contorno: 'ring-[rgb(var(--color-galaxy))]',
};
