import React, { useRef, useState } from 'react';
import Title from '../title';
import { MdSell } from "react-icons/md";
import RefautomexLogo from '@/app/components/refautomex-logo';
import { useReactToPrint } from 'react-to-print';
import { useTranslation } from '@/app/lib/text/text-provider';

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const TEENS = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

const chunkToWords = (num) => {
    if (num === 0) return '';
    if (num === 100) return 'cien';
    const hundreds = Math.floor(num / 100);
    const tensUnits = num % 100;
    const tens = Math.floor(tensUnits / 10);
    const units = tensUnits % 10;

    const parts = [];
    if (hundreds > 0) parts.push(HUNDREDS[hundreds]);

    if (tensUnits > 0) {
        if (tensUnits < 10) {
            parts.push(UNITS[tensUnits]);
        } else if (tensUnits < 20) {
            parts.push(TEENS[tensUnits - 10]);
        } else if (tensUnits < 30 && units !== 0) {
            parts.push(`veinti${UNITS[units]}`);
        } else {
            const tensWord = TENS[tens];
            const unitsWord = units > 0 ? UNITS[units] : '';
            parts.push(unitsWord ? `${tensWord} y ${unitsWord}` : tensWord);
        }
    }

    return parts.join(' ');
};

const numberToWordsEs = (rawValue) => {
    const number = Number(rawValue);
    if (!Number.isFinite(number) || number < 0) return '';

    const integer = Math.floor(number);
    const cents = Math.round((number - integer) * 100);

    if (integer === 0) {
        const centsPart = String(cents).padStart(2, '0');
        return `CERO PESOS ${centsPart}/100 M.N.`;
    }

    const millions = Math.floor(integer / 1_000_000);
    const thousands = Math.floor((integer % 1_000_000) / 1000);
    const hundreds = integer % 1000;

    const parts = [];

    if (millions > 0) {
        if (millions === 1) {
            parts.push('un millón');
        } else {
            parts.push(`${chunkToWords(millions)} millones`);
        }
    }

    if (thousands > 0) {
        if (thousands === 1) {
            parts.push('mil');
        } else {
            parts.push(`${chunkToWords(thousands)} mil`);
        }
    }

    if (hundreds > 0) {
        parts.push(chunkToWords(hundreds));
    }

    const centsPart = String(cents).padStart(2, '0');
    const integerWords = parts.join(' ').trim();
    const pesoLabel = integer === 1 ? 'peso' : 'pesos';
    return `${integerWords.toUpperCase()} ${pesoLabel.toUpperCase()} ${centsPart}/100 M.N.`;
};

const DevolutionTicket = React.forwardRef(({ data }, ref) => {
    const { t } = useTranslation();
    if (!data) return null;
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const logoUrl = `${multimediaSrc}refautomex_n.svg`;
    return (
        <div
            ref={ref}
            className="bg-white p-4 pb-24 max-w-[235px] mx-auto text-sm text-gray-700 print:max-w-[250px] print:text-black"
        >
            <style>
                {`
                @media print {
                    * {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        font-smooth: always;
                    }
                    img {
                        max-width: 100%;
                        max-height: auto;
                    }
                    .print-hidden {
                        display: none !important;
                    }
                    .bg-white {
                        background-color: white !important;
                    }
                }
                `}
            </style>
            <div className="flex justify-center items-center mb-3">
                <img src={logoUrl} alt={t('alt.logo')} className="h-14" />
            </div>
            <div className="mb-2 text-center text-xs">
                <p className="font-bold text-base">{t('panel.devolution.ticketTitle')}</p>
                <p className="opacity-70">{t('panel.devolution.ticketHint')}</p>
            </div>
            <div className="space-y-1 text-xs mb-2">
                <div className="flex justify-between">
                    <span className="font-semibold">{t('panel.devolution.fieldDate')}</span>
                    <span className="font-semibold">{data.date}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-semibold">{t('panel.devolution.fieldFolio')}</span>
                    <span className="font-semibold">{data.folio}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-semibold">{t('panel.devolution.fieldAmount')}</span>
                    <span className="font-semibold">${data.amount}</span>
                </div>
                <div>
                    <span className="font-semibold block">{t('panel.devolution.fieldAmountText')}</span>
                    <span className="block">{data.amountText}</span>
                </div>
                <div>
                    <span className="font-semibold block">{t('panel.devolution.fieldConcept')}</span>
                    <span className="block break-words">{data.concept}</span>
                </div>
                {data.notes && (
                    <div>
                        <span className="font-semibold block">{t('panel.devolution.fieldReason')}</span>
                        <span className="block break-words whitespace-pre-wrap">{data.notes}</span>
                    </div>
                )}
            </div>
            <div className="mt-4 pt-3 border-t border-dashed border-gray-300 text-center text-xs">
                <div className="h-10" />
                <div className="border-t border-gray-300 w-36 mx-auto" />
                <div className="mt-1">{t('panel.devolution.received')}</div>
            </div>
            <div className="flex justify-between">
                    <span className="font-semibold">{t('panel.devolution.fieldDate')}</span>
                    <span className="font-semibold">{data.date}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-semibold">{t('panel.devolution.fieldFolio')}</span>
                    <span className="font-semibold">{data.folio}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-semibold">{t('panel.devolution.fieldAmount')}</span>
                    <span className="font-semibold">${data.amount}</span>
                </div>
                <div>
                    <span className="font-semibold block">{t('panel.devolution.fieldAmountText')}</span>
                    <span className="block">{data.amountText}</span>
                </div>
                <div>
                    <span className="font-semibold block">{t('panel.devolution.fieldConcept')}</span>
                    <span className="block break-words">{data.concept}</span>
                </div>
                {data.notes && (
                    <div>
                        <span className="font-semibold block">{t('panel.devolution.fieldReason')}</span>
                        <span className="block break-words whitespace-pre-wrap">{data.notes}</span>
                    </div>
                )}
        </div>
    );
});
DevolutionTicket.displayName = 'DevolutionTicket';

