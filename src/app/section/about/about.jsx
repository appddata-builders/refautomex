'use client';
import MetaHead from '@/app/components/meta-head'
import OurScope from '@/app/components/principal/about/our-scope'
import OurTeam from '@/app/components/principal/about/our-team'
import OurValues from '@/app/components/principal/about/our-values'
import OurWork from '@/app/components/principal/about/our-work'
import { useTranslation } from '@/app/lib/text/text-provider';

export default function About({ includeMeta = true, sectionId = 'about' }) {
    const { t } = useTranslation();
    return (
        <section id={sectionId} className="scroll-mt-32">
            {includeMeta && <MetaHead title={t('navbar.about')} />}
            <OurTeam />
            <OurValues />
            <OurWork />
            <OurScope />
        </section>
    )
}
