'use client';

import Link from 'next/link';
import { FaArrowRight } from 'react-icons/fa6';
import { useOfertas } from '@/app/lib/ofertas-tienda';
import { useTranslation } from '@/app/lib/text/text-provider';
import PromotionShowcase from './promotion-showcase';
import { OFERTA } from '@/app/components/principal/promotions/oferta-estilos';

const EN_INICIO = 4;

/**
 * Las promociones vigentes en primer plano del inicio, antes del video. Sin
 * promociones vigentes no pinta nada y el video queda primero.
 *
 * `inicial` lo lee el servidor al armar el inicio (page.js): asi el orden se
 * decide antes de llegar al navegador y el video no brinca al cargar. Despues
 * useOfertas la mantiene al dia: una promocion que termina desaparece sola.
 * De cada una, la foto con su conteo y sus primeros productos; el boton lleva
 * a la seccion Promociones con todo.
 */
export default function HomePromotions({ inicial }) {
    const { t, i18n } = useTranslation();
    const { promociones, desfase } = useOfertas({ inicial });
    if (!promociones.length) return null;

    const lang = i18n?.language || 'es';
    const ofertas = promociones.reduce((total, promocion) => total + promocion.productos.length, 0);
    const recortadas = promociones.some((promocion) => promocion.productos.length > EN_INICIO);
    const boton = promociones.length > 1
        ? t('promotions.seeAllMany', { count: promociones.length })
        : recortadas
            ? t('promotions.seeAllProducts', { count: ofertas })
            : t('promotions.seeAll');

    return (
        <section
            aria-labelledby="inicio-promociones"
            className="bg-gradient-to-b from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-bg))] px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32 lg:px-8"
        >
            <div className="mx-auto max-w-7xl space-y-16">
                <h2 id="inicio-promociones" className="sr-only">{t('promotions.heading')}</h2>
                {promociones.map((promocion) => (
                    <PromotionShowcase key={promocion.idpromocion} promocion={promocion} desfase={desfase} maxProductos={EN_INICIO} />
                ))}
                <div className="flex justify-center">
                    <Link
                        href={`/section/promotion?lang=${lang}`}
                        className={`inline-flex items-center gap-2 ${OFERTA.boton} rounded-full px-6 py-3 font-bold shadow transition hover:scale-105`}
                    >
                        {boton}
                        <FaArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                </div>
            </div>
        </section>
    );
}
