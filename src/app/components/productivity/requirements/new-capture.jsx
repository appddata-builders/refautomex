import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaChevronLeft, FaCircleCheck, FaCircleExclamation, FaFileCircleCheck, FaPercent, FaRightFromBracket } from 'react-icons/fa6';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';
import FindProducts from '../sales/find-products';
import Sheet, { SheetHeader } from '../stock/sheet';
import TableCapture from './table-capture';
import { formatCurrency, formatDate, todayIso } from './print-docs';

const INPUT = 'h-11 w-full rounded-xl border bg-[rgb(var(--color-bg))] px-3 text-base text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-amber-400';
const LEAVE_TITLE_ID = 'captura-salir';

const addDays = (iso, days) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d + Number(days || 0));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Un renglon de la tabla a partir de lo que guardo una captura: el costo de
// lista es neto / cantidad y los descuentos se vuelven a aplicar sobre el.
const itemFromRecord = (record) => {
    const qty = Number(record.cantidad_solicitada) || 1;
    const listCost = Number(record.neto) / qty || Number(record.costo_actual) || 0;
    return {
        refaccion: record.num_parte,
        descripcion: record.descripcion || '',
        existencia: Number(record.existencia ?? 0),
        cantidad: qty,
        costo: listCost,
        costoBase: listCost,
        utilidad: Number(record.utilidad) || undefined,
        locked: false,
    };
};

const discountsFromRecords = (records = []) => records.reduce((acc, record) => {
    const values = [record.descuento_uno, record.descuento_dos, record.descuento_tres]
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0 && value < 1);
    if (values.length) acc[record.num_parte] = values;
    return acc;
}, {});

/**
 * Captura de una factura de proveedor: proveedor, sucursal que recibe, numero
 * y fecha, y las refacciones con su cantidad, costo y descuentos (TableCapture).
 * Al guardar, la existencia se suma en esa sucursal y el costo nuevo pone el
 * precio en todas (ver api/refautomex/[...path]/compras.js).
 *
 * Llega vacia, con una captura a editar (`captureToEdit`) o con el pedido de un
 * proveedor desde Faltantes (`prefill`).
 */
