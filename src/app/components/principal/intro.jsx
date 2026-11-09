'use client';
import { RiOilFill } from "react-icons/ri";
import { GiCarWheel } from 'react-icons/gi';
import { PiPlugsConnectedFill } from "react-icons/pi";
import { FaCarCrash } from "react-icons/fa";
import { useTranslation } from '@/app/lib/text/text-provider';

export default function Intro() {
    const { t } = useTranslation();
    const features = [
        {
            name: `${t('index.intro.section-1')}`,
            description: `${t('index.intro.description-1')}`,
            icon: RiOilFill,
        },
        {
            name: `${t('index.intro.section-2')}`,
            description:`${t('index.intro.description-2')}`,
            icon: GiCarWheel,
        },
        {
            name: `${t('index.intro.section-3')}`,
            description:`${t('index.intro.description-3')}`,
            icon: PiPlugsConnectedFill,
        },
        {
            name: `${t('index.intro.section-4')}`,
            description:`${t('index.intro.description-4')}`,
            icon: FaCarCrash,
        },
    ]

    return (
        <div className="bg-gradient-to-b from-[rgb(var(--color-text-base))]/85 via-[rgb(var(--color-text-base))]/85 to-[rgb(var(--color-galaxy))]/85 py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-5xl lg:text-center">
                    <h2 className="text-lg font-bold leading-10 text-[rgb(var(--color-text))]">{t('index.intro.subtitle')}</h2>
                    <p className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight gradient-text-title">
                    {t('index.intro.title')}
                    </p>
                    <p className="mt-6 text-lg leading-8 text-[rgb(var(--color-slate-base))] italic text-justify">
                    {t('index.intro.leyend')}
                    </p>
                </div>
                <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
                    <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-2 lg:gap-y-16">
                        {features.map((feature) => (
                        <div key={feature.name} className="relative pl-16">
                            <dt className="text-xl font-semibold leading-7 text-[rgb(var(--color-slate-base))]">
                            <div className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center bg-[rgb(var(--color-galaxy))] shadow rounded-full animate-pulse cursor-pointer">
                                <feature.icon className="h-8 w-8 text-[rgb(var(--color-text))]" aria-hidden="true" />
                            </div>
                            {feature.name}
                            </dt>
                            <dd className="mt-2 text-base leading-7 text-[rgb(var(--color-slate-base))] text-justify">{feature.description}</dd>
                        </div>
                        ))}
                    </dl>
                </div>
            </div>
        </div>
    )
}
