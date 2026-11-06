import { NextResponse } from 'next/server';
import { exigirEmpleado } from '@/app/lib/sesion-auth';
import getStripe from '../stripe-client';

// Solo el personal: la lista trae correo, telefono y domicilio de cada cliente,
// y antes cualquiera podia leerla o mover el estado de un pedido.
const sinAcceso = (acceso) => NextResponse.json({ error: acceso.mensaje }, { status: acceso.estado });

const normalizeReturn = (value) => (value === 'devolucion' ? 'devolucion' : null);

export async function POST(request) {
  const acceso = await exigirEmpleado(request);
  if (!acceso.usuario) return sinAcceso(acceso);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const { sessionId, note, returnStatus } = body || {};
  if (!sessionId) {
    return NextResponse.json({ error: 'MISSING_SESSION' }, { status: 400 });
  }

  const metadata = {};
  if (note !== undefined) metadata.fulfillmentNote = note || '';
  if (returnStatus !== undefined) {
    metadata.fulfillmentReturn = returnStatus === 'devolucion' ? 'devolucion' : 'none';
  }

  if (!Object.keys(metadata).length) {
    return NextResponse.json({ error: 'NO_CHANGES' }, { status: 400 });
  }

  try {
    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.update(sessionId, { metadata });
    return NextResponse.json({
      note: session.metadata?.fulfillmentNote || null,
      returnStatus: normalizeReturn(session.metadata?.fulfillmentReturn),
    });
  } catch (error) {
    console.error('Error updating logistics metadata:', error);
    return NextResponse.json(
      { error: 'LOGISTICS_UPDATE_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
