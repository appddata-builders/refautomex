'use client';
import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { userPool } from '@/app/lib/cognito-manager';
import { TbCircleX } from 'react-icons/tb';
import { Switch } from '@headlessui/react';
import { useTranslation } from '@/app/lib/text/text-provider';
import { GoTasklist } from "react-icons/go";
import { AiFillEye } from 'react-icons/ai';

import RefautomexLogo from '@/app/components/refautomex-logo';
import ReCAPTCHA from "react-google-recaptcha";
import GooglePlacesAutocomplete from './google-places';
import Link from 'next/link';

import { buildApiUrl } from '@/app/lib/refautomex-api';


function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

export default function SignUp() {
    const searchParams = useSearchParams();
    const lang = searchParams.get('lang') || 'es';
    const { i18n, t } = useTranslation();
    const [selectedLanguage, setSelectedLanguage] = useState('es');
    const recaptchaRef = React.createRef();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [verifyPassword, setVerifyPassword] = useState("");
    const [name, setName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [gender, setGender] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [placeId, setPlaceId] = useState('');
    const [rfc, setRfc] = useState('');
    const [alertMessage, setAlertMessage] = useState(null);
    const [isLoading, setLoading] = useState(false);
    const [isFocus, setIsFocus] = useState(false);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [errorMessages, setErrorMessage] = useState('');
    const [isSuccessfull, setIsSuccessfull] = useState(false);
    const [isCaptchaValid, setIsCaptchaValid] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [isValid, setIsValid] = useState({
        minLength: false,
        hasNumber: false,
        hasSpecialChar: false,
        hasUppercase: false,
        hasLowercase: false,
        isSame: false,
    });
    let error = '';

    const onReCAPTCHAChange = (token) => {
        if (token) {
            setIsCaptchaValid(true);
        } else {
            setIsCaptchaValid(false);
        }
    };

    const validatePassword = (password, verifyPassword) => {
        setIsValid({
            minLength: password.length >= 8,
            hasNumber: /\d/.test(password),
            hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password),
            hasUppercase: /[A-Z]/.test(password),
            hasLowercase: /[a-z]/.test(password),
            isSame: password === verifyPassword,
        });
    }

    const onFocusHandler = () => {
        setIsFocus(true);
    };

    const onBlurHandler = () => {
        setIsFocus(false);
    };

    const onSubmit = (event) => {
        onBlurHandler();
        event.preventDefault();
        const recaptchaValue = recaptchaRef.current.getValue();
        const nameRegex = /^[a-zA-ZñÑáéíóúÁÉÍÓÚ\s]+$/; 
        const phoneRegex = /^[0-9]{10,12}$/;
        const rfcRegex = /^([A-ZÑ&]{3,4})?(?:\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))([A-Z\d]{2})([A\d])$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/; 
        const birthDateRegex = /^\d{4}-\d{2}-\d{2}$/;

        if (!name || !nameRegex.test(name)) {
            error += t('validation.name') + '\n';
        }
        if (!lastName || !nameRegex.test(lastName)) {
            error += t('validation.lastname') + '\n';
        }
        if (!phone || !phoneRegex.test(phone)) {
            error += t('validation.phone') + '\n';
        }
        if (!rfc || !rfcRegex.test(rfc)) {
            error += t('validation.rfc') + '\n';
        }
        if (!birthDate || !birthDateRegex.test(birthDate)) {
            error += t('validation.birthdate') + '\n';
        }
        if (!gender) {
            error += t('validation.gender') + '\n';
        }
        if (!email || !emailRegex.test(email)) {
            error += t('validation.email') + '\n';
        }
        if (!password || !passwordRegex.test(password)) {
            error += t('validation.password') + '\n';
        }
        if (verifyPassword !== password) {
            error += t('password.match') + '\n';
        }
        if (!placeId) {
            error += t('validation.address') + '\n';
        }
        if (!agreed) {
            error += t('validation.agree') + '\n';
        }
        if (!recaptchaValue) {
            error += t('validation.captcha') + '\n';
        }

        recaptchaRef.current.reset();

        if (error){
            setAlertMessage(error);
            return;
        }

        userPool.signUp(email, password, [], null, async (err, data) => {
            if (err) {
                if (err.code === 'UsernameExistsException') {
                    setAlertMessage(t('account.emailExists'));
                } else {
                    console.error(err);
                }
            } else {
                const { userSub } = data;
                const user_data = {
                    nombre: name || "",
                    apellido: lastName || "",
                    telefono: phone || "",
                    rfc: rfc || "",
                    f_nacimiento: birthDate || "",
                    genero: gender || "",
                    email: email || "",
                    cognitoid: userSub,
                    domicilio: placeId || "",
                    categoria: "G",
                    empleado: "0"
                };

                setLoading(true);

                try {
                    const response = await fetch(buildApiUrl('/newUser'), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/json, text/plain, */*',
                        },
                        body: JSON.stringify(user_data),
                    });

                    if (!response.ok) {
                        throw new Error(`Error ${response.status}: ${response.statusText}`);
                    }

                    const dataResponse = await response.json().catch(() => null);
                    console.log('Data sent successfully:', dataResponse);
                    setAlertMessage(t('account.signUpOk'));
                    window.location.href = '/section/account?load=log-in&user_status=new';
                } catch (error) {
                    console.log('Error al subir formulario:', error);
                    setAlertMessage(t('account.signUpError'));
                }
            }
        });
    };

    useEffect(() => {
        if (i18n.language !== lang) {
            i18n.changeLanguage(lang);
        }
    }, [lang, i18n]);

    return (
        <div className="relative w-full h-auto flex flex-col justify-center items-center p-6">
            <div className="relative h-full justify-center items-center bg-[rgb(var(--color-card))]/50 w-full md:w-[650px] rounded-xl shadow shadow-[rgb(var(--color-text))]/10 pt-0 overflow-y-auto">
                <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-1 lg:px-8">
                    <div className="sm:mx-auto sm:w-full sm:max-w-sm">
                        <RefautomexLogo classAttr={"h-24 md:h-32 w-auto object-contain p-2 md:p-3 mx-auto"} />
                        <h2 className="text-center text-2xl leading-4 -mt-2 mb-1 tracking-tight text-[rgb(var(--color-text))] text-shadow">
                            {t('account.register')}
                        </h2>
                    </div>
                </div>
                <form onSubmit={onSubmit}>
                    <div className="space-y-4 max-w-3xl mx-auto mt-1 px-12">
                        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-6 sm:pt-12">
                            <div className="sm:col-span-3 sm:col-start">
                                <label htmlFor="name" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.name')}
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="name"
                                        name="Nombre"
                                        type="text"
                                        required
                                        placeholder={t('account.name')}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                </div>
                            </div>
                            <div className="sm:col-span-3">
                                <label htmlFor="lastname" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.lastname')}
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="lastname"
                                        name="Apellido"
                                        type="text"
                                        required
                                        placeholder={t('account.lastname')}
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                </div>
                            </div>
                            <div className="sm:col-span-3">
                                <label htmlFor="phone" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.phone')}
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="phone"
                                        name="Teléfono"
                                        type="text"
                                        required
                                        placeholder={t('account.phone')}
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                </div>
                            </div>
                            <div className="sm:col-span-3">
                                <label htmlFor="rfc" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('invoice.rfc')}
                                </label>
                                <div className="mt-2">
                                    <input 
                                        type="text" 
                                        name="rfc"
                                        id="rfc"
                                        required
                                        placeholder='RFC'
                                        value={rfc}
                                        onChange={(e) => setRfc(e.target.value)}
                                        className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" />
                                </div>
                            </div>
                            <div className="sm:col-span-3">
                                <label htmlFor="birth_date" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.birthdate')}
                                </label>
                                <div className="mt-2">
                                    <input type="date" name="birth_date" id="birth_date"
                                        value={birthDate}
                                        onChange={(e) => setBirthDate(e.target.value)}
                                        className="block w-full rounded-md border-0 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-[rgb(var(--color-text))] focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" />
                                </div>
                            </div>
                            <div className="sm:col-span-3">
                                <label htmlFor="gender" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.gener')}
                                </label>
                                <div>
                                    <select
                                        name="gender"
                                        id="gender"
                                        value={gender}
                                        onChange={(e) => setGender(e.target.value)}
                                        className="mt-2 block w-full rounded-md border-0 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-[rgb(var(--color-text))] focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6">
                                        <option id="gender_0" value="" disabled>{t('account.gener')}</option>
                                        <option id="gender_1" value="M">{t('account.genderMale')}</option>
                                        <option id="gender_2" value="F">{t('account.genderFemale')}</option>
                                        <option id="gender_3" value="O">{t('account.genderOther')}</option>
                                    </select>
                                </div>
                            </div>
                            <div className="sm:col-span-full">
                                <label htmlFor="email" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.mail')}
                                </label>
                                <div className="mt-2">
                                    <input type="text"
                                        name="email"
                                        id="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        placeholder={t('account.mail')}
                                        className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                </div>
                            </div>
                            <div className="sm:col-span-full">
                                <label htmlFor="password" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.password')}
                                </label>
                                <div className="mt-2 relative">
                                    <input
                                        type={passwordVisible ? "text" : "password"}
                                        name="pass"
                                        id="pass"
                                        value={password}
                                        onFocus={onFocusHandler}
                                        placeholder={t('account.password')}
                                        onChange={(event) => {
                                            setPassword(event.target.value);
                                            validatePassword(event.target.value, verifyPassword);
                                        }}
                                        className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" />
                                    <div 
                                        className='absolute right-0 top-0 bg-blue-300 cursor-pointer m-1.5 p-1 rounded-full shadow-xl'
                                        onClick={() => setPasswordVisible(!passwordVisible)}>
                                        <AiFillEye />
                                    </div>
                                    <label htmlFor="verifyPassword" className="block font-medium leading-6 mt-4 text-[rgb(var(--color-text))]">
                                        {t('account.verify')}
                                    </label>
                                    <input 
                                        type={passwordVisible ? 'text' : 'password'}
                                        name="verifyPassword"
                                        id="verifyPassword"
                                        value={verifyPassword}
                                        placeholder={t('account.verify')}
                                        onChange={(event) => {
                                            setVerifyPassword(event.target.value);
                                            validatePassword(password, event.target.value);
                                        }}
                                        className="block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6" 
                                    />
                                </div>
                                <div className={`grid grid-cols-2 p-2 leading-3 text-xs mt-1.5 opacity-40 shadow bg-[rgb(var(--color-card))] rounded-md -mx-10 sm:mx-0 ${isFocus ? '' : 'hidden'}`}>
                                    <p className={isValid.minLength ? 'text-green-500' : 'text-red-400'}>
                                        - {isValid.minLength ? t('password.minLengthOk') : t('password.minLength')}
                                    </p>
                                    <p className={isValid.hasNumber ? 'text-green-500' : 'text-red-400'}>
                                        - {isValid.hasNumber ? t('password.numberOk') : t('password.number')}
                                    </p>
                                    <p className={isValid.hasSpecialChar ? 'text-green-500' : 'text-red-400'}>
                                        - {isValid.hasSpecialChar ? t('password.specialOk') : t('password.special')}
                                    </p>
                                    <p className={isValid.hasUppercase ? 'text-green-500' : 'text-red-400'}>
                                        - {isValid.hasUppercase ? t('password.upperOk') : t('password.upper')}
                                    </p>
                                    <p className={isValid.hasLowercase ? 'text-green-500' : 'text-red-400'}>
                                        - {isValid.hasLowercase ? t('password.lowerOk') : t('password.lower')}
                                    </p>
                                    <p className={(password ? (isValid.isSame ? 'text-green-500' : 'text-red-400') : 'text-red-400')}>
                                        - {password
                                            ? (isValid.isSame ? t('password.matchOk') : t('password.match'))
                                            : t('password.empty')
                                        }
                                    </p>
                                </div>
                                <div className="sm:col-span-full mt-3">
                                    <label htmlFor="placeId" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                        {t('account.address')}
                                    </label>
                                    <div className="mt-2 relative">
                                        <GooglePlacesAutocomplete 
                                            placeId={placeId}
                                            setPlaceId={setPlaceId}
                                        />
                                    </div>
                                </div>
                                <Switch.Group as="div" className="flex gap-x-4 my-1.5 sm:col-span-2">
                                    <div className="flex h-6 items-center mt-2.5">
                                    <Switch
                                        checked={agreed}
                                        onChange={setAgreed}
                                        className={classNames(
                                        agreed ? 'bg-amber-400' : 'bg-gray-200',
                                        'flex w-8 flex-none cursor-pointer rounded-full p-px ring-1 ring-inset ring-gray-900/5 transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
                                        )}
                                    >
                                        <span
                                        aria-hidden="true"
                                        className={`
                                        ${agreed ? 'translate-x-3.5' : 'translate-x-0'}
                                        ${errorMessages.name ? "bg-red-200" : ""}
                                        ${isSuccessfull ? "bg-stone-400 opacity-70" : ""} 
                                        py-2 h-4 w-4 transform rounded-full bg-white shadow-sm ring-1 ring-gray-900/5 transition duration-200 ease-in-out
                                        `}
                                        />
                                    </Switch>
                                    </div>
                                    <Switch.Label className="text-sm mt-3 leading-6 text-[rgb(var(--color-text))] font-bold">
                                        {t('account.agree')}
                                    </Switch.Label>
                                </Switch.Group>
                            </div>
                        </div>
                        {alertMessage && !isLoading && (
                            <div className="text-red-700 px-6 py-2 border-0 rounded relative bg-[rgb(var(--color-gray))] max-w-xl mx-auto">
                                <span className="text-xl inline-block mr-5 align-middle">
                                    <i className="fas fa-bell" />
                                </span>
                                <span className="inline-block align-middle mr-8">
                                    {alertMessage.split('\n').map((line, index) => (
                                    <div key={index}>
                                        {line}
                                    </div>
                                    ))}
                                    Imposible continuar con el registro.
                                </span>
                                <button className="absolute bg-transparent text-2xl font-semibold leading-none right-0 top-0 mt-4 mr-6 outline-none focus:outline-none"
                                    onClick={() => setAlertMessage(null)}>
                                    <span><TbCircleX/></span>
                                </button>
                            </div>
                        )}
                        <div className='flex flex-col items-center justify-center'>
                            {!isSuccessfull ? (
                            <div className="m-2 w-full md:flex md:items-center md:justify-between mx-auto">
                                <ReCAPTCHA
                                    ref={recaptchaRef}
                                    sitekey="6Lf6jHcgAAAAALChHtUKBVxS23pYaFAo9HNJG1qF"
                                    onChange={onReCAPTCHAChange}
                                />
                                <button
                                    type="submit"
                                    className={!isCaptchaValid ? 'bg-gradient-to-bl hover:bg-gradient-to-tr bg-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out cursor-not-allowed font-bold' : 'bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer font-bold'}
                                    disabled={!isCaptchaValid || isLoading}
                                >
                                    <span className='flex px-1 justify-center items-center'>
                                        <GoTasklist className="inline-block text-xl md:text-2xl mx-1.5 p-0.5 rounded-md bg-slate-50 opacity-50 shadow" />
                                        {t('account.btnCaption')}
                                    </span>
                                </button>
                            </div>
                            ) : null}
                            <p className="my-5 text-center text-sm text-[rgb(var(--color-text))]">
                                {t('account.haveAccount')}{' '}
                                <Link href={{ pathname: "/section/account", query: { load: 'log-in', lang: selectedLanguage } }} className="font-semibold leading-6 text-[rgb(var(--color-refautomex))] text-shadow">
                                    {t('account.login')}
                                </Link>
                                <p className='text-gray-400 text-xs mt-4'>
                                    {t('account.support')} <a href={`mailto:${t('footer.supportMail')}`} className="text-amber-400">{t('footer.supportMail')}</a>
                                </p>
                            </p>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
