import { NextResponse } from 'next/server';
import { consultar } from '@/app/lib/refautomex-db';
import { exigirCuenta } from '@/app/lib/sesion-auth';
import { ofertasVigentesDe } from '@/app/lib/promociones-db';
import getStripe from '../orders/stripe-client';

const generateFriendlyFolio = () => {
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `P-${year}${month}${day}-${random}`;
};

const IVA = 1.16;
const MAX_QUANTITY = 99;

// Del carrito solo se toma que producto y cuantos. El precio y la descripcion
// salen de la base: antes venian del navegador, bastaba cambiarlos para pagar
// menos, y el webhook registraba la venta con esos mismos datos.
const requestedQuantities = (lineItems = []) => {
  const quantities = new Map();
  for (const item of Array.isArray(lineItems) ? lineItems : []) {
    const part = String(item?.num_parte ?? item?.refaccion ?? item?.metadata?.refaccion ?? '').trim();
    const quantity = Math.trunc(Number(item?.quantity ?? item?.cantidad));
    if (!part || !Number.isFinite(quantity) || quantity < 1) continue;
    quantities.set(part, Math.min((quantities.get(part) || 0) + quantity, MAX_QUANTITY));
  }
  return quantities;
};

// El precio de WEB de cada producto activo: el mismo que muestra la tienda
// (getProducts). Si hubiera dos renglones de WEB se cobra el mayor.
const webCatalog = async (parts) => {
  const rows = await consultar(
    `SELECT p.num_parte, max(p.descripcion) AS descripcion, max(d.precio) AS precio,
            max(d.existencia) AS existencia
       FROM producto p
       JOIN detalle d USING (num_parte)
       JOIN sucursal s USING (idsucursal)
      WHERE p.status = 'A' AND s.sucursal = 'WEB' AND p.num_parte = ANY(?::text[])
      GROUP BY p.num_parte`,
    [parts]
  );
  return new Map(rows.map((row) => [row.num_parte, row]));
};

// `oferta` es la de Promociones vigente en este momento (ofertasVigentesDe):
// se cobra ese precio y en Stripe el producto dice que va en oferta.
const toLineItem = (part, quantity, product, oferta) => {
  const regular = Math.round(Number(product.precio) * 100) / 100;
  const precio = oferta && oferta.precio < regular ? oferta.precio : regular;
  const descripcion = product.descripcion || part;
  return {
    price_data: {
      currency: 'mxn',
      product_data: {
        name: precio < regular ? `${descripcion} · Oferta` : descripcion,
        // El webhook registra la venta con esto (webhooks/stripe).
        metadata: {
          refaccion: part,
          descripcion,
          cantidad: String(quantity),
          aIva: (precio / IVA).toFixed(2),
          precio: precio.toFixed(2),
          monto: (precio * quantity).toFixed(2),
          existencia: String(product.existencia ?? 0),
          isSeminew: 'N',
          isEditable: 'false',
          isPedido: 'true',
          ...(precio < regular ? { promocion: String(oferta.idpromocion), precioRegular: regular.toFixed(2) } : {}),
        },
      },
      unit_amount: Math.round(precio * 100),
    },
    quantity,
  };
};

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const origin =
    request.headers.get('origin') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'http://localhost:3000';

  const quantities = requestedQuantities(payload?.lineItems);
  if (!quantities.size) {
    return NextResponse.json({ error: 'EMPTY_CART' }, { status: 400 });
  }

  let catalog;
  try {
    catalog = await webCatalog([...quantities.keys()]);
  } catch (error) {
    console.error('Error reading web prices:', error);
    return NextResponse.json({ error: 'PRICES_UNAVAILABLE', message: 'No se pudieron consultar los precios. Intenta de nuevo.' }, { status: 503 });
  }

  // Lo que ya no esta en la tienda (dado de baja, quitado de WEB o sin precio)
  // no se cobra: el cliente lo quita del carrito y vuelve a intentar.
  const unavailable = [...quantities.keys()].filter((part) => !(Number(catalog.get(part)?.precio) > 0));
  if (unavailable.length) {
    return NextResponse.json(
      {
        error: 'PRODUCT_UNAVAILABLE',
        parts: unavailable,
        message: `Ya no están disponibles en la tienda: ${unavailable.join(', ')}. Quítalos del carrito para continuar.`,
      },
      { status: 409 }
    );
  }

  // Si no se pueden leer las ofertas no se cobra a precio normal a quien vio
  // el de oferta: se pide intentar de nuevo, como cuando fallan los precios.
  let ofertas;
  try {
    ofertas = await ofertasVigentesDe([...quantities.keys()]);
  } catch (error) {
    console.error('Error reading active promotions:', error);
    return NextResponse.json({ error: 'PRICES_UNAVAILABLE', message: 'No se pudieron consultar los precios. Intenta de nuevo.' }, { status: 503 });
  }

  const lineItems = [...quantities].map(([part, quantity]) => toLineItem(part, quantity, catalog.get(part), ofertas.get(part)));

  const friendlyFolio = generateFriendlyFolio();
  const contact = payload?.contact || {};
  const orderContext = payload?.orderContext || {};

  // De quien es el pedido (Mis pedidos lo busca por idusuario) sale del token
  // verificado, no del navegador. Sin sesion, o con una vencida, se compra
  // como invitado y el pedido se consulta con su folio.
  const acceso = request.headers.get('authorization') ? await exigirCuenta(request) : {};
  const cliente = acceso.usuario || null;

  try {
    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      phone_number_collection: { enabled: true },
      billing_address_collection: 'required',
      shipping_address_collection: { allowed_countries: ['MX'] },
      success_url: `${origin}/section/shopping?lang=es&status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/section/shopping?lang=es&status=cancelled`,
      metadata: {
        friendlyFolio,
        fulfillmentStatus: 'en_proceso',
        fulfillmentCompleted: 'false',
        fulfillmentReturn: 'none',
        fulfillmentNote: '',
        contactAddress: contact.address || '',
        contactName: cliente?.nombre || contact.name || '',
        contactEmail: cliente?.email || contact.email || '',
        orderUserId: cliente ? String(cliente.idusuario) : '',
        orderType: orderContext.orderType || 'W',
        paymentMethodId: orderContext.paymentMethodId
          ? String(orderContext.paymentMethodId)
          : '3',
        orderNotes: orderContext.notes || '',
      },
      customer_email: cliente?.email || contact.email || undefined,
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      sessionId: session.id,
      friendlyFolio,
      url: session.url,
    });
  } catch (error) {
    console.error('Error creating Stripe session:', error);
    return NextResponse.json(
      { error: 'STRIPE_ERROR', message: error.message },
      { status: 500 }
    );
  }
}
