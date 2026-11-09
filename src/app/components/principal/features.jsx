'use client';
import { FaTools, FaCar, FaHandsHelping } from "react-icons/fa";
import { useTranslation } from '@/app/lib/text/text-provider';

export default function Features() {
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const { t } = useTranslation();
    const features = [
        {
            name: `${t('index.features.section-1')}`,
            description: `${t('index.features.description-1')}`,
            icon: FaCar,
        },
        {
            name: `${t('index.features.section-2')}`,
            description: `${t('index.features.description-2')}`,
            icon: FaTools,
        },
        {
            name: `${t('index.features.section-3')}`,
            description: `${t('index.features.description-3')}`,
            icon: FaHandsHelping,
        },
    ]

    return (
        <div className="overflow-hidden bg-[rgb(var(--color-card))] py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto grid max-w-2xl grid-cols-1 gap-y-16 sm:gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-2">
                    <div className="lg:pr-8 lg:pt-4">
                        <div className="lg:max-w-lg">
                        <h2 className="text-lg font-bold leading-10 text-[rgb(var(--color-slate-base))]">{t( 'index.features.subtitle' )}</h2>
                        <p className="mt-2 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight gradient-text-title">{t( 'index.features.title' )}</p>
                        <p className="mt-6 text-lg leading-8 text-[rgb(var(--color-slate-base))] italic">
                        {t( 'index.features.description' )}
                        </p>
                        <dl className="mt-10 max-w-xl space-y-8 text-base leading-7 text-[rgb(var(--color-slate-base))] lg:max-w-none">
                            {features.map((feature) => (
                            <div key={feature.name} className="relative pl-9">
                                <dt className="inline font-semibold text-[rgb(var(--color-slate-base))] ml-10">
                                <feature.icon className="absolute left-9 -top-1 h-7 w-7 text-[rgb(var(--color-galaxy))] p-1.5 bg-[rgb(var(--color-bg))]/50 rounded shadow shadow-[rgb(var(--color-galaxy))]" aria-hidden="true" />
                                {feature.name}
                                </dt>
                                <dd className="inline text-justify">{feature.description}</dd>
                            </div>
                            ))}
                        </dl>
                        </div>
                    </div>
                <img
                    src={`${multimediaSrc}place.jpg`}
                    alt={t('alt.place')}
                    className="w-[40rem] max-w-none rounded-xl shadow-xl sm:w-[57rem]"
                    width={2432}
                    height={1442}
                />
                </div>
            </div>
        </div>
    )
}
