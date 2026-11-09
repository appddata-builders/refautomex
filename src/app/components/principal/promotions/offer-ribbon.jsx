'use client';

import { useTranslation } from '@/app/lib/text/text-provider';
import { OFERTA } from '@/app/components/principal/promotions/oferta-estilos';

/**
 * La banda "OFERTA" en la esquina de un producto en promocion: ambar en modo
 * claro y el azul del sitio en oscuro (OFERTA en oferta-estilos.js). Va dentro
 * de un contenedor `relative overflow-hidden`: la tarjeta recorta las puntas.
 */
export default function OfferRibbon({ className = '' }) {
    const { t } = useTranslation();
    return (
        <div className={`pointer-events-none absolute left-0 top-0 z-20 size-28 overflow-hidden ${className}`} aria-hidden="true">
            <span className={`absolute left-[-42px] top-[24px] w-[160px] -rotate-45 ${OFERTA.banda} py-1.5 text-center text-xs font-extrabold uppercase tracking-[0.25em] shadow-lg ring-1 ring-black/10`}>
                {t('promotions.ribbon')}
            </span>
        </div>
    );
}
