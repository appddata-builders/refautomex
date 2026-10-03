/**
 * Despachador de /api/refautomex/*
 *
 * Resuelve los 47 endpoints contra el PostgreSQL del cluster. Las URL son las
 * mismas de siempre, asi que ningun componente del frontend se toca.
 *
 * HISTORIA
 * Esto era un proxy transparente hacia http://refautomex-calidad.com/api, un
 * Express que hablaba con MySQL. Ese servidor ya no tiene consumidores: los
 * datos se migraron a Postgres y la logica de sus 29 procedimientos vive en
 * los modulos `endpoints*.js` de este directorio. El Express original quedo
 * como referencia en .apirefautomex.
 *
 * Ya no hay reenvio a ningun lado: si un endpoint no esta registrado es un
 * 404, no una llamada a internet. Un nombre mal escrito ahora falla rapido y
 * de forma evidente, en vez de irse a buscar un servidor que ya nadie mantiene.
 */

import { NextResponse } from 'next/server';

import { ENDPOINTS } from './endpoints';

const leerCuerpo = async (request) => {
  // Un cuerpo vacio o mal formado no debe tumbar la peticion: el Express
  // original usaba `req.body || {}` en todos lados y varios endpoints se
  // llaman sin cuerpo.
  try {
    const texto = await request.text();
    return texto ? JSON.parse(texto) : {};
  } catch {
    return {};
  }
};

const despachar = async (metodo, request, context) => {
  const params = (await context.params) || {};
  const segmentos = params.path || [];
  const nombre = segmentos[0];

  const manejador = ENDPOINTS[metodo]?.[nombre];

  if (!manejador) {
    return NextResponse.json(
      {
        error: 'Not Found',
        details: `El endpoint '${nombre ?? ''}' no existe para ${metodo}.`,
      },
      { status: 404 }
    );
  }

  try {
    const resultado = await manejador({
      query: request.nextUrl.searchParams,
      body: metodo === 'GET' || metodo === 'HEAD' ? {} : await leerCuerpo(request),
      segmentos,
    });

    return NextResponse.json(resultado.cuerpo, { status: resultado.estado ?? 200 });
  } catch (error) {
    // Se conserva la forma de error del Express original: hay pantallas que
    // muestran `details` al usuario.
    console.error(`[refautomex/${nombre}]`, error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
};

export const GET = (request, context) => despachar('GET', request, context);
export const POST = (request, context) => despachar('POST', request, context);
export const PUT = (request, context) => despachar('PUT', request, context);
export const PATCH = (request, context) => despachar('PATCH', request, context);
export const DELETE = (request, context) => despachar('DELETE', request, context);

// Estas rutas leen y escriben la base en cada peticion: cachearlas devolveria
// inventarios y ventas viejos.
export const dynamic = 'force-dynamic';
