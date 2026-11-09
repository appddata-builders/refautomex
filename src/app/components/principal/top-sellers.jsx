'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PiArrowRight, PiCaretLeft, PiCaretRight, PiFireFill } from 'react-icons/pi';
import ProductCard, { useEsMovil } from '@/app/components/principal/products/product-card';
import ProductDetailsModal from '@/app/components/principal/products/product-details-modal';
import { OFERTA } from '@/app/components/principal/promotions/oferta-estilos';
import { conOferta, useOfertas } from '@/app/lib/ofertas-tienda';
import { useTranslation } from '@/app/lib/text/text-provider';

/**
 * Lo mas vendido: en lugar del carrusel de fotos, una fila de productos de la
 * tienda ordenados por lo que mas se vendio en el ultimo anio. Cada uno es la
 * misma ProductCard de Productos (cantidad, detalle, oferta si la tiene). En
 * el celular se desliza con el dedo; en escritorio, con flechas.
 *
 * `productos` lo lee el servidor al armar el inicio (tienda-inicio-db.js).
 */
export default function TopSellers({ productos = [] }) {
    const { t, i18n } = useTranslation();
    const { porParte, desfase } = useOfertas();
    const esMovil = useEsMovil();
    const [detalle, setDetalle] = useState(null);
    const filaRef = useRef(null);
    const lang = i18n?.language || 'es';

    const lista = useMemo(
        () => productos.map((producto) => conOferta({ ...producto, rutasParsed: producto.rutas }, porParte)),
        [productos, porParte]
    );
    if (!lista.length) return null;

    const desplazar = (sentido) => {
        const fila = filaRef.current;
        if (fila) fila.scrollBy({ left: sentido * fila.clientWidth * 0.8, behavior: 'smooth' });
    };

    const flecha = 'hidden size-11 place-items-center rounded-full bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))] transition hover:scale-105 sm:grid';

    return (
        <section aria-labelledby="mas-vendido" className="bg-[rgb(var(--color-bg))] py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[rgb(var(--color-text))]/60">
                            <PiFireFill className="size-5 text-[rgb(var(--color-refautomex))]" aria-hidden="true" />
                            {t('index.top.eyebrow')}
                        </p>
                        <h2 id="mas-vendido" className="mt-2 py-1 text-4xl font-bold tracking-tight gradient-text-title sm:text-5xl">{t('index.top.title')}</h2>
                        <p className="mt-2 text-lg text-[rgb(var(--color-text))]/75">{t('index.top.subtitle')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => desplazar(-1)} aria-label={t('index.top.prev')} className={flecha}>
                            <PiCaretLeft className="size-5" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => desplazar(1)} aria-label={t('index.top.next')} className={flecha}>
                            <PiCaretRight className="size-5" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* Espacio arriba y abajo para que la sombra y el "levantarse" al
                    pasar el mouse no se corten con el scroll horizontal. */}
                <div
                    ref={filaRef}
                    className="-mx-4 mt-6 flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth px-4 py-6 [scrollbar-width:none] sm:-mx-2 sm:px-2 [&::-webkit-scrollbar]:hidden"
                >
                    {lista.map((producto) => (
                        <ProductCard
                            key={producto.num_parte}
                            product={producto}
                            onOpenDetails={setDetalle}
                            desfase={desfase}
                            animado={!esMovil}
                            className="w-72 shrink-0 snap-start"
                        />
                    ))}
                </div>

                <div className="mt-4 flex justify-center">
                    <Link
                        href={`/section/products?lang=${lang}`}
                        className={`inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold transition hover:scale-105 ${OFERTA.boton}`}
                    >
                        {t('index.top.seeAll')}
                        <PiArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                </div>
            </div>
            <ProductDetailsModal product={detalle} onClose={() => setDetalle(null)} />
        </section>
    );
}
