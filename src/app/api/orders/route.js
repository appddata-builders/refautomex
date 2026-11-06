import { NextResponse } from 'next/server';
import { exigirEmpleado } from '@/app/lib/sesion-auth';
import { listOrders } from './utils';
import { sincronizarEnvios } from './pedidos';

// Solo el personal: la lista trae correo, telefono y domicilio de cada cliente,
// y antes cualquiera podia leerla o mover el estado de un pedido.
const sinAcceso = (acceso) => NextResponse.json({ error: acceso.mensaje }, { status: acceso.estado });

export async function GET(request) {
  const acceso = await exigirEmpleado(request);
  if (!acceso.usuario) return sinAcceso(acceso);
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = Number(limitParam) || 25;
  try {
    const orders = await listOrders(Math.max(1, Math.min(limit, 100)));
    await sincronizarEnvios(orders)
      .catch((error) => console.error('No se pudo sincronizar tracking_web:', error.message));
    return NextResponse.json({ orders });
  } catch (error) {
    console.error('Error fetching Stripe sessions:', error);
    return NextResponse.json(
      { error: 'FETCH_ORDERS_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
