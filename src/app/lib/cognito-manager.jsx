import { CognitoUserPool } from "amazon-cognito-identity-js";

const poolData = {
    UserPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID,
    ClientId: process.env.NEXT_PUBLIC_CLIENT_ID,
}

export const userPool = new CognitoUserPool(poolData);

// El ID token para las rutas que piden sesion (Authorization: Bearer).
// getSession() lo renueva con el refresh token si ya vencio (dura una hora);
// el que esta guardado en localStorage puede estar viejo.
export const obtenerIdToken = () => new Promise((resolve, reject) => {
    const usuario = userPool.getCurrentUser();
    if (!usuario) {
        reject(new Error('No hay sesión iniciada.'));
        return;
    }
    usuario.getSession((error, sesion) => {
        if (error || !sesion?.isValid()) reject(error || new Error('La sesión venció. Vuelve a entrar.'));
        else resolve(sesion.getIdToken().getJwtToken());
    });
});
