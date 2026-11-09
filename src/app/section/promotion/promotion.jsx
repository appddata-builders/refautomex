'use client';
import Link from 'next/link';
import { PiSealPercentFill } from 'react-icons/pi';
import MetaHead from '@/app/components/meta-head';
import Spinner from '@/app/components/principal/spinner';
import PromotionShowcase from '@/app/components/principal/promotions/promotion-showcase';
import { useOfertas } from '@/app/lib/ofertas-tienda';
import { useTranslation } from '@/app/lib/text/text-provider';

/**
 * Promociones del sitio: las que estan vigentes en Servicios > Promociones,
 * cada una con su foto de temporada, conteo regresivo y productos en oferta.
 * Se actualiza sola: una promocion que termina desaparece y una nueva aparece
 * sin recargar (useOfertas).
 */
export default function Promotion({ includeMeta = true, sectionId = 'promotions' }) {
    const { t, i18n } = useTranslation();
    const { promociones, desfase, cargando } = useOfertas();
    const lang = i18n?.language || 'es';

    return (
        <section id={sectionId} className="relative isolate scroll-mt-32 bg-gradient-to-b from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] pb-24 pt-36 sm:pt-40">
            {includeMeta && <MetaHead title={t('navbar.promotions')} />}
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="py-1 text-4xl font-bold tracking-tight gradient-text-title sm:text-5xl">{t('promotions.heading')}</h2>
                    <p className="mt-4 text-lg text-[rgb(var(--color-text))]/70">{t('promotions.subtitle')}</p>
                </div>

                <div className="mt-14 space-y-20">
                    {cargando ? (
                        <Spinner />
                    ) : promociones.length ? (
                        promociones.map((promocion) => (
                            <PromotionShowcase key={promocion.idpromocion} promocion={promocion} desfase={desfase} />
                        ))
                    ) : (
                        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl bg-[rgb(var(--color-card))] p-10 text-center shadow-lg">
                            <PiSealPercentFill className="size-12 text-amber-500" aria-hidden="true" />
                            <p className="text-xl font-bold">{t('promotions.emptyTitle')}</p>
                            <p className="text-[rgb(var(--color-text))]/70">{t('promotions.emptyBody')}</p>
                            <Link
                                href={`/section/products?lang=${lang}`}
                                className="rounded-full bg-gradient-to-bl from-amber-500 via-yellow-400 to-amber-500 px-6 py-3 font-bold text-slate-900 shadow transition hover:scale-105"
                            >
                                {t('promotions.emptyCta')}
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
