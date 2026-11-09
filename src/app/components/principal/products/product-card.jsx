'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CgMoreO } from 'react-icons/cg';
import { MdDelete } from 'react-icons/md';
import { FaCircleMinus, FaCirclePlus } from 'react-icons/fa6';
import Countdown from '@/app/components/principal/promotions/countdown';
import OfferRibbon from '@/app/components/principal/promotions/offer-ribbon';
import { OFERTA } from '@/app/components/principal/promotions/oferta-estilos';
import { formatoPrecio } from '@/app/lib/ofertas-tienda';
import { PRODUCT_FALLBACK_IMAGE, resolveProductImage } from '@/app/lib/product-images';
import { useCart } from '@/app/lib/shopping-context';
import { useTranslation } from '@/app/lib/text/text-provider';

export const MIN_QTY = 1;
export const MAX_QTY = 20;

export const normalizeGrupo = (grupo) => (grupo || '').toLowerCase().trim();

// `emptyLabel` llega desde el componente porque este helper vive fuera del
// arbol de React y no puede leer los textos con el hook.
export const displayGrupo = (grupo, emptyLabel = '') => {
    const g = normalizeGrupo(grupo);
    if (!g) return emptyLabel;
    return g.charAt(0).toUpperCase() + g.slice(1);
};

const coerceQuantity = (value) => {
    const num = Number(value);
    if (Number.isNaN(num)) return MIN_QTY;
    return Math.min(Math.max(num, MIN_QTY), MAX_QTY);
};

// La entrada escalonada del catalogo (la orquesta la cuadricula de
// card-products con gridVariants).
export const cardVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.9, rotate: -1 },
    show: (i) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        rotate: 0,
        transition: {
            delay: i * 0.0005,
            duration: 0.05,
            ease: [0.25, 0.8, 0.5, 1],
            type: 'spring',
            stiffness: 500,
            damping: 8,
        },
    }),
};

/** En el celular las tarjetas van sin animacion (se sentia lento al deslizar). */
export const useEsMovil = () => {
    const [esMovil, setEsMovil] = useState(false);
    useEffect(() => {
        const detectar = () => setEsMovil(window.innerWidth < 640);
        detectar();
        window.addEventListener('resize', detectar);
        return () => window.removeEventListener('resize', detectar);
    }, []);
    return esMovil;
};

/**
 * La tarjeta de producto de la tienda: la de Productos, y la misma en el
 * inicio (promociones y Lo mas vendido) y en Promociones. Grupo, detalle (los
 * tres puntos), foto, precio, cantidad y Agregar / Quitar del carrito. Si el
 * producto esta en una promocion vigente (conOferta), lleva la banda OFERTA,
 * el "-15 %", el precio de antes tachado, cuanto se ahorra y el conteo.
 *
 *   product        producto del catalogo (getProducts), ya con conOferta
 *   onOpenDetails  abre el detalle (ProductDetailsModal)
 *   desfase        del reloj del servidor, para el conteo (useOfertas)
 *   animado        animaciones de framer-motion (no en el celular)
 *   index          orden en la cuadricula, para la entrada escalonada
 */
