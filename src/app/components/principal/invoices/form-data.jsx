'use client';
import React, { useState, useEffect, useRef } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import GooglePlacesAutocomplete from '@/app/components/principal/account/google-places';
import Select from 'react-select';
import { buildApiUrl } from '@/app/lib/refautomex-api';

export default function FormData({ t, formState, setFormState, account }) {
  const [isCaptchaValid, setIsCaptchaValid] = useState(false);
  const [isSuccessfull, setIsSuccessfull] = useState(false);
  const recaptchaRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [CFDIOptions, setCFDIOptions] = useState([]);
  const [RegimenOptions, setRegimenOptions] = useState([]);
  const [errorMessages, setErrorMessages] = useState({
    name: '',
    rfc: '',
    email: '',
    phone: '',
    placeId: '',
    CFDI: '',
    regime: '',
    ticket: '',
    CP: ''
  });

  // El texto siempre sale de la base; aqui solo se protege el caso de que el
  // formulario se monte sin recibir `t` por props.
  const tr = (key) => (typeof t === 'function' ? t(key) : '');

  // Helper: take only the part after the pipe
  const extractAfterPipe = (s) => {
    if (typeof s !== 'string') return '';
    const parts = s.split('|');
    return parts.length > 1 ? parts[1].trim() : s.trim();
  };

  const normalizeTicket = (value) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return '';
    if (/^(t|w)-/i.test(trimmed)) return trimmed.toUpperCase();
    return trimmed;
  };

    const validate = () => {
        const errs = {};
        const name = (formState.name || '').trim();
        const rfc = (formState.rfc || '').toUpperCase().trim();
        const email = (formState.email || '').trim();
        const phoneDigits = (formState.phone || '').replace(/\D/g, '');
        const ticket = (formState.ticket || '').trim();
        const cp = (formState.CP || '').trim();
        const placeId = (formState.placeId || '').trim();
        const idCFDI = formState.idCFDI;
        const idregimen = formState.idregimen;

        // Patterns
        const nameRe = /^[A-ZÁÉÍÓÚÑÜ\s.'-]+$/i;
        const rfcRe = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i; // RFC PM (3) or PF (4) + YYMMDD + homoclave
        const emailRe = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
        const cpRe = /^\d{5}$/;

        if (!name || !nameRe.test(name)) errs.name = tr('invoice.err.name');
        if (!rfc || !rfcRe.test(rfc)) errs.rfc = tr('invoice.err.rfc');
        if (!email || !emailRe.test(email)) errs.email = tr('invoice.err.email');
        if (phoneDigits.length !== 10) errs.phone = tr('invoice.err.phone');
        if (!placeId) errs.placeId = tr('invoice.err.placeId');
        if (!cpRe.test(cp)) errs.CP = tr('invoice.err.cp');
        if (!idCFDI) errs.CFDI = tr('invoice.err.cfdi');
        if (!idregimen) errs.regime = tr('invoice.err.regimen');
        if (!ticket) errs.ticket = tr('invoice.err.ticket');

        setErrorMessages(prev => ({ ...prev, ...errs }));

        // Highlight form-level error message if any
        if (Object.keys(errs).length > 0) {
        setErrorMessage(tr('mailbox.errorData'));
        return false;
        }
        setErrorMessage('');
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");

        // 1) Field validation
        const ok = validate();
        if (!ok) return;

        // 2) reCAPTCHA
        const recaptchaValue = recaptchaRef.current?.getValue();
        if (!recaptchaValue) {
            setErrorMessage(tr('mailbox.errorCaptcha'));
            return;
        }
        recaptchaRef.current?.reset();

        const rfcUpper = (formState.rfc || '').toUpperCase().trim();
        const phoneDigits = (formState.phone || '').replace(/\D/g, '');

        const InvoiceItem = {
            name:     (formState.name || '').trim(),
            rfc:      rfcUpper,
            email:    (formState.email || '').trim(),
            phone:    phoneDigits,
            placeId:  (formState.placeId || '').trim(),
            CFDI:    formState.idCFDI ?? null,
            regime: formState.idregimen ?? null,
            ticket:   normalizeTicket(formState.ticket),
        };

        try {
            const response = await fetch(buildApiUrl('/addInvoice'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*',
                },
                body: JSON.stringify(InvoiceItem),
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            setIsSuccessfull(true);
            setSuccessMessage(tr('invoice.addOk'));
            return response;
        } catch (error) {
            alert(tr('invoice.addError'));
            console.log(error);
            setIsSuccessfull(false);
            return null;
        }
    };

  // CFDI: save idCFDI and keep label for UI (not sent)
    const handleCFDIChange = (selectedOption) => {
        setFormState(prev => ({
        ...prev,
        idCFDI: selectedOption?.value ?? null,
        CFDI:   selectedOption?.label ?? '' // used only for display
        }));
        setErrorMessages(prev => ({ ...prev, CFDI: '' }));
    };

  // Regimen: save idregimen and ONLY the text after the pipe
    const handleRegimeChange = (selectedOption) => {
        const label = selectedOption?.label ?? '';
        setFormState(prev => ({
        ...prev,
        idregimen: selectedOption?.value ?? null,
        regime:    extractAfterPipe(label)
        }));
        setErrorMessages(prev => ({ ...prev, regime: '' }));
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        const nextValue = name === 'ticket' ? normalizeTicket(value) : value;
        setFormState(prevState => ({ ...prevState, [name]: nextValue }));
        // Clear per-field error on change
        if (errorMessages[name]) {
        setErrorMessages(prev => ({ ...prev, [name]: '' }));
        }
    };

    const setPlaceId = (placeId) => {
        setFormState(prevState => ({ ...prevState, placeId }));
        if (errorMessages.placeId) {
        setErrorMessages(prev => ({ ...prev, placeId: '' }));
        }
    };

    const setPostalCode = (postalCode) => {
        setFormState(prevState => ({ ...prevState, CP: postalCode }));
        if (errorMessages.CP) {
        setErrorMessages(prev => ({ ...prev, CP: '' }));
        }
    };

    const onReCAPTCHAChange = (token) => {
        setIsCaptchaValid(!!token);
    };

    useEffect(() => {
        const fetchCFDI = async () => {
        try {
            const response = await fetch(buildApiUrl('/getCFDI'), {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' },
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const payload = await response.json();
            const formattedCFDIOptions = (payload || []).map(cfdi => ({
            value: cfdi.idcfdi,
            label: cfdi.cfdi // e.g., "Gastos en general"
            }));
            setCFDIOptions(formattedCFDIOptions);
        } catch (error) {
            console.error('Error fetching CFDI:', error);
        }
        };

        const fetchRegimen = async () => {
        try {
            const response = await fetch(buildApiUrl('/getRegimen'), {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' },
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const payload = await response.json();
            // Label format: "{id} | {regimen}" so we can extract the regimen (after the pipe)
            const formattedRegOptions = (payload || []).map(regimen => ({
            value: regimen.idregimen,
            label: `${regimen.idregimen} | ${regimen.regimen}`
            }));
            setRegimenOptions(formattedRegOptions);
        } catch (error) {
            console.error('Error fetching Regimen:', error);
        }
        };

        fetchCFDI();
        fetchRegimen();
    }, []);

    const invalidWrapper = (hasError) => hasError ? 'ring-2 ring-red-500 rounded-md p-1' : '';

    return (
        <form onSubmit={handleSubmit} method="POST" className="mx-auto max-w-full w-full">
        <div role="alert" className="my-4 text-xl bg-zinc-200 shadow-md opacity-90 p-2 rounded-md w-full">
            {errorMessage && <p className="text-red-800 text-center">{errorMessage}</p>}
            {successMessage && <p className="text-green-800 text-center">{successMessage}</p>}
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-3">
            {/* Name */}
            <div className="sm:col-span-2">
            <label htmlFor="name" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                {t('invoice.name')}
            </label>
            <div className="mt-2.5">
                <input
                type="text"
                name="name"
                id="name"
                value={formState.name}
                onChange={handleInputChange}
                disabled={isSuccessfull}
                className={`
                    ${errorMessages.name ? "bg-red-200" : ""}
                    ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                    block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                    uppercase`}
                />
                {errorMessages.name && <p className="text-red-600 text-xs mt-1">{errorMessages.name}</p>}
            </div>
            </div>

            {/* RFC */}
            <div className="sm:col-span-2">
            <label htmlFor="rfc" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                {t('invoice.rfc')}
            </label>
            <div className="mt-2.5">
                <input
                type="text"
                name="rfc"
                id="rfc"
                value={formState.rfc}
                onChange={handleInputChange}
                disabled={isSuccessfull}
                className={`
                    ${errorMessages.rfc ? "bg-red-200" : ""}
                    ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                    block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                `}
                />
                {errorMessages.rfc && <p className="text-red-600 text-xs mt-1">{errorMessages.rfc}</p>}
            </div>
            </div>

            {/* Email */}
            <div className="sm:col-span-2">
            <label htmlFor="email" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                {t('invoice.email')}
            </label>
            <div className="mt-2.5">
                <input
                type="email"
                name="email"
                id="email"
                value={formState.email}
                onChange={handleInputChange}
                disabled={isSuccessfull}
                className={`
                    ${errorMessages.email ? "bg-red-200" : ""}
                    ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                    block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                `}
                />
                {errorMessages.email && <p className="text-red-600 text-xs mt-1">{errorMessages.email}</p>}
            </div>
            </div>

            {/* Phone */}
            <div className="sm:col-span-2">
            <label htmlFor="phone" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                {t('invoice.phone')}
            </label>
            <div className="mt-2.5">
                <input
                type="tel"
                name="phone"
                id="phone"
                value={formState.phone}
                onChange={handleInputChange}
                disabled={isSuccessfull}
                className={`
                    ${errorMessages.phone ? "bg-red-200" : ""}
                    ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                    block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                `}
                />
                {errorMessages.phone && <p className="text-red-600 text-xs mt-1">{errorMessages.phone}</p>}
            </div>
            </div>

            {/* Address (Google Places) */}
            <div className="sm:col-span-2">
            <label htmlFor="direction" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                {t('invoice.direction')}
            </label>
            <div className="mt-2.5">
                <GooglePlacesAutocomplete
                placeId={formState.placeId}
                setPlaceId={setPlaceId}
                setPostalCode={setPostalCode}
                lock={ !!account }
                />
                {errorMessages.placeId && <p className="text-red-600 text-xs mt-1">{errorMessages.placeId}</p>}
            </div>
            </div>

            {/* CP */}
            <div className="sm:col-span-2">
            <label htmlFor="PC" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                {t('invoice.PC')}
            </label>
            <div className="mt-2.5">
                <input
                type="text"
                name="CP"
                id="CP"
                value={formState.CP}
                onChange={handleInputChange}
                disabled={true}
                className={`
                    ${errorMessages.CP ? "bg-red-200" : ""}
                    ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                    bg-gray-200 block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                `}
                />
                {errorMessages.CP && <p className="text-red-600 text-xs mt-1">{errorMessages.CP}</p>}
            </div>
            </div>

            {/* CFDI */}
            <div className="sm:col-span-2 border-t-2 border-[rgb(var(--color-border))] pt-6">
            <label htmlFor="CFDI" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                {t('invoice.CFDI')}
            </label>
            <div className={`mt-2.5 ${invalidWrapper(!!errorMessages.CFDI)}`}>
                <Select
                id="CFDI"
                name="CFDI"
                value={CFDIOptions.find(o => o.value === (formState.idCFDI ?? null)) || null}
                onChange={handleCFDIChange}
                options={CFDIOptions}
                isDisabled={isSuccessfull}
                classNamePrefix="react-select"
                />
            </div>
            {errorMessages.CFDI && <p className="text-red-600 text-xs mt-1">{errorMessages.CFDI}</p>}
            </div>

            {/* Regimen */}
            <div className="sm:col-span-2">
            <label htmlFor="regimen" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                {t('invoice.regime')}
            </label>
            <div className={`mt-2.5 ${invalidWrapper(!!errorMessages.regime)}`}>
                <Select
                id="regimen"
                name="regimen"
                value={RegimenOptions.find(o => o.value === formState.idregimen) || null}
                onChange={handleRegimeChange}
                options={RegimenOptions}
                isDisabled={isSuccessfull}
                classNamePrefix="react-select"
                />
            </div>
            {errorMessages.regime && <p className="text-red-600 text-xs mt-1">{errorMessages.regime}</p>}
            </div>

            {/* Ticket */}
            <div className="sm:col-span-2">
                <label htmlFor="ticket" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                    {t('invoice.ticket')}
                </label>
                <span className='text-[rgb(var(--color-text))] opacity-80 text-xs'>{tr('invoice.ticketHint')}</span>
                <div className="mt-2.5">
                    <input
                    type="text"
                    name="ticket"
                    id="ticket"
                    value={formState.ticket}
                    onChange={handleInputChange}
                    disabled={isSuccessfull}
                    className={`
                        ${errorMessages.ticket ? "bg-red-200" : ""}
                        ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                        block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                    `}
                    />
                    {errorMessages.ticket && <p className="text-red-600 text-xs mt-1">{errorMessages.ticket}</p>}
                </div>
            </div>
        </div>

        {!isSuccessfull ? (
            <div className="mt-10 mx-auto">
            <ReCAPTCHA
                ref={recaptchaRef}
                sitekey="6Lf6jHcgAAAAALChHtUKBVxS23pYaFAo9HNJG1qF"
                onChange={onReCAPTCHAChange}
            />
            <button
                type="submit"
                className={!isCaptchaValid ? 'bg-gradient-to-bl hover:bg-gradient-to-tr bg-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out cursor-not-allowed' : 'bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer'}
                disabled={!isCaptchaValid || isSuccessfull}
            >
                {t('invoice.btnCaption')}
            </button>
            </div>
        ) : null}
        </form>
    );
}
