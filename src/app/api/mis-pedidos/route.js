/**
 * "Mis pedidos": las compras en linea de quien tiene la sesion. El cliente ya
 * no manda su idusuario (antes /getUserHistory?id=... devolvia las compras de
 * cualquier id): sale del token verificado.
 */
import { NextResponse } from 'next/server';
import { exigirCuenta } from '@/app/lib/sesion-auth';
import { pedidosDeCliente } from '../orders/pedidos';

export async function GET(request) {
  const acceso = await exigirCuenta(request);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.mensaje }, { status: acceso.estado });
  }
  try {
    const pedidos = await pedidosDeCliente(acceso.usuario.idusuario);
    return NextResponse.json({ pedidos });
  } catch (error) {
    console.error('Error leyendo los pedidos del cliente:', error);
    return NextResponse.json({ error: 'No se pudieron cargar tus pedidos.' }, { status: 500 });
  }
}
