import React, { useEffect, useState } from 'react';
import { FaCircleCheck, FaCircleExclamation, FaFileSignature, FaPlus, FaPrint } from 'react-icons/fa6';
import Sheet, { SheetHeader } from '../stock/sheet';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';
import { amountInWords, buildPaymentReceiptHtml, formatCurrency, formatDate, printHtml, todayIso } from './print-docs';

const TITLE_ID = 'captura-poliza';
export const PAYMENT_TYPES = ['TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'EFECTIVO'];
const INPUT = 'h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 text-base focus:outline-none focus:ring-2 focus:ring-amber-400';

/**
 * Pagar facturas de un proveedor: crea la poliza (/newPolicy) con la forma de
 * pago, el banco y la referencia, y deja imprimir el comprobante. El banco se
 * elige de la lista o se agrega ahi mismo (/newBank).
 */
export default function PolicySheet({ open, invoices, providerName, banks, onBankCreated, onClose, onPaid }) {
    const { t } = useTranslation();
    const [type, setType] = useState('TRANSFERENCIA');
    const [bankId, setBankId] = useState('');
    const [newBank, setNewBank] = useState(null);
    const [reference, setReference] = useState('');
    const [date, setDate] = useState(todayIso());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [paid, setPaid] = useState(null);

    useEffect(() => {
        if (!open) return;
        setType('TRANSFERENCIA');
        setBankId('');
        setNewBank(null);
        setReference('');
        setDate(todayIso());
        setError('');
        setPaid(null);
    }, [open]);

    const total = invoices.reduce((acc, invoice) => acc + Number(invoice.total || 0), 0);
    const needsBank = type !== 'EFECTIVO';

    const addBank = async () => {
        const name = (newBank || '').trim();
        if (name.length < 2) return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch(buildApiUrl('/newBank'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ banco: name }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.details || t('panel.capture.bankError'));
            onBankCreated(data);
            setBankId(String(data.idbanco));
            setNewBank(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const handlePay = async (event) => {
        event.preventDefault();
        if (needsBank && !bankId) {
            setError(t('panel.capture.pickBank'));
            return;
        }
        setBusy(true);
        setError('');
        try {
            const response = await fetch(buildApiUrl('/newPolicy'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    compras: invoices.map((invoice) => invoice.idcompra),
                    tipo: type,
                    idbanco: needsBank ? Number(bankId) : null,
                    referencia: reference,
                    fecha: date,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.ok) throw new Error(data.details || t('panel.capture.policyError'));
            setPaid(data.poliza);
            onPaid(data.poliza);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet isOpen={open} onClose={onClose} locked={busy} labelledBy={TITLE_ID} wide>
            <SheetHeader
                icon={paid ? FaCircleCheck : FaFileSignature}
                title={paid ? t('panel.capture.policyDone', { id: paid.idpoliza }) : t('panel.capture.payTitle')}
                titleId={TITLE_ID}
                subtitle={providerName}
                onClose={onClose}
                closeDisabled={busy}
            />

            {paid ? (
                <div className="space-y-4">
                    <p className="text-sm">{t('panel.capture.policyDoneHint', { count: paid.compras.length, amount: formatCurrency(paid.importe) })}</p>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 font-semibold hover:bg-[rgb(var(--color-text))]/10">
                            {t('panel.capture.done')}
                        </button>
                        <button
                            type="button"
                            onClick={() => printHtml(buildPaymentReceiptHtml(paid, t)) || setError(t('panel.capture.printPopupBlocked'))}
                            className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow hover:bg-amber-400"
                        >
                            <FaPrint className="size-4" aria-hidden="true" />
                            {t('panel.capture.printReceipt')}
                        </button>
                    </div>
                </div>
            ) : (
                <form onSubmit={handlePay} className="space-y-4">
                    <div className="max-h-40 overflow-y-auto rounded-xl bg-[rgb(var(--color-card))] p-3">
                        <ul className="space-y-1 text-sm">
                            {invoices.map((invoice) => (
                                <li key={invoice.idcompra} className="flex justify-between gap-2">
                                    <span className="font-semibold">{invoice.num_factura}</span>
                                    <span className="text-[rgb(var(--color-gray-base))]">{formatDate(invoice.fecha_compra)}</span>
                                    <span className="ml-auto tabular-nums">{formatCurrency(invoice.total)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <p className="text-xs text-[rgb(var(--color-gray-base))]">{t('panel.capture.totalToPay')}</p>
                        <p className="text-2xl font-bold tabular-nums">{formatCurrency(total)}</p>
                        <p className="text-xs italic text-[rgb(var(--color-gray-base))]">{amountInWords(total)}</p>
                    </div>

                    <fieldset>
                        <legend className="mb-1 text-sm font-medium">{t('panel.capture.paymentType')}</legend>
                        <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-xl bg-[rgb(var(--color-card))] p-1 sm:grid-cols-4">
                            {PAYMENT_TYPES.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="radio"
                                    aria-checked={type === value}
                                    onClick={() => {
                                        setType(value);
                                        setError('');
                                    }}
                                    className={`h-10 rounded-lg text-sm font-semibold transition ${type === value ? 'bg-amber-500 text-slate-900 shadow' : 'text-[rgb(var(--color-gray-base))] hover:text-[rgb(var(--color-text))]'}`}
                                >
                                    {t(`panel.capture.pay_${value}`)}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    {needsBank && (
                        <div className="space-y-2">
                            <label className="block">
                                <span className="mb-1 block text-sm font-medium">{t('panel.capture.bank')}</span>
                                <select
                                    value={newBank === null ? bankId : '__new'}
                                    onChange={(e) => {
                                        setError('');
                                        if (e.target.value === '__new') setNewBank('');
                                        else {
                                            setNewBank(null);
                                            setBankId(e.target.value);
                                        }
                                    }}
                                    className={INPUT}
                                >
                                    <option value="">{t('panel.capture.pickBank')}</option>
                                    {banks.map((bank) => <option key={bank.idbanco} value={bank.idbanco}>{bank.banco}</option>)}
                                    <option value="__new">{t('panel.capture.otherBank')}</option>
                                </select>
                            </label>
                            {newBank !== null && (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newBank}
                                        onChange={(e) => setNewBank(e.target.value.toUpperCase())}
                                        placeholder={t('panel.capture.newBankPlaceholder')}
                                        aria-label={t('panel.capture.newBankPlaceholder')}
                                        maxLength={100}
                                        className={INPUT}
                                    />
                                    <button
                                        type="button"
                                        onClick={addBank}
                                        disabled={busy || newBank.trim().length < 2}
                                        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold hover:border-amber-400 disabled:opacity-50"
                                    >
                                        <FaPlus className="size-3" aria-hidden="true" />
                                        {t('panel.capture.addBank')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {needsBank && (
                            <label className="block">
                                <span className="mb-1 block text-sm font-medium">{t('panel.capture.reference')}</span>
                                <input
                                    type="text"
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value.toUpperCase())}
                                    placeholder={t(`panel.capture.ref_${type}`)}
                                    maxLength={60}
                                    className={`${INPUT} uppercase`}
                                />
                            </label>
                        )}
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium">{t('panel.capture.policyDate')}</span>
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={INPUT} />
                        </label>
                    </div>

                    {error && (
                        <p role="alert" className="flex items-center gap-2 rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2 text-sm text-[rgb(var(--color-error))]">
                            <FaCircleExclamation className="size-4 shrink-0" aria-hidden="true" />
                            {error}
                        </p>
                    )}

                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-xl px-4 font-semibold hover:bg-[rgb(var(--color-text))]/10">
                            {t('panel.common.cancel')}
                        </button>
                        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow hover:bg-amber-400 disabled:opacity-60">
                            {busy ? t('panel.providers.saving') : t('panel.capture.registerPayment', { amount: formatCurrency(total) })}
                        </button>
                    </div>
                </form>
            )}
        </Sheet>
    );
}
