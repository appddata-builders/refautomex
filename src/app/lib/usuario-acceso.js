/**
 * Usuario para entrar: un nombre corto que cada cuenta pone en Configuracion y
 * que los dos login (sitio y panel) aceptan en lugar del correo. Es el mismo
 * patron de applougistics.
 *
 * Cognito solo conoce el correo, asi que el login cambia el usuario por el
 * correo de su cuenta (/api/acceso) antes de autenticar. Se guarda en
 * `usuario.username`, siempre en minusculas y unico.
 *
 * Lo usan el navegador y el servidor: aqui no se importa la base.
 */

export const USUARIO_MAX = 30;

export const normalizarUsuario = (valor) => String(valor ?? '').trim().toLowerCase();

// De 3 a 30 minusculas, numeros, punto, guion o guion bajo, empezando por letra
// o numero. Nunca lleva "@": asi el login sabe si recibio un correo o un usuario.
export const esUsuario = (valor) => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(valor);

export const esCorreoDeAcceso = (identificador) => String(identificador ?? '').includes('@');

/**
 * Lo que se escribe en el login. Un correo va tal cual a Cognito; un usuario se
 * cambia por el correo de su cuenta. Null si el usuario no es valido o no
 * existe: el login responde lo mismo que con una contrasena equivocada.
 *
 * Si la API no alcanza la base lanza un Error con `userMessage`, como
 * verifyEmployee en el login del panel.
 */
export const correoDeAcceso = async (identificador) => {
  const valor = String(identificador ?? '').trim();
  if (esCorreoDeAcceso(valor)) return valor;

  const usuario = normalizarUsuario(valor);
  if (!esUsuario(usuario)) return null;

  const respuesta = await fetch(`/api/acceso?${new URLSearchParams({ usuario })}`, { cache: 'no-store' });
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => null);
    const error = new Error(`Error ${respuesta.status}: ${respuesta.statusText}`);
    error.userMessage = datos?.error;
    throw error;
  }
  return (await respuesta.json()).email || null;
};
