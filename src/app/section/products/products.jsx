'use client';
import MetaHead from "@/app/components/meta-head";
import CardProducts from "@/app/components/principal/products/card-products";
import Title from "@/app/components/principal/title";
import { useTranslation } from '@/app/lib/text/text-provider';

export default function Products({ includeMeta = true, sectionId = 'products', showSearchBar = true }) {
    const { t } = useTranslation();
    const topSpacingClass = showSearchBar ? 'mt-48' : 'mt-10';
    return(
        <section id={sectionId} className="bg-[rgb(var(--color-card))] py-0.5 scroll-mt-32">
            {includeMeta && <MetaHead title={t('navbar.products')}/>}
            <CardProducts showSearchBar={showSearchBar} />
        </section>
    )
}
