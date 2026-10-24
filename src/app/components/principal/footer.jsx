'use client';
import Link from 'next/link';
import { FaInstagram, FaWhatsapp, FaFacebookSquare } from 'react-icons/fa';
import { AuthContext } from '@/app/lib/auth-tracker';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useContext, useState, useEffect } from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function Footer() {
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const iconSize = 30;
    const { isAuthenticated } = useContext(AuthContext);
    const { i18n, t } = useTranslation();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [selectedLanguage, setSelectedLanguage] = useState('es');

    const message = t('index.video.whatsapp');
    const phoneNumber = "5639557232";
    const navigation = {
        social: [
            {
                name: t('footer.socialInstagram'),
                href: 'https://www.instagram.com/refautomex.by.volkspaco/',
                icon: (props) => (
                    <FaInstagram
                        size={iconSize}
                        className="transition duration-300 ease-in-out
                        hover:bg-gradient-to-bl hover:from-amber-500 hover:via-purple-600 hover:to-red-600 text-[rgb(var(--color-text))] hover:text-white
                        rounded p-0.5 shadow shadow-[rgb(var(--color-galaxy))] bg-[rgb(var(--color-gray))]"
                    />
                ),
            },
            {
                name: t('footer.socialWhatsapp'),
                href: `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`,
                icon: (props) => (
                    <FaWhatsapp size={iconSize} className='transition duration-300 ease-in-out
                    hover:bg-gradient-to-bl hover:from-green-300 hover:via-green-600 hover:to-green-800 text-[rgb(var(--color-text))] hover:text-white
                    rounded p-0.5 shadow shadow-[rgb(var(--color-galaxy))] bg-[rgb(var(--color-gray))]' />
                ),
            },
            {
                name: t('footer.socialFacebook'),
                href: `https://www.facebook.com/search/top?q=refautomex%20by%20volkspaco`,
                icon: (props) => (
                    <FaFacebookSquare size={iconSize} className='transition duration-300 ease-in-out
                    hover:bg-gradient-to-bl hover:from-blue-400 hover:to-blue-800 text-[rgb(var(--color-text))] hover:text-white
                    rounded p-0.5 shadow shadow-[rgb(var(--color-galaxy))] bg-[rgb(var(--color-gray))]' />
                ),
            },
        ],
    }

    const bubblesData = [
        { top: '7%', left: '0%', large:'h-12', url:`${multimediaSrc}brands/ford.png` },
        { top: '5%', left: '22%', large:'h-20', url:`${multimediaSrc}brands/seat.png` },
        { top: '5%', left: '52%', large:'h-16', url:`${multimediaSrc}brands/toyota.png` },
        { top: '40%', left: '67%', large:'h-12', url:`${multimediaSrc}brands/chevrolet.png` },
        { top: '36%', left: '33%', large:'h-20', url:`${multimediaSrc}brands/volkswagen.png` },
        { top: '40%', left: '7%', large:'h-20', url:`${multimediaSrc}brands/audi.png` },
        { top: '75%', left: '22%', large:'h-16', url:`${multimediaSrc}brands/kia.png` },
        { top: '75%', left: '52%', large:'h-20', url:`${multimediaSrc}brands/nissan.png` },
        { top: '7%', left: '76%', large:'h-20', url:`${multimediaSrc}brands/mazda.png` },
        ];

    const stats = [
        {   id: 1,
            desc: `${t('footer.ourBrands')}`,
            ruta:
            <div className='w-full flex flex-wrap justify-center items-center'>
                <div className="flex justify-center flex-wrap bg-[rgb(var(--color-bg))] -p-1 py-2 max-w-md rounded-xl shadow">
                    {bubblesData.map((bubble, index) => (
                        <div
                            key={index}
                            className='sm:m-1.5 sm:p-0.5 p-2 m-2 h-[85px] sm:h-[127px] flex items-center justify-center bg-[rgb(var(--color-card-white))] rounded-full shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] animate-up'
                            style={{
                                width: 'calc(33% - 1rem)',
                                position: 'relative',
                            }}
                        >
                            <img src={bubble.url} alt={t('alt.brandLogo')} className={`${bubble.large}`} style={{ objectFit: 'contain' }} />
                        </div>
                    ))}
                </div>
            </div>,
            value: `${t('footer.brands')}`
        },
        {   id: 2,
            desc: `${t('footer.schedule')}`,
            ruta: <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3759.801947704656!2d-99.19440841998485!3d19.5501146347099!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x85d21d65c03197a1%3A0x909cdd5c91dd2897!2sRefautomex%20by%20Volks%20Paco!5e0!3m2!1ses!2smx!4v1707630313260!5m2!1ses!2smx" 
                allowFullScreen=""
                loading="lazy"
                className='w-full h-[430px] shadow-md rounded-xl animate-up'
                referrerPolicy="no-referrer-when-downgrade">
            </iframe>,
            value: `${t('footer.maps')}`
        },
    ]

    const buttonSection = [
        {
            id: 1,
            ruta: '/section/mailbox',
            value:  `${t('footer.btnSectionOne')}`
        },
        {
            id: 2,
            ruta: '/section/faqs',
            value: `${t('footer.btnSectionTwo')}`
        },
        {
            id: 3,
            ruta: '/section/invoices',
            value: `${t('footer.btnSectionThree')}`
        },
    ]

    // Manejar cambios de idioma con searchParams
    useEffect(() => {
        const lang = searchParams.get('lang');
        if (lang) {
            setSelectedLanguage(lang);
            // Si estás usando next-i18next, descomenta esto:
            i18n.changeLanguage(lang);
        }
    }, [searchParams]);

    if ((pathname === '/calidad' && !isAuthenticated) || (pathname === '/productivity')) {
        return null;
    }

    return (
        <footer className="bg-[rgb(var(--color-bg))] text-white z-0">
            <div className="bg-gradient-to-bl from-[rgb(var(--color-card))] via-[rgb(var(--color-card))] to-[rgb(var(--color-galaxy))]/50 pt-14 sm:pt-20 pb-3 z-0">
                <div className="mx-auto max-w-7xl px-6 lg:px-8 mb-10">
                    <dl className="grid grid-cols-1 gap-2 text-center lg:grid-cols-2">
                        {stats.map((stat) => (
                        <div key={stat.id} className="mx-auto flex flex-col gap-y-4">
                            <div className="order-first text-2xl font-semibold tracking-tight text-[rgb(var(--color-text))] sm:text-3xl pt-5">
                                {stat.value}
                            </div>
                            <div className="text-sm leading-5 text-[rgb(var(--color-gray-base))] pt-2">{stat.desc}</div>
                            <div>{stat.ruta}</div>
                        </div>
                        ))}
                    </dl>
                </div>
            </div>

            <div className="mx-auto max-w-7xl overflow-hidden px-6 py-8">
                <dl className="mx-auto max-w-7xl grid grid-cols-1 text-center sm:grid-cols-2 lg:grid-cols-3">
                    {buttonSection.map((button) => (
                        <Link   key={button.id} href={{ pathname: button.ruta, query: { lang: selectedLanguage } }}
                                className='bg-gradient-to-b hover:bg-gradient-to-t from-[rgb(var(--color-card))] via-[rgb(var(--color-gray))] to-[rgb(var(--color-gray))] shadow shadow-[rgb(var(--color-galaxy))]
                                        rounded-tr-xl rounded-bl-xl mt-3 py-4 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer diagonal-cut mx-5'>
                            <p className='text-[rgb(var(--color-text))] font-semibold'>{button.value}</p>
                        </Link>
                    ))}
                </dl>
                <div className="mt-4 flex justify-center space-x-3">
                    {navigation.social.map((item) => (
                        <Link key={item.name} href={item.href} target='_blank'>
                            <span className="sr-only">{item.name}</span>
                            <item.icon className="h-6 w-6" aria-hidden="true" />
                        </Link>
                    ))}
                </div>
                <p className="mt-4 text-center text-xs leading-5 text-[rgb(var(--color-text))]">
                    {t('footer.copyright')} - <Link href={{ pathname: "/privacy", query: { lang: selectedLanguage } }} className='text-[rgb(var(--color-refautomex))]'>{t('footer.notice')}</Link>
                </p>
            </div>
        </footer>
    )
}
