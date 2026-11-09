import React, { useEffect, useState } from 'react';
import { FaArrowRight, FaArrowsRotate, FaCircleCheck, FaGlobe, FaPlus, FaStore } from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';
import { formatCount, pluralKey } from './inventory-model';

const PREVIEW = 5;

function Kpi({ label, value, hint, accent, onClick }) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`min-w-0 rounded-2xl bg-[rgb(var(--color-bg))] p-3 text-left shadow-sm transition ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400' : ''}`}
        >
            <span className="block truncate text-xs font-medium text-[rgb(var(--color-gray-base))]">{label}</span>
            <span className={`block text-2xl font-bold tabular-nums sm:text-3xl ${accent}`}>{formatCount(value)}</span>
            <span className="flex items-center gap-1 text-xs text-[rgb(var(--color-gray-base))]">
                <span className="truncate">{hint}</span>
                {onClick && <FaArrowRight className="size-2.5 shrink-0" aria-hidden="true" />}
            </span>
        </Tag>
    );
}

/**
 * Estado de productos: lo que falta por asignar y cuanto tiene cada sucursal.
 * Cada numero lleva a la accion: los sin asignar abren su lista en Asignar a
 * sucursal, y el "faltan" de una sucursal la deja elegida con lo que le falta.
 */
export default function InventoryStatus({
    coverage,
    pending,
    loading,
    onRefresh,
    onShowPending,
    onAssignProduct,
    onBranchMissing,
}) {
    const { t } = useTranslation();
    const empty = loading && coverage.total === 0 && coverage.pending === 0;

    // Las barras crecen desde cero cuando llegan los datos: se ve de un
    // vistazo cual sucursal se queda corta.
    const [grown, setGrown] = useState(false);
    useEffect(() => {
        if (empty) return undefined;
        // Dos cuadros: con uno solo el navegador aun no pinta el ancho 0 y no hay transicion.
        let frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => setGrown(true));
        });
        return () => cancelAnimationFrame(frame);
    }, [empty]);

    const worst = coverage.rows
        .filter((row) => !row.isWeb && row.missing > 0)
        .sort((a, b) => b.missing - a.missing)[0];

    return (
        <section className="rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-5">
            <header className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold">{t('panel.addRegister.statusTitle')}</h2>
                    <p className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.inventories.statusSubtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={onRefresh}
                    aria-label={t('panel.assignment.refresh')}
                    title={t('panel.assignment.refresh')}
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-[rgb(var(--color-bg))] shadow-sm hover:bg-amber-400/30"
                >
                    <FaArrowsRotate className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
            </header>

            {empty ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-hidden="true">
                    {[0, 1, 2].map((key) => <div key={key} className="h-24 animate-pulse rounded-2xl bg-[rgb(var(--color-bg))]" />)}
                </div>
            ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                    <div className="min-w-0 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                            <Kpi
                                label={t('panel.inventories.kpiPending')}
                                value={coverage.pending}
                                hint={t('panel.inventories.kpiPendingHint')}
                                accent={coverage.pending ? 'text-amber-500' : ''}
                                onClick={onShowPending}
                            />
                            <Kpi
                                label={t('panel.addRegister.activeProducts')}
                                value={coverage.total}
                                hint={t('panel.inventories.kpiActiveHint')}
                                accent="text-[rgb(var(--color-success))]"
                            />
                            <Kpi
                                label={t('panel.inventories.kpiIncomplete')}
                                value={coverage.incomplete}
                                hint={t('panel.inventories.kpiIncompleteHint')}
                                accent={coverage.incomplete ? 'text-[rgb(var(--color-error))]' : ''}
                                onClick={worst ? () => onBranchMissing(worst.branch.idsucursal) : undefined}
                            />
                        </div>

                        <div className="rounded-2xl bg-[rgb(var(--color-bg))] p-3">
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">{t('panel.inventories.pendingTitle')}</p>
                            {pending.length === 0 ? (
                                <p className="flex items-center gap-2 py-2 text-sm">
                                    <FaCircleCheck className="size-4 shrink-0 text-[rgb(var(--color-success))]" aria-hidden="true" />
                                    {t('panel.inventories.pendingNone')}
                                </p>
                            ) : (
                                <ul className="space-y-1">
                                    {pending.slice(0, PREVIEW).map((product) => (
                                        <li key={product.num_parte} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-amber-400/15">
                                            <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                                            <span className="min-w-0 flex-1 truncate text-sm">
                                                <strong className="tabular-nums">{product.num_parte}</strong>
                                                <span className="text-[rgb(var(--color-gray-base))]"> · {product.descripcion}</span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => onAssignProduct(product)}
                                                aria-label={t('panel.inventories.addToBatch', { part: product.num_parte })}
                                                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-amber-500 px-2.5 text-xs font-semibold text-slate-900 hover:bg-amber-400"
                                            >
                                                <FaPlus className="size-2.5" aria-hidden="true" />
                                                {t('panel.assignment.assign')}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {pending.length > PREVIEW && (
                                <button
                                    type="button"
                                    onClick={onShowPending}
                                    className="mt-2 inline-flex items-center gap-1 px-2 text-sm font-semibold text-amber-600 hover:text-amber-500"
                                >
                                    {t('panel.inventories.seeAllPending', { count: formatCount(pending.length) })}
                                    <FaArrowRight className="size-3" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="min-w-0 rounded-2xl bg-[rgb(var(--color-bg))] p-3 sm:p-4">
                        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">{t('panel.inventories.coverageTitle')}</p>
                        <ul className="space-y-4">
                            {coverage.rows.map(({ branch, isWeb, count, missing, percent }) => {
                                const Icon = isWeb ? FaGlobe : FaStore;
                                const full = missing === 0 && coverage.total > 0;
                                const bar = isWeb ? 'bg-sky-500' : full ? 'bg-[rgb(var(--color-success))]' : 'bg-amber-500';
                                return (
                                    <li key={branch.idsucursal} className="space-y-1.5">
                                        <div className="flex items-baseline gap-2">
                                            <Icon className="size-3.5 shrink-0 self-center text-[rgb(var(--color-gray-base))]" aria-hidden="true" />
                                            <span className="min-w-0 flex-1 truncate font-semibold">{branch.sucursal}</span>
                                            <span className="shrink-0 text-sm tabular-nums text-[rgb(var(--color-gray-base))]">
                                                {formatCount(count)} / {formatCount(coverage.total)}
                                            </span>
                                            <span className="w-11 shrink-0 text-right text-sm font-bold tabular-nums">{percent}%</span>
                                        </div>
                                        <div
                                            className="h-2.5 overflow-hidden rounded-full bg-[rgb(var(--color-gray))]"
                                            role="progressbar"
                                            aria-label={branch.sucursal}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-valuenow={percent}
                                        >
                                            <div
                                                className={`h-full rounded-full ${bar} transition-[width] duration-700 ease-out`}
                                                style={{ width: grown ? `${Math.max(percent, count ? 2 : 0)}%` : 0 }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                            {full ? (
                                                <span className="inline-flex items-center gap-1 text-[rgb(var(--color-success))]">
                                                    <FaCircleCheck className="size-3" aria-hidden="true" />
                                                    {t('panel.inventories.branchComplete')}
                                                </span>
                                            ) : missing > 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onBranchMissing(branch.idsucursal)}
                                                    className="inline-flex items-center gap-1 font-semibold text-amber-600 hover:text-amber-500"
                                                >
                                                    {t(pluralKey('panel.inventories.branchMissing', missing), { count: formatCount(missing) })}
                                                    <FaArrowRight className="size-2.5" aria-hidden="true" />
                                                </button>
                                            ) : (
                                                <span className="text-[rgb(var(--color-gray-base))]">
                                                    {isWeb ? t('panel.inventories.webRule') : t('panel.inventories.branchEmpty')}
                                                </span>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                            {coverage.rows.length === 0 && (
                                <li className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.inventories.noBranches')}</li>
                            )}
                        </ul>
                    </div>
                </div>
            )}
        </section>
    );
}
