'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
    FaBagShopping,
    FaChevronDown,
    FaCircleExclamation,
    FaClipboardList,
    FaRotateRight,
    FaTruckFast,
} from 'react-icons/fa6';
import { obtenerIdToken } from '@/app/lib/cognito-manager';
import { PRODUCT_FALLBACK_IMAGE, resolveProductImage } from '@/app/lib/product-images';
import { useTranslation } from '@/app/lib/text/text-provider';
import OrderProgress, { OrderStatusBadge } from './order-progress';

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const formatDate = (iso, lang) => (iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : '');

const unitsOf = (pedido) => pedido.articulos.reduce((acc, item) => acc + (item.cantidad || 0), 0);

/**
 * Mis pedidos: las compras en linea del cliente con sesion, cada una con su
 * avance y lo que incluye. Los datos salen de /api/mis-pedidos, que toma al
 * cliente del token y no de un id en la URL.
 */
export default function OrderHistory() {
    const { t } = useTranslation();
    const lang = useSearchParams().get('lang') || 'es';
    // error: 'signin' (sin sesion o vencida) o 'load'.
    const [state, setState] = useState({ status: 'loading', pedidos: [], error: null });
    const [openFolio, setOpenFolio] = useState(null);

    const load = useCallback(async () => {
        setState((prev) => ({ ...prev, status: 'loading', error: null }));
        let token;
        try {
            token = await obtenerIdToken();
        } catch {
            setState({ status: 'error', pedidos: [], error: 'signin' });
            return;
        }
        try {
            const response = await fetch('/api/mis-pedidos', {
                cache: 'no-store',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.status === 401) {
                setState({ status: 'error', pedidos: [], error: 'signin' });
                return;
            }
            if (!response.ok) throw new Error(`Error ${response.status}`);
            const data = await response.json();
            const pedidos = Array.isArray(data?.pedidos) ? data.pedidos : [];
            setState({ status: 'ready', pedidos, error: null });
            // El mas reciente abierto: casi siempre es el que se viene a ver.
            setOpenFolio((prev) => prev ?? pedidos[0]?.folio ?? null);
        } catch (error) {
            console.error('Error fetching orders:', error);
            setState({ status: 'error', pedidos: [], error: 'load' });
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const { status, pedidos, error } = state;

    return (
        <section className="bg-[rgb(var(--color-card))]">
            <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 sm:py-32">
                <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight linear-text-title">
                            <FaClipboardList className="size-8 text-[rgb(var(--color-galaxy))]" aria-hidden="true" />
                            {t('account.historyTitle')}
                        </h1>
                        <p className="mt-2 text-[rgb(var(--color-text))]/70">{t('account.historyIntro')}</p>
                    </div>
                    {status !== 'loading' && (
                        <button
                            type="button"
                            onClick={load}
                            className="inline-flex h-11 items-center gap-2 self-start rounded-full px-4 text-sm font-semibold text-[rgb(var(--color-text))]/70 transition hover:bg-[rgb(var(--color-text))]/10 sm:self-auto"
                        >
                            <FaRotateRight className="size-3.5" aria-hidden="true" />
                            {t('account.historyRefresh')}
                        </button>
                    )}
                </header>

                {status === 'loading' && (
                    <ul className="space-y-4" aria-busy="true">
                        {[0, 1, 2].map((key) => (
                            <li key={key} className="h-28 animate-pulse rounded-2xl bg-[rgb(var(--color-bg))]" />
                        ))}
                    </ul>
                )}

                {status === 'error' && (
                    <div role="alert" className="flex flex-col items-center gap-4 rounded-2xl bg-[rgb(var(--color-bg))] p-8 text-center shadow shadow-[rgb(var(--color-galaxy))]">
                        <FaCircleExclamation className="size-8 text-rose-500" aria-hidden="true" />
                        <p className="text-[rgb(var(--color-text))]">
                            {error === 'signin' ? t('account.historySignIn') : t('account.historyLoadError')}
                        </p>
                        {error === 'signin' ? (
                            <Link
                                href={`/section/account?load=log-in&lang=${lang}`}
                                className="inline-flex h-11 items-center rounded-full bg-[rgb(var(--color-refautomex))] px-6 font-semibold text-slate-900 shadow"
                            >
                                {t('account.historySignInCta')}
                            </Link>
                        ) : (
                            <button
                                type="button"
                                onClick={load}
                                className="inline-flex h-11 items-center gap-2 rounded-full bg-[rgb(var(--color-refautomex))] px-6 font-semibold text-slate-900 shadow"
                            >
                                <FaRotateRight className="size-3.5" aria-hidden="true" />
                                {t('account.historyRetry')}
                            </button>
                        )}
                    </div>
                )}

                {status === 'ready' && pedidos.length === 0 && (
                    <div className="flex flex-col items-center gap-4 rounded-2xl bg-[rgb(var(--color-bg))] p-10 text-center shadow shadow-[rgb(var(--color-galaxy))]">
                        <span className="grid size-16 place-items-center rounded-2xl bg-[rgb(var(--color-refautomex))] text-slate-900 shadow">
                            <FaBagShopping className="size-7" aria-hidden="true" />
                        </span>
                        <p className="text-lg font-semibold text-[rgb(var(--color-text))]">{t('account.historyEmpty')}</p>
                        <Link
                            href={`/section/products?lang=${lang}`}
                            className="inline-flex h-11 items-center rounded-full bg-[rgb(var(--color-text-base))] px-6 font-semibold text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))] transition hover:bg-[rgb(var(--color-refautomex))] hover:text-slate-900"
                        >
                            {t('account.historyShop')}
                        </Link>
                    </div>
                )}

                {status === 'ready' && pedidos.length > 0 && (
                    <ul className="space-y-4">
                        {pedidos.map((pedido) => {
                            const open = openFolio === pedido.folio;
                            const units = unitsOf(pedido);
                            const panelId = `pedido-${pedido.folio}`;
                            return (
                                <li key={pedido.folio} className="overflow-hidden rounded-2xl bg-[rgb(var(--color-bg))] shadow shadow-[rgb(var(--color-galaxy))]">
                                    <button
                                        type="button"
                                        onClick={() => setOpenFolio(open ? '' : pedido.folio)}
                                        aria-expanded={open}
                                        aria-controls={panelId}
                                        className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-[rgb(var(--color-text))]/5 sm:p-6"
                                    >
                                        <span className="flex shrink-0 -space-x-4">
                                            {pedido.articulos.slice(0, 3).map((item, index) => (
                                                <img
                                                    key={`${item.num_parte}-${index}`}
                                                    src={resolveProductImage(item.ruta)}
                                                    alt=""
                                                    onError={(event) => {
                                                        event.currentTarget.onerror = null;
                                                        event.currentTarget.src = PRODUCT_FALLBACK_IMAGE;
                                                    }}
                                                    className="size-14 rounded-xl border-2 border-[rgb(var(--color-bg))] bg-white object-contain shadow sm:size-16"
                                                />
                                            ))}
                                            {pedido.articulos.length === 0 && (
                                                <span className="grid size-14 place-items-center rounded-xl bg-[rgb(var(--color-card))] sm:size-16">
                                                    <FaBagShopping className="size-5 text-[rgb(var(--color-text))]/40" aria-hidden="true" />
                                                </span>
                                            )}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <span className="whitespace-nowrap text-lg font-bold tabular-nums text-[rgb(var(--color-text))]">{pedido.folio}</span>
                                                <OrderStatusBadge etapa={pedido.etapa} />
                                            </span>
                                            <span className="mt-1 block text-sm text-[rgb(var(--color-text))]/60">
                                                {formatDate(pedido.fecha, lang)}
                                                {units > 0 && ` · ${t(units === 1 ? 'account.historyUnitsOne' : 'account.historyUnits', { count: units })}`}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            <span className="block text-lg font-bold tabular-nums text-[rgb(var(--color-success))]">{currency.format(pedido.total)}</span>
                                            <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--color-text))]/60">
                                                {open ? t('account.historyHide') : t('account.historyView')}
                                                <FaChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                                            </span>
                                        </span>
                                    </button>

                                    {open && (
                                        <div id={panelId} className="space-y-5 border-t border-[rgb(var(--color-text))]/10 p-4 sm:p-6">
                                            <OrderProgress etapa={pedido.etapa} paso={pedido.paso} />

                                            {(pedido.nota || pedido.entrega) && (
                                                <div className="space-y-1 rounded-2xl bg-[rgb(var(--color-card))] px-4 py-3 text-sm text-[rgb(var(--color-text))]/80">
                                                    {pedido.entrega && pedido.etapa !== 'done' && (
                                                        <p className="flex items-center gap-2">
                                                            <FaTruckFast className="size-4 shrink-0 text-[rgb(var(--color-galaxy))]" aria-hidden="true" />
                                                            {t('account.historyDelivery', { date: formatDate(pedido.entrega, lang) })}
                                                        </p>
                                                    )}
                                                    {pedido.nota && (
                                                        <p>
                                                            <span className="font-semibold text-[rgb(var(--color-text))]">{t('account.historyNote')}: </span>
                                                            {pedido.nota}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            <ul className="divide-y divide-[rgb(var(--color-text))]/10">
                                                {pedido.articulos.map((item, index) => (
                                                    <li key={`${item.num_parte}-${index}`} className="flex items-center gap-4 py-3">
                                                        <img
                                                            src={resolveProductImage(item.ruta)}
                                                            alt={item.descripcion}
                                                            onError={(event) => {
                                                                event.currentTarget.onerror = null;
                                                                event.currentTarget.src = PRODUCT_FALLBACK_IMAGE;
                                                            }}
                                                            className="size-16 shrink-0 rounded-xl bg-white object-contain shadow sm:size-20"
                                                        />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block font-semibold text-[rgb(var(--color-text))]">{item.descripcion}</span>
                                                            <span className="block text-xs tabular-nums text-[rgb(var(--color-text))]/60">
                                                                {t('account.historyPart', { part: item.num_parte })}
                                                            </span>
                                                            <span className="mt-1 block text-sm tabular-nums text-[rgb(var(--color-text))]/70">
                                                                {item.cantidad} × {currency.format(item.precio)}
                                                            </span>
                                                        </span>
                                                        <span className="shrink-0 font-semibold tabular-nums text-[rgb(var(--color-text))]">
                                                            {currency.format(item.importe)}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>

                                            <div className="flex items-center justify-between border-t border-[rgb(var(--color-text))]/10 pt-4 font-semibold text-[rgb(var(--color-text))]">
                                                <span>{t('account.historyTotal')}</span>
                                                <span className="text-lg tabular-nums text-[rgb(var(--color-success))]">{currency.format(pedido.total)}</span>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </section>
    );
}
