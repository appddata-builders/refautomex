'use client';

import { useState } from 'react';
import ProductCard, { useEsMovil } from '@/app/components/principal/products/product-card';
import ProductDetailsModal from '@/app/components/principal/products/product-details-modal';
import { useTranslation } from '@/app/lib/text/text-provider';
import Countdown from './countdown';

// El producto de la promocion con la forma del catalogo (getProducts y
// conOferta): asi ProductCard lo pinta y el carrito lo guarda igual que en
// Productos, con el precio de oferta como `precio`.
const paraTarjeta = (producto, promocion) => ({
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

/**
 * Una promocion vigente en el sitio: la foto de la temporada completa y, a su
 * lado, su titulo, descripcion y conteo regresivo; abajo sus productos con la
 * banda de oferta, el precio de antes tachado y el de oferta.
 *
 * La foto no se recorta ni lleva texto encima: casi siempre es un arte de
 * temporada con su propio texto (cuadrado, horizontal o vertical). De fondo va
 * ella misma desenfocada, para que el banner tome sus colores.
 */
export default function PromotionShowcase({ promocion, desfase, maxProductos }) {
    const { t } = useTranslation();
    const esMovil = useEsMovil();
    const [detalle, setDetalle] = useState(null);
    const multimediaSrc = process.env.NEXT_PUBLIC_S3 || '';
    const foto = promocion.foto ? `${multimediaSrc}${promocion.foto}` : null;
    const mayorAhorro = Math.max(...promocion.productos.map((p) => p.ahorro));

    return (
        <article className="space-y-8">
            {/* El fondo sigue al tema (claro u oscuro), como el resto del sitio;
                la foto desenfocada detras solo le da el color de la temporada. */}
            <header className="relative isolate overflow-hidden rounded-[2rem] bg-[rgb(var(--color-card))] shadow-2xl shadow-[rgb(var(--color-galaxy))]/20">
                {foto && (
                    <img src={foto} alt="" aria-hidden="true" className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-60 blur-3xl" />
                )}
                <div className="absolute inset-0 -z-10 bg-[rgb(var(--color-card))]/75" />
                <div className={`grid items-center gap-6 p-4 sm:p-8 lg:gap-10 lg:p-10 ${foto ? 'lg:grid-cols-2' : ''}`}>
                    {foto && (
                        <img
                            src={foto}
                            alt={promocion.titulo}
                            className="mx-auto max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-[rgb(var(--color-border))]"
                        />
                    )}
                    <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
                        {mayorAhorro > 0 && (
                            <span className="w-fit rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 px-4 py-1 text-sm font-extrabold uppercase tracking-wider text-slate-900 shadow">
                                {t('promotions.upTo', { percent: mayorAhorro })}
                            </span>
                        )}
                        <div>
                            <h3 className="py-1 text-3xl font-extrabold tracking-tight gradient-text-title sm:text-5xl">{promocion.titulo}</h3>
                            {promocion.descripcion && (
                                <p className="mt-3 max-w-2xl text-base text-[rgb(var(--color-text))]/80 sm:text-lg">{promocion.descripcion}</p>
                            )}
                        </div>
                        <Countdown fin={promocion.fin} desfase={desfase} />
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
                {promocion.productos.slice(0, maxProductos).map((producto) => (
                    <ProductCard
                        key={producto.num_parte}
                        product={paraTarjeta(producto, promocion)}
                        onOpenDetails={setDetalle}
                        desfase={desfase}
                        animado={!esMovil}
                    />
                ))}
            </div>
            <ProductDetailsModal product={detalle} onClose={() => setDetalle(null)} />
        </article>
    );
}
