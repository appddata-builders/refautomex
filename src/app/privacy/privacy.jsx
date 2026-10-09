'use client';

import { useTranslation } from '@/app/lib/text/text-provider';
import { RiEdit2Line } from 'react-icons/ri';
import RefautomexLogo from '@/app/components/refautomex-logo';

export default function PrivacyContent({ lang }) {
    const { t, i18n } = useTranslation();

    if (i18n.language !== lang) {
        i18n.changeLanguage(lang);
    }

    const privacySections = Array.from({ length: 8 }, (_, i) => ({
        title: t(`privacy.section.title${i + 1}`),
        content: t(`privacy.section.leyend${i + 1}`),
    }));

    return (
        <section className="bg-[rgb(var(--color-bg))] py-32 px-5">
            <div className="prose prose-lg p-10 mx-auto space-y-4
                            text-[rgb(var(--color-text))] bg-[rgb(var(--color-card))]
                            sm:prose-xl max-w-screen-lg lg:rounded-3xl shadow-xl">
                
                <p>{t('privacy.date')}</p>
                <h1 className="text-3xl text-center font-bold text-yellow-600">
                {t('privacy.notice')}
                </h1>

                <RefautomexLogo classAttr="mx-auto mb-6" />

                <p>{t('privacy.description')}</p>

                {privacySections.map((sec, i) => (
                <div key={i}>
                    <h2 className="text-2xl font-semibold flex items-center mb-2">
                    <span className="mr-2 p-2 rounded-full bg-yellow-500">
                        <RiEdit2Line className="text-white" />
                    </span>
                    <span className="text-yellow-600">
                        {sec.title}
                    </span>
                    </h2>

                    <p>{sec.content}</p>
                </div>
                ))}
            </div>
        </section>
    );
}
