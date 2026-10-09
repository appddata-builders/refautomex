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

// Fallas que no son del endpoint sino de que la API no alcanza Postgres. En
// local casi siempre es el tunel cerrado (README: `npm run db:tunnel`) o una
// credencial vieja en .env.local. Se responde 503 con un mensaje que el login
// muestra tal cual, en vez de un 500 con "connect ECONNREFUSED 127.0.0.1:5433"
// que el usuario veia como "Error al verificar el estado de empleado".
const SIN_RED = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ECONNRESET', 'EAI_AGAIN']);
const EN_LOCAL = process.env.NODE_ENV !== 'production';
const SIN_BASE = 'No hay conexión con la base de datos. Intenta de nuevo en unos minutos.';

const faltaDeBase = (error) => {
  // Los dos mensajes son de pg-pool y pg: el pool se agoto esperando conexion
  // o el servidor la corto.
  const sinRed = SIN_RED.has(error?.code)
    || /^(timeout exceeded when trying to connect|Connection terminated)/.test(error?.message || '');

  if (sinRed) {
    return EN_LOCAL
      ? 'No hay conexión con la base de datos. Abre `npm run db:tunnel` en otra terminal y vuelve a intentar.'
      : SIN_BASE;
  }
  // 28P01: usuario o contrasena rechazados por Postgres.
  if (error?.code === '28P01') {
    return EN_LOCAL
      ? 'La base rechazó las credenciales. Revisa DATABASE_URL en .env.local y reinicia Next.'
      : SIN_BASE;
  }
  return null;
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

    const sinBase = faltaDeBase(error);
    if (sinBase) {
      return NextResponse.json({ error: 'Service Unavailable', details: sinBase }, { status: 503 });
    }

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
