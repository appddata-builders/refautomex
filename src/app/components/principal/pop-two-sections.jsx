import React from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function PopTwoSections ({tracking, title, sectionOne, sectionTwo, imageSrc}) {
    const { t } = useTranslation();

    return (
        <div className="container mx-auto p-2 leading-5 text-justify">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-2 px-2">
                <div className="lg:col-span-2">
                    <h2 className="text-md hover:opacity-80 text-[rgb(var(--color-gray-base))] font-semibold tracking-wide uppercase">{t(tracking)}</h2>
                    <h3 className="text-4xl italic mt-2 gradient-text-title cursor-pointer">{t(title)}</h3>
                </div>
                <div className="lg:col-span-1">
                    <p className="text-[rgb(var(--color-text))] mt-2">
                        {t(sectionOne)}
                    </p>
                </div>
                <div className="lg:col-span-1">
                    <p className="text-[rgb(var(--color-text))] mt-2">
                        {t(sectionTwo)}
                    </p>
                </div>
                <div className="lg:col-span-2">
                    <div className="h-[50vh] w-full bg-cover bg-center rounded-lg shadow-lg overflow-hidden mt-3 lg:mt-0">
                        <img src={imageSrc} alt={t('alt.workflow')} className="w-full h-full object-cover sm:animate-out" />
                    </div>
                </div>
            </div>
        </div>
    );
};