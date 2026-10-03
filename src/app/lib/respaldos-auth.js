/**
 * Quien puede usar /api/respaldos: solo un administrador con sesion valida.
 *
 * El resto de /api/refautomex no pide sesion, pero esto no puede quedar igual:
 * el respaldo trae TODAS las tablas (clientes, usuarios, ventas) y la carga
 * modifica la base. Se verifica la firma del ID token contra el user pool de
 * Cognito (no basta con leer el payload: cualquiera puede armar uno) y luego
 * que ese usuario sea categoria 'A' en la tabla `usuario`.
 */
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { consultar } from '@/app/lib/refautomex-db';

// Se crea en la primera peticion y no al importar: `next build` importa la
// ruta sin variables de entorno de runtime.
let verificador = null;

const obtenerVerificador = () => {
  verificador ??= CognitoJwtVerifier.create({
    userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID,
    clientId: process.env.NEXT_PUBLIC_CLIENT_ID,
    tokenUse: 'id',
  });
  return verificador;
};

/**
 * Devuelve { usuario } si quien llama es administrador, o { estado, mensaje }
 * con el codigo HTTP que corresponde.
 */
export const exigirAdmin = async (request) => {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { estado: 401, mensaje: 'Falta la sesión.' };

  let payload;
  try {
    payload = await obtenerVerificador().verify(token);
  } catch {
    return { estado: 401, mensaje: 'La sesión no es válida o ya venció. Vuelve a entrar.' };
  }

  // `cognitoid` guarda el sub (sign-up.jsx usa userSub); se acepta tambien el
  // username por si alguna cuenta vieja se dio de alta con el.
  const [usuario] = await consultar(
    'SELECT idusuario, email, categoria FROM usuario WHERE cognitoid IN (?, ?) LIMIT 1',
    [payload.sub, payload['cognito:username'] ?? payload.sub]
  );

  if (!usuario || String(usuario.categoria || '').toUpperCase() !== 'A') {
    return { estado: 403, mensaje: 'Solo un administrador puede usar los respaldos.' };
  }

  return { usuario };
};
