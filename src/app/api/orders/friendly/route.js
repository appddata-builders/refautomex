import { NextResponse } from 'next/server';
import { pedidoPorFolio } from '../pedidos';

// Consulta publica por folio (Carrito > Consulta tu folio). Sin datos de
// contacto: ver pedidos.js.
export async function GET(request) {
  const folio = request.nextUrl.searchParams.get('folio');
  if (!folio || folio.length > 40) {
    return NextResponse.json({ error: 'MISSING_FOLIO' }, { status: 400 });
  }

  try {
    const order = await pedidoPorFolio(folio);
    if (!order) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch (error) {
    console.error('Error searching folio:', error);
    return NextResponse.json({ error: 'FIND_BY_FOLIO_FAILED' }, { status: 500 });
  }
}
