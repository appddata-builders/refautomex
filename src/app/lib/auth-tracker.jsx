import { createContext, useCallback, useState, useEffect } from 'react';
import { userPool } from '@/app/lib/cognito-manager';
import { getStorageValue, setStorageValue } from '@/app/lib/storage-values';
import { buildApiUrl } from '@/app/lib/refautomex-api';

export const AuthContext = createContext();

// Mientras revisa la sesion no pinta nada: el loader de entrada
// (layout-client.jsx) sigue encima hasta que `alRevisar` le avisa.
export const AuthChecker = ({ children, alRevisar }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authStatusChecked, setAuthStatusChecked] = useState(false);
    const [userData, setUserData] = useState(null);
    const cognitoUserSession = getStorageValue('CognitoUserSession');
    const username = cognitoUserSession ? cognitoUserSession.idToken.payload["cognito:username"] : null;
    const forceRefreshUser = typeof window !== 'undefined'
        ? window.location.pathname.startsWith('/calidad')
        : false;

    useEffect(() => {
        try {
            const cognitoUser = userPool.getCurrentUser();

            if (cognitoUser) {
                cognitoUser.getSession((err, session) => {
                    if (err) {
                        console.error(err);
                        setStorageValue('CognitoUserSession', null);
                    } else {
                        setIsAuthenticated(true);
                        setStorageValue('CognitoUserSession', session);
                    }
                    setAuthStatusChecked(true);
                });
            } else {
                setStorageValue('CognitoUserSession', null);
                setAuthStatusChecked(true);
            }
        } catch (error) {
            setStorageValue('CognitoUserSession', null);
            setAuthStatusChecked(true);
        }
    }, []);

    useEffect(() => {
        if (authStatusChecked) alRevisar?.();
    }, [authStatusChecked, alRevisar]);

    // Salir tiene que pasar por aqui y no solo por Cognito: este contexto sigue
    // montado al cambiar de ruta y, sin avisarle, /calidad veria la sesion como
    // abierta y regresaria al panel.
    const cerrarSesion = useCallback(() => {
        try {
            userPool.getCurrentUser()?.signOut();
        } catch (error) {
            console.warn('No habia una sesion de Cognito que cerrar:', error);
        }
        setStorageValue('CognitoUserSession', null);
        setIsAuthenticated(false);
        setUserData(null);
    }, []);

    useEffect(() => {
        const fetchUserData = async () => {
            if (!username) {
                setUserData(null);
                return;
            }

            // Se pinta con lo guardado y se vuelve a pedir siempre: un admin puede
            // haber cambiado la sucursal o el rol desde Permisos, y sin esto
            // el empleado seguiria vendiendo desde la sucursal vieja hasta
            // volver a iniciar sesion.
            const cachedUserData = forceRefreshUser ? null : getStorageValue(`user_${username}`);
            if (cachedUserData) setUserData(cachedUserData);

            try {
                const params = new URLSearchParams({ id: username });
                const endpoint = `${buildApiUrl('/getUser')}?${params.toString()}`;
                const response = await fetch(endpoint, {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                const fetchedUserData = data[0];
                if (fetchedUserData) {
                    setStorageValue(`user_${username}`, fetchedUserData);
                    setUserData(fetchedUserData);
                } else if (!cachedUserData) {
                    setUserData(null);
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
                if (!cachedUserData) setUserData(null);
            }
        };

        fetchUserData();
    }, [username, forceRefreshUser]);

    return (
        <AuthContext.Provider value={{ isAuthenticated, authStatusChecked, userData, setUserData, cerrarSesion }}>
            {authStatusChecked ? children : null}
        </AuthContext.Provider>
    );
};
