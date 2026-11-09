import React, { useDeferredValue, useMemo, useState } from 'react';
import {
    FaArrowTrendUp,
    FaCcStripe,
    FaCheck,
    FaCircleCheck,
    FaCircleExclamation,
    FaMagnifyingGlass,
    FaStore,
} from 'react-icons/fa6';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { obtenerIdToken } from '@/app/lib/cognito-manager';
import { STRIPE_MX } from '@/app/lib/stripe-fees';
import { useTranslation } from '@/app/lib/text/text-provider';
import { WEB_MAX_RAISE, formatCount, formatMoney, matchesProduct, pluralKey } from './inventory-model';

const PAGE = 40;
// 'short' son los que conviene subir; los que pasan de WEB_MAX_RAISE van
// aparte, en 'notWorth'.
const FILTERS = ['short', 'notWorth', 'covered', 'all'];
const inFilter = (row, filter) => {
    if (filter === 'short') return row.status === 'short' && !row.notWorth;
    if (filter === 'notWorth') return row.notWorth;
    if (filter === 'covered') return row.status === 'covered';
    return true;
};

const formatPercent = (value) => `${(value * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;

function Kpi({ label, value, hint, accent = '' }) {
    return (
        <div className="min-w-0 rounded-2xl bg-[rgb(var(--color-bg))] p-3 shadow-sm">
            <span className="block truncate text-xs font-medium text-[rgb(var(--color-gray-base))]">{label}</span>
            <span className={`block truncate text-2xl font-bold tabular-nums sm:text-3xl ${accent}`}>{value}</span>
            <span className="block truncate text-xs text-[rgb(var(--color-gray-base))]">{hint}</span>
        </div>
    );
}

/**
 * Precios WEB: cuales productos del sitio cubren la comision de Stripe y
 * cuales dejan menos que el mostrador. Arriba el analisis (cuantos, cuanto
 * cobra Stripe, en que rango de precio pesa mas); abajo la lista, de donde se
 * eligen los que se suben a su precio sugerido de una vez (patchWebPrices).
 *
 * `rows` y `summary` los arma Inventarios con buildWebPricing y
 * summarizeWebPricing (inventory-model), los mismos datos de Estado de
 * productos.
 */
export default function InventoryWebPrices({ rows, summary, loading, onApplied }) {
    const { t } = useTranslation();
    const [filter, setFilter] = useState('short');
    const [term, setTerm] = useState('');
    const deferredTerm = useDeferredValue(term.trim());
    const [selected, setSelected] = useState(() => new Set());
    const [limit, setLimit] = useState(PAGE);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Se puede elegir cualquiera que no cubra; "seleccionar todos" solo toma
    // los que conviene subir.
    const shortRows = useMemo(() => rows.filter((row) => row.status === 'short'), [rows]);
    const worthRows = useMemo(() => shortRows.filter((row) => !row.notWorth), [shortRows]);
    const counts = Object.fromEntries(FILTERS.map((id) => [id, rows.filter((row) => inFilter(row, id)).length]));
    const visible = useMemo(() => rows
        .filter((row) => inFilter(row, filter))
        .filter((row) => matchesProduct(row.product, deferredTerm))
        // Primero lo que mas le falta: es donde mas se pierde por venta.
        .sort((a, b) => b.check.gap - a.check.gap
            || String(a.product.num_parte).localeCompare(String(b.product.num_parte), 'es', { numeric: true })),
    [rows, filter, deferredTerm]);

    // Solo cuenta lo elegido que sigue sin cubrir (tras recargar, lo ya
    // ajustado sale solo de la seleccion).
    const chosen = shortRows.filter((row) => selected.has(row.product.num_parte));
    const chosenGap = chosen.reduce((total, row) => total + row.check.gap, 0);
    const allChosen = worthRows.length > 0 && worthRows.every((row) => selected.has(row.product.num_parte));
    const maxRaise = Math.max(...summary.ranges.map((range) => range.averageRaise), 0);

    const toggle = (part) => {
        setConfirming(false);
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(part)) next.delete(part);
            else next.add(part);
            return next;
        });
    };

    const toggleAll = () => {
        setConfirming(false);
        setSelected(allChosen ? new Set() : new Set(worthRows.map((row) => row.product.num_parte)));
    };

    const apply = async () => {
        setBusy(true);
        setError('');
        try {
            const token = await obtenerIdToken();
            const response = await fetch(buildApiUrl('/patchWebPrices'), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ partes: chosen.map((row) => row.product.num_parte) }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.details || `Error ${response.status}`);
            setSelected(new Set());
            setConfirming(false);
            onApplied({
                updated: data.actualizados?.length || 0,
                skipped: data.omitidos?.length || 0,
            });
        } catch (applyError) {
            setError(t('panel.webPrices.applyError', { message: applyError.message }));
        } finally {
            setBusy(false);
        }
    };

    if (loading && !rows.length) {
        return (
            <div className="grid gap-3 rounded-2xl bg-[rgb(var(--color-card))] p-4 sm:grid-cols-4" aria-hidden="true">
                {[0, 1, 2, 3].map((key) => <div key={key} className="h-24 animate-pulse rounded-2xl bg-[rgb(var(--color-bg))]" />)}
            </div>
        );
    }

    return (
        <div className="space-y-4 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-5">
            <header className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-500">
                    <FaCcStripe className="size-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-lg font-bold">{t('panel.webPrices.title')}</h2>
                    <p className="text-sm text-[rgb(var(--color-gray-base))]">
                        {t('panel.webPrices.subtitle', {
                            percent: `${(STRIPE_MX.percent * 100).toFixed(1)} %`,
                            fixed: formatMoney(STRIPE_MX.fixed),
                        })}
                    </p>
                </div>
            </header>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Kpi label={t('panel.webPrices.kpiTotal')} value={formatCount(summary.total)} hint={t('panel.webPrices.kpiTotalHint')} />
                <Kpi
                    label={t('panel.webPrices.kpiShort')}
                    value={formatCount(summary.short)}
                    hint={t('panel.webPrices.kpiShortHint')}
                    accent={summary.short ? 'text-[rgb(var(--color-error))]' : ''}
                />
                <Kpi
                    label={t('panel.webPrices.kpiCovered')}
                    value={formatCount(summary.covered)}
                    hint={t('panel.webPrices.kpiCoveredHint')}
                    accent="text-[rgb(var(--color-success))]"
                />
                <Kpi label={t('panel.webPrices.kpiFee')} value={formatMoney(summary.averageFee)} hint={t('panel.webPrices.kpiFeeHint')} />
            </div>

            {summary.short > 0 ? (
                <div className="space-y-3 rounded-2xl bg-[rgb(var(--color-bg))] p-3 sm:p-4">
                    <p className="flex items-start gap-2 text-sm font-medium">
                        <FaCircleExclamation className="mt-0.5 size-4 shrink-0 text-[rgb(var(--color-error))]" aria-hidden="true" />
                        {t('panel.webPrices.gapTotal', { amount: formatMoney(summary.gapTotal) })}
                    </p>
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">{t('panel.webPrices.rangesTitle')}</p>
                        <ul className="space-y-2">
                            {summary.ranges.map((range) => (
                                <li key={range.id} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[9rem_6.5rem_minmax(0,1fr)_auto]">
                                    <span className="font-semibold">{t(`panel.webPrices.range_${range.id}`)}</span>
                                    <span className="hidden tabular-nums text-[rgb(var(--color-gray-base))] sm:block">
                                        {t(pluralKey('panel.webPrices.rangeCount', range.count), { count: formatCount(range.count) })}
                                    </span>
                                    <span className="h-2.5 overflow-hidden rounded-full bg-[rgb(var(--color-gray))]" aria-hidden="true">
                                        <span
                                            className="block h-full rounded-full bg-indigo-500"
                                            style={{ width: `${maxRaise ? Math.max((range.averageRaise / maxRaise) * 100, 4) : 0}%` }}
                                        />
                                    </span>
                                    <span className="text-right tabular-nums">
                                        <strong>+{formatPercent(range.averageRaise)}</strong>
                                        <span className="ml-2 text-xs text-[rgb(var(--color-gray-base))]">{t('panel.webPrices.rangeFee', { amount: formatMoney(range.averageFee) })}</span>
                                    </span>
                                    <span className="col-span-3 -mt-1 text-xs tabular-nums text-[rgb(var(--color-gray-base))] sm:hidden">
                                        {t(pluralKey('panel.webPrices.rangeCount', range.count), { count: formatCount(range.count) })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-2 text-xs text-[rgb(var(--color-gray-base))]">
                            {t('panel.webPrices.rangesNote', { fixed: formatMoney(STRIPE_MX.fixed) })}
                        </p>
                    </div>
                    {summary.notWorth > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                setFilter('notWorth');
                                setLimit(PAGE);
                            }}
                            className="flex w-full items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-400/15 px-3 py-2.5 text-left text-sm transition hover:bg-amber-400/25"
                        >
                            <FaStore className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                                <strong className="block">
                                    {t(pluralKey('panel.webPrices.notWorthTitle', summary.notWorth), {
                                        count: formatCount(summary.notWorth),
                                        percent: formatPercent(WEB_MAX_RAISE),
                                    })}
                                </strong>
                                <span className="text-[rgb(var(--color-gray-base))]">{t('panel.webPrices.notWorthBody')}</span>
                            </span>
                        </button>
                    )}
                </div>
            ) : summary.total > 0 && (
                <p className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm font-medium">
                    <FaCircleCheck className="size-4 shrink-0 text-[rgb(var(--color-success))]" aria-hidden="true" />
                    {t('panel.webPrices.allCovered')}
                </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div role="tablist" aria-label={t('panel.webPrices.title')} className="flex flex-wrap gap-1 rounded-xl bg-[rgb(var(--color-bg))] p-1">
                    {FILTERS.map((id) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={filter === id}
                            onClick={() => {
                                setFilter(id);
                                setLimit(PAGE);
                            }}
                            className={`h-9 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition ${filter === id ? 'bg-amber-500 text-slate-900 shadow' : 'hover:bg-[rgb(var(--color-text))]/10'}`}
                        >
                            {t(`panel.webPrices.filter_${id}`)} <span className="tabular-nums opacity-70">{formatCount(counts[id])}</span>
                        </button>
                    ))}
                </div>
                <label className="relative min-w-0 flex-1">
                    <span className="sr-only">{t('panel.webPrices.search')}</span>
                    <FaMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[rgb(var(--color-gray-base))]" aria-hidden="true" />
                    <input
                        type="search"
                        value={term}
                        onChange={(event) => {
                            setTerm(event.target.value);
                            setLimit(PAGE);
                        }}
                        placeholder={t('panel.webPrices.search')}
                        className="h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                </label>
            </div>

            {visible.length === 0 ? (
                <p className="rounded-2xl bg-[rgb(var(--color-bg))] p-6 text-center text-sm text-[rgb(var(--color-gray-base))]">
                    {deferredTerm ? t('panel.assignment.noMatches', { term: deferredTerm.toUpperCase() }) : t(`panel.webPrices.empty_${filter}`)}
                </p>
            ) : (
                <ul className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl bg-[rgb(var(--color-bg))]">
                    {visible.slice(0, limit).map(({ product, check, status, raise, notWorth }) => {
                        const part = product.num_parte;
                        const isShort = status === 'short';
                        const checked = selected.has(part);
                        return (
                            <li key={part} className={checked ? 'bg-amber-400/10' : ''}>
                                <label className={`flex items-start gap-3 px-3 py-3 ${isShort ? 'cursor-pointer' : ''}`}>
                                    <span className="grid size-6 shrink-0 place-items-center pt-0.5">
                                        {isShort ? (
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggle(part)}
                                                className="size-5 accent-amber-500"
                                                aria-label={t('panel.webPrices.select', { part })}
                                            />
                                        ) : status === 'covered' ? (
                                            <FaCircleCheck className="size-4 text-[rgb(var(--color-success))]" aria-label={t('panel.webPrices.coveredChip')} />
                                        ) : (
                                            <FaCircleExclamation className="size-4 text-[rgb(var(--color-gray-base))]" aria-hidden="true" />
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="truncate font-bold tabular-nums">{part}</span>
                                            {notWorth && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/25 px-2 text-xs font-semibold">
                                                    <FaStore className="size-3" aria-hidden="true" />
                                                    {t('panel.webPrices.notWorthChip', { percent: formatPercent(raise) })}
                                                </span>
                                            )}
                                        </span>
                                        <span className="line-clamp-1 text-sm text-[rgb(var(--color-text))]/80">{product.descripcion}</span>
                                        <span className="mt-1 block text-xs tabular-nums text-[rgb(var(--color-gray-base))]">
                                            {check.reference
                                                ? t('panel.webPrices.reference', { branch: check.reference.branch, amount: formatMoney(check.reference.price) })
                                                : check.base
                                                    ? t('panel.webPrices.referenceCost', { amount: formatMoney(check.base) })
                                                    : t('panel.webPrices.noReference')}
                                            {check.fee !== null && (
                                                <> · {t('panel.webPrices.net', { fee: formatMoney(check.fee), net: formatMoney(check.net) })}</>
                                            )}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right tabular-nums">
                                        <span className="block text-xs text-[rgb(var(--color-gray-base))]">{t('panel.webPrices.current')}</span>
                                        <span className={`block font-bold ${isShort ? 'text-[rgb(var(--color-gray-base))] line-through decoration-1' : ''}`}>
                                            {formatMoney(check.current)}
                                        </span>
                                        {isShort && (
                                            <>
                                                <span className="block text-base font-bold text-indigo-600 dark:text-indigo-400">{formatMoney(check.suggested)}</span>
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--color-error))]">
                                                    <FaArrowTrendUp className="size-3" aria-hidden="true" />
                                                    {formatMoney(check.gap)}
                                                    {check.current ? ` (${formatPercent(check.gap / check.current)})` : ''}
                                                </span>
                                            </>
                                        )}
                                    </span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
            )}
            {visible.length > limit && (
                <button
                    type="button"
                    onClick={() => setLimit((n) => n + PAGE)}
                    className="h-10 w-full rounded-xl text-sm font-semibold text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10"
                >
                    {t('panel.inventories.showMore', { shown: formatCount(limit), total: formatCount(visible.length) })}
                </button>
            )}

            {shortRows.length > 0 && (
                <div className="sticky bottom-3 z-10 space-y-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 shadow-xl">
                    {confirming ? (
                        <div className="space-y-3">
                            <p className="font-bold">{t(pluralKey('panel.webPrices.confirmTitle', chosen.length), { count: formatCount(chosen.length) })}</p>
                            <p className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.webPrices.confirmBody', { amount: formatMoney(chosenGap) })}</p>
                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() => setConfirming(false)}
                                    disabled={busy}
                                    className="h-11 rounded-xl px-5 font-semibold text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10 disabled:opacity-60"
                                >
                                    {t('panel.common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={apply}
                                    disabled={busy}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-semibold text-white shadow transition hover:bg-indigo-500 disabled:opacity-60"
                                >
                                    <FaCheck className="size-3.5" aria-hidden="true" />
                                    {busy ? t('panel.webPrices.applying') : t('panel.webPrices.confirm')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <button
                                type="button"
                                onClick={toggleAll}
                                className="h-11 rounded-xl px-4 text-left text-sm font-semibold hover:bg-[rgb(var(--color-text))]/10 sm:text-center"
                            >
                                {allChosen
                                    ? t('panel.webPrices.clearSelection')
                                    : t('panel.webPrices.selectAll', { count: formatCount(worthRows.length) })}
                            </button>
                            <span className="flex-1 text-sm tabular-nums text-[rgb(var(--color-gray-base))]">
                                {chosen.length > 0 && t(pluralKey('panel.webPrices.selected', chosen.length), { count: formatCount(chosen.length), amount: formatMoney(chosenGap) })}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setError('');
                                    setConfirming(true);
                                }}
                                disabled={!chosen.length}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-semibold text-white shadow transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <FaArrowTrendUp className="size-4" aria-hidden="true" />
                                {chosen.length
                                    ? t(pluralKey('panel.webPrices.apply', chosen.length), { count: formatCount(chosen.length) })
                                    : t('panel.webPrices.applyNone')}
                            </button>
                        </div>
                    )}
                    {error && (
                        <p role="alert" className="flex items-center gap-2 text-sm text-[rgb(var(--color-error))]">
                            <FaCircleExclamation className="size-3.5 shrink-0" aria-hidden="true" />
                            {error}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