export default function ProductCard({ product, onOpenDetails, desfase = 0, animado = true, index = 0, className = '' }) {
    const { t } = useTranslation();
    const { cart, addToCart, removeFromCart } = useCart();
    const [cantidad, setCantidad] = useState(MIN_QTY);

    const enCarrito = cart.find((item) => item.num_parte === product.num_parte);
    const inCart = Boolean(enCarrito);
    const valor = inCart ? (enCarrito.quantity || MIN_QTY) : cantidad;
    const img = resolveProductImage(product.rutasParsed?.[0] ?? product.rutas?.[0]);
    const groupLabel = displayGrupo(product.grupo, t('products.noGroup'));

    const Card = animado ? motion.div : 'div';
    const ImageWrapper = animado ? motion.div : 'div';
    const ProductImage = animado ? motion.img : 'img';
    const ActionButton = animado ? motion.button : 'button';
    const tap = animado ? { whileTap: { scale: 0.95 }, whileHover: { scale: 1.05 } } : {};

    const cambiar = (valorNuevo) => {
        if (valorNuevo === '') {
            setCantidad('');
            return;
        }
        const num = Number(valorNuevo);
        if (!Number.isNaN(num) && num >= MIN_QTY && num <= MAX_QTY) setCantidad(num);
    };

    const agregar = () => {
        const qty = coerceQuantity(cantidad);
        addToCart(product, qty);
        setCantidad(qty);
    };

    const quitar = () => {
        removeFromCart(product);
        setCantidad(MIN_QTY);
    };

    return (
        <Card
            {...(animado ? { custom: index, variants: cardVariants } : {})}
            className={`group relative flex flex-col justify-between rounded-3xl shadow-lg overflow-hidden transition-all duration-500 hover:shadow-[rgb(var(--color-med))]/30 hover:-translate-y-1 hover:scale-[1.02)] bg-[rgb(var(--color-card))] ${product.oferta ? `ring-2 ${OFERTA.contorno}` : ''} ${className}`}
        >
            {product.oferta && <OfferRibbon />}
            <ImageWrapper
                className="relative w-full aspect-square overflow-hidden"
                {...(animado ? { whileHover: { scale: 1.05 }, transition: { duration: 0.3 } } : {})}
            >
                {/* Con oferta, la esquina es de la banda: el grupo baja. */}
                <span className={`absolute ${product.oferta ? 'bottom-3' : 'top-3'} left-3 z-10 inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-[rgb(var(--color-gray))]/70 text-[rgb(var(--color-text))] shadow`}>
                    {groupLabel}
                </span>
                {product.oferta && (
                    <span className={`absolute bottom-3 right-3 z-10 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums ${OFERTA.etiqueta}`}>
                        -{product.oferta.ahorro} %
                    </span>
                )}
                {onOpenDetails && (
                    <button
                        type="button"
                        onClick={() => onOpenDetails(product)}
                        className="absolute top-3 right-3 z-10 flex items-center justify-center h-9 w-9 rounded-full bg-[rgb(var(--color-bg))]/80 shadow text-[rgb(var(--color-text))] hover:scale-105 transition-all"
                        aria-label={t('products.details')}
                    >
                        <CgMoreO />
                    </button>
                )}
                <ProductImage
                    src={img}
                    alt={product.descripcion}
                    loading="lazy"
                    className="h-full w-full object-contain object-center bg-white"
                    // Una ruta que ya no existe en S3 dejaba el texto
                    // alternativo encima de la etiqueta de la tarjeta.
                    onError={(evento) => {
                        if (!evento.currentTarget.src.endsWith('no-img.png')) evento.currentTarget.src = PRODUCT_FALLBACK_IMAGE;
                    }}
                />
            </ImageWrapper>

            <div className="flex flex-col justify-between flex-1 p-4">
                <h4 className="text-lg font-semibold linear-text-title text-center line-clamp-2" title={product.descripcion}>
                    {product.descripcion}
                </h4>
                {/* El precio exacto que se cobra (el de Stripe), con la oferta si la hay. */}
                {product.oferta ? (
                    <div className="mt-2 flex flex-col items-center tabular-nums">
                        <span className="text-sm text-[rgb(var(--color-text))]/60 line-through">{formatoPrecio(product.precioRegular)}</span>
                        <span className={`text-lg sm:text-xl font-extrabold ${OFERTA.precio}`}>{formatoPrecio(product.precio)} MXN</span>
                        <span className="text-xs font-medium text-[rgb(var(--color-success))]">
                            {t('promotions.youSave', { amount: formatoPrecio(product.precioRegular - product.precio) })}
                        </span>
                        <Countdown fin={product.oferta.fin} desfase={desfase} variant="chica" className="mt-1 text-[rgb(var(--color-text))]/70" />
                    </div>
                ) : (
                    <div className="flex items-center justify-center mt-2">
                        <span className="mt-1 text-base sm:text-lg font-semibold tabular-nums text-[rgb(var(--color-success))]">
                            {formatoPrecio(product.precio)} MXN
                        </span>
                    </div>
                )}
                <div className="mt-6 grid grid-cols-2 items-center gap-2 border-t border-[rgb(var(--color-text))]/10 pt-4">
                    <div className={`col-span-1 flex ${inCart ? 'items-start justify-start' : 'items-center justify-center'} gap-2`}>
                        <button
                            type="button"
                            onClick={() => setCantidad((actual) => Math.max(MIN_QTY, coerceQuantity(actual) - 1))}
                            className={`${inCart ? 'cursor-not-allowed opacity-0 pointer-events-none' : 'cursor-pointer'} flex items-center justify-center h-6 w-6 rounded-full shadow shadow-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-bg))]/60 transition`}
                            disabled={inCart}
                            aria-label={t('products.decrease')}
                        >
                            <FaCircleMinus />
                        </button>
                        <input
                            type="number"
                            min={MIN_QTY}
                            max={MAX_QTY}
                            value={valor}
                            disabled={inCart}
                            onChange={(e) => cambiar(e.target.value)}
                            onBlur={(e) => setCantidad(coerceQuantity(e.target.value))}
                            aria-label={t('products.quantity')}
                            className="w-14 text-center rounded-md shadow shadow-[rgb(var(--color-galaxy))] bg-transparent text-[rgb(var(--color-text))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-galaxy))]"
                            placeholder={`${MIN_QTY}`}
                        />
                        <button
                            type="button"
                            onClick={() => setCantidad((actual) => Math.min(MAX_QTY, coerceQuantity(actual) + 1))}
                            className={`${inCart ? 'cursor-not-allowed opacity-0 pointer-events-none' : 'cursor-pointer'} flex items-center justify-center h-6 w-6 rounded-full shadow shadow-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-bg))]/60 transition`}
                            disabled={inCart}
                            aria-label={t('products.increase')}
                        >
                            <FaCirclePlus />
                        </button>
                    </div>

                    <div className="col-span-1 flex justify-end">
                        {inCart ? (
                            <ActionButton
                                {...tap}
                                type="button"
                                onClick={quitar}
                                className="flex items-center gap-2 rounded-full bg-red-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-all"
                            >
                                <MdDelete className="text-base" />
                                {t('products.remove')}
                            </ActionButton>
                        ) : (
                            <ActionButton
                                {...tap}
                                type="button"
                                onClick={agregar}
                                className="rounded-full cursor-pointer bg-[rgb(var(--color-text))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-card))] transition-all"
                            >
                                {t('products.add')}
                            </ActionButton>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}
