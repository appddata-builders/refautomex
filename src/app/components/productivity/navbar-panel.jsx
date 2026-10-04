'use client';

import { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { FaUsersViewfinder, FaBoxesPacking, FaUserShield } from 'react-icons/fa6';
import { AiOutlineDashboard, AiOutlineLogout } from 'react-icons/ai';
import { HiClipboardDocumentList, HiMiniCog6Tooth } from "react-icons/hi2";
import { IoIosArrowDown, IoIosArrowUp } from 'react-icons/io';
import { getStorageValue, setStorageValue } from "@/app/lib/storage-values";
import { userPool } from '@/app/lib/cognito-manager';
import { GiAutoRepair } from 'react-icons/gi';
import { MdSell } from "react-icons/md";
import { LuDatabaseBackup } from 'react-icons/lu';
import { BiSolidUserCircle } from 'react-icons/bi';
import RefautomexLogo from '@/app/components/refautomex-logo';
import NotificationBell from './notification-bell';
import ShiftModeButton from '../principal/shiftmode-button';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/app/lib/text/text-provider';
import { perfilDeCategoria, puedeVer } from '@/app/lib/permisos-menu';
import { usePermisosMenu } from '@/app/lib/use-permisos-menu';

const MenuItems = ({ items, closeMenu, lang }) => {
    const [openedSection, setOpenedSection] = useState(null);
    const toggleSection = (sectionName) => {
        setOpenedSection(prev => prev === sectionName ? null : sectionName);
    };

    return (
        <>
        {items.map((item) => (
            <div key={item.name} className='px-3 cursor-pointer bg-[rgb(var(--color-card))]'>
            {item.href ? (
                <Link
                href={`${item.href}&lang=${lang}`}
                className="flex items-center text-[rgb(var(--color-text))] py-2"
                onClick={closeMenu}
                >
                {item.icon && <item.icon className="mr-3" />}
                {item.name}
                </Link>
            ) : (
                <div
                onClick={() => toggleSection(item.name)}
                className="flex items-center text-[rgb(var(--color-text))] py-2"
                >
                {openedSection === item.name
                    ? <IoIosArrowUp className='mr-4' />
                    : <IoIosArrowDown className='mr-4' />}
                {item.icon && <item.icon className="mr-3" />}
                {item.name}
                </div>
            )}

            {item.subNav && openedSection === item.name && (
                <div className="p-3 transition duration-300 ease-in-out">
                {item.subNav.map(subItem => (
                    <Link
                    key={subItem.name}
                    href={`${subItem.href}&lang=${lang}`}
                    onClick={closeMenu}
                    className="block text-[rgb(var(--color-text))] rounded-md py-1 bg-[rgb(var(--color-bg))] shadow shadow-[rgb(var(--color-galaxy))] my-1 pl-2"
                    >
                    {subItem.name}
                    </Link>
                ))}
                </div>
            )}
            </div>
        ))}
        </>
    );
};

export default function NavbarPanel() {
    const { t } = useTranslation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [imgError, setImgError] = useState(false);
    const [profileImageUrl, setProfileImageUrl] = useState('');
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const cognitoUserSession = getStorageValue('CognitoUserSession');
    const username = cognitoUserSession?.idToken.payload["cognito:username"];
    const userData = getStorageValue(`user_${username}`);
    const name = userData?.nombre;
    const id = userData?.idusuario;

    const router = useRouter();
    const searchParams = useSearchParams();
    const lang = searchParams.get('lang') || 'es';

    // Que ve cada perfil se configura en Permisos > Permisos de perfil;
    // `modulo` es la clave de permisos-menu.js.
    const permisos = usePermisosMenu();
    const perfil = perfilDeCategoria(userData?.categoria);

    const navItems = [
        {
        name: t('panel.nav.sales'),
        icon: MdSell,
        subNav: [
            { name: t('panel.nav.tickets'), href: '/productivity?load=tickets', modulo: 'tickets' },
            { name: t('panel.nav.devolution'), href: '/productivity?load=devolution', modulo: 'devolution' },
            { name: t('panel.nav.history'), href: '/productivity?load=history', modulo: 'history' },
        ],
        },
        {
        name: t('panel.nav.stock'),
        icon: FaBoxesPacking,
        subNav: [
            { name: t('panel.nav.inventories'), href: '/productivity?load=inventories', modulo: 'inventories' },
            { name: t('panel.nav.warehouse'), href: '/productivity?load=warehouse', modulo: 'warehouse' },
            { name: t('panel.nav.missing'), href: '/productivity?load=missing', modulo: 'missing' },
        ],
        },
        {
        name: t('panel.nav.purchases'),
        icon: HiClipboardDocumentList,
        subNav: [
            { name: t('panel.nav.capture'), href: '/productivity?load=capture', modulo: 'capture' },
            { name: t('panel.nav.providers'), href: '/productivity?load=providers', modulo: 'providers' },
        ],
        },
        {
        name: t('panel.nav.services'),
        icon: FaUsersViewfinder,
        subNav: [
            { name: t('panel.nav.calendar'), href: '/productivity?load=calendar', modulo: 'calendar' },
            { name: t('panel.nav.invoice'), href: '/productivity?load=invoice', modulo: 'invoice' },
        ],
        },
        {
        name: t('panel.nav.orders'),
        icon: GiAutoRepair,
        subNav: [
            { name: t('panel.nav.site'), href: '/productivity?load=site', modulo: 'site' },
            { name: t('panel.nav.delivery'), href: '/productivity?load=delivery', modulo: 'delivery' },
        ],
        },
        { name: t('panel.nav.home'), icon: AiOutlineDashboard, href: '/productivity?load=home', modulo: 'home' },
        { name: t('panel.nav.settings'), icon: HiMiniCog6Tooth, href: '/productivity?load=user-settings', modulo: 'user-settings' },
        { name: t('panel.nav.personal'), icon: FaUserShield, href: '/productivity?load=personal', modulo: 'personal' },
        { name: t('panel.nav.backups'), icon: LuDatabaseBackup, href: '/productivity?load=backups', modulo: 'backups' },
    ];

    const filteredNavItems = navItems
        .map((item) => {
            if (!item.subNav) return puedeVer(permisos, item.modulo, perfil) ? item : null;
            const allowedSubNav = item.subNav.filter((subItem) => puedeVer(permisos, subItem.modulo, perfil));
            if (!allowedSubNav.length) return null;
            return { ...item, subNav: allowedSubNav };
        })
        .filter(Boolean);

    useEffect(() => {
        if (!id || !multimediaSrc) return;
        const imageUrl = `${multimediaSrc}usr/${id}.jpg`;
        setProfileImageUrl(imageUrl);
        const image = new Image();
        image.src = imageUrl;
        image.onload = () => setImgError(false);
        image.onerror = () => setImgError(true);
    }, [id, multimediaSrc]);

    if (userData && userData?.empleado === 0) return null;

    return (
        <header
        className={`fixed flex justify-center min-h-[95px] p-0.5 my-2 lg:my-4 opacity-95 w-full z-20 shadow shadow-[rgb(var(--color-galaxy))] bg-[rgb(var(--color-card))]/95`}
        >
        <nav
            className="flex w-full items-center justify-between max-w-7xl mx-5 transition duration-100 ease-in-out"
            aria-label={t('navbar.ariaGlobal')}
        >
            <div className="flex w-full items-center justify-between">
            <div className="flex flex-row items-center justify-center md:mx-3 md:mt-0">
                <Link href={`/productivity?lang=${lang}`} className="flex lg:flex-1">
                <RefautomexLogo classAttr="h-16 2xl:h-20" />
                </Link>
                <div className="left-3 fixed bottom-3">
                    <ShiftModeButton />
                </div>
            </div>

            <div className="flex justify-between sm:justify-end items-center mr-2.5">
                <Link
                href={`/productivity?load=user-settings&lang=${lang}`}
                className="mx-3 text-md xl:text-lg leading-6 xl:pr-1 flex rounded-3xl justify-center items-center shadow shadow-[rgb(var(--color-galaxy))]/90 text-[rgb(var(--color-text))] bg-[rgb(var(--color-card))] cursor-pointer animate-out"
                >
                {userData?.idusuario && !imgError ? (
                    <div className="flex h-9 w-9 2xl:h-11 2xl:w-11 items-center justify-center bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-card-white))] hover:border-[rgb(var(--color-amber))] animate-out shadow-lg rounded-full overflow-hidden">
                        {profileImageUrl ? (
                        <img
                            src={profileImageUrl}
                            onError={() => setImgError(true)}
                            className="w-full h-full object-cover bg-gray-50"
                            alt={t('account.photo')}
                        />
                        ) : null}
                    </div>
                    ) : (
                    <BiSolidUserCircle className="w-8 h-8 rounded-full shadow-xl border border-indigo-100 my-auto animate-out" />
                    )
                }
                <div className="ml-1.5 mr-2 text-sm xl:text-xl italic hidden sm:block">
                    {name}
                </div>
                </Link>

                <NotificationBell lang={lang} />

                <button
                type="button"
                className="my-auto items-center rounded-full p-1.5 text-[rgb(var(--color-gray-base))] bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))] animate-out"
                onClick={() => setMobileMenuOpen(true)}
                >
                <Bars3Icon className="h-6 w-6 2xl:h-8 2xl:w-8" aria-hidden="true" />
                </button>
            </div>
            </div>
        </nav>

        <Transition show={mobileMenuOpen}>
            <Dialog as="div" className="fixed inset-0 overflow-hidden z-40" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
            <div className="absolute inset-0 overflow-hidden">
                <Dialog.Panel className="fixed inset-y-0 right-0 pl-10 max-w-full flex sm:pl-16">
                <div className="flex flex-col h-full bg-[rgb(var(--color-bg))] shadow-xl overflow-y-auto w-screen max-w-md">
                    <div className="px-5 pt-5 pb-3 border-b border-[rgb(var(--color-galaxy))]">
                    <Dialog.Title className="text-xl font-semibold text-gray-900">
                        <RefautomexLogo classAttr="h-16" />
                    </Dialog.Title>
                    </div>

                    <div className="flex flex-col flex-1 mt-5">
                    <nav className="flex-1 space-y-2">
                        <MenuItems items={filteredNavItems} closeMenu={() => setMobileMenuOpen(false)} lang={lang} />

                        <button
                        key="salir"
                        className="px-3 bg-[rgb(var(--color-card))] text-[rgb(var(--color-error))] cursor-pointer w-full"
                        onClick={() => {
                            try {
                            setStorageValue('CognitoUserSession', null);
                            userPool.getCurrentUser()?.signOut();
                            router.replace(`/calidad?lang=${lang}`);
                            } catch (err) {
                            console.log('No existe cuenta activa', err);
                            }
                        }}
                        >
                        <div className="flex items-center py-2">
                            <AiOutlineLogout className="mr-3" />
                            {t('panel.nav.logout')}
                        </div>
                        </button>
                    </nav>
                    </div>
                </div>
                </Dialog.Panel>
            </div>

            <div className="absolute top-0 right-0 pt-4 pr-4">
                <button
                type="button"
                className="rounded-md text-[rgb(var(--color-error))]"
                onClick={() => setMobileMenuOpen(false)}
                >
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                </button>
            </div>
            </Dialog>
        </Transition>
        </header>
    );
}
