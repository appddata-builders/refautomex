import Spinner from '@/app/components/principal/spinner'
import { createContext, useState, useEffect } from 'react';
import { userPool } from '@/app/lib/cognito-manager';
import { getStorageValue, setStorageValue } from '@/app/lib/storage-values';
import { buildApiUrl } from '@/app/lib/refautomex-api';

export const AuthContext = createContext();

export const AuthChecker = ({ children }) => {
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
        <AuthContext.Provider value={{ isAuthenticated, authStatusChecked, userData, setUserData }}>
            {authStatusChecked ? (
                children
            ) : (
                <div className="fixed inset-0 flex justify-center items-center h-screen bg-gradient-to-tl from-blue-200 via-slate-100 to-slate-50">
                    <Spinner />
                </div>
            )}
        </AuthContext.Provider>
    );
};
