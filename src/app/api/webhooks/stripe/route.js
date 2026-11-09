import { NextResponse } from 'next/server';
import buildApiUrl from '@/app/lib/refautomex-api';
import { getSecretValue } from '@/app/lib/secrets';
import getStripe from '../../orders/stripe-client';
import { marcarEnvio, registrarSesion, ventaDeSesion } from '../../orders/pedidos';

const getBaseUrl = () =>
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

const formatCurrency = (value) => Number(value || 0).toFixed(2);

const mapLineItems = (lineItems) =>
  lineItems.data.map((item) => {
    const metadata = item.price?.product?.metadata || {};
    const quantity = Number(metadata.cantidad) || item.quantity || 1;
    const unitPrice = Number(metadata.precio) || (item.amount_total || 0) / 100 / quantity;
    const subtotal = unitPrice * quantity;
    return {
      refaccion: metadata.refaccion || item.description || 'WEB',
      descripcion: metadata.descripcion || item.description || 'Producto',
      cantidad: quantity,
      aIva: formatCurrency(metadata.aIva || unitPrice / 1.16),
      precio: formatCurrency(metadata.precio || unitPrice),
      monto: formatCurrency(metadata.monto || subtotal),
      existencia: Number(metadata.existencia) || 0,
      isSeminew: metadata.isSeminew === 'S' ? 'S' : 'N',
      isEditable: metadata.isEditable === 'true',
      isPedido: metadata.isPedido === 'false' ? false : true,
    };
  });

const persistSale = async (salePayload) => {
  const endpoint = `${getBaseUrl()}${buildApiUrl('/newSale')}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(salePayload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to persist sale: ${response.status} ${text}`);
  }
  return response.json();
};

const handleCheckoutCompleted = async (paidSession) => {
  // Stripe reintenta el aviso si tarda en contestar, y el evento trae la sesion
  // como era al pagar (sin saleRecorded): sin esto la venta se duplicaba.
  if (await ventaDeSesion(paidSession.id).catch(() => null)) return;
  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.retrieve(paidSession.id);
  if (session.metadata?.saleRecorded === 'true') return;
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ['data.price.product'],
  });
  const items = mapLineItems(lineItems);
  if (!items.length) {
    throw new Error('No line items found for session.');
  }

  const metadata = session.metadata || {};
  const amountTotal = (session.amount_total || 0) / 100;
  const now = new Date();
  const fechaVenta = now.toISOString().split('T')[0];
  const entregaDate = new Date(now);
  entregaDate.setDate(now.getDate() + 3);
  const salePayload = {
    fecha_venta: fechaVenta,
    total_venta: formatCurrency(amountTotal),
    idusuario: Number(metadata.orderUserId) || 1,
    idsucursal: 1,
    tipo: metadata.orderType || 'W',
    idmetodo: Number(metadata.paymentMethodId) || 3,
    items: items.map((item) => ({
      ...item,
      aIva: formatCurrency(item.aIva),
      precio: formatCurrency(item.precio),
      monto: formatCurrency(item.monto),
    })),
    telefono: session.customer_details?.phone || '',
    email: session.customer_details?.email || metadata.contactEmail || '',
    fecha_entrega: entregaDate.toISOString().split('T')[0],
    fecha_pedido: fechaVenta,
    nombre_cliente:
      metadata.contactName || session.customer_details?.name || 'Cliente Web Stripe',
    isOrder: true,
    notas: metadata.orderNotes || 'Pedido web (Stripe)',
  };

  const result = await persistSale(salePayload);
  if (result?.folio) {
    // La venta queda ligada a su sesion (Mis pedidos y la consulta por folio
    // la encuentran sin buscar en Stripe). El folio del pago (P-...) se
    // conserva: es el que el cliente vio al pagar y lo puede seguir usando.
    await registrarSesion({ folio: result.folio, sessionId: session.id, folioPago: metadata.friendlyFolio })
      .catch((error) => console.error('No se pudo ligar la venta con su sesion de Stripe:', error.message));
    // Por surtir: es lo que hace sonar la campana del panel.
    await marcarEnvio(result.folio, 'P')
      .catch((error) => console.error('No se pudo marcar la venta por surtir:', error.message));
    await stripe.checkout.sessions.update(session.id, {
      metadata: {
        ...metadata,
        checkoutFolio: metadata.friendlyFolio || '',
        friendlyFolio: result.folio,
        saleRecorded: 'true',
      },
    });
  }
};

export async function POST(request) {
  const webhookSecret = await getSecretValue('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured when handling Stripe webhook');
    return NextResponse.json({ error: 'WEBHOOK_SECRET_NOT_CONFIGURED' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'MISSING_SIGNATURE' }, { status: 400 });
  }

  let event;
  try {
    const stripe = await getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error);
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'WEBHOOK_PROCESSING_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
