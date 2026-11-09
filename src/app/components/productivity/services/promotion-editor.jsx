import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    FaCamera,
    FaCheck,
    FaCircleExclamation,
    FaPercent,
    FaPlus,
    FaTrashCan,
    FaXmark,
} from 'react-icons/fa6';
import FindProducts, { resolveProductImage } from '../sales/find-products';
import { netAfterStripe } from '@/app/lib/stripe-fees';
import {
    MAX_DESCRIPCION,
    MAX_FOTO_MB,
    MAX_PORCENTAJE,
    MAX_TITULO,
    TIPOS_FOTO,
    ahorroPorcentaje,
    precioPromocion,
    validarPromocion,
} from '@/app/lib/promociones';
import { useTranslation } from '@/app/lib/text/text-provider';
import { formatMoney } from '../stock/inventory-model';

const WEB_BRANCH = { id: 1, label: 'WEB' };
const DURACIONES = [3, 7, 15, 30];
const IVA = 1.16;
const DIA_MS = 86_400_000;

const INPUT = 'h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-amber-400';

// El input datetime-local trabaja con la hora del equipo, sin zona; la base
// guarda el instante (ISO con zona).
const pad = (n) => String(n).padStart(2, '0');
export const aLocal = (iso) => {
    if (!iso) return '';
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return '';
    return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
};
const aIso = (local) => {
    const fecha = new Date(local);
    return Number.isNaN(fecha.getTime()) ? '' : fecha.toISOString();
};

// Una promocion nueva empieza en la siguiente hora en punto y dura una semana.
const vigenciaInicial = () => {
    const inicio = new Date();
    inicio.setMinutes(0, 0, 0);
    inicio.setHours(inicio.getHours() + 1);
    return { inicio: aLocal(inicio.toISOString()), fin: aLocal(new Date(inicio.getTime() + 7 * DIA_MS).toISOString()) };
};

