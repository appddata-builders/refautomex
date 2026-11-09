'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FaArrowsRotate,
    FaCircleCheck,
    FaCircleExclamation,
    FaClock,
    FaPause,
    FaPen,
    FaPlay,
    FaPlus,
    FaTrashCan,
    FaUpRightFromSquare,
} from 'react-icons/fa6';
import { PiSealPercentFill } from 'react-icons/pi';
import Title from '../title';
import PopPortal from '@/app/lib/pop-portal';
import { obtenerIdToken } from '@/app/lib/cognito-manager';
import { estadoPromocion, tiempoRestante } from '@/app/lib/promociones';
import { useTranslation } from '@/app/lib/text/text-provider';
import PromotionEditor from './promotion-editor';

const TOAST_MS = 6000;
const ZONA = 'America/Mexico_City';

const ESTADOS = {
    vigente: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    programada: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    pausada: 'bg-amber-400/25 text-amber-800 dark:text-amber-300',
    terminada: 'bg-[rgb(var(--color-gray))] text-[rgb(var(--color-gray-base))]',
};
const ORDEN = { vigente: 0, programada: 1, pausada: 2, terminada: 3 };

const formatoFecha = (iso) => new Date(iso).toLocaleString('es-MX', {
    timeZone: ZONA, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

const pedir = async (metodo, { query = '', body, json } = {}) => {
    const token = await obtenerIdToken();
    const response = await fetch(`/api/promociones${query}`, {
        method: metodo,
        cache: 'no-store',
        headers: {
            Authorization: `Bearer ${token}`,
            ...(json ? { 'Content-Type': 'application/json' } : {}),
        },
        body: json ? JSON.stringify(json) : body,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
};

// "2 d 04:12:09": lo que falta para `fin` (o para `inicio` si aun no empieza).
function Restante({ hasta, ahora, t }) {
    const { total, dias, horas, minutos, segundos } = tiempoRestante(hasta, ahora);
    if (!total) return null;
    const reloj = [horas, minutos, segundos].map((n) => String(n).padStart(2, '0')).join(':');
    return <span className="tabular-nums">{dias ? t('panel.promotions.daysShort', { count: dias }) : ''}{reloj}</span>;
}

/**
 * Servicios > Promociones (solo admin): las promociones de la tienda. Cada una
 * tiene foto de temporada, vigencia con fecha y hora y productos de WEB con
 * descuento. La tienda las muestra en Promociones con su conteo regresivo y
 * cobra el precio de oferta mientras estan vigentes (/api/promociones).
 */
export default function Promotions() {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3 || '';
    const [promociones, setPromociones] = useState([]);
    const [carga, setCarga] = useState({ estado: 'cargando', mensaje: '' });
    // null: la lista; { promocion: null }: crear; { promocion }: editar.
    const [edicion, setEdicion] = useState(null);
    const [borrando, setBorrando] = useState(null);
    const [ocupado, setOcupado] = useState(null);
    const [toast, setToast] = useState(null);
    const [ahora, setAhora] = useState(() => Date.now());
    const desfase = useRef(0);
    const toastTimer = useRef(null);

    const avisar = useCallback((siguiente) => {
        clearTimeout(toastTimer.current);
        setToast(siguiente);
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
    }, []);
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    const cargar = useCallback(async () => {
        setCarga((actual) => ({ ...actual, estado: 'cargando' }));
        try {
            const { ok, data } = await pedir('GET', { query: '?panel=1' });
            if (!ok) throw new Error(data?.error || t('panel.common.unexpectedError'));
            desfase.current = Date.parse(data.ahora) - Date.now();
            setPromociones(Array.isArray(data.promociones) ? data.promociones : []);
            setCarga({ estado: 'lista', mensaje: '' });
        } catch (error) {
            setCarga({ estado: 'error', mensaje: error.message });
        }
    }, [t]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const ordenadas = useMemo(() => promociones
        .map((promocion) => ({ ...promocion, estado: estadoPromocion(promocion, ahora) }))
        .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || Date.parse(a.fin) - Date.parse(b.fin)),
    [promociones, ahora]);
    const cuenta = (estado) => ordenadas.filter((p) => p.estado === estado).length;

    // El reloj corre solo si hay algo vigente o programado que contar.
    const conReloj = ordenadas.some((p) => p.estado === 'vigente' || p.estado === 'programada');
    useEffect(() => {
        if (!conReloj || edicion) return undefined;
        const timer = setInterval(() => setAhora(Date.now() + desfase.current), 1000);
        return () => clearInterval(timer);
    }, [conReloj, edicion]);

    const guardar = async ({ datos, foto }) => {
        const formulario = new FormData();
        formulario.append('datos', JSON.stringify(datos));
        if (foto) formulario.append('foto', foto);
        try {
            const { ok, data } = await pedir(datos.idpromocion ? 'PUT' : 'POST', { body: formulario });
            if (!ok) return { error: data?.error || t('panel.common.unexpectedError'), detalle: data?.detalle };
            setEdicion(null);
            avisar({ message: datos.idpromocion ? t('panel.promotions.saved') : t('panel.promotions.created') });
            cargar();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return null;
        } catch (error) {
            return { error: error.message };
        }
    };

    const alternarActiva = async (promocion) => {
        setOcupado(promocion.idpromocion);
        const { ok, data } = await pedir('PATCH', { json: { idpromocion: promocion.idpromocion, activa: !promocion.activa } })
            .catch((error) => ({ ok: false, data: { error: error.message } }));
        setOcupado(null);
        if (!ok) {
            avisar({ message: data?.error || t('panel.common.unexpectedError'), error: true });
            return;
        }
        avisar({ message: promocion.activa ? t('panel.promotions.paused') : t('panel.promotions.resumed') });
        cargar();
    };

    const borrar = async () => {
        const promocion = borrando;
        setOcupado(promocion.idpromocion);
        const { ok, data } = await pedir('DELETE', { query: `?id=${promocion.idpromocion}` })
            .catch((error) => ({ ok: false, data: { error: error.message } }));
        setOcupado(null);
        setBorrando(null);
        if (!ok) {
            avisar({ message: data?.error || t('panel.common.unexpectedError'), error: true });
            return;
        }
        avisar({ message: t('panel.promotions.deleted', { title: promocion.titulo }) });
        cargar();
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] pb-24 pt-28">
            <Title title={t('panel.promotions.title')} icon={PiSealPercentFill} back={t('panel.common.back')} path="/productivity" />

            {edicion ? (
                <PromotionEditor
                    key={edicion.promocion?.idpromocion ?? 'nueva'}
                    promocion={edicion.promocion}
                    onCancel={() => setEdicion(null)}
                    onSave={guardar}
                />
            ) : (
                <div className="mx-auto mt-5 max-w-7xl space-y-5 px-2 sm:px-4 xl:px-8">
                    <section className="flex flex-col gap-4 rounded-2xl bg-[rgb(var(--color-card))] p-4 shadow shadow-[rgb(var(--color-galaxy))] sm:flex-row sm:items-center sm:p-5">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-lg font-bold">{t('panel.promotions.listTitle')}</h2>
                            <p className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.promotions.listSubtitle')}</p>
                            {promociones.length > 0 && (
                                <p className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                                    {['vigente', 'programada', 'pausada', 'terminada'].filter(cuenta).map((estado) => (
                                        <span key={estado} className={`rounded-full px-2.5 py-0.5 ${ESTADOS[estado]}`}>
                                            {t(`panel.promotions.count_${estado}`, { count: cuenta(estado) })}
                                        </span>
                                    ))}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={cargar}
                                aria-label={t('panel.assignment.refresh')}
                                title={t('panel.assignment.refresh')}
                                className="grid size-11 shrink-0 place-items-center rounded-xl bg-[rgb(var(--color-bg))] hover:bg-amber-400/30"
                            >
                                <FaArrowsRotate className={`size-4 ${carga.estado === 'cargando' ? 'animate-spin' : ''}`} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setEdicion({ promocion: null })}
                                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 font-bold text-slate-900 shadow hover:bg-amber-400 sm:flex-none"
                            >
                                <FaPlus className="size-3.5" aria-hidden="true" />
                                {t('panel.promotions.new')}
                            </button>
                        </div>
                    </section>

                    {carga.estado === 'error' && (
                        <p role="alert" className="flex items-center gap-2 rounded-2xl bg-[rgb(var(--color-error))]/10 p-4 text-sm text-[rgb(var(--color-error))]">
                            <FaCircleExclamation className="size-4 shrink-0" aria-hidden="true" />
                            {carga.mensaje}
                        </p>
                    )}

                    {carga.estado === 'cargando' && !promociones.length ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
                            {[0, 1, 2].map((n) => <div key={n} className="h-80 animate-pulse rounded-2xl bg-[rgb(var(--color-card))]" />)}
                        </div>
                    ) : carga.estado !== 'error' && !promociones.length ? (
                        <div className="flex flex-col items-center gap-3 rounded-2xl bg-[rgb(var(--color-card))] p-10 text-center">
                            <PiSealPercentFill className="size-10 text-amber-500" aria-hidden="true" />
                            <p className="font-semibold">{t('panel.promotions.empty')}</p>
                            <p className="max-w-md text-sm text-[rgb(var(--color-gray-base))]">{t('panel.promotions.emptyHint')}</p>
                        </div>
                    ) : (
                        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {ordenadas.map((promocion) => {
                                const sinWeb = promocion.productos.filter((p) => !p.enWeb).length;
                                const enCurso = ocupado === promocion.idpromocion;
                                return (
                                    <li key={promocion.idpromocion} className="flex flex-col overflow-hidden rounded-2xl bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))]">
                                        <div className="relative aspect-[16/9] overflow-hidden bg-slate-950">
                                            {promocion.foto && (
                                                <>
                                                    <img src={`${multimediaSrc}${promocion.foto}`} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-2xl" />
                                                    <img src={`${multimediaSrc}${promocion.foto}`} alt="" loading="lazy" className="relative size-full object-contain" />
                                                </>
                                            )}
                                            <span className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-bold shadow ${ESTADOS[promocion.estado]} backdrop-blur`}>
                                                {t(`panel.promotions.status_${promocion.estado}`)}
                                            </span>
                                        </div>
                                        <div className="flex flex-1 flex-col gap-2 p-4">
                                            <h3 className="line-clamp-2 text-lg font-bold">{promocion.titulo}</h3>
                                            <p className="text-xs text-[rgb(var(--color-gray-base))]">
                                                {formatoFecha(promocion.inicio)} → {formatoFecha(promocion.fin)}
                                            </p>
                                            {(promocion.estado === 'vigente' || promocion.estado === 'programada') && (
                                                <p className="inline-flex items-center gap-2 text-sm font-semibold">
                                                    <FaClock className="size-3.5 text-amber-500" aria-hidden="true" />
                                                    {promocion.estado === 'vigente' ? t('panel.promotions.endsIn') : t('panel.promotions.startsIn')}
                                                    <Restante hasta={promocion.estado === 'vigente' ? promocion.fin : promocion.inicio} ahora={ahora} t={t} />
                                                </p>
                                            )}
                                            <p className="text-sm">
                                                {t(promocion.productos.length === 1 ? 'panel.promotions.productsOne' : 'panel.promotions.products', { count: promocion.productos.length })}
                                            </p>
                                            {sinWeb > 0 && (
                                                <p className="flex items-start gap-1.5 text-xs text-[rgb(var(--color-error))]">
                                                    <FaCircleExclamation className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                                                    {t('panel.promotions.notInWebWarning', { count: sinWeb })}
                                                </p>
                                            )}
                                            <div className="mt-auto flex flex-wrap gap-2 border-t border-[rgb(var(--color-border))] pt-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setEdicion({ promocion })}
                                                    disabled={enCurso}
                                                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[rgb(var(--color-bg))] px-3 text-sm font-semibold hover:bg-amber-400/25 disabled:opacity-60"
                                                >
                                                    <FaPen className="size-3" aria-hidden="true" />
                                                    {t('panel.promotions.edit')}
                                                </button>
                                                {promocion.estado !== 'terminada' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => alternarActiva(promocion)}
                                                        disabled={enCurso}
                                                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[rgb(var(--color-bg))] px-3 text-sm font-semibold hover:bg-amber-400/25 disabled:opacity-60"
                                                    >
                                                        {promocion.activa ? <FaPause className="size-3" aria-hidden="true" /> : <FaPlay className="size-3" aria-hidden="true" />}
                                                        {promocion.activa ? t('panel.promotions.pause') : t('panel.promotions.resume')}
                                                    </button>
                                                )}
                                                {promocion.estado === 'vigente' && (
                                                    <a
                                                        href="/section/promotion"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[rgb(var(--color-bg))] px-3 text-sm font-semibold hover:bg-amber-400/25"
                                                    >
                                                        <FaUpRightFromSquare className="size-3" aria-hidden="true" />
                                                        {t('panel.promotions.viewSite')}
                                                    </a>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setBorrando(promocion)}
                                                    disabled={enCurso}
                                                    aria-label={t('panel.promotions.deleteNamed', { title: promocion.titulo })}
                                                    className="ml-auto grid size-10 place-items-center rounded-xl text-[rgb(var(--color-error))] hover:bg-[rgb(var(--color-error))]/10 disabled:opacity-60"
                                                >
                                                    <FaTrashCan className="size-3.5" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}

            {borrando && (
                <PopPortal>
                    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="promo-borrar">
                        <div className="w-full max-w-sm space-y-4 rounded-2xl bg-[rgb(var(--color-card))] p-5 shadow-2xl">
                            <h3 id="promo-borrar" className="text-lg font-bold">{t('panel.promotions.deleteTitle')}</h3>
                            <p className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.promotions.deleteBody', { title: borrando.titulo })}</p>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setBorrando(null)}
                                    disabled={ocupado === borrando.idpromocion}
                                    className="h-11 rounded-xl px-4 font-semibold text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10"
                                >
                                    {t('panel.common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={borrar}
                                    disabled={ocupado === borrando.idpromocion}
                                    className="h-11 rounded-xl bg-red-600 px-4 font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                                >
                                    {t('panel.promotions.deleteConfirm')}
                                </button>
                            </div>
                        </div>
                    </div>
                </PopPortal>
            )}

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
