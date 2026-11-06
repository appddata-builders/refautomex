/**
 * Los pedidos del sitio vistos por el cliente: "Mis pedidos" (con sesion) y la
 * consulta por folio (sin sesion).
 *
 * Un pedido vive en dos lados. La venta (folio W-...) y sus conceptos estan en
 * la base: los escribe el webhook de Stripe al confirmarse el pago. El avance
 * (en proceso, confirmado, finalizado, devolucion) esta en la metadata de la
 * sesion de Stripe: lo mueve el panel en Pedidos > Web (Stripe).
 *
 * Para ir de una a otra, `venta_stripe` guarda la sesion de cada venta. Antes
 * se buscaba con stripe.checkout.sessions.search, que no existe (Stripe no
 * deja buscar sesiones), y el respaldo solo revisaba las ultimas 100: los
 * pedidos mas viejos salian como "no encontrado".
 */
import { consultar } from '@/app/lib/refautomex-db';
import getStripe from './stripe-client';
import { formatOrderFromSession } from './utils';

// Tiene que ser identica a `venta_stripe` en lib/db/schema.pg.js. Se crea la
// primera vez que se necesita, como las columnas de compras.js.
const TABLA_SESIONES = `CREATE TABLE IF NOT EXISTS venta_stripe (
  idventa integer PRIMARY KEY NOT NULL,
  session_id varchar(255) NOT NULL UNIQUE,
  folio_pago varchar(30),
  CONSTRAINT venta_stripe_idventa_venta_idVenta_fk FOREIGN KEY (idventa)
    REFERENCES venta ("idVenta") ON DELETE CASCADE
)`;

let tablaLista = null;
const conTabla = () => {
  tablaLista ??= consultar(TABLA_SESIONES).catch((error) => {
    tablaLista = null;
    throw error;
  });
  return tablaLista;
};

// Los pedidos sin sesion registrada (de antes de esta tabla) se buscan entre
// las sesiones recientes solo si son de estos ultimos dias: las ventas web de
// 2024 vienen del sistema anterior y no tienen sesion en esta cuenta.
const DIAS_PARA_BUSCAR = 120;

export const registrarSesion = async ({ folio, sessionId, folioPago }) => {
  await conTabla();
  await consultar(
    `INSERT INTO venta_stripe (idventa, session_id, folio_pago)
     SELECT "idVenta", ?, ? FROM venta WHERE folio = ?
     ON CONFLICT DO NOTHING`,
    [sessionId, folioPago || null, folio]
  );
};

export const ventaDeSesion = async (sessionId) => {
  await conTabla();
  const [fila] = await consultar(
    'SELECT v.folio FROM venta_stripe vs JOIN venta v ON v."idVenta" = vs.idventa WHERE vs.session_id = ?',
    [sessionId]
  );
  return fila?.folio ?? null;
};

/**
 * La etapa que ve el cliente, con los mismos pasos del panel: En proceso ->
 * Pedido confirmado -> Finalizado (el panel lo marca como completado). Una
 * devolucion o un pago pendiente salen aparte. Sin sesion (ventas viejas) se
 * usa el estado de `pedidos`: 'F' es entregado.
 */
export const etapaDelPedido = (sesion, statusPedido) => {
  if (sesion) {
    if (sesion.status !== 'paid') return { etapa: 'unpaid', paso: 0 };
    if (sesion.fulfillmentReturn === 'devolucion') return { etapa: 'returned', paso: 2 };
    if (sesion.isCompleted) return { etapa: 'done', paso: 2 };
    if (sesion.fulfillmentStatus === 'pedido_confirmado') return { etapa: 'confirmed', paso: 1 };
    if (sesion.fulfillmentStatus === 'en_camino') return { etapa: 'done', paso: 2 };
    return { etapa: 'paid', paso: 0 };
  }
  return String(statusPedido || '').toUpperCase() === 'F' ? { etapa: 'done', paso: 2 } : { etapa: 'paid', paso: 0 };
};

const leerSesion = async (stripe, sessionId) => {
  const [sesion, renglones] = await Promise.all([
    stripe.checkout.sessions.retrieve(sessionId),
    stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 }),
  ]);
  return formatOrderFromSession(sesion, renglones);
};

