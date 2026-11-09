/**
 * /api/acceso - el usuario para entrar sin escribir el correo (ver
 * lib/usuario-acceso.js).
 *
 *   GET ?usuario=ana.lopez   { email }     lo pide el login, sin sesion; 404 si no existe
 *   PUT { username }         { username }  la cuenta pone, cambia o quita (vacio) el suyo
 *
 * Cualquier cuenta pone el suyo, cliente o empleado: Configuracion es la misma
 * pantalla para los dos. Un usuario que no existe responde igual que uno mal
 * escrito, y el login lo trata como una contrasena equivocada.
 */
import { NextResponse } from 'next/server';

import { exigirCuenta } from '@/app/lib/sesion-auth';
import { consultar, escribir } from '@/app/lib/refautomex-db';
import { esUsuario, normalizarUsuario } from '@/app/lib/usuario-acceso';

export const dynamic = 'force-dynamic';

// La columna nace con el primer usuario que alguien guarda y tiene que ser
// identica a `usuario.username` en lib/db/schema.pg.js. El indice unico es lo
// que de verdad impide que dos cuentas tengan el mismo; la consulta previa del
// PUT solo da un mensaje claro.
const COLUMNA = [
  'ALTER TABLE usuario ADD COLUMN IF NOT EXISTS username varchar(30)',
  'CREATE UNIQUE INDEX IF NOT EXISTS usuario_username_unique ON usuario (username)',
];

// 42703: la columna aun no existe, o sea que nadie ha puesto usuario.
const sinColumna = (error) => error?.code === '42703';

const respuesta = (cuerpo, estado = 200) => NextResponse.json(cuerpo, { status: estado });
const TOMADO = 'Ese usuario ya lo tiene otra cuenta.';

export async function GET(request) {
  const usuario = normalizarUsuario(request.nextUrl.searchParams.get('usuario'));
  if (!esUsuario(usuario)) return respuesta({ error: 'No existe.' }, 404);

  try {
    const [fila] = await consultar('SELECT email FROM usuario WHERE username = ? LIMIT 1', [usuario]);
    return fila ? respuesta({ email: fila.email }) : respuesta({ error: 'No existe.' }, 404);
  } catch (error) {
    if (sinColumna(error)) return respuesta({ error: 'No existe.' }, 404);
    console.error('[acceso]', error);
    return respuesta({ error: 'No pudimos revisar tu usuario. Intenta de nuevo en unos minutos.' }, 500);
  }
}

const otraCuentaLoTiene = async (username, idusuario) => {
  try {
    const [otra] = await consultar(
      'SELECT idusuario FROM usuario WHERE username = ? AND idusuario <> ? LIMIT 1',
      [username, idusuario]
    );
    return Boolean(otra);
  } catch (error) {
    if (sinColumna(error)) return false;
    throw error;
  }
};

const guardar = async (username, idusuario) => {
  const sql = 'UPDATE usuario SET username = ? WHERE idusuario = ?';
  try {
    await escribir(sql, [username, idusuario]);
  } catch (error) {
    if (!sinColumna(error)) throw error;
    for (const ddl of COLUMNA) await consultar(ddl);
    await escribir(sql, [username, idusuario]);
  }
};

export async function PUT(request) {
  const acceso = await exigirCuenta(request);
  if (!acceso.usuario) return respuesta({ error: acceso.mensaje }, acceso.estado);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = null;
  }
  if (typeof cuerpo?.username !== 'string') return respuesta({ error: 'Falta el usuario.' }, 400);

  const username = normalizarUsuario(cuerpo.username) || null;
  if (username && !esUsuario(username)) {
    return respuesta({ error: 'El usuario lleva de 3 a 30 minúsculas, números, punto o guion, sin @.' }, 400);
  }

  const { idusuario } = acceso.usuario;
  try {
    if (username && await otraCuentaLoTiene(username, idusuario)) return respuesta({ error: TOMADO }, 409);
    await guardar(username, idusuario);
    return respuesta({ username });
  } catch (error) {
    // Dos cuentas pidieron el mismo usuario a la vez: el indice dejo pasar una.
    if (error?.code === '23505') return respuesta({ error: TOMADO }, 409);
    console.error('[acceso]', error);
    return respuesta({ error: 'No se pudo guardar el usuario.' }, 500);
  }
}
