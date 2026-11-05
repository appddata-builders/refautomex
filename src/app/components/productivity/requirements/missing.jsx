import React, { useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    FaArrowsRotate,
    FaCircleCheck,
    FaCircleExclamation,
    FaClipboardList,
    FaCopy,
    FaFileInvoiceDollar,
    FaMagnifyingGlass,
    FaPrint,
    FaXmark,
} from 'react-icons/fa6';
import Title from '../title';
import PopPortal from '@/app/lib/pop-portal';
import { AuthContext } from '@/app/lib/auth-tracker';
import { perfilDeCategoria, puedeVer } from '@/app/lib/permisos-menu';
import { usePermisosMenu } from '@/app/lib/use-permisos-menu';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';
import {
    CAPTURE_HANDOFF_KEY,
    COVERAGE_OPTIONS,
    DEFAULT_COVERAGE,
    coverageKey,
    analyzeProducts,
    buildPlan,
    formatMonth,
    groupByProvider,
    monthGaps,
} from './reorder-model';
import { ReorderRow } from './reorder-list';
import { buildOrderHtml, formatCurrency, formatDate, printHtml, todayIso } from './print-docs';

const PAGE = 40;
const PREFS_KEY = 'faltantes';
const TOAST_MS = 5000;

const isWeb = (branch) => Number(branch.idsucursal) === 1 || String(branch.sucursal || '').trim().toUpperCase() === 'WEB';

// Lo que este navegador recuerda: cuantos meses cubrir, de donde se mide la
// demanda y los cambios a mano del pedido de cada sucursal.
const readPrefs = () => {
    try {
        return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
        return {};
    }
};

const savePrefs = (patch) => {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
    } catch {
        // Sin almacenamiento solo no se recuerda.
    }
};

function Segmented({ label, options, value, onChange }) {
    return (
        <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-[rgb(var(--color-bg))] p-1">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={value === option.value}
                    onClick={() => onChange(option.value)}
                    className={`h-9 rounded-lg px-3 text-sm font-semibold transition ${value === option.value
                        ? 'bg-amber-500 text-slate-900 shadow'
                        : 'text-[rgb(var(--color-gray-base))] hover:text-[rgb(var(--color-text))]'}`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

function Kpi({ label, value, hint, onClick, active }) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`min-w-0 rounded-2xl p-3 text-left shadow-sm transition sm:p-4 ${active ? 'bg-amber-500 text-slate-900' : 'bg-[rgb(var(--color-card))]'} ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`}
        >
            <span className={`block truncate text-xs font-medium ${active ? 'text-slate-900/75' : 'text-[rgb(var(--color-gray-base))]'}`}>{label}</span>
            <span className="block text-2xl font-bold tabular-nums">{value}</span>
            <span className={`block truncate text-xs ${active ? 'text-slate-900/75' : 'text-[rgb(var(--color-gray-base))]'}`}>{hint}</span>
        </Tag>
    );
}

/**
 * Faltantes: que conviene pedir en una sucursal, cuanto y a que proveedor.
 *
 * La demanda sale de las ventas de los ultimos 12 meses con datos (incluido el
 * historial del sistema anterior) y el proveedor de lo que se le ha comprado a
 * cada uno (ver /getReorderAnalysis). Lo que el analisis propone forma el
 * pedido; cada renglon se puede cambiar de cantidad o de proveedor, y el pedido
 * de cada proveedor se imprime, se copia o se lleva a Captura cuando llega la
 * factura.
 */
