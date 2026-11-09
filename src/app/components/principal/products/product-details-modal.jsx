'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { MdOutlineViewInAr } from 'react-icons/md';
import ProductOverview from '@/app/components/principal/products/product-overview';
import { parseProductRoutes } from '@/app/lib/product-images';
import { useTranslation } from '@/app/lib/text/text-provider';

/**
 * El detalle de un producto (los tres puntos de ProductCard): fotos, precio y
 * descripcion en un modal sobre la pagina. Abierto mientras `product` no sea
 * null; `onClose` lo cierra.
 */
export default function ProductDetailsModal({ product, onClose }) {
    const { t } = useTranslation();
    // En el servidor no hay document.body: el portal se monta ya en el navegador.
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);

    // Solo el modal abierto toca el scroll de la pagina: en el inicio hay
    // varios (uno por promocion y el de Lo mas vendido) y uno cerrado no debe
    // quitarle el bloqueo al que esta abierto.
    const abierto = Boolean(product);
    useEffect(() => {
        if (!abierto) return undefined;
        document.body.classList.add('overflow-hidden');
        return () => document.body.classList.remove('overflow-hidden');
    }, [abierto]);

    if (!montado || !product) return null;
    const prodOverview = { ...product, images: product.images ?? product.rutasParsed ?? parseProductRoutes(product.rutas) };

    return createPortal(
        <div className="fixed inset-0 z-[1400] flex items-center justify-center px-4 py-10">
            <div
                className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative z-10 w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[rgb(var(--color-card))]/95 via-[rgb(var(--color-bg))] to-[rgb(var(--color-gray))]/95 shadow-[0_30px_70px_rgba(2,6,23,0.85)]"
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 text-[rgb(var(--color-text))]">
                    <div>
                        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-[rgb(var(--color-text))]/50">
                            <MdOutlineViewInAr className="h-4 w-4" />
                            {t('products.detailTitle')}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold line-clamp-2">
                            {prodOverview.descripcion}
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-[rgb(var(--color-text))]/30 px-4 py-1 text-sm font-semibold text-[rgb(var(--color-text))] transition hover:bg-[rgb(var(--color-card))]"
                        aria-label={t('common.close')}
                    >
                        {t('common.close')}
                    </button>
                </div>
                <div className="max-h-[80vh] overflow-y-auto px-4 py-6 sm:px-8">
                    <ProductOverview prodOverview={prodOverview} />
                </div>
            </motion.div>
        </div>,
        document.body
    );
}
