'use client';

import { MdDelete } from 'react-icons/md';
import { FaCartPlus } from 'react-icons/fa6';
import { useCart } from '@/app/lib/shopping-context';
import { formatoPrecio } from '@/app/lib/ofertas-tienda';
import { PRODUCT_FALLBACK_IMAGE, resolveProductImage } from '@/app/lib/product-images';
import { useTranslation } from '@/app/lib/text/text-provider';
import Countdown from './countdown';
import OfferRibbon from './offer-ribbon';

// Lo que se guarda en el carrito: la misma forma que el catalogo
// (card-products), con el precio de oferta como `precio`.
const paraCarrito = (producto, promocion) => ({
    num_parte: producto.num_parte,
    descripcion: producto.descripcion,
    grupo: producto.grupo,
    existencia: producto.existencia,
    rutas: producto.rutas,
    rutasParsed: producto.rutas,
    precio: producto.precio,
    precioRegular: producto.precioRegular,
    oferta: { idpromocion: promocion.idpromocion, titulo: promocion.titulo, fin: promocion.fin, ahorro: producto.ahorro },
});

function ProductoEnOferta({ producto, promocion }) {
    const { t } = useTranslation();
    const { cart, addToCart, removeFromCart } = useCart();
    const enCarrito = cart.some((item) => item.num_parte === producto.num_parte);

    return (
        <li className="group relative flex flex-col overflow-hidden rounded-3xl bg-[rgb(var(--color-card))] shadow-lg transition hover:-translate-y-1 hover:shadow-[rgb(var(--color-med))]/30">
            <OfferRibbon />
            <div className="relative aspect-square overflow-hidden bg-white">
                <img
                    src={resolveProductImage(producto.rutas?.[0])}
                    alt={producto.descripcion}
                    loading="lazy"
                    onError={(evento) => {
                        if (!evento.currentTarget.src.endsWith('no-img.png')) evento.currentTarget.src = PRODUCT_FALLBACK_IMAGE;
                    }}
                    className="size-full object-contain transition duration-500 group-hover:scale-105"
                />
                <span className="absolute right-3 top-3 rounded-full bg-slate-900 px-2.5 py-1 text-sm font-extrabold tabular-nums text-amber-400 shadow">
                    -{producto.ahorro} %
                </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4 text-center">
                <h4 className="line-clamp-2 text-base font-semibold linear-text-title" title={producto.descripcion}>{producto.descripcion}</h4>
                <div className="mt-auto">
                    <p className="text-sm tabular-nums text-[rgb(var(--color-text))]/60 line-through">{formatoPrecio(producto.precioRegular)}</p>
                    <p className="text-2xl font-extrabold tabular-nums text-amber-600 dark:text-amber-400">{formatoPrecio(producto.precio)}</p>
                    <p className="text-xs font-medium text-[rgb(var(--color-success))]">
                        {t('promotions.youSave', { amount: formatoPrecio(producto.precioRegular - producto.precio) })}
                    </p>
                </div>
                {enCarrito ? (
                    <button
                        type="button"
                        onClick={() => removeFromCart(producto)}
                        className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-red-500/90 px-4 text-sm font-semibold text-white transition hover:bg-red-600"
                    >
                        <MdDelete className="text-base" aria-hidden="true" />
                        {t('products.remove')}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => addToCart(paraCarrito(producto, promocion), 1)}
                        className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-bl from-amber-500 via-yellow-400 to-amber-500 px-4 text-sm font-bold text-slate-900 shadow transition hover:scale-[1.03]"
                    >
                        <FaCartPlus className="size-4" aria-hidden="true" />
                        {t('products.add')}
                    </button>
                )}
            </div>
        </li>
    );
}

/**
 * Una promocion vigente en el sitio: la foto de la temporada completa y, a su
 * lado, su titulo, descripcion y conteo regresivo; abajo sus productos con la
 * banda de oferta, el precio de antes tachado y el de oferta.
 *
 * La foto no se recorta ni lleva texto encima: casi siempre es un arte de
 * temporada con su propio texto (cuadrado, horizontal o vertical). De fondo va
 * ella misma desenfocada, para que el banner tome sus colores.
 */
export default function PromotionShowcase({ promocion, desfase }) {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3 || '';
    const foto = promocion.foto ? `${multimediaSrc}${promocion.foto}` : null;
    const mayorAhorro = Math.max(...promocion.productos.map((p) => p.ahorro));

    return (
        <article className="space-y-8">
            <header className="relative isolate overflow-hidden rounded-[2rem] bg-slate-950 shadow-2xl">
                {foto && (
                    <img src={foto} alt="" aria-hidden="true" className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-60 blur-3xl" />
                )}
                <div className="absolute inset-0 -z-10 bg-slate-950/45" />
                <div className={`grid items-center gap-6 p-4 sm:p-8 lg:gap-10 lg:p-10 ${foto ? 'lg:grid-cols-2' : ''}`}>
                    {foto && (
                        <img
                            src={foto}
                            alt={promocion.titulo}
                            className="mx-auto max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/15"
                        />
                    )}
                    <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
                        {mayorAhorro > 0 && (
                            <span className="w-fit rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 px-4 py-1 text-sm font-extrabold uppercase tracking-wider text-slate-900 shadow">
                                {t('promotions.upTo', { percent: mayorAhorro })}
                            </span>
                        )}
                        <div>
                            <h3 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">{promocion.titulo}</h3>
                            {promocion.descripcion && (
                                <p className="mt-3 max-w-2xl text-base text-white/85 sm:text-lg">{promocion.descripcion}</p>
                            )}
                        </div>
                        <Countdown fin={promocion.fin} desfase={desfase} />
                    </div>
                </div>
            </header>

            <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
                {promocion.productos.map((producto) => (
                    <ProductoEnOferta key={producto.num_parte} producto={producto} promocion={promocion} />
                ))}
            </ul>
        </article>
    );
}