export default function Devolution() {
    const { t } = useTranslation();
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isSuccessfull, setIsSuccessfull] = useState(false);
    const [formState, setFormState] = useState({
        date: '',
        folio: '',
        amount: '',
        amountText: '',
        concept: '',
        notes: ''
    });
    const [errorMessages, setErrorMessages] = useState({
        date: '',
        folio: '',
        amount: '',
        concept: '',
        notes: ''
    });
    const [ticketData, setTicketData] = useState(null);
    const printRef = useRef(null);
    const isPrintingRef = useRef(false);
    const pageStyle = `
        @page { margin: 0; }
        body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            display: flex;
            justify-content: center;
            align-items: flex-start;
        }
    `;
    const handlePrint = useReactToPrint({
        contentRef: printRef,
        pageStyle,
    });

    const toUpperSafe = (value = '') => (typeof value === 'string' ? value.toUpperCase() : '');

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (name === 'amount') {
            const sanitized = value.replace(/[^0-9.,]/g, '').replace(',', '.');
            const amount = sanitized;
            const words = numberToWordsEs(amount);
            setFormState(prevState => ({ ...prevState, amount, amountText: words }));
            return;
        }
        if (name === 'folio' || name === 'concept' || name === 'notes') {
            setFormState(prevState => ({ ...prevState, [name]: toUpperSafe(value) }));
            return;
        }
        setFormState(prevState => ({ ...prevState, [name]: value }));
    };

    const handlePrintClick = () => {
        if (!ticketData || isPrintingRef.current) return;
        isPrintingRef.current = true;
        const result = handlePrint?.();
        if (result && typeof result.then === 'function') {
            result.finally(() => {
                isPrintingRef.current = false;
            });
        } else {
            setTimeout(() => {
                isPrintingRef.current = false;
            }, 300);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');

        const newErrors = {
            date: formState.date ? '' : t('panel.common.required'),
            folio: formState.folio ? '' : t('panel.common.required'),
            amount: formState.amount ? '' : t('panel.common.required'),
            concept: formState.concept ? '' : t('panel.common.required'),
            notes: '',
        };

        const hasErrors = Object.values(newErrors).some(Boolean);
        setErrorMessages(newErrors);
        if (hasErrors) {
            setErrorMessage(t('panel.devolution.requiredFields'));
            return;
        }

        const amountText = formState.amountText || numberToWordsEs(formState.amount);
        const data = {
            date: formState.date,
            folio: toUpperSafe(formState.folio),
            amount: Number(formState.amount || 0).toFixed(2),
            amountText,
            concept: toUpperSafe(formState.concept),
            notes: toUpperSafe(formState.notes),
        };

        setTicketData(data);
        setSuccessMessage(t('panel.devolution.ticketReady'));
        setIsSuccessfull(true);
    };

    return (
        <div className="isolate bg-[rgb(var(--color-bg))] px-6 py-24 sm:py-32 lg:px-8">
            <Title 
            title={t('panel.devolution.title')}
            icon={MdSell}
            back={t('panel.common.back')}
            path='/productivity'
            />
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
                <RefautomexLogo classAttr={'mx-auto'}/>
                <p className="mt-2 text-lg leading-8 text-[rgb(var(--color-text))] opacity-80">
                Introduce los datos de la devolución para generar e imprimir el ticket.
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
                    {t('panel.devolution.date')}
                    </label>
                    <div className="mt-2.5">
                    <input type="date" name="date" id="date" value={formState.date ?? ""} onChange={handleInputChange} disabled={isSuccessfull}
                        className={`
                        ${errorMessages.date ? "bg-red-200" : ""}
                        ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                        block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                        `}
                    />
                    </div>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="full-name" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                    {t('panel.devolution.folio')}
                    </label>
                    <div className="mt-2.5">
                    <input type="text" name="folio" id="folio" value={formState.folio ?? ""} onChange={handleInputChange} disabled={isSuccessfull}
                        className={`
                        ${errorMessages.folio ? "bg-red-200" : ""}
                        ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                        block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                        `}
                    />
                    </div>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="full-name" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                    {t('panel.devolution.amount')}
                    </label>
                    <div className="mt-2.5">
                    <input type="text" name="amount" id="amount" value={formState.amount ?? ""} onChange={handleInputChange} disabled={isSuccessfull}
                        className={`
                        ${errorMessages.amount ? "bg-red-200" : ""}
                        ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                        block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                        `}
                    />
                    </div>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="full-name" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                    {t('panel.devolution.amountText')}
                    </label>
                    <div className="mt-2.5">
                    <input type="text" name="amountText" id="amountText" disabled value={formState.amountText ?? ""} onChange={handleInputChange} 
                        className={`
                        ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                        block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                        `}
                    />
                    </div>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="email" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                        {t('panel.devolution.concept')}
                    </label>
                    <div className="mt-2.5">
                    <select
                        name="concept"
                        id="concept"
                        value={formState.concept ?? ""}
                        onChange={handleInputChange}
                        disabled={isSuccessfull}
                        className={`
                        ${errorMessages.concept ? "bg-red-200" : ""}
                        ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                        block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                        `}
                    >
                        <option value="" disabled>{t('panel.devolution.pickConcept')}</option>
                        <option value="DEVOLUCION DE MERCANCIA.">{t('panel.devolution.conceptGoods')}</option>
                        <option value="DEVOLUCION DE EFECTIVO.">{t('panel.devolution.conceptCash')}</option>
                        <option value="DEVOLUCION DE EFECTIVO O MERCANCIA.">{t('panel.devolution.conceptBoth')}</option>
                    </select>
                    </div>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="message" className="block text-sm font-semibold leading-6 text-[rgb(var(--color-text))]">
                    {t('panel.devolution.reason')}
                    </label>
                    <div className="mt-2.5">
                    <textarea name="notes" id="notes" value={formState.notes ?? ""} onChange={handleInputChange} disabled={isSuccessfull}
                        rows={4}
                        maxLength={500}
                        className={`
                        ${errorMessages.notes ? "bg-red-200" : ""}
                        ${isSuccessfull ? "bg-stone-400 opacity-70" : ""}
                        block w-full rounded-md border-0 py-2 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6
                        `}
                    />
                    </div>
                </div>
                </div>
                {!isSuccessfull ? (
                    <div className="mt-10 md:flex md:items-center md:justify-between mx-auto">
                        <button
                            type="submit"
                            className='bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer'
                        >
                            {t('panel.devolution.generate')}
                        </button>
                    </div>
                ) : null}
            </form>
            {ticketData && (
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <button
                        type="button"
                        onClick={handlePrintClick}
                        className="bg-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))] px-4 py-2 rounded-full shadow hover:shadow-lg transition"
                    >
                        {t('panel.devolution.print')}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setIsSuccessfull(false);
                            setTicketData(null);
                        }}
                        className="bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))] px-4 py-2 rounded-full shadow hover:border-[rgb(var(--color-amber))]"
                    >
                        {t('panel.devolution.editData')}
                    </button>
                </div>
            )}
            {ticketData && (
                <div className="hidden">
                    <DevolutionTicket ref={printRef} data={ticketData} />
                </div>
            )}
        </div>
    )
}
