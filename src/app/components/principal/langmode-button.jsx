'use client';

import { TbWorld } from "react-icons/tb";
import { IoMdCloseCircle } from "react-icons/io";
import { useState, useEffect } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function LangModeButton() {
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { i18n, t } = useTranslation();

    const changeLanguage = (lang) => {

        // Opción 2: Con next-i18next - cambiar idioma y actualizar URL
        i18n.changeLanguage(lang);
        const newSearchParams = new URLSearchParams(searchParams.toString());
        newSearchParams.set('lang', lang);
        router.push(`${pathname}?${newSearchParams.toString()}`);

        setIsOpen(false);
    };

    // Manejar cambios en los parámetros de búsqueda para actualizar el idioma
    useEffect(() => {
        const lang = searchParams.get('lang');
        if (lang) {
            i18n.changeLanguage(lang);
        }
    }, [searchParams]);

    // No renderizar en ciertas rutas
    if (pathname === '/calidad' || pathname === '/productivity') {
        return null;
    }

    return (
        <div className="z-30">
            {isOpen && (
                <div className="fixed bottom-24 left-20 md:-mb-1 md:left-20 2xl:left-24 md:right-auto -mb-2.5 bg-slate-100 text-white text-sm border-x-4 shadow-md border-amber-400 justify-between">
                    <div className="flex flex-row">
                        <button
                            className="block p-0.5 text-sm animate-out hover:scale-110 transition-transform"
                            role="menuitem"
                            onClick={() => changeLanguage('es')}
                        >
                            <img
                                loading="lazy"
                                src="https://flagsapi.com/MX/shiny/64.png"
                                alt={t('alt.flagMx')}
                                className='h-7 md:h-8 2xl:h-12'
                            />
                        </button>
                        <button
                            className="block p-0.5 text-sm animate-out hover:scale-110 transition-transform" 
                            role="menuitem"
                            onClick={() => changeLanguage('en')}
                        >
                            <img
                                loading="lazy"
                                src="https://flagsapi.com/US/shiny/64.png"
                                alt={t('alt.flagUs')}
                                className='h-7 md:h-8 2xl:h-12'
                            />
                        </button>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="bg-red-600 rounded-full absolute -left-3 -top-2 animate-out hover:scale-110 transition-transform"
                    >
                        <IoMdCloseCircle className='text-slate-50' size={15} />
                    </button>
                </div>
            )}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className='bg-gradient-to-t from-zinc-300 via-zinc-200 to-zinc-100 hover:scale-105 font-semibold
                rounded-full shadow-2xl border-slate-600 border-b animate-out focus:outline-none transition-all duration-500
                ease-in-out p-3 rounded-full shadow-2xl border-slate-600 border-b animate-out
                w-14 h-14 flex items-center justify-center transition-transform hover:scale-105'
            >
                <TbWorld className='text-stone-600 m-0 h-9 w-9 2xl:w-12 2xl:h-12' />
            </button>
        </div>
    );
}