'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ReCAPTCHA from 'react-google-recaptcha';
import { AiFillEye } from 'react-icons/ai';
import { GoTasklist } from 'react-icons/go';
import { FaCircleCheck, FaCircleExclamation } from 'react-icons/fa6';
import { userPool } from '@/app/lib/cognito-manager';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';
import RefautomexLogo from '@/app/components/refautomex-logo';

const INPUT_CLASS = 'block w-full rounded-md border-0 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6';

const NAME_PATTERN = /^[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ\s.'-]{2,45}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordChecks = (password) => ({
    minLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    // La politica por omision de Cognito tambien pide un simbolo.
    hasSpecialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password),
});

/**
 * Registro corto: nombre, correo, contrasena y el aviso de privacidad. Antes
 * pedia tambien apellido, telefono, RFC, fecha de nacimiento, genero y
 * domicilio, todos obligatorios; ahora se llenan cuando el cliente quiera desde
 * Configuracion (ver settings.jsx). Para comprar no hace falta cuenta.
 */
export default function SignUp() {
    const searchParams = useSearchParams();
    const lang = searchParams.get('lang') || 'es';
    const { i18n, t } = useTranslation();
    const recaptchaRef = useRef(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [captchaOk, setCaptchaOk] = useState(false);
    const [errors, setErrors] = useState([]);
    const [isLoading, setLoading] = useState(false);

    useEffect(() => {
        if (i18n.language !== lang) i18n.changeLanguage(lang);
    }, [lang, i18n]);

    const checks = passwordChecks(password);
    const passwordOk = Object.values(checks).every(Boolean);

    const onSubmit = (event) => {
        event.preventDefault();
        if (isLoading) return;
        const found = [];
        if (!NAME_PATTERN.test(name.trim())) found.push(t('validation.name'));
        if (!EMAIL_PATTERN.test(email.trim())) found.push(t('validation.email'));
        if (!passwordOk) found.push(t('validation.password'));
        if (!agreed) found.push(t('validation.agree'));
        if (!recaptchaRef.current?.getValue()) found.push(t('validation.captcha'));
        setErrors(found);
        if (found.length) return;

        setLoading(true);
        userPool.signUp(email.trim(), password, [], null, async (err, data) => {
            if (err) {
                recaptchaRef.current?.reset();
                setCaptchaOk(false);
                setLoading(false);
                if (err.code === 'UsernameExistsException') setErrors([t('account.emailExists')]);
                else if (err.code === 'InvalidPasswordException') setErrors([t('validation.password')]);
                else setErrors([err.message || t('account.signUpError')]);
                return;
            }
            try {
                const response = await fetch(buildApiUrl('/newUser'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
                    body: JSON.stringify({ nombre: name.trim(), email: email.trim(), cognitoid: data.userSub }),
                });
                if (!response.ok) throw new Error(`Error ${response.status}`);
                window.location.href = `/section/account?load=log-in&user_status=new&lang=${lang}`;
            } catch (error) {
                console.error('Error al registrar la cuenta:', error);
                setErrors([t('account.signUpError')]);
                setLoading(false);
            }
        });
    };

    const checklist = [
        ['minLength', 'password.minLength', 'password.minLengthOk'],
        ['hasUppercase', 'password.upper', 'password.upperOk'],
        ['hasLowercase', 'password.lower', 'password.lowerOk'],
        ['hasNumber', 'password.number', 'password.numberOk'],
        ['hasSpecialChar', 'password.special', 'password.specialOk'],
    ];

    return (
        <div className="relative flex w-full flex-col items-center justify-center p-6">
            <div className="w-full max-w-md rounded-xl bg-[rgb(var(--color-card))]/50 px-6 pb-8 shadow shadow-[rgb(var(--color-text))]/10 sm:px-10">
                <RefautomexLogo classAttr="h-24 md:h-32 w-auto object-contain p-2 md:p-3 mx-auto" />
                <h2 className="text-center text-2xl tracking-tight text-[rgb(var(--color-text))] text-shadow">
                    {t('account.register')}
                </h2>
                <p className="mt-1 text-center text-sm text-[rgb(var(--color-text))]/70">{t('account.signUpIntro')}</p>

                <ul className="mt-5 space-y-1.5 text-sm text-[rgb(var(--color-text))]/80">
                    {['account.signUpBenefitOrders', 'account.signUpBenefitFaster'].map((key) => (
                        <li key={key} className="flex items-center gap-2">
                            <FaCircleCheck className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                            {t(key)}
                        </li>
                    ))}
                </ul>

                <form className="mt-6 space-y-5" onSubmit={onSubmit} noValidate>
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                            {t('account.name')}
                        </label>
                        <input
                            id="name"
                            name="name"
                            type="text"
                            autoComplete="given-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={`mt-2 ${INPUT_CLASS}`}
                        />
                    </div>
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                            {t('account.mail')}
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={`mt-2 ${INPUT_CLASS}`}
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                            {t('account.password')}
                        </label>
                        <div className="relative mt-2">
                            <input
                                id="password"
                                name="password"
                                type={passwordVisible ? 'text' : 'password'}
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                aria-describedby="password-checks"
                                className={`${INPUT_CLASS} pr-10`}
                            />
                            <button
                                type="button"
                                onClick={() => setPasswordVisible((visible) => !visible)}
                                aria-label={t('account.password')}
                                aria-pressed={passwordVisible}
                                className="absolute right-0 top-0 m-1.5 rounded-full bg-[rgb(var(--color-amber))] p-1 text-[rgb(var(--color-text-base))] shadow-xl"
                            >
                                <AiFillEye />
                            </button>
                        </div>
                        <ul id="password-checks" className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                            {checklist.map(([key, pending, ok]) => (
                                <li key={key} className={`flex items-center gap-1.5 ${checks[key] ? 'text-emerald-600' : 'text-[rgb(var(--color-text))]/50'}`}>
                                    <FaCircleCheck className={`size-3 shrink-0 ${checks[key] ? '' : 'opacity-30'}`} aria-hidden="true" />
                                    {t(checks[key] ? ok : pending)}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <label className="flex items-start gap-3 text-sm text-[rgb(var(--color-text))]">
                        <input
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            className="mt-0.5 size-4 shrink-0 rounded border-gray-300 accent-amber-500"
                        />
                        <span>
                            {t('account.agreePrefix')}{' '}
                            <Link href={{ pathname: '/privacy', query: { lang } }} target="_blank" className="font-semibold text-[rgb(var(--color-refautomex))] underline">
                                {t('account.privacyNotice')}
                            </Link>{' '}
                            {t('account.agreeSuffix')}
                        </span>
                    </label>

                    <p className="rounded-xl bg-[rgb(var(--color-bg))]/70 px-3 py-2 text-xs text-[rgb(var(--color-text))]/70">
                        {t('account.signUpLater')}
                    </p>

                    {errors.length > 0 && (
                        <div role="alert" className="flex gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700">
                            <FaCircleExclamation className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                            <ul className="space-y-0.5">
                                {errors.map((message) => <li key={message}>{message}</li>)}
                            </ul>
                        </div>
                    )}

                    <div className="flex flex-col items-center gap-3">
                        <ReCAPTCHA
                            ref={recaptchaRef}
                            sitekey="6Lf6jHcgAAAAALChHtUKBVxS23pYaFAo9HNJG1qF"
                            onChange={(token) => setCaptchaOk(Boolean(token))}
                        />
                        <button
                            type="submit"
                            disabled={!captchaOk || isLoading}
                            className="w-full rounded-full bg-gradient-to-bl from-amber-500 via-yellow-400 to-slate-300 p-3 font-bold text-slate-900 shadow transition-all duration-500 ease-in-out hover:scale-[1.02] hover:bg-gradient-to-tr disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:hover:scale-100"
                        >
                            <span className="flex items-center justify-center px-1">
                                <GoTasklist className="mx-1.5 inline-block rounded-md bg-slate-50 p-0.5 text-xl opacity-50 shadow md:text-2xl" />
                                {isLoading ? t('account.creating') : t('account.btnCaption')}
                            </span>
                        </button>
                    </div>
                </form>

                <p className="mt-6 text-center text-sm text-[rgb(var(--color-text))]">
                    {t('account.haveAccount')}{' '}
                    <Link href={{ pathname: '/section/account', query: { load: 'log-in', lang } }} className="font-semibold leading-6 text-[rgb(var(--color-refautomex))] text-shadow">
                        {t('account.login')}
                    </Link>
                </p>
                <p className="mt-2 text-center text-sm text-[rgb(var(--color-text))]/70">
                    {t('account.guestCheckout')}{' '}
                    <Link href={{ pathname: '/section/products', query: { lang } }} className="font-semibold text-[rgb(var(--color-refautomex))]">
                        {t('account.historyShop')}
                    </Link>
                </p>
                <p className="mt-4 text-center text-xs text-gray-400">
                    {t('account.support')} <a href={`mailto:${t('footer.supportMail')}`} className="text-amber-400">{t('footer.supportMail')}</a>
                </p>
            </div>
        </div>
    );
}