export default function NewCapture({ onCancelEdit, captureToEdit = null, prefill = null, branches = [], defaultBranchId }) {
    const { t } = useTranslation();
    const tableRef = useRef();
    const editing = Boolean(captureToEdit?.header);
    const [providers, setProviders] = useState([]);
    const [providerId, setProviderId] = useState('');
    const [branchId, setBranchId] = useState('');
    const [invoice, setInvoice] = useState('');
    const [date, setDate] = useState(todayIso());
    const [items, setItems] = useState([]);
    const [defaultDiscounts, setDefaultDiscounts] = useState({});
    const [generalDiscount, setGeneralDiscount] = useState('');
    const [errors, setErrors] = useState({});
    const [message, setMessage] = useState({ ok: '', error: '' });
    const [submitting, setSubmitting] = useState(false);
    const [created, setCreated] = useState(null);
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        fetch(buildApiUrl('/getProviders'), { cache: 'no-store' })
            .then((response) => response.json())
            .then((rows) => setProviders((Array.isArray(rows) ? rows : []).filter((p) => p.empresa !== 'NINGUNO')))
            .catch(() => setProviders([]));
    }, []);

    // Lo que trae la captura a editar o el pedido de Faltantes.
    useEffect(() => {
        if (editing) {
            const { header, detail = [] } = captureToEdit;
            setProviderId(String(header.idproveedor ?? ''));
            setBranchId(String(header.idsucursal ?? ''));
            setInvoice(header.num_factura ?? '');
            setDate(String(header.fecha_compra ?? todayIso()).slice(0, 10));
            setItems(detail.map(itemFromRecord));
            setDefaultDiscounts(discountsFromRecords(detail));
        } else if (prefill) {
            setProviderId(String(prefill.idproveedor ?? ''));
            setBranchId(String(prefill.idsucursal ?? ''));
            setItems((prefill.items || []).map((item) => ({
                refaccion: item.num_parte,
                descripcion: item.descripcion,
                existencia: Number(item.existencia) || 0,
                cantidad: Number(item.cantidad) || 1,
                costo: Number(item.costo) || 0,
                costoBase: Number(item.costo) || 0,
                locked: false,
            })));
        }
    }, [editing, captureToEdit, prefill]);

    useEffect(() => {
        if (!branchId && defaultBranchId) setBranchId(String(defaultBranchId));
    }, [branchId, defaultBranchId]);

    const provider = providers.find((p) => String(p.idproveedor) === providerId);
    const branch = branches.find((b) => String(b.idsucursal) === branchId);
    const suggested = Number(provider?.descuento) || 0;
    const dueDate = provider ? addDays(date, provider.plazo_dias) : null;
    const findBranch = useMemo(() => (branch ? { id: branch.idsucursal, label: branch.sucursal } : undefined), [branch]);

    const handleAddProduct = (product) => {
        setItems((prev) => (prev.some((item) => item.refaccion === product.refaccion)
            ? prev.filter((item) => item.refaccion !== product.refaccion)
            : [...prev, {
                ...product,
                cantidad: 1,
                costo: Number(product.costo ?? 0),
                costoBase: Number(product.costo ?? 0),
                locked: false,
            }]));
    };

    const handleRemoveProduct = (part) => setItems((prev) => prev.filter((item) => item.refaccion !== part));

    const applyDiscount = (fraction) => {
        setMessage({ ok: '', error: '' });
        if (!items.length) {
            setMessage({ ok: '', error: t('panel.newCapture.needPartsForDiscount') });
            return;
        }
        if (!(fraction > 0 && fraction < 1)) {
            setMessage({ ok: '', error: t('panel.newCapture.discountRangePercent') });
            return;
        }
        tableRef.current?.handleDiscountRow(null, fraction, { isGeneral: true });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        const nextErrors = {};
        if (!providerId) nextErrors.provider = t('panel.newCapture.providerRequired');
        if (!branchId) nextErrors.branch = t('panel.newCapture.branchRequired');
        if (!invoice.trim()) nextErrors.invoice = t('panel.newCapture.invoiceRequired');
        if (!date) nextErrors.date = t('panel.newCapture.dateRequired');
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) {
            setMessage({ ok: '', error: t('panel.newCapture.fillRequired') });
            return;
        }
        if (!items.length) {
            setMessage({ ok: '', error: t('panel.newCapture.needParts') });
            return;
        }
        const summary = tableRef.current?.collectCapturePayload();
        if (!summary || summary.errors.length) {
            setMessage({ ok: '', error: summary?.errors.join(' ') || t('panel.newCapture.detailError') });
            return;
        }

        setSubmitting(true);
        setMessage({ ok: '', error: '' });
        try {
            const response = await fetch(buildApiUrl(editing ? '/patchCapture' : '/newCapture'), {
                method: editing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idCompra: editing ? captureToEdit.header.idcompra : undefined,
                    idProveedor: Number(providerId),
                    idSucursal: Number(branchId),
                    numFactura: invoice.trim().toUpperCase(),
                    fechaCompra: date,
                    detalle: summary.detail,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.success === false) throw new Error(payload.details || payload.message || t('panel.newCapture.saveError'));
            if (editing) {
                onCancelEdit?.();
                return;
            }
            setCreated({ invoice: invoice.trim().toUpperCase(), total: payload.data?.total, due: dueDate });
            setItems([]);
            setInvoice('');
            setGeneralDiscount('');
            setDefaultDiscounts({});
        } catch (error) {
            setMessage({ ok: '', error: error.message });
        } finally {
            setSubmitting(false);
        }
    };

    const leave = () => (items.length && !created ? setLeaving(true) : onCancelEdit?.());

    const fieldClass = (key) => `${INPUT} ${errors[key] ? 'border-[rgb(var(--color-error))]' : 'border-[rgb(var(--color-border))]'}`;

    return (
        <form onSubmit={handleSubmit} className="space-y-4 px-2 py-6 sm:px-4 2xl:px-10" noValidate>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-4">
                <button type="button" onClick={leave} className="inline-flex h-10 items-center gap-2 rounded-full bg-[rgb(var(--color-bg))] px-4 text-sm font-semibold shadow-sm hover:bg-amber-400/25">
                    <FaChevronLeft className="size-3" aria-hidden="true" />
                    {t('panel.common.goBack')}
                </button>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold">{editing ? t('panel.newCapture.editTitle', { invoice: captureToEdit.header.num_factura }) : t('panel.newCapture.title')}</h2>
                    <p className="text-sm text-[rgb(var(--color-gray-base))]">{prefill && !editing ? t('panel.newCapture.fromMissing') : t('panel.newCapture.subtitle')}</p>
                </div>
                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow hover:bg-amber-400 disabled:opacity-60"
                >
                    <FaFileCircleCheck className="size-4" aria-hidden="true" />
                    {submitting ? t('panel.newCapture.saving') : editing ? t('panel.newCapture.update') : t('panel.newCapture.capture')}
                </button>
            </div>

            {created && (
                <div role="status" className="flex flex-col gap-3 rounded-2xl bg-emerald-500/15 p-4 sm:flex-row sm:items-center">
                    <FaCircleCheck className="size-6 shrink-0 text-[rgb(var(--color-success))]" aria-hidden="true" />
                    <p className="min-w-0 flex-1">
                        <strong>{t('panel.newCapture.createdTitle', { invoice: created.invoice, amount: formatCurrency(created.total) })}</strong>
                        <span className="block text-sm text-[rgb(var(--color-gray-base))]">{t('panel.newCapture.createdHint', { date: formatDate(created.due) })}</span>
                    </p>
                    <button type="button" onClick={() => onCancelEdit?.()} className="h-11 rounded-xl bg-amber-500 px-4 font-semibold text-slate-900 shadow hover:bg-amber-400">
                        {t('panel.newCapture.toPayables')}
                    </button>
                </div>
            )}
            {message.error && (
                <p role="alert" className="flex items-center gap-2 rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2 text-sm text-[rgb(var(--color-error))]">
                    <FaCircleExclamation className="size-4 shrink-0" aria-hidden="true" />
                    {message.error}
                </p>
            )}

            <div className="grid grid-cols-1 gap-3 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t('panel.capture.provider')}</span>
                    <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className={fieldClass('provider')}>
                        <option value="">{t('panel.newCapture.selectProvider')}</option>
                        {providers.map((p) => <option key={p.idproveedor} value={p.idproveedor}>{p.empresa}</option>)}
                    </select>
                    {errors.provider && <span className="mt-1 block text-sm text-[rgb(var(--color-error))]">{errors.provider}</span>}
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t('panel.newCapture.receivingBranch')}</span>
                    <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={fieldClass('branch')}>
                        <option value="">{t('panel.common.pickBranch')}</option>
                        {branches.map((b) => <option key={b.idsucursal} value={b.idsucursal}>{b.sucursal}</option>)}
                    </select>
                    {errors.branch && <span className="mt-1 block text-sm text-[rgb(var(--color-error))]">{errors.branch}</span>}
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t('panel.newCapture.invoiceNumber')}</span>
                    <input type="text" value={invoice} onChange={(e) => setInvoice(e.target.value.toUpperCase())} placeholder={t('panel.newCapture.invoiceId')} className={`${fieldClass('invoice')} uppercase`} />
                    {errors.invoice && <span className="mt-1 block text-sm text-[rgb(var(--color-error))]">{errors.invoice}</span>}
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t('panel.capture.purchaseDate')}</span>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass('date')} />
                    {dueDate && <span className="mt-1 block text-xs text-[rgb(var(--color-gray-base))]">{t('panel.newCapture.dueHint', { days: provider.plazo_dias, date: formatDate(dueDate) })}</span>}
                </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-4">
                <FaPercent className="size-4 text-amber-500" aria-hidden="true" />
                <p className="mr-auto text-sm font-semibold">{t('panel.newCapture.applyDiscounts')}</p>
                {suggested > 0 && (
                    <button type="button" onClick={() => applyDiscount(suggested)} className="h-10 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold hover:border-amber-400">
                        {t('panel.newCapture.applySuggested', { percent: Math.round(suggested * 10000) / 100 })}
                    </button>
                )}
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="99.99"
                        step="0.01"
                        value={generalDiscount}
                        onChange={(e) => setGeneralDiscount(e.target.value)}
                        placeholder="%"
                        aria-label={t('panel.newCapture.generalDiscount')}
                        className="h-10 w-24 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button type="button" onClick={() => applyDiscount(Number(generalDiscount) / 100)} className="h-10 rounded-xl bg-[rgb(var(--color-bg))] px-3 text-sm font-semibold shadow-sm hover:bg-amber-400/25">
                        {t('panel.newCapture.applyToAll')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="min-w-0 overflow-hidden rounded-2xl bg-[rgb(var(--color-card))] pt-2 shadow">
                    {branch && (
                        <FindProducts
                            key={branch.idsucursal}
                            branch={findBranch}
                            onAddProduct={handleAddProduct}
                            onRemoveProduct={handleRemoveProduct}
                            addedItems={items}
                            isCapture
                            includePendingProducts={false}
                            includeWebBranch={false}
                            allowedSearchTypes={['Descripcion', 'Parte', 'Localizacion']}
                        />
                    )}
                    <p className="p-3 text-xs text-[rgb(var(--color-gray-base))]">
                        {t('panel.newCapture.notInCatalog')}{' '}
                        <a href="/productivity?load=inventories" className="font-semibold text-amber-600 underline">{t('panel.newCapture.goInventories')}</a>
                    </p>
                </div>
                <div className="min-w-0 xl:col-span-2">
                    <TableCapture ref={tableRef} items={items} onRemoveProduct={handleRemoveProduct} defaultDiscounts={defaultDiscounts} />
                </div>
            </div>

            <Sheet isOpen={leaving} onClose={() => setLeaving(false)} labelledBy={LEAVE_TITLE_ID}>
                <SheetHeader
                    icon={FaRightFromBracket}
                    title={t('panel.newCapture.confirmCancel')}
                    titleId={LEAVE_TITLE_ID}
                    subtitle={t('panel.newCapture.confirmCancelHint')}
                    onClose={() => setLeaving(false)}
                />
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setLeaving(false)} className="h-11 rounded-xl px-4 font-semibold hover:bg-[rgb(var(--color-text))]/10">{t('panel.newCapture.keepEditing')}</button>
                    <button type="button" onClick={() => onCancelEdit?.()} className="h-11 rounded-xl bg-red-600 px-5 font-semibold text-white shadow hover:bg-red-500">{t('panel.newCapture.discard')}</button>
                </div>
            </Sheet>
        </form>
    );
}