// Las ultimas sesiones, por si un pedido todavia no tiene la suya registrada.
const sesionesRecientes = async (stripe) => (await stripe.checkout.sessions.list({ limit: 100 })).data;

const folioDeSesion = (sesion) => String(sesion.metadata?.friendlyFolio || '').toUpperCase();

/**
 * Las compras en linea de un cliente (venta W-... de su idusuario), las mas
 * recientes primero, con sus productos y la etapa de cada una. Si Stripe no
 * responde, se devuelven igual con la etapa de la base.
 */
export const pedidosDeCliente = async (idusuario, limite = 30) => {
  await conTabla();
  const ventas = await consultar(
    `SELECT v."idVenta" AS idventa, v.folio, to_char(v.fecha_venta, 'YYYY-MM-DD') AS fecha,
            v.total_venta AS total, vs.session_id,
            (v.fecha_venta >= CURRENT_DATE - ?::int) AS reciente,
            (SELECT max(pe.status) FROM pedidos pe WHERE pe.idventa = v."idVenta") AS status_pedido,
            (SELECT to_char(max(pe.f_entrega), 'YYYY-MM-DD') FROM pedidos pe WHERE pe.idventa = v."idVenta") AS entrega
       FROM venta v
       LEFT JOIN venta_stripe vs ON vs.idventa = v."idVenta"
      WHERE v.idusuario = ? AND v.folio LIKE 'W%'
      ORDER BY v.fecha_venta DESC, v."idVenta" DESC
      LIMIT ?`,
    [DIAS_PARA_BUSCAR, idusuario, limite]
  );
  if (!ventas.length) return [];

  const renglones = await consultar(
    `SELECT c.idventa, c.num_parte, c.cantidad, c.precio_venta AS precio, c.monto_venta AS importe,
            COALESCE(p.descripcion, c.concepto_comodin, c.num_parte) AS descripcion,
            (SELECT i.ruta FROM imagenes i WHERE i.num_parte = c.num_parte ORDER BY i."idImagen" LIMIT 1) AS ruta
       FROM concepto c
       LEFT JOIN producto p USING (num_parte)
      WHERE c.idventa = ANY(?::int[])
      ORDER BY c.idconcepto`,
    [ventas.map((venta) => venta.idventa)]
  );
  const porVenta = new Map();
  for (const renglon of renglones) {
    if (!porVenta.has(renglon.idventa)) porVenta.set(renglon.idventa, []);
    porVenta.get(renglon.idventa).push({
      num_parte: renglon.num_parte,
      descripcion: renglon.descripcion,
      cantidad: Number(renglon.cantidad) || 0,
      precio: Number(renglon.precio) || 0,
      importe: Number(renglon.importe) || 0,
      ruta: renglon.ruta || null,
    });
  }

  const sesiones = new Map();
  try {
    const stripe = await getStripe();
    // Pedidos recientes sin sesion registrada: se buscan una vez entre las
    // ultimas sesiones y se registran, asi la siguiente vez ya no se busca.
    const sinSesion = ventas.filter((venta) => !venta.session_id && venta.reciente);
    if (sinSesion.length) {
      const recientes = await sesionesRecientes(stripe);
      for (const venta of sinSesion) {
        const hallada = recientes.find((sesion) => folioDeSesion(sesion) === venta.folio.toUpperCase());
        if (!hallada) continue;
        venta.session_id = hallada.id;
        await registrarSesion({ folio: venta.folio, sessionId: hallada.id, folioPago: hallada.metadata?.checkoutFolio });
      }
    }
    const conSesion = ventas.filter((venta) => venta.session_id);
    const leidas = await Promise.all(
      conSesion.map((venta) => leerSesion(stripe, venta.session_id).catch(() => null))
    );
    conSesion.forEach((venta, i) => {
      if (leidas[i]) sesiones.set(venta.idventa, leidas[i]);
    });
  } catch (error) {
    console.error('No se pudo leer el avance de los pedidos en Stripe:', error.message);
  }

  return ventas.map((venta) => {
    const sesion = sesiones.get(venta.idventa) || null;
    return {
      folio: venta.folio,
      fecha: venta.fecha,
      total: Number(venta.total) || 0,
      entrega: venta.entrega || null,
      // Una venta vieja sin sesion ni renglon en `pedidos` (sistema anterior)
      // ya se surtio hace mucho: no se muestra como recien pagada.
      ...etapaDelPedido(sesion, venta.status_pedido ?? (venta.reciente ? null : 'F')),
      nota: sesion?.fulfillmentNote || null,
      articulos: porVenta.get(venta.idventa) || [],
    };
  });
};

