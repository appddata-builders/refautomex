import React, { useState } from 'react';
import {
    FaArrowRightArrowLeft,
    FaChevronDown,
    FaCircleCheck,
    FaCircleExclamation,
    FaClock,
    FaMinus,
    FaPlus,
    FaTriangleExclamation,
} from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';
import { costWith, coverageKey, formatMonth, formatRate } from './reorder-model';
import { formatCurrency, formatDate } from './print-docs';
import { resolveProductImage } from '../sales/find-products';

// Estado de cada producto: siempre icono y texto, nunca solo el color. El
// texto va con la tinta normal; el color lo lleva el icono y el fondo.
export const STATUS_STYLE = {
    out: { icon: FaCircleExclamation, badge: 'bg-[rgb(var(--color-error))]/12', icon_: 'text-[rgb(var(--color-error))]' },
    urgent: { icon: FaTriangleExclamation, badge: 'bg-orange-500/15', icon_: 'text-orange-500' },
    soon: { icon: FaClock, badge: 'bg-amber-400/20', icon_: 'text-amber-500' },
    ok: { icon: FaCircleCheck, badge: 'bg-emerald-500/12', icon_: 'text-[rgb(var(--color-success))]' },
    idle: { icon: FaMinus, badge: 'bg-[rgb(var(--color-gray))]', icon_: 'text-[rgb(var(--color-gray-base))]' },
};

export function StatusBadge({ status }) {
    const { t } = useTranslation();
    const { icon: Icon, badge, icon_: iconClass } = STATUS_STYLE[status];
    return (
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-[rgb(var(--color-text))] ${badge}`}>
            <Icon className={`size-3 ${iconClass}`} aria-hidden="true" />
            {t(`panel.missing.status_${status}`)}
        </span>
    );
}

/**
 * Ventas por mes de un producto: una barra por mes con datos, del mas viejo al
 * mas nuevo. El area de cada mes es mas alta que su barra para que el cursor
 * la encuentre; los valores tambien estan en el detalle, en tabla.
 */
function Sparkline({ months, serie, label }) {
    const { t } = useTranslation();
    const [hover, setHover] = useState(null);
    const values = months.map((month) => Number(serie?.[month]) || 0);
    const max = Math.max(1, ...values);
    const step = 7;
    const height = 26;
    return (
        <div className="relative inline-block" onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${months.length * step} ${height}`} className="h-7 w-[92px]" role="img" aria-label={label}>
                {values.map((value, i) => {
                    const h = value ? Math.max(3, (value / max) * (height - 2)) : 1.5;
                    return (
                        <g key={months[i]} onMouseEnter={() => setHover(i)}>
                            <rect x={i * step} y={0} width={step} height={height} fill="transparent" />
                            <rect
                                x={i * step + 1}
                                y={height - h}
                                width={step - 2}
                                height={h}
                                rx={1.5}
                                className={value ? (hover === i ? 'fill-amber-600' : 'fill-amber-500') : 'fill-[rgb(var(--color-gray))]'}
                            />
                        </g>
                    );
                })}
            </svg>
            {hover !== null && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[rgb(var(--color-text))] px-2 py-1 text-xs text-[rgb(var(--color-bg))] shadow">
                    {formatMonth(months[hover])}: {t('panel.missing.units', { count: values[hover] })}
                </span>
            )}
        </div>
    );
}

function QuantityStepper({ value, onChange, label }) {
    return (
        <div className="inline-flex h-10 items-center rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]">
            <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`${label} −1`} className="grid size-10 place-items-center rounded-l-xl hover:bg-[rgb(var(--color-text))]/10">
                <FaMinus className="size-3" aria-hidden="true" />
            </button>
            <input
                type="number"
                inputMode="numeric"
                min="0"
                value={value}
                onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                aria-label={label}
                className="h-10 w-12 bg-transparent text-center font-semibold tabular-nums focus:outline-none"
            />
            <button type="button" onClick={() => onChange(value + 1)} aria-label={`${label} +1`} className="grid size-10 place-items-center rounded-r-xl hover:bg-[rgb(var(--color-text))]/10">
                <FaPlus className="size-3" aria-hidden="true" />
            </button>
        </div>
    );
}

