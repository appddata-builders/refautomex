'use client';
import RefautomexLogo from '@/app/components/refautomex-logo';
import Link from 'next/link';
import Atropos from 'atropos/react';
import 'atropos/css';
import { PiCarProfileFill } from 'react-icons/pi';
import { useTranslation } from '@/app/lib/text/text-provider';

/**
 * Busca por tu auto: una burbuja por cada modelo que de verdad hay en el
 * catalogo de la tienda, con cuantos productos tiene; cada una abre Productos
 * ya filtrado (?q=). Los modelos los lee el servidor al armar el inicio
 * (tienda-inicio-db.js). Van justo debajo de "Mejoramos nuestras operaciones" y del logo.
 */
export default function Improve({ tienda = { modelos: [] } }) {
    const { i18n, t } = useTranslation();
    const lang = i18n?.language || 'es';

    return (
        <section className='overflow-hidden bg-[rgb(var(--color-bg)/0.90)]'>
            <div className='flex min-h-screen flex-col items-center justify-center pb-16'>
                <div className="text-4xl sm:text-5xl md:text-6xl gradient-text-title mt-5 md:mt-10 p-2 mx-auto px-10 font-bold text-center">{t('index.beginning.title')}</div>
                <div className="text-xl md:text-3xl text-[rgb(var(--color-text))] md:p-1 p-3 mb-3 text-center font-semibold">{t('index.beginning.leyend')}</div>
                <Atropos className="overflow-visible max-w-[400px] mx-auto my-10"
                    activeOffset={10} shadowScale={0.8}>
                    <div className='overflow-hidden px-5 bg-[rgb(var(--color-text-base))]
                    '>
                        <RefautomexLogo classAttr=" h-48 md:h-60 w-auto object-contain p-3 mx-auto" />
                    </div>
                </Atropos>

                {/* Busca por tu auto, justo debajo del logo. */}
                {tienda.modelos.length > 0 && (
                    <div className="w-full max-w-5xl px-4 sm:px-6 lg:px-8">
                        <h2 className="flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[rgb(var(--color-text))]/60">
                            <PiCarProfileFill className="size-5 text-[rgb(var(--color-galaxy))]" aria-hidden="true" />
                            {t('index.find.byCar')}
                        </h2>
                        <ul className="mt-6 flex flex-wrap justify-center gap-3">
                            {tienda.modelos.map((modelo) => (
                                <li key={modelo.busqueda}>
                                    <Link
                                        href={`/section/products?${new URLSearchParams({ lang, q: modelo.busqueda })}`}
                                        className="inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-card))] px-5 py-2.5 text-lg font-semibold text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))] transition hover:-translate-y-0.5 hover:shadow-md"
                                    >
                                        {modelo.etiqueta}
                                        <span className="rounded-full bg-[rgb(var(--color-galaxy))]/25 px-2 text-xs tabular-nums">{modelo.cuantos}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </section>
    )
}
