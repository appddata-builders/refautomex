'use client';
import TierPromotion from "@/app/components/principal/promotions/tier-promotion";
import CardPromotion from "@/app/components/principal/promotions/card-promotion";
import MetaHead from "@/app/components/meta-head";
import { useTranslation } from '@/app/lib/text/text-provider';

export default function Promotion({ includeMeta = true, sectionId = 'promotions' }) {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const elements = [
        { title: t('promotions.element-1'), url: `${multimediaSrc}element1.jpg` },
        { title: t('promotions.element-2'), url: `${multimediaSrc}element2.jpg` },
        { title: t('promotions.element-3'), url: `${multimediaSrc}element3.jpg` },
        { title: t('promotions.element-5'), url: `${multimediaSrc}element5.jpg` },
        { title: t('promotions.element-6'), url: `${multimediaSrc}element6.jpg` },
    ];

    return (
        <section id={sectionId} className="scroll-mt-32">
            {includeMeta && <MetaHead title={t('navbar.promotions')}/>}
            <TierPromotion />
            <CardPromotion elements={elements} />
        </section>
    )
}