function ProductDetail({ row, months, providersById, onUseProvider, onSetQty }) {
    const { t } = useTranslation();
    const purchases = row.compras || [];
    const typical = row.recommendation?.typicalQty;
    return (
        <div className="grid gap-4 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]/60 p-3 sm:p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">{t('panel.missing.salesByMonth')}</p>
                <table className="w-full text-sm">
                    <caption className="sr-only">{t('panel.missing.salesByMonth')}</caption>
                    <tbody>
                        {months.slice().reverse().map((month) => {
                            const value = Number(row.serie?.[month]) || 0;
                            const max = Math.max(1, ...months.map((m) => Number(row.serie?.[m]) || 0));
                            return (
                                <tr key={month}>
                                    <th scope="row" className="w-24 py-0.5 pr-2 text-left text-xs font-normal capitalize text-[rgb(var(--color-gray-base))]">{formatMonth(month)}</th>
                                    <td className="py-0.5">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 rounded-r bg-amber-500" style={{ width: `${(value / max) * 100}%`, minWidth: value ? 4 : 0 }} />
                                            <span className="text-xs tabular-nums">{value}</span>
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {row.en_otras > 0 && (
                    <p className="flex items-start gap-2 rounded-xl bg-sky-500/10 p-2 text-sm">
                        <FaArrowRightArrowLeft className="mt-0.5 size-3.5 shrink-0 text-sky-600" aria-hidden="true" />
                        {t('panel.missing.transferHint', { count: row.en_otras })}
                    </p>
                )}
            </div>
            <div className="min-w-0 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">{t('panel.missing.purchaseHistory')}</p>
                {purchases.length === 0 ? (
                    <p className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.missing.noPurchases')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[460px] text-sm">
                            <thead className="text-left text-xs text-[rgb(var(--color-gray-base))]">
                                <tr>
                                    <th className="py-1 pr-2 font-medium">{t('panel.capture.provider')}</th>
                                    <th className="py-1 pr-2 text-right font-medium">{t('panel.missing.times')}</th>
                                    <th className="py-1 pr-2 font-medium">{t('panel.missing.lastPurchase')}</th>
                                    <th className="py-1 pr-2 text-right font-medium">{t('panel.missing.lastCost')}</th>
                                    <th className="py-1 pr-2 text-right font-medium">{t('panel.missing.typicalQty')}</th>
                                    <th className="py-1" />
                                </tr>
                            </thead>
                            <tbody>
                                {purchases.map((purchase) => (
                                    <tr key={purchase.idproveedor} className="border-t border-[rgb(var(--color-border))]">
                                        <td className="py-1.5 pr-2 font-semibold">{providersById.get(purchase.idproveedor)?.empresa || purchase.idproveedor}</td>
                                        <td className="py-1.5 pr-2 text-right tabular-nums">{purchase.veces}</td>
                                        <td className="py-1.5 pr-2">{formatDate(purchase.ultima)}</td>
                                        <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(purchase.ultimo_costo)}</td>
                                        <td className="py-1.5 pr-2 text-right tabular-nums">{purchase.cantidad_tipica}</td>
                                        <td className="py-1.5 text-right">
                                            <button
                                                type="button"
                                                onClick={() => onUseProvider(purchase.idproveedor)}
                                                className="rounded-lg px-2 py-1 text-xs font-semibold text-amber-600 hover:bg-amber-400/15"
                                            >
                                                {t('panel.missing.useProvider')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {typical > 1 && typical > row.suggested && (
                    <p className="flex flex-wrap items-center gap-2 text-sm text-[rgb(var(--color-gray-base))]">
                        {t('panel.missing.typicalHint', { count: typical })}
                        <button type="button" onClick={() => onSetQty(typical)} className="rounded-lg px-2 py-1 text-xs font-semibold text-amber-600 hover:bg-amber-400/15">
                            {t('panel.missing.useQty', { count: typical })}
                        </button>
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Un renglon de "Que pedir": estado, existencia, venta mensual, proveedor
 * sugerido (se puede cambiar) y la cantidad del pedido.
 */
export function ReorderRow({ row, qty, idproveedor, months, coverage, providers, providersById, expanded, onToggle, onChange }) {
    const { t } = useTranslation();
    const cost = idproveedor ? costWith(row, idproveedor) : Number(row.costo) || 0;
    const supplied = new Set((row.compras || []).map((p) => p.idproveedor));
    const reason = row.recommendation?.idproveedor === idproveedor ? row.recommendation?.reason : 'manual';
    const coverageLabel = !Number.isFinite(row.months)
        ? t('panel.missing.noDemand')
        : row.stock <= 0
            ? t('panel.missing.noStock')
            : t('panel.missing.covers', { months: row.months >= 10 ? '10+' : row.months.toFixed(1) });

    return (
        <li className={`overflow-hidden rounded-2xl border bg-[rgb(var(--color-bg))] ${qty > 0 ? 'border-amber-400/70' : 'border-[rgb(var(--color-border))]'}`}>
            <div className="flex gap-3 p-3 sm:p-4">
                <img
                    src={resolveProductImage(row.ruta)}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                        const fallback = resolveProductImage('');
                        if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                    }}
                    className="size-16 shrink-0 rounded-xl bg-white object-cover shadow-sm sm:size-20"
                />
                <div className="min-w-0 flex-1 space-y-3">
                    <div className="grid grid-cols-2 items-center gap-x-3 gap-y-3 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto]">
                        <div className="col-span-2 min-w-0 sm:col-span-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={row.status} />
                                {!row.regular && row.rate > 0 && (
                                    <span className="rounded-full bg-[rgb(var(--color-gray))] px-2 py-0.5 text-xs text-[rgb(var(--color-gray-base))]">{t('panel.missing.occasional')}</span>
                                )}
                            </div>
                            <p className="mt-1 truncate font-bold tabular-nums">{row.num_parte}</p>
                            <p className="truncate text-sm text-[rgb(var(--color-gray-base))]">{row.descripcion}</p>
                        </div>

                        <div className="min-w-0">
                            <p className="text-xs text-[rgb(var(--color-gray-base))]">{t('panel.missing.stock')}</p>
                            <p className="text-lg font-bold tabular-nums">{row.stock}</p>
                            <p className="truncate text-xs text-[rgb(var(--color-gray-base))]">{coverageLabel}</p>
                        </div>

                        <div className="min-w-0">
                            <p className="text-xs text-[rgb(var(--color-gray-base))]">{t('panel.missing.perMonth')}</p>
                            <div className="flex items-end gap-2">
                                <span className="text-lg font-bold tabular-nums">{formatRate(row.rate)}</span>
                                {row.u12 > 0 && (
                                    <Sparkline
                                        months={months}
                                        serie={row.serie}
                                        label={t('panel.missing.sparkLabel', { part: row.num_parte, total: row.u12, months: months.length })}
                                    />
                                )}
                            </div>
                        </div>

                        <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                            {qty > 0 ? (
                                <QuantityStepper value={qty} onChange={(value) => onChange({ qty: value })} label={t('panel.missing.qtyFor', { part: row.num_parte })} />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onChange({ qty: Math.max(1, row.suggested) })}
                                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-sm font-semibold text-slate-900 shadow hover:bg-amber-400"
                                >
                                    <FaPlus className="size-3" aria-hidden="true" />
                                    {row.suggested > 0 ? t('panel.missing.addQty', { count: row.suggested }) : t('panel.missing.add')}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onToggle}
                                aria-expanded={expanded}
                                aria-label={t('panel.missing.details')}
                                title={t('panel.missing.details')}
                                className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-[rgb(var(--color-text))]/10"
                            >
                                <FaChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    {/* El proveedor va en su propia linea: junto a la grafica se veia amontonado. */}
                    <div className="flex flex-wrap items-end gap-x-3 gap-y-1 border-t border-dashed border-[rgb(var(--color-border))] pt-3">
                        <label className="block w-full min-w-0 sm:w-80">
                            <span className="text-xs text-[rgb(var(--color-gray-base))]">{t('panel.capture.provider')}</span>
                            <select
                                value={idproveedor ?? ''}
                                onChange={(e) => onChange({ idproveedor: e.target.value ? Number(e.target.value) : null })}
                                className="mt-0.5 h-10 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                            >
                                <option value="">{t('panel.missing.noProvider')}</option>
                                {supplied.size > 0 && (
                                    <optgroup label={t('panel.missing.suppliedBy')}>
                                        {(row.compras || []).map((p) => (
                                            <option key={p.idproveedor} value={p.idproveedor}>
                                                {providersById.get(p.idproveedor)?.empresa} · {formatCurrency(p.ultimo_costo)}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                <optgroup label={t('panel.missing.otherProviders')}>
                                    {providers.filter((p) => !supplied.has(p.idproveedor)).map((p) => (
                                        <option key={p.idproveedor} value={p.idproveedor}>{p.empresa}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </label>
                        <span className="pb-2.5 text-xs text-[rgb(var(--color-gray-base))]">
                            {idproveedor ? t(`panel.missing.reason_${reason}`, { cost: formatCurrency(cost) }) : t('panel.missing.pickProviderHint')}
                        </span>
                        {qty > 0 && (
                            <span className="pb-2.5 text-xs text-[rgb(var(--color-gray-base))] sm:ml-auto">
                                {qty !== row.suggested && row.suggested > 0
                                    ? t('panel.missing.suggestedWas', { count: row.suggested, coverage: t(coverageKey(coverage)) })
                                    : t('panel.missing.suggestedFor', { coverage: t(coverageKey(coverage)) })}
                                {' · '}
                                <strong className="text-[rgb(var(--color-text))] tabular-nums">{formatCurrency(qty * cost)}</strong>
                            </span>
                        )}
                    </div>
                </div>
            </div>
            {expanded && (
                <ProductDetail
                    row={row}
                    months={months}
                    providersById={providersById}
                    onUseProvider={(id) => onChange({ idproveedor: id, qty: qty || Math.max(1, row.suggested) })}
                    onSetQty={(value) => onChange({ qty: value })}
                />
            )}
        </li>
    );
}
