/**
 * Precios de WEB con la comision de Stripe (Inventarios -> Precios WEB).
 *
 * Una venta del sitio le paga a Stripe 3.6 % + $3 + IVA (lib/stripe-fees); una
 * de mostrador no. Con el mismo precio en los dos, la web deja menos. Esto sube
 * el precio de WEB de los productos elegidos al que, quitando la comision,
 * deja lo mismo que la sucursal fisica mas cara (webPriceCheck).
 *
 * El navegador solo dice que productos: el precio sale de la base y de la misma
 * funcion que pinta la pantalla, asi que no se puede mandar uno inventado. Solo
 * sube; lo que ya cubre la comision no se toca. A diferencia del resto de
 * /api/refautomex pide sesion: cambia precios de muchos productos de una vez.
 */
import { enTransaccion } from '@/app/lib/refautomex-db';
import { leerPermisos } from '@/app/lib/permisos-menu-db';
import { perfilDeCategoria, puedeEditar } from '@/app/lib/permisos-menu';
import { exigirEmpleado } from '@/app/lib/sesion-auth';
import { webPriceCheck } from '@/app/lib/stripe-fees';

const IVA = 1.16;
const MAX_PARTES = 2000;

// La misma regla que isWebBranch (inventory-model): idsucursal 1 o "WEB".
const ES_WEB = `(s.idsucursal = 1 OR upper(trim(s.sucursal)) = 'WEB')`;

const error = (estado, mensaje) => ({ estado, cuerpo: { error: mensaje, details: mensaje } });

const redondear = (valor, decimales) => Math.round(valor * 10 ** decimales) / 10 ** decimales;

const patchWebPrices = async ({ request, body }) => {
  const acceso = await exigirEmpleado(request);
  if (!acceso.usuario) return error(acceso.estado, acceso.mensaje);
  const permisos = await leerPermisos();
  if (!puedeEditar(permisos, 'inventories', perfilDeCategoria(acceso.usuario.categoria))) {
    return error(403, 'Tu perfil no puede cambiar precios en Inventarios.');
  }

  const partes = [...new Set((Array.isArray(body?.partes) ? body.partes : [])
    .map((parte) => String(parte ?? '').trim())
    .filter(Boolean))];
  if (!partes.length) return error(400, 'Indica que productos ajustar.');
  if (partes.length > MAX_PARTES) return error(400, `Son mas de ${MAX_PARTES} productos; ajustalos por partes.`);

  return {
    cuerpo: await enTransaccion(async (tx) => {
      // FOR UPDATE: si alguien guarda el mismo detalle a la vez, se espera y se
      // calcula sobre el precio que quedo, no sobre uno viejo.
      const filas = await tx.consultar(
        `SELECT d.iddetalle, d.num_parte, s.sucursal, d.precio, d.costo, d.utilidad, ${ES_WEB} AS web
           FROM detalle d
           JOIN sucursal s USING (idsucursal)
           JOIN producto p USING (num_parte)
          WHERE p.status = 'A' AND d.num_parte = ANY(?::text[])
          FOR UPDATE OF d`,
        [partes]
      );

      const porParte = new Map();
      filas.forEach((fila) => {
        if (!porParte.has(fila.num_parte)) porParte.set(fila.num_parte, []);
        porParte.get(fila.num_parte).push(fila);
      });

      const actualizados = [];
      const sinCambio = [];
      const omitidos = [];

      for (const parte of partes) {
        const detalles = porParte.get(parte) || [];
        const web = detalles.find((detalle) => detalle.web);
        if (!web) {
          omitidos.push({ num_parte: parte, motivo: 'notInWeb' });
          continue;
        }
        const revision = webPriceCheck({
          webPrice: web.precio,
          references: detalles.filter((detalle) => !detalle.web).map((detalle) => ({ branch: detalle.sucursal, price: detalle.precio })),
          cost: web.costo,
        });
        if (revision.suggested === null) {
          omitidos.push({ num_parte: parte, motivo: 'noReference' });
          continue;
        }
        if (revision.covered) {
          sinCambio.push(parte);
          continue;
        }

        // El costo se queda; suben el precio sin IVA y la utilidad, como hace
        // el detalle del almacen al usar el precio sugerido.
        const precio = revision.suggested;
        const aiva = redondear(precio / IVA, 2);
        const costo = Number(web.costo);
        const utilidad = costo > 0 ? redondear(aiva / costo, 4) : web.utilidad;
        await tx.escribir(
          'UPDATE detalle SET precio = ?, aiva = ?, utilidad = ? WHERE iddetalle = ?',
          [precio, aiva, utilidad, web.iddetalle]
        );
        actualizados.push({ num_parte: parte, antes: revision.current, despues: precio });
      }

      return { actualizados, sinCambio, omitidos };
    }),
  };
};

export const PRECIOS_WEB = {
  PATCH: { patchWebPrices },
};