// Una foto HEIC del iPhone se convierte a JPG antes de subirla: S3 la serviria
// pero la mayoria de los navegadores no la pintan.
const prepararFoto = async (archivo) => {
    const heic = /image\/hei[cf]/.test(archivo.type) || /\.hei[cf]$/i.test(archivo.name);
    if (!heic) return archivo;
    const { default: heic2any } = await import('heic2any');
    const convertido = await heic2any({ blob: archivo, toType: 'image/jpeg', quality: 0.85 });
    const blob = Array.isArray(convertido) ? convertido[0] : convertido;
    return new File([blob], archivo.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' });
};

const filaDeProducto = (producto, previo) => ({
    num_parte: producto.num_parte,
    descripcion: producto.descripcion,
    rutas: producto.rutas || [],
    precioRegular: Number(producto.precioRegular ?? producto.precio) || 0,
    costo: Number(producto.costo) || null,
    tipo: previo?.tipo ?? producto.tipo ?? 'porcentaje',
    valor: String(previo?.valor ?? producto.valor ?? 10),
});

function Paso({ numero, titulo, children, aside }) {
    return (
        <section className="space-y-4 rounded-2xl bg-[rgb(var(--color-card))] p-4 shadow shadow-[rgb(var(--color-galaxy))] sm:p-5">
            <div className="flex items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-500 text-sm font-bold text-slate-900">{numero}</span>
                <h3 className="min-w-0 flex-1 text-lg font-bold">{titulo}</h3>
                {aside}
            </div>
            {children}
        </section>
    );
}

function Campo({ id, label, error, hint, children }) {
    return (
        <div className="space-y-1">
            <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
            {children}
            {error ? (
                <p className="flex items-center gap-1.5 text-xs text-[rgb(var(--color-error))]">
                    <FaCircleExclamation className="size-3 shrink-0" aria-hidden="true" />
                    {error}
                </p>
            ) : hint && <p className="text-xs text-[rgb(var(--color-gray-base))]">{hint}</p>}
        </div>
    );
}

/**
 * Crear o editar una promocion: foto de temporada, datos y vigencia, y los
 * productos de WEB con su descuento. Cada producto muestra lo que llega
 * despues de Stripe y la ganancia contra su costo, para no promocionar con
 * perdida sin darse cuenta.
 *
 * `promocion` es null al crear. `onSave({ datos, foto })` guarda y devuelve
 * { error, detalle } si el servidor rechaza algo.
 */
export default function PromotionEditor({ promocion, onCancel, onSave }) {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3 || '';
    const nueva = !promocion;
    const fileRef = useRef(null);

    const [titulo, setTitulo] = useState(promocion?.titulo ?? '');
    const [descripcion, setDescripcion] = useState(promocion?.descripcion ?? '');
    const [vigencia, setVigencia] = useState(() => (promocion
        ? { inicio: aLocal(promocion.inicio), fin: aLocal(promocion.fin) }
        : vigenciaInicial()));
    const [activa, setActiva] = useState(promocion?.activa ?? true);
    const [foto, setFoto] = useState(null);
    const [fotoError, setFotoError] = useState('');
    const [preparando, setPreparando] = useState(false);
    const [arrastrando, setArrastrando] = useState(false);
    const [filas, setFilas] = useState(() => (promocion?.productos || []).map((producto) => filaDeProducto(producto)));
    const [porcentajeTodos, setPorcentajeTodos] = useState('10');
    const [intentado, setIntentado] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [errorServidor, setErrorServidor] = useState(null);

    const vistaFoto = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto]);
    useEffect(() => () => {
        if (vistaFoto) URL.revokeObjectURL(vistaFoto);
    }, [vistaFoto]);
    const fotoActual = vistaFoto || (promocion?.foto ? `${multimediaSrc}${promocion.foto}` : null);

    const elegidas = useMemo(() => new Set(filas.map((fila) => fila.num_parte)), [filas]);
    const partesConError = new Set(errorServidor?.detalle?.partes || []);

    const datos = {
        titulo,
        descripcion,
        inicio: aIso(vigencia.inicio),
        fin: aIso(vigencia.fin),
        activa,
        productos: filas.map(({ num_parte, tipo, valor }) => ({ num_parte, tipo, valor: Number(valor) })),
    };
    const errores = validarPromocion(datos, { nueva });
    const filasInvalidas = filas.filter((fila) => precioPromocion(fila.precioRegular, fila.tipo, fila.valor) === null);
    const faltaFoto = nueva && !foto;
    const mostrar = (campo) => (intentado && errores[campo] ? t(`panel.promotions.err_${errores[campo]}`) : '');

    const elegirFoto = async (archivo) => {
        if (!archivo) return;
        setFotoError('');
        setPreparando(true);
        try {
            const lista = await prepararFoto(archivo);
            if (!TIPOS_FOTO.includes(lista.type)) throw new Error(t('panel.promotions.err_photoType'));
            if (lista.size > MAX_FOTO_MB * 1024 * 1024) throw new Error(t('panel.promotions.err_photoSize', { mb: MAX_FOTO_MB }));
            setFoto(lista);
        } catch (error) {
            setFotoError(error.message || t('panel.promotions.err_photoType'));
        } finally {
            setPreparando(false);
        }
    };

    const alternarProducto = (producto) => {
        setErrorServidor(null);
        setFilas((actuales) => (actuales.some((fila) => fila.num_parte === producto.num_parte)
            ? actuales.filter((fila) => fila.num_parte !== producto.num_parte)
            : [...actuales, filaDeProducto(producto, { tipo: 'porcentaje', valor: porcentajeTodos || 10 })]));
    };

    const cambiarFila = (parte, cambios) => {
        setErrorServidor(null);
        setFilas((actuales) => actuales.map((fila) => (fila.num_parte === parte ? { ...fila, ...cambios } : fila)));
    };

    const aplicarATodos = () => {
        const valor = Number(porcentajeTodos);
        if (!(valor >= 1 && valor <= MAX_PORCENTAJE)) return;
        setFilas((actuales) => actuales.map((fila) => ({ ...fila, tipo: 'porcentaje', valor: String(valor) })));
    };

    const fijarDuracion = (dias) => {
        const inicio = new Date(vigencia.inicio);
        if (Number.isNaN(inicio.getTime())) return;
        setVigencia((actual) => ({ ...actual, fin: aLocal(new Date(inicio.getTime() + dias * DIA_MS).toISOString()) }));
    };

    const guardar = async (event) => {
        event.preventDefault();
        setIntentado(true);
        setErrorServidor(null);
        if (Object.keys(errores).length || filasInvalidas.length || faltaFoto) return;
        setGuardando(true);
        const resultado = await onSave({ datos: nueva ? datos : { ...datos, idpromocion: promocion.idpromocion }, foto });
        setGuardando(false);
        if (resultado?.error) setErrorServidor(resultado);
    };

    const productAction = (producto) => {
        const dentro = elegidas.has(producto.num_parte);
        return dentro
            ? { label: t('panel.promotions.removeProduct'), tone: 'added', icon: FaCheck, iconOnly: true, onClick: () => alternarProducto(producto) }
            : { label: t('panel.promotions.addProduct'), tone: 'primary', icon: FaPlus, iconOnly: true, onClick: () => alternarProducto(producto) };
    };

    return (
        <form onSubmit={guardar} noValidate className="mx-auto mt-5 max-w-7xl space-y-5 px-2 pb-28 sm:px-4 xl:px-8">
            <header className="flex items-center gap-3 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-4">
                <button
                    type="button"
                    onClick={onCancel}
                    aria-label={t('panel.common.cancel')}
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-[rgb(var(--color-bg))] hover:bg-[rgb(var(--color-text))]/10"
                >
                    <FaXmark className="size-4" aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">
                        {nueva ? t('panel.promotions.newTitle') : t('panel.promotions.editTitle')}
                    </p>
                    <h2 className="truncate text-xl font-bold">{titulo.trim() || t('panel.promotions.untitled')}</h2>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
                <div className="space-y-5 lg:sticky lg:top-24">
                    <Paso numero="1" titulo={t('panel.promotions.photoTitle')}>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                            className="hidden"
                            onChange={(event) => {
                                elegirFoto(event.target.files?.[0]);
                                event.target.value = '';
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            onDragOver={(event) => {
                                event.preventDefault();
                                setArrastrando(true);
                            }}
                            onDragLeave={() => setArrastrando(false)}
                            onDrop={(event) => {
                                event.preventDefault();
                                setArrastrando(false);
                                elegirFoto(event.dataTransfer.files?.[0]);
                            }}
                            className={`group relative grid aspect-[16/9] w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed transition ${arrastrando ? 'border-amber-400 bg-amber-400/15' : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] hover:border-amber-400'}`}
                        >
                            {fotoActual ? (
                                <>
                                    <img src={fotoActual} alt="" className="absolute inset-0 size-full object-cover" />
                                    <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1.5 text-sm font-semibold text-white">
                                        <FaCamera className="size-3.5" aria-hidden="true" />
                                        {t('panel.promotions.photoChange')}
                                    </span>
                                </>
                            ) : (
                                <span className="flex flex-col items-center gap-2 px-4 text-center text-sm text-[rgb(var(--color-gray-base))]">
                                    <FaCamera className="size-7 text-amber-500" aria-hidden="true" />
                                    <strong className="text-[rgb(var(--color-text))]">{preparando ? t('panel.promotions.photoPreparing') : t('panel.promotions.photoPick')}</strong>
                                    {t('panel.promotions.photoHint', { mb: MAX_FOTO_MB })}
                                </span>
                            )}
                        </button>
                        {(fotoError || (intentado && faltaFoto)) && (
                            <p className="flex items-center gap-1.5 text-xs text-[rgb(var(--color-error))]">
                                <FaCircleExclamation className="size-3 shrink-0" aria-hidden="true" />
                                {fotoError || t('panel.promotions.err_photoRequired')}
                            </p>
                        )}
                    </Paso>

                    <Paso numero="2" titulo={t('panel.promotions.dataTitle')}>
                        <Campo id="promo-titulo" label={t('panel.promotions.fieldTitle')} error={mostrar('titulo')}>
                            <input
                                id="promo-titulo"
                                value={titulo}
                                maxLength={MAX_TITULO}
                                onChange={(event) => setTitulo(event.target.value)}
                                placeholder={t('panel.promotions.fieldTitlePlaceholder')}
                                className={INPUT}
                            />
                        </Campo>
                        <Campo
                            id="promo-descripcion"
                            label={t('panel.promotions.fieldDescription')}
                            error={mostrar('descripcion')}
                            hint={t('panel.promotions.fieldDescriptionHint', { count: descripcion.length, max: MAX_DESCRIPCION })}
                        >
                            <textarea
                                id="promo-descripcion"
                                value={descripcion}
                                maxLength={MAX_DESCRIPCION}
                                rows={3}
                                onChange={(event) => setDescripcion(event.target.value)}
                                className={`${INPUT} h-auto py-2`}
                            />
                        </Campo>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Campo id="promo-inicio" label={t('panel.promotions.fieldStart')} error={mostrar('inicio')}>
                                <input
                                    id="promo-inicio"
                                    type="datetime-local"
                                    value={vigencia.inicio}
                                    onChange={(event) => setVigencia((actual) => ({ ...actual, inicio: event.target.value }))}
                                    className={INPUT}
                                />
                            </Campo>
                            <Campo id="promo-fin" label={t('panel.promotions.fieldEnd')} error={mostrar('fin')}>
                                <input
                                    id="promo-fin"
                                    type="datetime-local"
                                    value={vigencia.fin}
                                    onChange={(event) => setVigencia((actual) => ({ ...actual, fin: event.target.value }))}
                                    className={INPUT}
                                />
                            </Campo>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-[rgb(var(--color-gray-base))]">{t('panel.promotions.duration')}</span>
                            {DURACIONES.map((dias) => (
                                <button
                                    key={dias}
                                    type="button"
                                    onClick={() => fijarDuracion(dias)}
                                    className="h-8 rounded-full border border-[rgb(var(--color-border))] px-3 font-semibold hover:border-amber-400 hover:bg-amber-400/15"
                                >
                                    {t('panel.promotions.durationDays', { count: dias })}
                                </button>
                            ))}
                        </div>
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[rgb(var(--color-bg))] p-3">
                            <input
                                type="checkbox"
                                checked={activa}
                                onChange={(event) => setActiva(event.target.checked)}
                                className="mt-0.5 size-5 accent-amber-500"
                            />
                            <span>
                                <span className="block text-sm font-semibold">{t('panel.promotions.fieldActive')}</span>
                                <span className="block text-xs text-[rgb(var(--color-gray-base))]">{t('panel.promotions.fieldActiveHint')}</span>
                            </span>
                        </label>
                    </Paso>
                </div>

                <Paso
                    numero="3"
                    titulo={t('panel.promotions.productsTitle')}
                    aside={filas.length > 0 && (
                        <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-sm font-bold tabular-nums">{filas.length}</span>
                    )}
                >
                    <p className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.promotions.productsHint')}</p>
                    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))]">
                        <FindProducts
                            branch={WEB_BRANCH}
                            includeWebBranch={false}
                            includePendingProducts={false}
                            productAction={productAction}
                            listClassName="max-h-[22rem]"
                            emptyMessage={t('panel.promotions.noWebProducts')}
                        />
                    </div>

                    {filas.length === 0 ? (
                        <p className={`rounded-2xl p-5 text-center text-sm ${intentado && errores.productos ? 'bg-[rgb(var(--color-error))]/10 text-[rgb(var(--color-error))]' : 'bg-[rgb(var(--color-bg))] text-[rgb(var(--color-gray-base))]'}`}>
                            {intentado && errores.productos ? t(`panel.promotions.err_${errores.productos}`) : t('panel.promotions.productsEmpty')}
                        </p>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[rgb(var(--color-bg))] p-3 text-sm">
                                <span className="font-semibold">{t('panel.promotions.applyAll')}</span>
                                <span className="relative">
                                    <input
                                        type="number"
                                        min={1}
                                        max={MAX_PORCENTAJE}
                                        value={porcentajeTodos}
                                        onChange={(event) => setPorcentajeTodos(event.target.value)}
                                        aria-label={t('panel.promotions.applyAll')}
                                        className="h-10 w-24 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] pl-3 pr-8 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
                                    />
                                    <FaPercent className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-[rgb(var(--color-gray-base))]" aria-hidden="true" />
                                </span>
                                <button
                                    type="button"
                                    onClick={aplicarATodos}
                                    className="h-10 rounded-xl bg-[rgb(var(--color-text))] px-4 font-semibold text-[rgb(var(--color-card))] hover:opacity-90"
                                >
                                    {t('panel.promotions.applyAllButton')}
                                </button>
                            </div>
                            <ul className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl bg-[rgb(var(--color-bg))]">
                                {filas.map((fila) => {
                                    const precio = precioPromocion(fila.precioRegular, fila.tipo, fila.valor);
                                    const neto = precio === null ? null : netAfterStripe(precio);
                                    const ganancia = neto !== null && fila.costo ? neto / IVA - fila.costo : null;
                                    const marcada = partesConError.has(fila.num_parte) || (intentado && precio === null);
                                    return (
                                        <li key={fila.num_parte} className={`flex flex-wrap items-center gap-3 p-3 ${marcada ? 'bg-[rgb(var(--color-error))]/10' : ''}`}>
                                            <img
                                                src={resolveProductImage(fila.rutas?.[0], multimediaSrc)}
                                                alt=""
                                                className="size-14 shrink-0 rounded-xl bg-white object-contain"
                                            />
                                            <span className="min-w-0 flex-1 basis-40">
                                                <span className="block truncate font-bold tabular-nums">{fila.num_parte}</span>
                                                <span className="line-clamp-1 text-sm text-[rgb(var(--color-text))]/80">{fila.descripcion}</span>
                                                <span className="text-xs tabular-nums text-[rgb(var(--color-gray-base))]">
                                                    {t('panel.promotions.webPrice', { amount: formatMoney(fila.precioRegular) })}
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <span className="inline-flex rounded-xl bg-[rgb(var(--color-card))] p-1" role="group" aria-label={t('panel.promotions.discountType')}>
                                                    {['porcentaje', 'precio'].map((tipo) => (
                                                        <button
                                                            key={tipo}
                                                            type="button"
                                                            aria-pressed={fila.tipo === tipo}
                                                            onClick={() => cambiarFila(fila.num_parte, {
                                                                tipo,
                                                                valor: tipo === 'precio'
                                                                    ? String(precio ?? fila.precioRegular)
                                                                    : String(ahorroPorcentaje(fila.precioRegular, precio ?? fila.precioRegular) || 10),
                                                            })}
                                                            className={`h-8 min-w-9 rounded-lg px-2 text-sm font-bold ${fila.tipo === tipo ? 'bg-amber-500 text-slate-900' : 'text-[rgb(var(--color-gray-base))]'}`}
                                                        >
                                                            {tipo === 'porcentaje' ? '%' : '$'}
                                                        </button>
                                                    ))}
                                                </span>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={fila.tipo === 'porcentaje' ? 1 : 0.01}
                                                    max={fila.tipo === 'porcentaje' ? MAX_PORCENTAJE : undefined}
                                                    step={fila.tipo === 'porcentaje' ? 1 : 0.01}
                                                    value={fila.valor}
                                                    onChange={(event) => cambiarFila(fila.num_parte, { valor: event.target.value })}
                                                    aria-label={t('panel.promotions.discountValue', { part: fila.num_parte })}
                                                    className="h-10 w-24 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-2 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                />
                                            </span>
                                            <span className="w-32 shrink-0 text-right tabular-nums">
                                                {precio === null ? (
                                                    <span className="text-xs font-semibold text-[rgb(var(--color-error))]">{t('panel.promotions.err_discountInvalid')}</span>
                                                ) : (
                                                    <>
                                                        <span className="block text-lg font-bold text-amber-600 dark:text-amber-400">{formatMoney(precio)}</span>
                                                        <span className="block text-xs text-[rgb(var(--color-gray-base))]">
                                                            -{ahorroPorcentaje(fila.precioRegular, precio)} % · {t('panel.promotions.net', { amount: formatMoney(neto) })}
                                                        </span>
                                                        {ganancia !== null && (
                                                            <span className={`block text-xs font-semibold ${ganancia < 0 ? 'text-[rgb(var(--color-error))]' : 'text-[rgb(var(--color-success))]'}`}>
                                                                {ganancia < 0
                                                                    ? t('panel.promotions.loss', { amount: formatMoney(-ganancia) })
                                                                    : t('panel.promotions.profit', { amount: formatMoney(ganancia) })}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => alternarProducto(fila)}
                                                aria-label={t('panel.promotions.removeProductNamed', { part: fila.num_parte })}
                                                className="grid size-9 shrink-0 place-items-center rounded-full text-[rgb(var(--color-error))] hover:bg-[rgb(var(--color-error))]/10"
                                            >
                                                <FaTrashCan className="size-3.5" aria-hidden="true" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                            <p className="text-xs text-[rgb(var(--color-gray-base))]">{t('panel.promotions.profitHint')}</p>
                        </>
                    )}
                </Paso>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 px-4 py-3 shadow-2xl backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center">
                    <p role={errorServidor ? 'alert' : undefined} className={`min-w-0 flex-1 text-sm ${errorServidor ? 'text-[rgb(var(--color-error))]' : 'text-[rgb(var(--color-gray-base))]'}`}>
                        {errorServidor?.error
                            || (intentado && (Object.keys(errores).length || filasInvalidas.length || faltaFoto)
                                ? t('panel.promotions.fixErrors')
                                : t('panel.promotions.saveHint'))}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={guardando}
                            className="h-11 flex-1 rounded-xl px-5 font-semibold text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10 disabled:opacity-60 sm:flex-none"
                        >
                            {t('panel.common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={guardando || preparando}
                            className="h-11 flex-1 rounded-xl bg-amber-500 px-6 font-bold text-slate-900 shadow hover:bg-amber-400 disabled:opacity-60 sm:flex-none"
                        >
                            {guardando ? t('panel.promotions.saving') : nueva ? t('panel.promotions.create') : t('panel.promotions.save')}
                        </button>
                    </div>
                </div>
            </div>
        </form>
    );
}
