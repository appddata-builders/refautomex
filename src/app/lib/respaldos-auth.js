/**
 * Quien puede usar /api/respaldos (y guardar /api/permisos-menu): solo un
 * administrador con sesion valida. /api/avisos pide lo mismo pero acepta a
 * cualquier empleado: tiene que saber quien pregunta para darle sus avisos.
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

// `cognitoid` guarda el sub (sign-up.jsx usa userSub); se acepta tambien el
// username por si alguna cuenta vieja se dio de alta con el.
const usuarioDelToken = async (request) => {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { estado: 401, mensaje: 'Falta la sesión.' };

  let payload;
  try {
    payload = await obtenerVerificador().verify(token);
  } catch {
    return { estado: 401, mensaje: 'La sesión no es válida o ya venció. Vuelve a entrar.' };
  }

  const [usuario] = await consultar(
    `SELECT idusuario, email, nombre, categoria, empleado, idsucursal,
            to_char(f_nacimiento, 'MM-DD') AS cumple
       FROM usuario WHERE cognitoid IN (?, ?) LIMIT 1`,
    [payload.sub, payload['cognito:username'] ?? payload.sub]
  );
  return usuario ? { usuario } : { estado: 403, mensaje: 'La cuenta no existe en el panel.' };
};

/**
 * Devuelve { usuario } si quien llama es administrador, o { estado, mensaje }
 * con el codigo HTTP que corresponde. `sinPermiso` es el mensaje del 403.
 */
export const exigirAdmin = async (request, sinPermiso = 'Solo un administrador puede usar los respaldos.') => {
  const acceso = await usuarioDelToken(request);
  if (!acceso.usuario) return acceso;
  if (String(acceso.usuario.categoria || '').toUpperCase() !== 'A') {
    return { estado: 403, mensaje: sinPermiso };
  }
  return acceso;
};

/** Igual que exigirAdmin, para cualquier empleado activo. */
export const exigirEmpleado = async (request) => {
  const acceso = await usuarioDelToken(request);
  if (!acceso.usuario) return acceso;
  if (Number(acceso.usuario.empleado) !== 1) {
    return { estado: 403, mensaje: 'Solo empleados activos.' };
  }
  return acceso;
};
