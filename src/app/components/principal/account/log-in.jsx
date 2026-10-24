'use client';
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";
import { AuthContext } from '@/app/lib/auth-tracker';
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useContext } from 'react';
import { CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
import { userPool } from "@/app/lib/cognito-manager";
import { setStorageValue } from "@/app/lib/storage-values";
import RefautomexLogo from "@/app/components/refautomex-logo";
import { useTranslation } from '@/app/lib/text/text-provider';
import { IoMdLogIn } from "react-icons/io";
import { AiFillEye } from 'react-icons/ai';
import { IoIosCloseCircle } from "react-icons/io";
import Link from 'next/link';
import { signInWithRedirect } from 'aws-amplify/auth';
import '@/app/lib/amplify-client';

export default function Login() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState(null);
    const [alertSuccess, setSuccessMessage] = useState(null);
    const [alertConfirmation, setConfirmationMessage] = useState(null);
    const [indicationMessage, setIndicationMessage] = useState(null);
    const [isLoading, setLoading] = useState(false);
    const { isAuthenticated } = useContext(AuthContext);
    const [selectedLanguage, setSelectedLanguage] = useState('es');
    const { i18n, t } = useTranslation();
    const userStatus = searchParams.get('user_status');

    const signIn = async (provider) => {
        try {
            await signInWithRedirect({ provider });
        } catch (err) {
            console.error("Error en signInWithRedirect:", err);
            setAlertMessage(t('account.errorSocial'));
        }
    };

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
                setStorageValue('CognitoUserSession', result);
                window.location.href = '/section/refautomex';
            },
            onFailure: function (err) {
                if (err.code === 'UserNotConfirmedException') {
                    setAlertMessage(t('account.errorUnconfirmed'));
                    setConfirmationMessage(t('account.errorUnconfirmedHint'));
                } else {
                    setAlertMessage(t('account.errorCredentials'));
                }
                setLoading(false);
            }
        });
    };

    const resendConfirmationCode = () => {
        const cognitoUser = new CognitoUser({
            Username: email,
            Pool: userPool
        });

        cognitoUser.resendConfirmationCode((err, result) => {
            if (err) {
                setAlertMessage(err.message || JSON.stringify(err));
                return;
            }
            setSuccessMessage(t('account.resent'));
            setIndicationMessage(t('account.checkInbox'));
        });
    };

    const closeAlert = () => {
        setAlertMessage(null);
        setSuccessMessage(null);
    };

    useEffect(() => {
    if (isAuthenticated) {
            router.replace('/section/refautomex');
        }
    }, [isAuthenticated, router]);

    useEffect(() => {
        const lang = searchParams.get('lang');
        if (lang) {
            i18n.changeLanguage(lang);
            setSelectedLanguage(lang);
        }
    }, [searchParams, i18n]);

    useEffect(() => {
        if (userStatus && userStatus.includes('new')) {
            setSuccessMessage(t('account.confirmationSent'));
            setIndicationMessage(t('account.checkInbox'));
        } else if (userStatus && userStatus.includes('password-reset')) {
            setSuccessMessage(t('account.passwordReset'));
        } else if (userStatus && userStatus.includes('error')) {
            setAlertMessage(t('common.tryLater'));
        }
    }, []);

    return (
        <div className="relative mx-auto w-full md:w-[500px] bg-[rgb(var(--color-card))]/50 md:rounded-xl shadow shadow-[rgb(var(--color-text))]/10 p-6">
            {alertMessage && (
                <div className="rounded-xl my-1 shadow bg-gradient-to-br from-[rgb(var(--color-galaxy))] to-[rgb(var(--color-bg))] text-center py-4 lg:px-4">
                    <div className="px-4 md:px-2 p-1 bg-transparent items-center text-[rgb(var(--color-text))] leading-none lg:rounded-full flex lg:inline-flex" role="alert">
                        <span className="flex rounded-full bg-red-600 text-indigo-100 uppercase px-2 py-1 text-xs font-bold mr-3 shadow">{t('common.error')}</span>
                        <span className="font-semibold mr-2 text-left flex-auto">{alertMessage}</span>
                        <button onClick={closeAlert} className="ml-2">
                            <IoIosCloseCircle className="text-red-500 text-2xl" />
                        </button>
                    </div>
                    {alertConfirmation && (
                        <div>
                            <span className="mx-2.5 italic font-sans text-left text-[rgb(var(--color-text))]">{alertConfirmation}</span>
                            <button onClick={resendConfirmationCode} className="ml-2 text-blue-500 underline">{t('account.resend')}</button>
                        </div>
                    )}
                </div>
            )}
            {alertSuccess && (
                <div className="rounded-xl my-1 shadow bg-gradient-to-br from-[rgb(var(--color-galaxy))] to-[rgb(var(--color-bg))] text-center py-4 lg:px-4">
                    <div className="px-4 md:px-2 p-1 bg-transparent items-center text-[rgb(var(--color-text))] leading-none lg:rounded-full flex lg:inline-flex" role="alert">
                        <span className="flex rounded-full bg-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))] uppercase px-2 py-1 text-xs font-bold mr-3 shadow">{t('common.warning')}</span>
                        <span className="m-2 text-left font-sans">
                            <b>{alertSuccess}</b>
                        </span>
                        <button onClick={closeAlert} className="ml-2">
                            <IoIosCloseCircle className="text-red-500 text-2xl" />
                        </button>
                    </div>
                    <div className="mx-2.5 italic font-sans text-left flex-auto text-[rgb(var(--color-text))]">{indicationMessage}</div>
                </div>
            )}
            <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
                <div className="sm:mx-auto sm:w-full sm:max-w-sm">
                    <RefautomexLogo classAttr={"h-24 md:h-32 w-auto object-contain p-2 md:p-3 mx-auto"} />
                    <h2 className="text-center text-2xl leading-9 tracking-tight text-[rgb(var(--color-text))] text-shadow">
                        {t('account.account')}
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
                                    <Link href={{ pathname: "/section/account", query: { load: 'recovery', lang: selectedLanguage } }} className="font-semibold leading-6 text-[rgb(var(--color-refautomex))] text-shadow">
                                        {t('account.forgot')}
                                    </Link>
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
                                    className='absolute right-0 top-0 bg-[rgb(var(--color-amber))] text-[rgb(var(--color-text-base))] cursor-pointer m-1.5 p-1 rounded-full shadow-xl'
                                    onClick={() => setPasswordVisible(!passwordVisible)}>
                                    <AiFillEye />
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-1 justify-center items-center">
                            <button type="submit" className="bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer font-bold">
                                <span className='flex px-1 justify-center items-center'>
                                    <IoMdLogIn className="inline-block text-xl md:text-2xl mx-1.5 p-0.5 rounded-md bg-slate-50 opacity-50 shadow" />
                                    {t('account.login')}
                                </span>
                            </button>
                        </div>
                    </form>
                    <p className="mt-5 text-center text-sm text-[rgb(var(--color-text))]">
                        <Link href={{ pathname: "/section/account", query: { load: 'sign-up', lang: selectedLanguage } }} className="font-semibold leading-6 text-[rgb(var(--color-refautomex))] text-shadow">
                            {t('account.noAccount')}
                        </Link>
                    </p>
                    {/* Social login temporalmente oculto hasta ajustar Cognito */}
                </div>
            </div>
        </div>
    )
}
