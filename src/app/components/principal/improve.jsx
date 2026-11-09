'use client';
import RefautomexLogo from '@/app/components/refautomex-logo';
import Link from 'next/link';
import Atropos from 'atropos/react';
import 'atropos/css';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/app/lib/text/text-provider';
import { FaShoppingBag } from "react-icons/fa";

export default function Improve() {
    const { i18n, t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const router = useRouter();
    const [selectedLanguage, setSelectedLanguage] = useState('es');

    useEffect(() => {
        const detectLanguage = () => {
            const langFromUrl = window.location.pathname.split('/')[1];
            if (langFromUrl && langFromUrl !== selectedLanguage) {
                i18n.changeLanguage(langFromUrl);
                setSelectedLanguage(langFromUrl);
            }
        };
        detectLanguage();
    }, [i18n, selectedLanguage]);

    return (
        <section className='overflow-hidden
        bg-[rgb(var(--color-bg)/0.90)]
        text-[rgb(var(--color-text-base))]
        min-h-[300px] sm:min-h-[500px]'>
            <div className="relative sm:h-screen overflow-hidden
                bg-[rgb(var(--color-bg)/70)]
            ">
                <div className="pb-80 pt-16 sm:pb-40 sm:pt-24 lg:pb-48 lg:pt-40">
                    <div className="relative mx-auto max-w-7xl px-4 sm:static lg:px-6">
                        <div className="sm:max-w-sm lg:max-w-md">
                            <h1 className="text-4xl sm:text-5xl lg:text-6xl gradient-text-title font-bold tracking-tight">
                                {t('index.improve.title')}
                            </h1>
                            <p className="mt-4 text-xl max-w-full sm:max-w-xs lg:max-w-md text-justify
                                    text-[rgb(var(--color-text))]">
                                {t('index.improve.description')}
                            </p>
                        </div>
                        <div>
                            <div className="mt-10">
                                <div aria-hidden="true" className="pointer-events-none lg:absolute lg:inset-y-0 lg:mx-auto lg:w-full lg:max-w-7xl" >
                                    <div className="absolute transform sm:left-1/2 sm:top-0 sm:translate-x-8 lg:left-1/2 lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-8">
                                        <div className="flex items-center space-x-6 lg:space-x-8">
                                            <div className="grid flex-shrink-0 grid-cols-1 gap-y-6 lg:gap-y-8">
                                                <div className="h-44 w-44 overflow-hidden rounded-lg border border-gray-200 shadow-md">
                                                    <img
                                                    src={`${multimediaSrc}productos/2480/PhotoRoom_20231024_141254.jpeg`}
                                                    alt=""
                                                    className="h-full w-full object-cover object-center"
                                                    />
                                                </div>
                                                <div className="h-44 w-44 overflow-hidden rounded-lg border border-gray-200 shadow-md">
                                                    <img
                                                    src={`${multimediaSrc}productos/1455/1455.png`}
                                                    alt=""
                                                    className="h-full w-full object-cover object-center"
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid flex-shrink-0 grid-cols-1 gap-y-6 lg:gap-y-8 pt-5">
                                                <div className="h-44 w-44 overflow-hidden rounded-lg border border-gray-200 shadow-md">
                                                    <img
                                                    src={`${multimediaSrc}productos/CH98/PhotoRoom_20231102_113612.jpeg`}
                                                    alt=""
                                                    className="h-full w-full object-cover object-center"
                                                    />
                                                </div>
                                                <div className="h-44 w-44 overflow-hidden rounded-lg border border-gray-200 shadow-md">
                                                    <img
                                                    src={`${multimediaSrc}productos/2485/PhotoRoom_20231021_115622.jpeg`}
                                                    alt=""
                                                    className="h-full w-full object-cover object-center"
                                                    />
                                                </div>
                                                <div className="h-44 w-44 overflow-hidden rounded-lg border border-gray-200 shadow-md">
                                                    <img
                                                    src={`${multimediaSrc}productos/TFA6000/PhotoRoom_20231021_142337.jpeg`}
                                                    alt=""
                                                    className="h-full w-full object-cover object-center"
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid flex-shrink-0 grid-cols-1 gap-y-6 lg:gap-y-8">
                                                <div className="h-44 w-44 overflow-hidden rounded-lg border border-gray-200 shadow-md">
                                                    <img
                                                    src={`${multimediaSrc}productos/FGI298/PhotoRoom_20231021_145910.jpeg`}
                                                    alt=""
                                                    className="h-full w-full object-cover object-center"
                                                    />
                                                </div>
                                                <div className="h-44 w-44 overflow-hidden rounded-lg border border-gray-200 shadow-md">
                                                    <img
                                                    src={`${multimediaSrc}productos/550/PhotoRoom_20231021_160607.jpeg`}
                                                    alt=""
                                                    className="h-full w-full object-cover object-center"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <Link
                                    href={{ pathname: "/section/products",
                                    query: { lang: selectedLanguage } }}
                                    className="inline-block bg-gradient-to-bl hover:bg-gradient-to-tr from-[rgb(var(--color-galaxy))] to-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))] px-2 py-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer font-bold">
                                        <span className='flex px-1 justify-center items-center'>
                                            <FaShoppingBag className="inline-block text-xl md:text-2xl mx-1.5 p-0.5 rounded-full bg-[rgb(var(--color-galaxy))]/10 shadow shadow-[rgb(var(--color-galaxy))]" />
                                            {t('index.improve.btnCaption')}
                                        </span>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className='flex flex-col justify-center items-center h-screen pb-10'>
                <div className="text-4xl sm:text-5xl md:text-6xl gradient-text-title mt-5 md:mt-10 p-2 mx-auto px-10 font-bold text-center">{t('index.beginning.title')}</div>
                <div className="text-xl md:text-3xl text-[rgb(var(--color-text))] md:p-1 p-3 mb-3 text-center font-semibold">{t('index.beginning.leyend')}</div>
                <Atropos className="overflow-visible max-w-[400px] mx-auto my-10"
                    activeOffset={10} shadowScale={0.8}>
                    <div className='overflow-hidden px-5 bg-[rgb(var(--color-text-base))]
                    '>
                        <RefautomexLogo classAttr=" h-48 md:h-60 w-auto object-contain p-3 mx-auto" />
                    </div>
                </Atropos>
            </div>
        </section>
    )
}