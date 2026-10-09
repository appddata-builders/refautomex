'use client';
import RefautomexLogo from '@/app/components/refautomex-logo';
import { CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
import { useState, useEffect } from 'react';
import { userPool } from "@/app/lib/cognito-manager";
import { setStorageValue } from "@/app/lib/storage-values";
import { AiFillEye } from 'react-icons/ai';
import { TbWorldWww } from "react-icons/tb";
import Link from 'next/link';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function LogIn() {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState(null);
    const [alertSuccess, setSuccessMessage] = useState(null);
    const [alertDanger, setDangerMessage] = useState(null);
    const [indicationMessage, setIndicationMessage] = useState(null);
    const [isLoading, setLoading] = useState(false);
    const urlParams = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    const userStatus = urlParams.get('user_status');

    useEffect(() => {
        if (userStatus && userStatus.includes('new')) {
            setSuccessMessage(t('account.confirmationSent'));
            setIndicationMessage(t('account.checkInbox'));
        } else if (userStatus && userStatus.includes('password-reset')) {
            setSuccessMessage(t('account.passwordReset'));
        } else if (userStatus && userStatus.includes('error')) {
            setDangerMessage(t('common.tryLater'));
        }
    }, []);

    const onSubmit = (event) => {
        event.preventDefault();
        setLoading(true);

        const authenticationDetails = new AuthenticationDetails({
            Username: email,
            Password: password
        });

        const cognitoUser = new CognitoUser({
            Username: email,
            Pool: userPool
        });

        cognitoUser.authenticateUser(authenticationDetails, {
            onSuccess: function (result) {
                // pasamos cognitoId para verificar en la base de datos si es empleado
                checkIfUserIsEmployee(result.idToken.payload.sub).then(isEmployee => {
                    if (isEmployee) {
                        setStorageValue('CognitoUserSession', result);
                        window.location.href = '/productivity';
                    } else {
                        setAlertMessage(t('panel.login.notEmployee'));
                        cognitoUser.signOut();
                        setStorageValue('CognitoUserSession', null);
                        setLoading(false);
                    }
                }).catch((error) => {
                    cognitoUser.signOut();
                    setStorageValue('CognitoUserSession', null);
                    setAlertMessage(error?.userMessage || t('panel.login.statusError'));
                    setLoading(false);
                });
            },
            onFailure: function (err) {
                if (err.code === 'UserNotConfirmedException') {
                    setAlertMessage(t('account.errorUnconfirmed'));
                } else {
                    setAlertMessage(t('account.errorCredentials'));
                }
                setLoading(false);
            }
        });
    };

    const checkIfUserIsEmployee = async (token) => {
        if (!token) return false;
        const params = new URLSearchParams({ id: token });
        const endpoint = `${buildApiUrl('/verifyEmployee')}?${params.toString()}`;
        const response = await fetch(endpoint, {
            cache: 'no-store',
            headers: { Accept: 'application/json, text/plain, */*' },
        });

        if (response.status === 404) return false;
        if (!response.ok) {
            // 503: la API no alcanza la base (en local, el tunel cerrado) y su
            // mensaje dice que hacer. Cualquier otro error queda en el generico.
            const data = response.status === 503 ? await response.json().catch(() => null) : null;
            const error = new Error(`Error ${response.status}: ${response.statusText}`);
            error.userMessage = data?.details;
            throw error;
        }

        const data = await response.json();
        return data.empleado === true || data.empleado === 1 || data.empleado === '1';
    };

    return (
        <>
            <div className="top-0 left-0 w-full h-full flex flex-col justify-center items-center">
                <div className="relative bg-[rgb(var(--color-card))]/50 w-full md:w-[500px] md:rounded-xl shadow shadow-[rgb(var(--color-text))]/10 lg:pt-10 pt-0">
                    <Link href='/' className="bg-[rgb(var(--color-gray))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-card))] cursor-pointer absolute top-4 left-3 items-center leading-none rounded-full flex lg:inline-flex" role="alert">
                        <span className="flex rounded-full bg-[rgb(var(--color-galaxy))] uppercase p-1 text-xs font-bold mr-3 shadow-md"><TbWorldWww size={30}/></span>
                        <span className="font-semibold mr-2 text-left flex-auto">{t('footer.copyrightSite')}</span>
                    </Link>
                    <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:pb-10 lg:px-8">
                        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
                            <RefautomexLogo classAttr={"h-24 md:h-32 w-auto object-contain p-2 md:p-3 mx-auto"} />
                            <h2 className="text-center text-2xl leading-9 tracking-tight text-[rgb(var(--color-text))] text-shadow">
                                {t('panel.login.title')}
                            </h2>
                        </div>
                        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
                            <form className="space-y-6" method="POST" onSubmit={onSubmit}>
                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.mail')}
                                    </label>
                                    <div className="mt-2">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        onChange={event => setEmail(event.target.value)}
                                        className="block w-full rounded-md border-0 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between">
                                    <label htmlFor="password" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                        {t('account.password')}
                                    </label>
                                    <div className="text-sm">
                                        <a href="section/account?load=recovery&lang=es" className="font-semibold text-[rgb(var(--color-refautomex))] text-shadow">
                                        {t('account.forgot')}
                                        </a>
                                    </div>
                                    </div>
                                    <div className="mt-2 relative">
                                        <input
                                            id="password"
                                            name="password"
                                            type={passwordVisible ? "text" : "password"}
                                            autoComplete="current-password"
                                            required
                                            onChange={event => setPassword(event.target.value)}
                                            className="block w-full rounded-md border-0 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                        />
                                        <div
                                            className='absolute right-0 top-0 bg-blue-300 cursor-pointer m-1.5 p-1 rounded-full shadow-xl'
                                            onClick={() => setPasswordVisible(!passwordVisible)}>
                                            <AiFillEye />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-1 justify-center items-center">
                                    <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer -mt-2"
                                    >
                                        {isLoading ? t('panel.login.signingIn') : t('account.login')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                    {alertMessage && (
                        <div className="md:rounded-xl bg-gradient-to-br from-[rgb(var(--color-galaxy))] to-[rgb(var(--color-amber))] text-center py-4 lg:px-4">
                            <div className="px-6 md:px-4 p-2 bg-transparent items-center text-[rgb(var(--color-text))] leading-none lg:rounded-full flex lg:inline-flex md:animate-out" role="alert">
                                <span className="flex rounded-full bg-red-400 uppercase px-2 py-1 text-xs font-bold mr-3 shadow">{t('common.error')}</span>
                                <span className="font-semibold mr-2 text-left flex-auto">{alertMessage}</span>
                            </div>
                        </div>
                    )}
                    {alertSuccess && (
                        <div className="md:rounded-xl bg-gradient-to-br from-[rgb(var(--color-galaxy))] to-[rgb(var(--color-amber))] text-center py-4 lg:px-4">
                            <div className="px-6 md:px-4 p-2 bg-transparent items-center text-[rgb(var(--color-text))] leading-none lg:rounded-full flex lg:inline-flex" role="alert">
                                <span className="flex rounded-full bg-amber-500 text-white uppercase px-2 py-1 text-xs font-bold mr-3 shadow">{t('common.warning')}</span>
                                <span className="inline-block m-2 text-justify italic">
                                    <b>{alertSuccess}</b>
                                </span>
                                <span className="font-semibold mr-2 text-left flex-auto">{indicationMessage}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
