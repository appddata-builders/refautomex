import { NextResponse } from 'next/server';
import { exigirEmpleado } from '@/app/lib/sesion-auth';
import getStripe from '../stripe-client';
import { marcarEnvio } from '../pedidos';

// Solo el personal: la lista trae correo, telefono y domicilio de cada cliente,
// y antes cualquiera podia leerla o mover el estado de un pedido.
const sinAcceso = (acceso) => NextResponse.json({ error: acceso.mensaje }, { status: acceso.estado });

const DEFAULT_STATUS = 'en_proceso';

export async function POST(request) {
  const acceso = await exigirEmpleado(request);
  if (!acceso.usuario) return sinAcceso(acceso);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const { sessionId, status, complete, reset } = body || {};
  if (!sessionId) {
    return NextResponse.json({ error: 'MISSING_SESSION' }, { status: 400 });
  }

  let metadata = null;
  if (reset) {
    metadata = {
      fulfillmentStatus: DEFAULT_STATUS,
      fulfillmentCompleted: 'false',
      fulfillmentReturn: 'none',
      fulfillmentNote: '',
    };
  } else if (complete) {
    metadata = {
      fulfillmentStatus: 'en_camino',
      fulfillmentCompleted: 'true',
    };
  } else if (status) {
    metadata = {
      fulfillmentStatus: status,
      fulfillmentCompleted: 'false',
    };
  }

  if (!metadata) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  try {
    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.update(sessionId, { metadata });
    // Finalizado sale de "por surtir" en la campana; reactivarlo lo regresa.
    await marcarEnvio(session.metadata?.friendlyFolio, complete && !reset ? 'F' : 'P')
      .catch((error) => console.error('No se pudo actualizar tracking_web:', error.message));
    return NextResponse.json({
      fulfillmentStatus: session.metadata?.fulfillmentStatus || DEFAULT_STATUS,
      fulfillmentNote: session.metadata?.fulfillmentNote || null,
      fulfillmentCompleted: session.metadata?.fulfillmentCompleted === 'true',
    });
  } catch (error) {
    console.error('Error updating session status:', error);
    return NextResponse.json(
      { error: 'STATUS_UPDATE_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
