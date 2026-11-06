import { NextResponse } from 'next/server';
import { etapaDelPedido, ventaDeSesion } from '../pedidos';
import { fetchOrderSummary } from '../utils';

// La pagina del carrito al volver de Stripe: el folio y lo que se pago. El
// id de sesion solo lo tiene quien pago (viene en la URL de regreso). Mientras
// el webhook no registra la venta, `recorded` es false y el folio es el del
// pago (P-...); despues es el de la venta (W-...).
export async function GET(request) {
  const sessionId = request.nextUrl.searchParams.get('session_id');
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return NextResponse.json({ error: 'MISSING_SESSION' }, { status: 400 });
  }
  try {
    const summary = await fetchOrderSummary(sessionId);
    const ventaFolio = await ventaDeSesion(sessionId).catch(() => null);
    return NextResponse.json({
      friendlyFolio: ventaFolio || summary.friendlyFolio,
      recorded: Boolean(ventaFolio),
      paymentStatus: summary.status,
      amount: summary.amount,
      items: summary.lineItems.map(({ description, quantity, total }) => ({ description, quantity, total })),
      ...etapaDelPedido(summary, null),
    });
  } catch (error) {
    console.error('Error fetching session folio:', error);
    return NextResponse.json({ error: 'FOLIO_LOOKUP_FAILED' }, { status: 500 });
  }
}
