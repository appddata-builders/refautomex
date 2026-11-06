'use client';
import React, { useState } from 'react';
import emailjs from '@emailjs/browser';
import { Switch } from '@headlessui/react';
import ReCAPTCHA from "react-google-recaptcha";
import { useTranslation } from '@/app/lib/text/text-provider';
import { GoTasklist } from "react-icons/go";
import MetaHead from '@/app/components/meta-head';

function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}

export default function Mailbox() {
    const { t } = useTranslation();
    const recaptchaRef = React.createRef();
    const [agreed, setAgreed] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isCaptchaValid, setIsCaptchaValid] = useState(false);
    const [isSuccessfull, setIsSuccessfull] = useState(false);
    const [formState, setFormState] = useState({
        name: '',
        email: '',
        message: ''
    });
    const [errorMessages, setErrorMessages] = useState({
        name: '',
        email: '',
        message: ''
    });

    const onReCAPTCHAChange = (token) => {
        if (token) {
            setIsCaptchaValid(true);
        } else {
            setIsCaptchaValid(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormState(prevState => ({ ...prevState, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");

        const regexPatterns = {
            name: /^[a-zA-ZáéíóúÁÉÍÓÚ\s]+$/,
            email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            message: /^\s*\S+.*$/,
        };

        let isValid = true;
        let newErrorMessages = {};

        for (const [key, value] of Object.entries(formState)) {
            if (!regexPatterns[key].test(value)) {
                isValid = false;
                newErrorMessages[key] = `Invalid ${key}`;
            } else {
                newErrorMessages[key] = '';
            }
        }

        if (!isValid) {
            setErrorMessages(newErrorMessages);
            setErrorMessage(t('mailbox.errorData'));
            return;
        }

        if (!agreed) {
            setErrorMessage(t('mailbox.errorPrivacy'));
            return; // Detiene la ejecución del método si el toggle no está activado
        }

        const recaptchaValue = recaptchaRef.current.getValue();
        if (!recaptchaValue) {
            setErrorMessage(t('mailbox.errorCaptcha'));
            return;
        }

        recaptchaRef.current.reset();

        // Refautomex MailJS
        emailjs.sendForm('service_8auv5hr', 'template_wk5q7bl', e.target, 'CN4xn1pjy830ZUWML')
        .then((result) => {
            setSuccessMessage(t('mailbox.sent'));
            setIsCaptchaValid(false);
            setIsSuccessfull(true);
        }, (error) => {
            setErrorMessage(t('mailbox.errorContact'));
        });   
    };

    return (
        <div className="isolate bg-[rgb(var(--color-bg))] px-6 py-24 sm:py-32 lg:px-8">
            <MetaHead title={t('mailbox.title')}/>
            <div
                className="absolute inset-x-0 top-[-10rem] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[-20rem]"
                aria-hidden="true"
            >
                <div
                className="relative left-1/2 -z-10 aspect-[1155/678] w-[36.125rem] max-w-none -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[rgb(var(--color-blue))] to-[rgb(var(--color-galaxy))] opacity-30 sm:left-[calc(50%-40rem)] sm:w-[72.1875rem]"
                style={{
                    clipPath:
                    'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
                }}
                />
            </div>
            <div className="mx-auto max-w-2xl text-center mt-10">
                <h2 className="text-3xl font-bold tracking-tight text-[rgb(var(--color-text))] sm:text-4xl">{t('mailbox.title')}</h2>
                <p className="mt-2 text-lg leading-8 text-[rgb(var(--color-text))] opacity-80">
                {t('mailbox.subtitle')}
                </p>
                <div role="alert" className="mt-4 text-xl bg-zinc-200 shadow-md opacity-90 p-2 rounded-md w-full">
                    {errorMessage && <p className="text-red-800 text-center">{errorMessage}</p>}
                    {successMessage && <p className="text-green-800 text-center">{successMessage}</p>}
                </div>
            </div>
            <form onSubmit={handleSubmit} method="POST" className="mx-auto mt-10 max-w-xl sm:mt-14">
                <div className="grid grid-cols-1 gap-x-8 gap-y-6">
                <div className="sm:col-span-2">
                    <label htmlFor="full-name" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                    {t('mailbox.name')}
                    </label>
                    <div className="mt-2.5">
                    <input type="name" name="name" id="name" value={formState.name ?? ""} onChange={handleInputChange} disabled={isSuccessfull}
                        className={`
                        ${errorMessages.name ? "bg-red-200" : ""}
                        ${isSuccessfull ? "bg-stone-400 bg-opacity-70" : ""}
                        block w-full rounded-md border-0 py-2 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-[rgb(var(--color-border))] placeholder:text-[rgb(var(--color-text))] placeholder:opacity-60 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 bg-[rgb(var(--color-bg))]
                        `}
                    />
                    </div>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="email" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                    {t('mailbox.email')}
                    </label>
                    <div className="mt-2.5">
                    <input type="email" name="email" id="email" value={formState.email ?? ""} onChange={handleInputChange} disabled={isSuccessfull}
                        className={`
                        ${errorMessages.email ? "bg-red-200" : ""}
                        ${isSuccessfull ? "bg-stone-400 bg-opacity-70" : ""}
                        block w-full rounded-md border-0 py-2 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-[rgb(var(--color-border))] placeholder:text-[rgb(var(--color-text))] placeholder:opacity-60 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 bg-[rgb(var(--color-bg))]
                        `}
                    />
                    </div>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="message" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                    {t('mailbox.message')}
                    </label>
                    <div className="mt-2.5">
                    <textarea name="message" id="messade" value={formState.message ?? ""} onChange={handleInputChange} disabled={isSuccessfull}
                        rows={4}
                        maxLength={500}
                        className={`
                        ${errorMessages.message ? "bg-red-200" : ""}
                        ${isSuccessfull ? "bg-stone-400 bg-opacity-70" : ""}
                        block w-full rounded-md border-0 py-2 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-[rgb(var(--color-border))] placeholder:text-[rgb(var(--color-text))] placeholder:opacity-60 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 bg-[rgb(var(--color-bg))]
                        `}
                    />
                    </div>
                </div>
                <Field as="div" className="flex gap-x-4 sm:col-span-2">
                    <div className="flex h-6 items-center">
                    <Switch
                        checked={agreed}
                        onChange={setAgreed}
                        disabled={isSuccessfull}
                        className={classNames(
                        agreed ? 'bg-amber-400' : 'bg-[rgb(var(--color-card))]',
                        'flex w-8 flex-none cursor-pointer rounded-full p-px ring-1 ring-inset ring-gray-900/5 transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
                        )}
                    >
                        <span
                        aria-hidden="true"
                        className={`
                        ${agreed ? 'translate-x-3.5' : 'translate-x-0'}
                        ${errorMessages.name ? "bg-red-200" : ""}
                        ${isSuccessfull ? "bg-stone-400 bg-opacity-70" : ""} 
                        h-4 w-4 transform rounded-full bg-white shadow-sm ring-1 ring-gray-900/5 transition duration-200 ease-in-out
                        `}
                        />
                    </Switch>
                    </div>
                    <Label className="text-sm leading-6 text-[rgb(var(--color-text))] font-bold">
                    {t('mailbox.agree')}
                    </Label>
                </Field>
                </div>
                {!isSuccessfull ? (
                <div className="mt-10 md:flex md:items-center md:justify-between mx-auto">
                    <ReCAPTCHA
                        ref={recaptchaRef}
                        sitekey="6Lf6jHcgAAAAALChHtUKBVxS23pYaFAo9HNJG1qF"
                        onChange={onReCAPTCHAChange}
                    />
                    <button
                        type="submit"
                        className={!isCaptchaValid ? 'bg-gradient-to-bl hover:bg-gradient-to-tr bg-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out cursor-not-allowed font-bold' : 'bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer font-bold'}
                        disabled={!isCaptchaValid}
                    >
                        <span className='flex px-1 justify-center items-center'>
                            <GoTasklist className="inline-block text-xl md:text-2xl mx-1.5 p-0.5 rounded-md bg-slate-50 bg-opacity-50 shadow" />
                            {t('mailbox.btnCaption')}
                        </span>
                    </button>
                </div>
                ) : null}
            </form>
        </div>
    )
}
