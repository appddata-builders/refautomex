'use client';

import { useTranslation } from '@/app/lib/text/text-provider';

/**
 * La banda "OFERTA" en la esquina de un producto en promocion, en el amarillo
 * de Refautomex (el mismo degradado ambar de los botones del sitio). Va dentro
 * de un contenedor `relative overflow-hidden`: la tarjeta recorta las puntas.
 */
export default function OfferRibbon({ className = '' }) {
    const { t } = useTranslation();
    return (
        <div className={`pointer-events-none absolute left-0 top-0 z-20 size-28 overflow-hidden ${className}`} aria-hidden="true">
            <span className="absolute left-[-42px] top-[24px] w-[160px] -rotate-45 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 py-1.5 text-center text-xs font-extrabold uppercase tracking-[0.25em] text-slate-900 shadow-lg ring-1 ring-amber-600/40">
                {t('promotions.ribbon')}
            </span>
        </div>
    );
}