// j***@gmail.com: alcanza para que el cliente reconozca su pedido sin dar el
// correo de nadie a quien adivine un folio.
const ocultarCorreo = (correo) => {
  const [usuario, dominio] = String(correo || '').split('@');
  if (!usuario || !dominio) return null;
  return `${usuario[0]}***@${dominio}`;
};

/**
 * Consulta publica por folio: el de la venta (W-...) o el que se mostro al
 * pagar (P-...). Sin telefono, domicilio ni correo completo: el folio no es
 * una contrasena.
 */
export const pedidoPorFolio = async (folio) => {
  const buscado = String(folio || '').trim().toUpperCase();
  if (!buscado) return null;
  await conTabla();

  const stripe = await getStripe();
  const [fila] = await consultar(
    `SELECT vs.session_id FROM venta_stripe vs JOIN venta v ON v."idVenta" = vs.idventa
      WHERE upper(v.folio) = ? OR upper(vs.folio_pago) = ? LIMIT 1`,
    [buscado, buscado]
  );
  let sesionId = fila?.session_id ?? null;
  if (!sesionId) {
    const hallada = (await sesionesRecientes(stripe)).find((sesion) =>
      folioDeSesion(sesion) === buscado || String(sesion.metadata?.checkoutFolio || '').toUpperCase() === buscado);
    sesionId = hallada?.id ?? null;
  }
  if (!sesionId) return null;

  const pedido = await leerSesion(stripe, sesionId);
  return {
    friendlyFolio: pedido.friendlyFolio,
    paymentStatus: pedido.status,
    amount: pedido.amount,
    currency: pedido.currency,
    created: pedido.created,
    items: pedido.lineItems.map(({ description, quantity, total }) => ({ description, quantity, total })),
    email: ocultarCorreo(pedido.email),
    fulfillmentStatus: pedido.fulfillmentStatus,
    fulfillmentCompleted: pedido.isCompleted,
    fulfillmentReturn: pedido.fulfillmentReturn,
    fulfillmentNote: pedido.fulfillmentNote,
    ...etapaDelPedido(pedido, null),
  };
};

// `venta.tracking_web`: 'P' por surtir, 'F' surtido. Es lo que lee la campana
// (lib/avisos.js, webPorSurtir); el avance detallado sigue en Stripe. Antes
// nadie lo escribia y el aviso de ventas web nunca salia.
export const marcarEnvio = async (folio, estado) => {
  if (!/^W-/i.test(String(folio || ''))) return;
  await consultar(
    'UPDATE venta SET tracking_web = ? WHERE folio = ? AND tracking_web IS DISTINCT FROM ?',
    [estado, folio, estado]
  );
};

// Pone tracking_web de acuerdo con lo que dice Stripe para los pedidos pagados
// que ve el panel (Web (Stripe)). Corrige lo que se marco antes de que existiera
// marcarEnvio, o lo que se movio por otro lado.
export const sincronizarEnvios = async (orders = []) => {
  const pares = orders
    .filter((order) => order.status === 'paid' && /^W-/i.test(String(order.friendlyFolio || '')))
    .map((order) => [order.friendlyFolio, order.isCompleted ? 'F' : 'P']);
  if (!pares.length) return;
  await consultar(
    `UPDATE venta v SET tracking_web = x.estado
       FROM unnest(?::text[], ?::text[]) AS x(folio, estado)
      WHERE v.folio = x.folio AND v.tracking_web IS DISTINCT FROM x.estado`,
    [pares.map(([folio]) => folio), pares.map(([, estado]) => estado)]
  );
};
