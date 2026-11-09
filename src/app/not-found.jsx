'use client';

import { BsArrowRightCircle } from "react-icons/bs";
import { IoIosContact } from 'react-icons/io';
import { MdEmail, MdStars } from 'react-icons/md';
import { AiOutlineShop } from 'react-icons/ai';
import { useTranslation } from '@/app/lib/text/text-provider';

import RefautomexLogo from '@/app/components/refautomex-logo';
import Link from 'next/link';


export default function Custom404() {
    const { t } = useTranslation();
    const sections = [
        {
            key: 1,
            name: `${t('navbar.about')}`,
            href: '/section/about',
            description: `${t('navbar.aboutTitle')}`,
            icon: IoIosContact,
        },
        {
            key: 2,
            name: `${t('navbar.contact')}`,
            href: '/section/contact',
            description: `${t('navbar.contactTitle')}`,
            icon: MdEmail,
        },
        {
            key: 3,
            name: `${t('navbar.promotions')}`,
            href: '/section/promotion',
            description: `${t('navbar.promotionsTitle')}`,
            icon: MdStars,
        },
        {
            key: 4,
            name: `${t('navbar.products')}`,
            href: '/section/products',
            description: `${t('navbar.productsTitle')}`,
            icon: AiOutlineShop ,
        },
    ]

    return (
        <div className="bg-[rgb(var(--color-card))]  pt-20 pb-4">
            <main className="mx-auto w-full max-w-7xl px-6 my-20  lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <RefautomexLogo classAttr="h-20 md:h-40 w-auto object-contain p-2 md:p-3 mx-auto" />
                    <p className="text-5xl font-semibold leading-8 text-yellow-500">404</p>
                    <h1 className="mt-2 text-xl tracking-tight text-[rgb(var(--color-text))] ">{t('index.custom404.title')}</h1>
                    <p className="mb-4 text-base leading-7 text-[rgb(var(--color-text))]  sm:text-lg sm:leading-8">
                        {t('index.custom404.description')}
                    </p>
                    <h2 className="text-xl border-gray-200 border-t-2 pt-2 text-[rgb(var(--color-text))] ">{t('index.custom404.popular')}</h2>
                    <div className="mx-auto mt-16 flow-root max-w-lg sm:mt-20">
                        {sections.map((section, index) => (
                            <Link key={section.key} href={section.href} className="relative flex gap-x-6 py-6 animate-out hover:bg-[rgb(var(--color-text-base))] rounded-xl px-4">
                                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full shadow-md shadow-[rgb(var(--color-galaxy))] text-[rgb(var(--color-gray-base))]">
                                    <section.icon className="h-6 w-6" aria-hidden="true" />
                                </div>
                                <div className="flex-auto">
                                    <h3 className="text-sm font-semibold leading-6 text-[rgb(var(--color-refautomex))]">
                                        <span className="absolute inset-0" aria-hidden="true" />
                                        {section.name}
                                    </h3>
                                    <p className="mt-2 text-sm leading-6 text-[rgb(var(--color-text))] ">{section.description}</p>
                                </div>
                                <div className="flex-none self-center text-[rgb(var(--color-refautomex))]">
                                    <BsArrowRightCircle className="h-5 w-5" aria-hidden="true" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    )
}