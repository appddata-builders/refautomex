import React, { useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { HiClipboardDocumentList } from 'react-icons/hi2';
import {
    FaBox,
    FaCircleCheck,
    FaCircleExclamation,
    FaClockRotateLeft,
    FaFileSignature,
    FaMagnifyingGlass,
    FaPlus,
    FaPrint,
    FaReceipt,
    FaTrashCan,
} from 'react-icons/fa6';
import Title from '../title';
import PopPortal from '@/app/lib/pop-portal';
import Sheet, { SheetHeader } from '../stock/sheet';
import { AuthContext } from '@/app/lib/auth-tracker';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';
import { highlightText } from '../sales/find-products';
import NewCapture from './new-capture';
import CaptureDetail from './capture-detail';
import PolicySheet from './policy-sheet';
import { CAPTURE_HANDOFF_KEY } from './reorder-model';
import { buildPaymentReceiptHtml, buildReviewHtml, formatCurrency, formatDate, printHtml, todayIso } from './print-docs';

const TOAST_MS = 6000;
const HISTORY_PAGE = 30;
const DELETE_TITLE_ID = 'captura-eliminar';
const CANCEL_TITLE_ID = 'captura-cancelar-poliza';

const isWeb = (branch) => Number(branch.idsucursal) === 1 || String(branch.sucursal || '').trim().toUpperCase() === 'WEB';

const getJson = async (path) => {
    const response = await fetch(buildApiUrl(path), { cache: 'no-store', headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.details || data?.message || `Error ${response.status}`);
    return data;
};

// El numero de poliza en lo que se busca: "1328", "P-1328", "#1328" o "POLIZA 1328".
const policyNumber = (term) => {
    const match = /^(?:P[OÓ]LIZA\s*|P-?\s*|#\s*)?(\d+)$/.exec(term);
    return match ? Number(match[1]) : null;
};

// Dias de hoy a la fecha de pago: negativo es vencida.
const daysUntil = (iso) => {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const [ty, tm, td] = todayIso().split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
};

function DueBadge({ date }) {
    const { t } = useTranslation();
    const days = daysUntil(date);
    if (days === null) return null;
    const [key, className] = days < 0
        ? ['overdue', 'bg-[rgb(var(--color-error))]/12']
        : days <= 7
            ? (days === 0 ? ['dueToday', 'bg-orange-500/15'] : ['dueSoon', 'bg-amber-400/20'])
            : ['dueLater', 'bg-[rgb(var(--color-gray))]'];
    return (
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
            {t(`panel.capture.${key}`, { count: Math.abs(days) })}
        </span>
    );
}

function Kpi({ label, value, hint, tone = '' }) {
    return (
        <div className="min-w-0 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow-sm sm:p-4">
            <span className="block truncate text-xs font-medium text-[rgb(var(--color-gray-base))]">{label}</span>
            <span className={`block truncate text-xl font-bold tabular-nums sm:text-2xl ${tone}`}>{value}</span>
            <span className="block truncate text-xs text-[rgb(var(--color-gray-base))]">{hint}</span>
        </div>
    );
}

// Lo de alrededor de un valor dentro de un texto traducido ("Póliza {{id}}"),
// para resaltar solo el valor.
const around = (text) => text.split('\u0000');

function PolicyCard({ policy, onPrint, onCancel, highlighted = false, term = '' }) {
    const { t } = useTranslation();
    const via = policy.tipo === 'EFECTIVO'
        ? t('panel.capture.pay_EFECTIVO')
        : [t(`panel.capture.pay_${policy.tipo}`), policy.banco, policy.referencia].filter(Boolean).join(' · ');
    const [policyBefore, policyAfter] = around(t('panel.capture.policyShort', { id: '\u0000' }));
    const [listBefore, listAfter] = around(t('panel.capture.invoicesList', { count: policy.compras.length, list: '\u0000' }));
    return (
        <li className={`flex flex-col gap-3 rounded-2xl bg-[rgb(var(--color-bg))] p-3 sm:flex-row sm:items-center sm:p-4 ${highlighted ? 'ring-2 ring-amber-400' : ''}`}>
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold">{policyBefore}{highlightText(String(policy.idpoliza), term)}{policyAfter}</span>
                    <span className="font-semibold">{highlightText(policy.empresa || '—', term)}</span>
                    <span className="text-sm text-[rgb(var(--color-gray-base))]">{formatDate(policy.fecha_poliza)}</span>
                </p>
                <p className="truncate text-sm text-[rgb(var(--color-gray-base))]">{highlightText(via, term)}</p>
                <p className="truncate text-xs text-[rgb(var(--color-gray-base))]">
                    {listBefore}{highlightText(policy.compras.map((c) => c.num_factura).join(', '), term)}{listAfter}
                </p>
            </div>
            <span className="text-lg font-bold tabular-nums">{formatCurrency(policy.importe)}</span>
            <div className="flex gap-2">
                <button type="button" onClick={() => onPrint(policy)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold hover:border-amber-400">
                    <FaPrint className="size-3.5" aria-hidden="true" />
                    {t('panel.capture.receiptShort')}
                </button>
                {onCancel && (
                    <button type="button" onClick={() => onCancel(policy)} className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-semibold text-[rgb(var(--color-error))] hover:bg-[rgb(var(--color-error))]/10">
                        {t('panel.capture.cancelPolicy')}
                    </button>
                )}
            </div>
        </li>
    );
}

/**
 * Captura: las facturas de proveedor por pagar y su pago.
 *
 * Por pagar: las compras pendientes por proveedor, con su vencimiento (fecha
 * de compra + plazo del proveedor). Se eligen facturas para imprimir el contra
 * recibo o pagarlas con una poliza (de un solo proveedor). Polizas: las
 * pagadas, con su comprobante; cancelar una regresa sus facturas a por pagar.
 * Historial: las polizas del sistema anterior (2020-2024), solo para consulta.
 *
 * Una captura nueva puede llegar armada desde Faltantes (sessionStorage).
 */
export default function Capture() {
    const { t } = useTranslation();
    const { userData } = useContext(AuthContext);
    const [pending, setPending] = useState([]);
    const [policies, setPolicies] = useState([]);
    const [history, setHistory] = useState(null);
    const [banks, setBanks] = useState([]);
    const [branches, setBranches] = useState([]);
    const [providers, setProviders] = useState([]);
    const [load, setLoad] = useState({ status: 'loading', message: '' });
    const [tab, setTab] = useState('pending');
    const [providerFilter, setProviderFilter] = useState('');
    const [term, setTerm] = useState('');
    const searchTerm = useDeferredValue(term.trim().toUpperCase());
    const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
    const [selected, setSelected] = useState(() => new Set());
    const [view, setView] = useState({ type: 'list' });
    const [paying, setPaying] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const [toCancel, setToCancel] = useState(null);
    const [busy, setBusy] = useState(false);
    const [sheetError, setSheetError] = useState('');
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

    const notify = useCallback((message, error = false) => {
        clearTimeout(toastTimer.current);
        setToast({ message, error });
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
    }, []);

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    const loadInvoices = useCallback(async () => {
        setLoad((prev) => ({ ...prev, status: 'loading' }));
        try {
            const [pendientes, polizas] = await getJson('/getInvoicesCaptured');
            setPending(Array.isArray(pendientes) ? pendientes : []);
            setPolicies(Array.isArray(polizas) ? polizas : []);
            setSelected((prev) => new Set([...prev].filter((id) => pendientes.some((p) => p.idcompra === id))));
            setLoad({ status: 'ready', message: '' });
        } catch (error) {
            setLoad({ status: 'error', message: error.message });
        }
    }, []);

    useEffect(() => {
        loadInvoices();
        getJson('/getBanks').then(setBanks).catch(() => setBanks([]));
        getJson('/getSucursal').then((rows) => setBranches(rows.filter((b) => !isWeb(b)))).catch(() => setBranches([]));
        getJson('/getAllProviders').then((rows) => setProviders(rows.filter((p) => p.empresa !== 'NINGUNO'))).catch(() => setProviders([]));
        try {
            const handoff = sessionStorage.getItem(CAPTURE_HANDOFF_KEY);
            if (handoff) {
                sessionStorage.removeItem(CAPTURE_HANDOFF_KEY);
                setView({ type: 'new', prefill: JSON.parse(handoff) });
            }
        } catch {
            // Sin almacenamiento no hay pedido que traer.
        }
    }, [loadInvoices]);

    useEffect(() => {
        if (tab !== 'history' || history) return;
        getJson('/getPolicyHistory').then(setHistory).catch(() => setHistory([]));
    }, [tab, history]);

    const matches = (values) => !searchTerm || values.some((v) => String(v ?? '').toUpperCase().includes(searchTerm));

    const groups = useMemo(() => {
        const map = new Map();
        pending
            .filter((invoice) => !providerFilter || String(invoice.idproveedor) === providerFilter)
            .filter((invoice) => matches([invoice.num_factura, invoice.empresa, invoice.sucursal]))
            .forEach((invoice) => {
                if (!map.has(invoice.idproveedor)) map.set(invoice.idproveedor, { id: invoice.idproveedor, name: invoice.empresa, invoices: [], total: 0, overdue: 0 });
                const group = map.get(invoice.idproveedor);
                group.invoices.push(invoice);
                group.total += Number(invoice.total);
                if (daysUntil(invoice.fecha_pago) < 0) group.overdue += 1;
            });
        return [...map.values()].sort((a, b) => b.overdue - a.overdue || b.total - a.total);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pending, providerFilter, searchTerm]);

    // Una poliza se busca por su numero, sus facturas, el proveedor, el banco o
    // la referencia. Si lo buscado es un numero de poliza, esa va primero: un
    // "1328" tambien aparece dentro de folios de factura.
    const wantedPolicy = policyNumber(searchTerm);
    // Lo que se resalta: el numero de poliza si se busco asi ("P-1328" -> 1328).
    const highlightTerm = wantedPolicy === null ? searchTerm : String(wantedPolicy);
    const filterPolicies = (list) => {
        const rows = (list || [])
            .filter((p) => !providerFilter || String(p.idproveedor) === providerFilter)
            .filter((p) => p.idpoliza === wantedPolicy
                || matches([p.idpoliza, p.empresa, t(`panel.capture.pay_${p.tipo}`), p.banco, p.referencia, ...p.compras.map((c) => c.num_factura)]));
        return wantedPolicy === null ? rows : [...rows].sort((a, b) => (b.idpoliza === wantedPolicy) - (a.idpoliza === wantedPolicy));
    };
    const visiblePolicies = useMemo(() => filterPolicies(policies), [policies, providerFilter, searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps
    const visibleHistory = useMemo(() => filterPolicies(history), [history, providerFilter, searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

    const kpis = useMemo(() => {
        const sum = (list) => list.reduce((acc, i) => acc + Number(i.total), 0);
        const overdue = pending.filter((i) => daysUntil(i.fecha_pago) < 0);
        const week = pending.filter((i) => {
            const d = daysUntil(i.fecha_pago);
            return d !== null && d >= 0 && d <= 7;
        });
        const month = todayIso().slice(0, 7);
        const paidMonth = policies.filter((p) => String(p.fecha_poliza).startsWith(month));
        return {
            pending: { amount: sum(pending), count: pending.length },
            overdue: { amount: sum(overdue), count: overdue.length },
            week: { amount: sum(week), count: week.length },
            paid: { amount: paidMonth.reduce((acc, p) => acc + Number(p.importe), 0), count: paidMonth.length },
        };
    }, [pending, policies]);

    const selectedInvoices = pending.filter((invoice) => selected.has(invoice.idcompra));
    const selectedProviders = new Set(selectedInvoices.map((invoice) => invoice.idproveedor));
    const selectedTotal = selectedInvoices.reduce((acc, invoice) => acc + Number(invoice.total), 0);

    const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const toggleGroup = (group) => setSelected((prev) => {
        const ids = group.invoices.map((invoice) => invoice.idcompra);
        const all = ids.every((id) => prev.has(id));
        const next = new Set(prev);
        ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
        return next;
    });

    const payGroup = (group) => {
        setSelected(new Set(group.invoices.map((invoice) => invoice.idcompra)));
        setPaying(true);
    };

    const printReview = () => {
        const byProvider = new Map();
        selectedInvoices.forEach((invoice) => {
            if (!byProvider.has(invoice.idproveedor)) byProvider.set(invoice.idproveedor, { name: invoice.empresa, invoices: [], total: 0 });
            const group = byProvider.get(invoice.idproveedor);
            group.invoices.push(invoice);
            group.total += Number(invoice.total);
        });
        if (!printHtml(buildReviewHtml([...byProvider.values()], t))) notify(t('panel.capture.printPopupBlocked'), true);
    };

    const printReceipt = (policy) => {
        if (!printHtml(buildPaymentReceiptHtml(policy, t))) notify(t('panel.capture.printPopupBlocked'), true);
    };

    const openDetail = async (idcompra) => {
        setView({ type: 'loading' });
        try {
            const data = await getJson(`/getCaptureWithDetails?id=${idcompra}`);
            setView({ type: 'detail', data });
        } catch (error) {
            setView({ type: 'list' });
            notify(error.message, true);
        }
    };

    const confirmDelete = async () => {
        setBusy(true);
        setSheetError('');
        try {
            const response = await fetch(buildApiUrl('/deleteCapture'), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: toDelete.idcompra }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.success === false) throw new Error(payload.message || t('panel.capture.deleteError'));
            setToDelete(null);
            setView({ type: 'list' });
            notify(payload.sinSucursal ? t('panel.capture.deleteOkNoStock') : t('panel.capture.deleteOk'));
            loadInvoices();
        } catch (error) {
            setSheetError(error.message);
        } finally {
            setBusy(false);
        }
    };

    const confirmCancel = async () => {
        setBusy(true);
        setSheetError('');
        try {
            const response = await fetch(buildApiUrl('/deletePolicy'), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idpoliza: toCancel.idpoliza }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.details || t('panel.capture.cancelError'));
            setToCancel(null);
            notify(t('panel.capture.cancelOk', { id: toCancel.idpoliza, count: payload.compras }));
            loadInvoices();
        } catch (error) {
            setSheetError(error.message);
        } finally {
            setBusy(false);
        }
    };

    const backToList = (refresh = false) => {
        setView({ type: 'list' });
        if (refresh) loadInvoices();
    };

    const defaultBranchId = (branches.find((b) => String(b.idsucursal) === String(userData?.idsucursal)) || branches[0])?.idsucursal;
    const tabs = [
        { id: 'pending', icon: FaReceipt, label: t('panel.capture.tabPending'), count: pending.length },
        { id: 'policies', icon: FaFileSignature, label: t('panel.capture.tabPolicies'), count: policies.length },
        { id: 'history', icon: FaClockRotateLeft, label: t('panel.capture.tabHistory'), count: history?.length ?? null },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-b from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] pb-28 pt-28">
            <Title title={t('panel.capture.pageTitle')} icon={HiClipboardDocumentList} back={t('panel.common.back')} path="/productivity" />

            {(view.type === 'new' || view.type === 'edit') && (
                <div className="mx-auto max-w-[1700px]">
                    <NewCapture
                        branches={branches}
                        defaultBranchId={defaultBranchId}
                        captureToEdit={view.type === 'edit' ? view.data : null}
                        prefill={view.prefill}
                        onCancelEdit={() => backToList(true)}
                    />
                </div>
            )}

            {view.type === 'loading' && (
                <p className="mx-auto mt-6 max-w-7xl px-4 text-center text-sm text-[rgb(var(--color-gray-base))]">{t('panel.capture.loadingDetail')}</p>
            )}

            {view.type === 'detail' && (
                <div className="mx-auto mt-6 max-w-7xl px-2 sm:px-4 xl:px-8">
                    <CaptureDetail
                        header={view.data.header}
                        detail={view.data.detail}
                        onBack={() => backToList()}
                        onEdit={() => setView({ type: 'edit', data: view.data })}
                        onDelete={() => setToDelete(view.data.header)}
                    />
                </div>
            )}

            {view.type === 'list' && (
                <div className="mx-auto mt-5 max-w-7xl space-y-4 px-2 sm:px-4 xl:px-8">
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                        <Kpi label={t('panel.capture.kpiPending')} value={formatCurrency(kpis.pending.amount)} hint={t('panel.capture.kpiInvoices', { count: kpis.pending.count })} />
                        <Kpi label={t('panel.capture.kpiOverdue')} value={formatCurrency(kpis.overdue.amount)} hint={t('panel.capture.kpiInvoices', { count: kpis.overdue.count })} tone={kpis.overdue.count ? 'text-[rgb(var(--color-error))]' : ''} />
                        <Kpi label={t('panel.capture.kpiWeek')} value={formatCurrency(kpis.week.amount)} hint={t('panel.capture.kpiInvoices', { count: kpis.week.count })} />
                        <Kpi label={t('panel.capture.kpiPaid')} value={formatCurrency(kpis.paid.amount)} hint={t('panel.capture.kpiPolicies', { count: kpis.paid.count })} />
                    </div>

                    <section className="flex flex-wrap items-end gap-3 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-4">
                        <label className="block min-w-48 flex-1 sm:flex-none">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">{t('panel.capture.provider')}</span>
                            <select
                                value={providerFilter}
                                onChange={(e) => {
                                    setProviderFilter(e.target.value);
                                    setSelected(new Set());
                                }}
                                className="h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                            >
                                <option value="">{t('panel.capture.allProviders')}</option>
                                {providers.map((p) => <option key={p.idproveedor} value={p.idproveedor}>{p.empresa}</option>)}
                            </select>
                        </label>
                        <label className="relative block min-w-0 flex-1">
                            <span className="sr-only">{t(tab === 'pending' ? 'panel.capture.searchPending' : 'panel.capture.searchPolicies')}</span>
                            <FaMagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[rgb(var(--color-gray-base))]" aria-hidden="true" />
                            <input
                                type="search"
                                value={term}
                                onChange={(e) => setTerm(e.target.value)}
                                placeholder={t(tab === 'pending' ? 'panel.capture.searchPending' : 'panel.capture.searchPolicies')}
                                className="h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => setView({ type: 'new' })}
                            className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-500 px-4 font-semibold text-slate-900 shadow hover:bg-amber-400"
                        >
                            <FaPlus className="size-3.5" aria-hidden="true" />
                            {t('panel.capture.newCapture')}
                        </button>
                    </section>

                    <section className="space-y-3 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-4">
                        <div role="tablist" aria-label={t('panel.capture.title')} className="grid grid-cols-3 gap-1 rounded-xl bg-[rgb(var(--color-bg))] p-1">
                            {tabs.map(({ id, icon: Icon, label, count }) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === id}
                                    onClick={() => setTab(id)}
                                    className={`flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition ${tab === id ? 'bg-amber-500 text-slate-900 shadow' : 'text-[rgb(var(--color-gray-base))] hover:text-[rgb(var(--color-text))]'}`}
                                >
                                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                                    <span className="truncate">{label}</span>
                                    {count !== null && <span className={`shrink-0 rounded-full px-1.5 text-xs tabular-nums ${tab === id ? 'bg-slate-900/15' : 'bg-[rgb(var(--color-gray))]'}`}>{count.toLocaleString('es-MX')}</span>}
                                </button>
                            ))}
                        </div>

                        {load.status === 'error' && (
                            <div role="alert" className="flex flex-col items-center gap-3 p-6 text-center">
                                <FaCircleExclamation className="size-6 text-[rgb(var(--color-error))]" aria-hidden="true" />
                                <p className="text-sm">{load.message}</p>
                                <button type="button" onClick={loadInvoices} className="h-11 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow">{t('panel.common.retry')}</button>
                            </div>
                        )}

                        {tab === 'pending' && load.status !== 'error' && (
                            groups.length === 0 ? (
                                <p className="flex flex-col items-center gap-2 py-12 text-center text-sm text-[rgb(var(--color-gray-base))]">
                                    <FaCircleCheck className="size-6 text-[rgb(var(--color-success))]" aria-hidden="true" />
                                    {load.status === 'loading' ? t('panel.capture.loading') : t('panel.capture.noPending')}
                                </p>
                            ) : (
                                <ul className="space-y-3">
                                    {groups.map((group) => {
                                        const ids = group.invoices.map((invoice) => invoice.idcompra);
                                        const count = ids.filter((id) => selected.has(id)).length;
                                        return (
                                            <li key={group.id} className="overflow-hidden rounded-2xl bg-[rgb(var(--color-bg))]">
                                                <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={count === ids.length}
                                                        ref={(el) => {
                                                            if (el) el.indeterminate = count > 0 && count < ids.length;
                                                        }}
                                                        onChange={() => toggleGroup(group)}
                                                        aria-label={t('panel.capture.selectProvider', { provider: group.name })}
                                                        className="size-5 accent-amber-500"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate font-bold">{highlightText(group.name, searchTerm)}</p>
                                                        <p className="text-xs text-[rgb(var(--color-gray-base))]">
                                                            {t('panel.capture.kpiInvoices', { count: group.invoices.length })}
                                                            {group.overdue > 0 && ` · ${t('panel.capture.overdueCount', { count: group.overdue })}`}
                                                        </p>
                                                    </div>
                                                    <span className="text-lg font-bold tabular-nums">{formatCurrency(group.total)}</span>
                                                    <button type="button" onClick={() => payGroup(group)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold hover:border-amber-400">
                                                        <FaFileSignature className="size-3.5" aria-hidden="true" />
                                                        {t('panel.capture.payAll')}
                                                    </button>
                                                </div>
                                                <ul className="divide-y divide-[rgb(var(--color-border))] border-t border-[rgb(var(--color-border))]">
                                                    {group.invoices.map((invoice) => (
                                                        <li key={invoice.idcompra} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4">
                                                            <input
                                                                type="checkbox"
                                                                checked={selected.has(invoice.idcompra)}
                                                                onChange={() => toggle(invoice.idcompra)}
                                                                aria-label={t('panel.capture.selectInvoice', { invoice: invoice.num_factura })}
                                                                className="size-5 accent-amber-500"
                                                            />
                                                            <button type="button" onClick={() => openDetail(invoice.idcompra)} className="min-w-0 flex-1 text-left">
                                                                <span className="block truncate font-semibold hover:underline">{highlightText(invoice.num_factura, searchTerm)}</span>
                                                                <span className="block truncate text-xs text-[rgb(var(--color-gray-base))]">
                                                                    {formatDate(invoice.fecha_compra)} · {highlightText(invoice.sucursal || t('panel.capture.noBranch'), searchTerm)} · {t('panel.capture.lines', { count: invoice.renglones })}
                                                                </span>
                                                            </button>
                                                            <span className="text-right text-xs text-[rgb(var(--color-gray-base))]">
                                                                <DueBadge date={invoice.fecha_pago} />
                                                                <span className="block">{formatDate(invoice.fecha_pago)}</span>
                                                            </span>
                                                            <span className="w-28 text-right font-semibold tabular-nums">{formatCurrency(invoice.total)}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSheetError('');
                                                                    setToDelete(invoice);
                                                                }}
                                                                aria-label={t('panel.capture.deleteInvoice', { invoice: invoice.num_factura })}
                                                                title={t('panel.common.delete')}
                                                                className="grid size-9 place-items-center rounded-full text-[rgb(var(--color-error))] hover:bg-[rgb(var(--color-error))]/10"
                                                            >
                                                                <FaTrashCan className="size-3.5" aria-hidden="true" />
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )
                        )}

                        {tab === 'policies' && load.status !== 'error' && (
                            visiblePolicies.length === 0 ? (
                                <p className="py-12 text-center text-sm text-[rgb(var(--color-gray-base))]">{t('panel.capture.noPolicies')}</p>
                            ) : (
                                <ul className="space-y-2">
                                    {visiblePolicies.map((policy) => (
                                        <PolicyCard
                                            key={policy.idpoliza}
                                            policy={policy}
                                            highlighted={policy.idpoliza === wantedPolicy}
                                            term={highlightTerm}
                                            onPrint={printReceipt}
                                            onCancel={(p) => {
                                                setSheetError('');
                                                setToCancel(p);
                                            }}
                                        />
                                    ))}
                                </ul>
                            )
                        )}

                        {tab === 'history' && (
                            history === null ? (
                                <p className="py-12 text-center text-sm text-[rgb(var(--color-gray-base))]">{t('panel.capture.loading')}</p>
                            ) : (
                                <>
                                    <p className="text-xs text-[rgb(var(--color-gray-base))]">{t('panel.capture.historyHint')}</p>
                                    <ul className="space-y-2">
                                        {visibleHistory.slice(0, historyLimit).map((policy) => (
                                            <PolicyCard key={policy.idpoliza} policy={policy} onPrint={printReceipt} highlighted={policy.idpoliza === wantedPolicy} term={highlightTerm} />
                                        ))}
                                    </ul>
                                    {visibleHistory.length === 0 && <p className="py-8 text-center text-sm text-[rgb(var(--color-gray-base))]">{t('panel.capture.noHistory')}</p>}
                                    {visibleHistory.length > historyLimit && (
                                        <button type="button" onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE)} className="h-11 w-full rounded-xl text-sm font-semibold text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10">
                                            {t('panel.inventories.showMore', { shown: historyLimit, total: visibleHistory.length.toLocaleString('es-MX') })}
                                        </button>
                                    )}
                                </>
                            )
                        )}
                    </section>
                </div>
            )}

            {view.type === 'list' && selectedInvoices.length > 0 && (
                <PopPortal>
                    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-3">
                        <div className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-[rgb(var(--color-text))] px-4 py-3 text-[rgb(var(--color-bg))] shadow-2xl">
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold">{t('panel.capture.selection', { count: selectedInvoices.length, amount: formatCurrency(selectedTotal) })}</p>
                                {selectedProviders.size > 1 && <p className="text-xs opacity-75">{t('panel.capture.oneProviderHint')}</p>}
                            </div>
                            <button type="button" onClick={() => setSelected(new Set())} className="h-10 rounded-xl px-3 text-sm font-semibold opacity-80 hover:opacity-100">
                                {t('panel.capture.clearSelection')}
                            </button>
                            <button type="button" onClick={printReview} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[rgb(var(--color-bg))]/30 px-3 text-sm font-semibold hover:bg-[rgb(var(--color-bg))]/10">
                                <FaPrint className="size-3.5" aria-hidden="true" />
                                {t('panel.capture.review')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setPaying(true)}
                                disabled={selectedProviders.size !== 1}
                                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-slate-900 shadow hover:bg-amber-400 disabled:opacity-50"
                            >
                                <FaFileSignature className="size-3.5" aria-hidden="true" />
                                {t('panel.capture.pay')}
                            </button>
                        </div>
                    </div>
                </PopPortal>
            )}

            <PolicySheet
                open={paying}
                invoices={selectedInvoices}
                providerName={selectedInvoices[0]?.empresa || ''}
                banks={banks}
                onBankCreated={(bank) => setBanks((prev) => [...prev, bank].sort((a, b) => a.banco.localeCompare(b.banco)))}
                onClose={() => setPaying(false)}
                onPaid={() => {
                    setSelected(new Set());
                    loadInvoices();
                }}
            />

            <Sheet isOpen={Boolean(toDelete)} onClose={() => !busy && setToDelete(null)} locked={busy} labelledBy={DELETE_TITLE_ID}>
                <SheetHeader
                    icon={FaTrashCan}
                    title={t('panel.capture.deleteTitleInvoice', { invoice: toDelete?.num_factura || '' })}
                    titleId={DELETE_TITLE_ID}
                    subtitle={t('panel.capture.deleteHintStock')}
                    onClose={() => setToDelete(null)}
                    closeDisabled={busy}
                />
                {sheetError && <p role="alert" className="rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2 text-sm text-[rgb(var(--color-error))]">{sheetError}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setToDelete(null)} disabled={busy} className="h-11 rounded-xl px-4 font-semibold hover:bg-[rgb(var(--color-text))]/10">{t('panel.common.cancel')}</button>
                    <button type="button" onClick={confirmDelete} disabled={busy} className="h-11 rounded-xl bg-red-600 px-5 font-semibold text-white shadow hover:bg-red-500 disabled:opacity-60">
                        {busy ? t('panel.common.deleting') : t('panel.common.delete')}
                    </button>
                </div>
            </Sheet>

            <Sheet isOpen={Boolean(toCancel)} onClose={() => !busy && setToCancel(null)} locked={busy} labelledBy={CANCEL_TITLE_ID}>
                <SheetHeader
                    icon={FaBox}
                    title={t('panel.capture.cancelTitle', { id: toCancel?.idpoliza || '' })}
                    titleId={CANCEL_TITLE_ID}
                    subtitle={t('panel.capture.cancelHint', { count: toCancel?.compras.length || 0 })}
                    onClose={() => setToCancel(null)}
                    closeDisabled={busy}
                />
                {sheetError && <p role="alert" className="rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2 text-sm text-[rgb(var(--color-error))]">{sheetError}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setToCancel(null)} disabled={busy} className="h-11 rounded-xl px-4 font-semibold hover:bg-[rgb(var(--color-text))]/10">{t('panel.common.goBack')}</button>
                    <button type="button" onClick={confirmCancel} disabled={busy} className="h-11 rounded-xl bg-red-600 px-5 font-semibold text-white shadow hover:bg-red-500 disabled:opacity-60">
                        {busy ? t('panel.common.updating') : t('panel.capture.cancelPolicy')}
                    </button>
                </div>
            </Sheet>

            {toast && (
                <PopPortal>
                    <div className="pointer-events-none fixed inset-x-0 top-24 z-[60] flex justify-center px-4">
                        <div role="status" className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-[rgb(var(--color-text))] px-4 py-3 text-sm text-[rgb(var(--color-bg))] shadow-2xl">
                            {toast.error
                                ? <FaCircleExclamation className="size-4 shrink-0 text-red-400" aria-hidden="true" />
                                : <FaCircleCheck className="size-4 shrink-0 text-green-400" aria-hidden="true" />}
                            <span className="min-w-0 flex-1 font-medium">{toast.message}</span>
                        </div>
                    </div>
                </PopPortal>
            )}
        </div>
    );
}
