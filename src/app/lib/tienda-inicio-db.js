/**
 * Lo que el inicio muestra del catalogo de la tienda (productos en WEB): los
 * autos para "Busca por tu auto" y "Lo mas vendido". Solo servidor: lo lee page.js al armar el inicio.
 *
 * Todo sale de la base en cada visita, asi que un producto que se sube o se
 * quita de WEB aparece o desaparece solo.
 */
import { consultar } from '@/app/lib/refautomex-db';

// Modelos que se buscan en la descripcion de cada producto: [palabra, etiqueta].
// Con la palabra se arma el enlace a Productos (?q=), que busca dentro de la
// descripcion. "GOL" no esta: buscarla tambien traeria los Golf.
const MODELOS = [
    ['JETTA', 'Jetta'], ['GOLF', 'Golf'], ['POLO', 'Polo'], ['POINTER', 'Pointer'],
    ['DERBY', 'Derby'], ['LUPO', 'Lupo'], ['VENTO', 'Vento'], ['BORA', 'Bora'],
    ['PASSAT', 'Passat'], ['TIGUAN', 'Tiguan'], ['BEETLE', 'Beetle'], ['CADDY', 'Caddy'],
    ['COMBI', 'Combi'], ['SEDAN', 'Sedán'], ['CROSSFOX', 'CrossFox'], ['SAVEIRO', 'Saveiro'],
    ['AMAROK', 'Amarok'], ['TRANSPORTER', 'Transporter'], ['A3', 'Audi A3'], ['A4', 'Audi A4'],
    ['IBIZA', 'Ibiza'], ['LEON', 'León'], ['CORDOBA', 'Córdoba'], ['TSURU', 'Tsuru'],
    ['SENTRA', 'Sentra'], ['AVEO', 'Aveo'], ['CHEVY', 'Chevy'], ['FOCUS', 'Focus'], ['FIESTA', 'Fiesta'],
];
const MAX_MODELOS = 10;
const MAX_VENDIDOS = 12;

// Una venta cuenta como en las metricas de Compras (compras.js): status 'A' y
// cantidad positiva. Solo el ultimo anio: lo que se vende hoy.
const CATALOGO_CON_VENTAS = `
    WITH web AS (
        SELECT p.num_parte, p.descripcion, max(d.precio) AS precio, max(d.existencia) AS existencia,
               max(CASE WHEN p.idgrupo > 0 THEN g.grupo END) AS grupo
          FROM producto p
          JOIN detalle d USING (num_parte)
          JOIN sucursal s USING (idsucursal)
          LEFT JOIN grupo g ON g.idgrupo = p.idgrupo
         WHERE p.status = 'A' AND s.sucursal = 'WEB' AND d.precio > 0
         GROUP BY p.num_parte, p.descripcion
    ), vendidos AS (
        SELECT c.num_parte, sum(c.cantidad) AS piezas
          FROM concepto c
          JOIN venta v ON v."idVenta" = c.idventa
         WHERE v.status = 'A' AND c.cantidad > 0 AND v.fecha_venta > current_date - 365
         GROUP BY c.num_parte
    )
    SELECT w.num_parte, w.descripcion, w.precio, w.existencia, w.grupo,
           COALESCE(v.piezas, 0) AS piezas,
           COALESCE((SELECT json_agg(i.ruta ORDER BY i."idImagen") FROM imagenes i WHERE i.num_parte = w.num_parte), '[]'::json) AS rutas
      FROM web w
      LEFT JOIN vendidos v USING (num_parte)`;

const palabras = (texto) => new Set(String(texto || '').toUpperCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').split(/[^A-Z0-9]+/).filter(Boolean));

/**
 * { modelos: [{ busqueda, etiqueta, cuantos }], masVendidos: [producto] }. `masVendidos` lleva la forma del catalogo de la
 * tienda (getProducts), para agregarse al carrito igual.
 */
export const leerInicioTienda = async () => {
    const filas = await consultar(CATALOGO_CON_VENTAS);

    const porModelo = new Map();
    filas.forEach((fila) => {
        const enDescripcion = palabras(fila.descripcion);
        MODELOS.forEach(([busqueda]) => {
            if (enDescripcion.has(busqueda)) porModelo.set(busqueda, (porModelo.get(busqueda) || 0) + 1);
        });
    });

    const modelos = MODELOS
        .filter(([busqueda]) => porModelo.has(busqueda))
        .map(([busqueda, etiqueta]) => ({ busqueda, etiqueta, cuantos: porModelo.get(busqueda) }))
        .sort((a, b) => b.cuantos - a.cuantos || a.etiqueta.localeCompare(b.etiqueta))
        .slice(0, MAX_MODELOS);

    // Lo mas vendido; si aun no hay ventas suficientes se completa con el resto
    // del catalogo, para que la fila no quede corta.
    const masVendidos = [...filas]
        .sort((a, b) => Number(b.piezas) - Number(a.piezas) || String(a.descripcion).localeCompare(String(b.descripcion)))
        .slice(0, MAX_VENDIDOS)
        .map(({ num_parte, descripcion, precio, existencia, grupo, rutas }) => ({
            num_parte,
            descripcion,
            precio: Number(precio),
            existencia: Number(existencia) || 0,
            grupo: grupo || null,
            rutas: Array.isArray(rutas) ? rutas : [],
        }));

    return { modelos, masVendidos };
};