export default function Missing() {
    const { t } = useTranslation();
    const router = useRouter();
    const { userData } = useContext(AuthContext);
    const permisos = usePermisosMenu();
    const canCapture = puedeVer(permisos, 'capture', perfilDeCategoria(userData?.categoria));

    const [branches, setBranches] = useState([]);
    const [branchId, setBranchId] = useState(null);
    const [scope, setScope] = useState('sucursal');
    const [coverage, setCoverage] = useState(DEFAULT_COVERAGE);
    const [data, setData] = useState(null);
    const [load, setLoad] = useState({ status: 'loading', message: '' });
    const [attempt, setAttempt] = useState(0);
    const [overrides, setOverrides] = useState({});
    const [filter, setFilter] = useState('plan');
    const [providerFilter, setProviderFilter] = useState('');
    const [term, setTerm] = useState('');
    const searchTerm = useDeferredValue(term.trim().toUpperCase());
    const [limit, setLimit] = useState(PAGE);
    const [expanded, setExpanded] = useState(null);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        const prefs = readPrefs();
        if (COVERAGE_OPTIONS.includes(prefs.coverage)) setCoverage(prefs.coverage);
        if (prefs.scope === 'todas') setScope('todas');
    }, []);

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    const notify = useCallback((message, error = false) => {
        clearTimeout(toastTimer.current);
        setToast({ message, error });
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch(buildApiUrl('/getSucursal'), { cache: 'no-store' })
            .then((response) => response.json())
            .then((rows) => {
                if (cancelled || !Array.isArray(rows)) return;
                const physical = rows.filter((branch) => !isWeb(branch));
                setBranches(physical);
                const mine = physical.find((branch) => String(branch.idsucursal) === String(userData?.idsucursal));
                setBranchId((current) => current ?? (mine || physical[0])?.idsucursal ?? null);
            })
            .catch(() => !cancelled && setLoad({ status: 'error', message: t('panel.missing.loadError') }));
        return () => {
            cancelled = true;
        };
    }, [userData, t]);

    useEffect(() => {
        if (!branchId) return undefined;
        let cancelled = false;
        setLoad((prev) => ({ ...prev, status: 'loading' }));
        const params = new URLSearchParams({ idsucursal: branchId, alcance: scope });
        fetch(`${buildApiUrl('/getReorderAnalysis')}?${params}`, { cache: 'no-store' })
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok || !payload?.productos) throw new Error(payload?.details || t('panel.missing.loadError'));
                if (cancelled) return;
                setData(payload);
                setLoad({ status: 'ready', message: '' });
            })
            .catch((error) => !cancelled && setLoad({ status: 'error', message: error.message }));
        setOverrides(readPrefs().overrides?.[branchId] || {});
        return () => {
            cancelled = true;
        };
    }, [branchId, scope, attempt, t]);

    const providers = useMemo(() => (data?.proveedores || []).filter((p) => p.empresa !== 'NINGUNO'), [data]);
    const providersById = useMemo(() => new Map((data?.proveedores || []).map((p) => [p.idproveedor, p])), [data]);
    const rows = useMemo(() => analyzeProducts(data, coverage, providersById), [data, coverage, providersById]);
    const plan = useMemo(() => buildPlan(rows, overrides), [rows, overrides]);
    const planByPart = useMemo(() => new Map(plan.map((item) => [item.row.num_parte, item])), [plan]);
    const groups = useMemo(() => groupByProvider(plan, providersById), [plan, providersById]);
    const months = data?.meses || [];
    const gaps = monthGaps(months);
    const branch = branches.find((item) => String(item.idsucursal) === String(branchId));

    const counts = useMemo(() => ({
        plan: plan.length,
        out: rows.filter((row) => row.status === 'out' && row.regular).length,
        urgent: rows.filter((row) => row.status === 'urgent' && row.regular).length,
        soon: rows.filter((row) => row.status === 'soon' && row.regular).length,
        all: rows.length,
    }), [rows, plan]);

    const visible = useMemo(() => rows.filter((row) => {
        if (filter === 'plan' && !planByPart.has(row.num_parte)) return false;
        if (['out', 'urgent', 'soon'].includes(filter) && !(row.status === filter && row.regular)) return false;
        if (providerFilter) {
            const item = planByPart.get(row.num_parte);
            const id = item ? item.idproveedor : row.recommendation?.idproveedor;
            if (String(id ?? 'none') !== providerFilter) return false;
        }
        if (searchTerm && !`${row.num_parte} ${row.descripcion}`.toUpperCase().includes(searchTerm)) return false;
        return true;
    }), [rows, filter, providerFilter, searchTerm, planByPart]);

    const updateOverride = (row, patch) => {
        setOverrides((prev) => {
            const current = prev[row.num_parte] || {};
            const base = {
                qty: current.qty ?? planByPart.get(row.num_parte)?.qty ?? 0,
                idproveedor: current.idproveedor ?? planByPart.get(row.num_parte)?.idproveedor ?? row.recommendation?.idproveedor ?? null,
            };
            const next = { ...prev, [row.num_parte]: { ...base, ...patch } };
            savePrefs({ overrides: { ...(readPrefs().overrides || {}), [branchId]: next } });
            return next;
        });
    };

    const resetPlan = () => {
        setOverrides({});
        savePrefs({ overrides: { ...(readPrefs().overrides || {}), [branchId]: {} } });
    };

    const changeFilter = (next) => {
        setFilter(next);
        setLimit(PAGE);
    };

    const showProvider = (key) => {
        setProviderFilter(String(key));
        changeFilter('plan');
        listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const providerName = (group) => group.provider?.empresa || t('panel.missing.noProvider');

    const printOrder = (group) => {
        const ok = printHtml(buildOrderHtml({ provider: providerName(group), branch: branch?.sucursal || '', items: group.items }, t));
        if (!ok) notify(t('panel.capture.printPopupBlocked'), true);
    };

    const copyOrder = async (group) => {
        const lines = [
            t('panel.missing.copyHeader', { provider: providerName(group), branch: branch?.sucursal || '', date: formatDate(todayIso()) }),
            ...group.items.map((item, index) => `${index + 1}. ${item.row.num_parte} ${item.row.descripcion.trim()} — ${item.qty} ${t('panel.missing.pcs')}`),
        ];
        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            notify(t('panel.missing.copied', { provider: providerName(group) }));
        } catch {
            notify(t('panel.missing.copyError'), true);
        }
    };

    const captureOrder = (group) => {
        try {
            sessionStorage.setItem(CAPTURE_HANDOFF_KEY, JSON.stringify({
                idproveedor: group.provider?.idproveedor,
                idsucursal: branchId,
                items: group.items.map((item) => ({
                    num_parte: item.row.num_parte,
                    descripcion: item.row.descripcion,
                    cantidad: item.qty,
                    costo: item.cost,
                    existencia: item.row.stock,
                })),
            }));
        } catch {
            notify(t('panel.missing.copyError'), true);
            return;
        }
        router.push('/productivity?load=capture');
    };

    const totals = plan.reduce((acc, item) => ({ units: acc.units + item.qty, amount: acc.amount + item.amount }), { units: 0, amount: 0 });
    const filters = [
        { id: 'plan', label: t('panel.missing.filterPlan') },
        { id: 'out', label: t('panel.missing.status_out') },
        { id: 'urgent', label: t('panel.missing.status_urgent') },
        { id: 'soon', label: t('panel.missing.status_soon') },
        { id: 'all', label: t('panel.missing.filterAll') },
    ];
    const providerFilterName = providerFilter === 'none'
        ? t('panel.missing.noProvider')
        : providersById.get(Number(providerFilter))?.empresa;

    return (
        <div className="min-h-screen bg-gradient-to-b from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] pb-24 pt-28">
            <Title title={t('panel.missing.pageTitle')} icon={FaClipboardList} back={t('panel.common.back')} path="/productivity" />

            <div className="mx-auto mt-5 max-w-7xl space-y-4 px-2 sm:px-4 xl:px-8">
                <section className="space-y-3 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">{t('panel.common.branch')}</span>
                            <select
                                value={branchId ?? ''}
                                onChange={(e) => {
                                    setBranchId(Number(e.target.value));
                                    setProviderFilter('');
                                }}
                                className="h-11 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                            >
                                {branches.map((item) => <option key={item.idsucursal} value={item.idsucursal}>{item.sucursal}</option>)}
                            </select>
                        </label>
                        <div>
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">{t('panel.missing.demandFrom')}</span>
                            <Segmented
                                label={t('panel.missing.demandFrom')}
                                value={scope}
                                onChange={(value) => {
                                    setScope(value);
                                    savePrefs({ scope: value });
                                }}
                                options={[{ value: 'sucursal', label: t('panel.missing.scopeBranch') }, { value: 'todas', label: t('panel.missing.scopeAll') }]}
                            />
                        </div>
                        <div>
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">{t('panel.missing.coverFor')}</span>
                            <Segmented
                                label={t('panel.missing.coverFor')}
                                value={coverage}
                                onChange={(value) => {
                                    setCoverage(value);
                                    savePrefs({ coverage: value });
                                }}
                                options={COVERAGE_OPTIONS.map((value) => ({ value, label: t(coverageKey(value)) }))}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setAttempt((n) => n + 1)}
                            aria-label={t('panel.assignment.refresh')}
                            title={t('panel.assignment.refresh')}
                            className="ml-auto grid size-11 place-items-center rounded-full bg-[rgb(var(--color-bg))] shadow-sm hover:bg-amber-400/30"
                        >
                            <FaArrowsRotate className={`size-4 ${load.status === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
                        </button>
                    </div>
                    {data && (
                        <p className="text-xs text-[rgb(var(--color-gray-base))]">
                            {months.length
                                ? t('panel.missing.dataNote', { count: months.length, from: formatMonth(months[0]), to: formatMonth(months.at(-1)) })
                                : t('panel.missing.noSales')}
                            {gaps.map((gap) => ` ${t('panel.missing.dataGap', { from: formatMonth(gap.from), to: formatMonth(gap.to) })}`).join('')}
                            {' '}
                            {data.historial ? t('panel.missing.historyNote') : t('panel.missing.noHistoryNote')}
                        </p>
                    )}
                    {data && scope === 'sucursal' && months.length === 0 && (
                        <p className="flex items-center gap-2 rounded-xl bg-amber-400/20 px-3 py-2 text-sm">
                            {t('panel.missing.noBranchSales')}
                            <button type="button" onClick={() => setScope('todas')} className="font-semibold underline">{t('panel.missing.useAllBranches')}</button>
                        </p>
                    )}
                </section>

                {load.status === 'error' && (
                    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl bg-[rgb(var(--color-card))] p-8 text-center">
                        <FaCircleExclamation className="size-6 text-[rgb(var(--color-error))]" aria-hidden="true" />
                        <p className="text-sm">{load.message}</p>
                        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="h-11 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow">
                            {t('panel.common.retry')}
                        </button>
                    </div>
                )}

                {!data && load.status === 'loading' && (
                    <div className="grid gap-3 sm:grid-cols-4" aria-hidden="true">
                        {[0, 1, 2, 3].map((key) => <div key={key} className="h-24 animate-pulse rounded-2xl bg-[rgb(var(--color-card))]" />)}
                    </div>
                )}

                {data && (
                    <>
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                            <Kpi label={t('panel.missing.kpiOut')} value={counts.out} hint={t('panel.missing.kpiOutHint')} onClick={() => changeFilter('out')} active={filter === 'out'} />
                            <Kpi label={t('panel.missing.kpiLow')} value={counts.urgent + counts.soon} hint={t('panel.missing.kpiLowHint', { coverage: t(coverageKey(coverage)) })} onClick={() => changeFilter('urgent')} active={filter === 'urgent' || filter === 'soon'} />
                            <Kpi label={t('panel.missing.kpiPlan')} value={counts.plan} hint={t('panel.missing.kpiPlanHint', { units: totals.units, providers: groups.length })} onClick={() => changeFilter('plan')} active={filter === 'plan'} />
                            <Kpi label={t('panel.missing.kpiInvestment')} value={formatCurrency(totals.amount * 1.16)} hint={t('panel.missing.kpiInvestmentHint')} />
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                            <section ref={listRef} className="min-w-0 scroll-mt-28 space-y-3 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="mr-auto text-lg font-bold">{t('panel.missing.whatToOrder')}</h2>
                                    {Object.keys(overrides).length > 0 && (
                                        <button type="button" onClick={resetPlan} className="rounded-lg px-2 py-1 text-sm font-semibold text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10">
                                            {t('panel.missing.resetPlan')}
                                        </button>
                                    )}
                                </div>
                                <div role="tablist" aria-label={t('panel.missing.whatToOrder')} className="flex flex-wrap gap-1.5">
                                    {filters.map(({ id, label }) => (
                                        <button
                                            key={id}
                                            type="button"
                                            role="tab"
                                            aria-selected={filter === id}
                                            onClick={() => changeFilter(id)}
                                            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${filter === id
                                                ? 'bg-amber-500 text-slate-900 shadow'
                                                : 'bg-[rgb(var(--color-bg))] text-[rgb(var(--color-gray-base))] hover:text-[rgb(var(--color-text))]'}`}
                                        >
                                            {label}
                                            <span className={`rounded-full px-1.5 text-xs tabular-nums ${filter === id ? 'bg-slate-900/15' : 'bg-[rgb(var(--color-gray))]'}`}>{counts[id].toLocaleString('es-MX')}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <label className="relative block min-w-0 flex-1">
                                        <FaMagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[rgb(var(--color-gray-base))]" aria-hidden="true" />
                                        <input
                                            type="search"
                                            value={term}
                                            onChange={(e) => {
                                                setTerm(e.target.value);
                                                setLimit(PAGE);
                                            }}
                                            placeholder={t('panel.missing.search')}
                                            aria-label={t('panel.missing.search')}
                                            className="h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        />
                                    </label>
                                    {providerFilter && (
                                        <button
                                            type="button"
                                            onClick={() => setProviderFilter('')}
                                            className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-400/25 px-3 text-sm font-semibold"
                                        >
                                            {providerFilterName}
                                            <FaXmark className="size-3.5" aria-label={t('panel.common.close')} />
                                        </button>
                                    )}
                                </div>

                                <ul className="space-y-2">
                                    {visible.slice(0, limit).map((row) => {
                                        const item = planByPart.get(row.num_parte);
                                        return (
                                            <ReorderRow
                                                key={row.num_parte}
                                                row={row}
                                                qty={item?.qty ?? 0}
                                                idproveedor={item?.idproveedor ?? overrides[row.num_parte]?.idproveedor ?? row.recommendation?.idproveedor ?? null}
                                                months={months}
                                                coverage={coverage}
                                                providers={providers}
                                                providersById={providersById}
                                                expanded={expanded === row.num_parte}
                                                onToggle={() => setExpanded((current) => (current === row.num_parte ? null : row.num_parte))}
                                                onChange={(patch) => updateOverride(row, patch)}
                                            />
                                        );
                                    })}
                                </ul>
                                {visible.length === 0 && (
                                    <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[rgb(var(--color-gray-base))]">
                                        <FaCircleCheck className="size-6 text-[rgb(var(--color-success))]" aria-hidden="true" />
                                        {searchTerm ? t('panel.assignment.noMatches', { term: searchTerm }) : t(`panel.missing.empty_${filter}`)}
                                    </p>
                                )}
                                {visible.length > limit && (
                                    <button
                                        type="button"
                                        onClick={() => setLimit((n) => n + PAGE)}
                                        className="h-11 w-full rounded-xl text-sm font-semibold text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10"
                                    >
                                        {t('panel.inventories.showMore', { shown: limit.toLocaleString('es-MX'), total: visible.length.toLocaleString('es-MX') })}
                                    </button>
                                )}
                            </section>

                            <aside className="space-y-3 lg:sticky lg:top-24">
                                <div className="rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-4">
                                    <h2 className="text-lg font-bold">{t('panel.missing.ordersTitle')}</h2>
                                    <p className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.missing.ordersHint')}</p>
                                </div>
                                {groups.length === 0 && (
                                    <p className="rounded-2xl bg-[rgb(var(--color-card))] p-4 text-sm text-[rgb(var(--color-gray-base))]">{t('panel.missing.noOrders')}</p>
                                )}
                                {groups.map((group) => (
                                    <article key={group.key} className="space-y-3 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow-sm sm:p-4">
                                        <button type="button" onClick={() => showProvider(group.key)} className="block w-full text-left">
                                            <span className="flex items-baseline gap-2">
                                                <span className="min-w-0 flex-1 truncate font-bold">{providerName(group)}</span>
                                                <span className="shrink-0 font-bold tabular-nums">{formatCurrency(group.amount)}</span>
                                            </span>
                                            <span className="flex items-baseline gap-2 text-xs text-[rgb(var(--color-gray-base))]">
                                                <span className="flex-1">{t('panel.missing.groupSummary', { products: group.items.length, units: group.units })}</span>
                                                <span>{t('panel.missing.withTaxShort', { amount: formatCurrency(group.amount * 1.16) })}</span>
                                            </span>
                                            {group.provider && (
                                                <span className="mt-1 block text-xs text-[rgb(var(--color-gray-base))]">
                                                    {t('panel.missing.providerTerms', {
                                                        discount: Math.round((Number(group.provider.descuento) || 0) * 1000) / 10,
                                                        days: group.provider.plazo_dias ?? 0,
                                                    })}
                                                </span>
                                            )}
                                        </button>
                                        {group.provider ? (
                                            <div className="grid grid-cols-3 gap-1.5">
                                                <button type="button" onClick={() => printOrder(group)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] text-xs font-semibold hover:border-amber-400">
                                                    <FaPrint className="size-3.5" aria-hidden="true" />
                                                    {t('panel.missing.print')}
                                                </button>
                                                <button type="button" onClick={() => copyOrder(group)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] text-xs font-semibold hover:border-amber-400">
                                                    <FaCopy className="size-3.5" aria-hidden="true" />
                                                    {t('panel.missing.copy')}
                                                </button>
                                                {canCapture ? (
                                                    <button type="button" onClick={() => captureOrder(group)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-500 text-xs font-semibold text-slate-900 shadow hover:bg-amber-400" title={t('panel.missing.captureHint')}>
                                                        <FaFileInvoiceDollar className="size-3.5" aria-hidden="true" />
                                                        {t('panel.missing.capture')}
                                                    </button>
                                                ) : <span />}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-[rgb(var(--color-gray-base))]">{t('panel.missing.noProviderHint')}</p>
                                        )}
                                    </article>
                                ))}
                            </aside>
                        </div>
                    </>
                )}
            </div>

            {toast && (
                <PopPortal>
                    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex justify-center px-4">
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
