import { Popover, Transition, Dialog } from '@headlessui/react'
import { motion, useReducedMotion } from 'framer-motion';
import { PiList } from 'react-icons/pi';
import { useState, useEffect } from 'react';
import { getStorageValue } from "@/app/lib/storage-values";
import { XMarkIcon } from '@heroicons/react/20/solid';
import RefautomexLogo from '@/app/components/refautomex-logo';
import Link from 'next/link'
import { useTranslation } from '@/app/lib/text/text-provider';

// Los botones redondos del navbar (cuenta, carrito y este menu): todos del
// mismo tamano, con el icono a 22px.
export const BOTON_REDONDO = `relative flex size-10 shrink-0 items-center justify-center rounded-full
    bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] ring-1 ring-[rgb(var(--color-border))]
    transition-all duration-300 hover:-translate-y-0.5 hover:ring-[rgb(var(--color-galaxy))]
    hover:shadow-md hover:shadow-[rgb(var(--color-galaxy))]/30 focus:outline-none`;

// El numero del carrito en la esquina de un boton redondo; rebota al cambiar.
export function CartBadge({ count }) {
    if (!count) return null;
    return (
        <motion.span
            key={count}
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-[rgb(var(--color-bg))]"
        >
            {count > 99 ? '99+' : count}
        </motion.span>
    );
}

// La seccion activa no cambia el color del texto: detras lleva una aurora, las
// manchas del fondo de Cuenta (background-stars.jsx) en chico. Salen de los
// colores del tema, asi que en claro es dorada y en oscuro azul.
const MANCHAS_AURORA = [
    { color: '--color-galaxy', alfa: 0.6, lugar: { left: '-15%', top: '-80%', width: '65%', height: '260%' }, dur: 6, recorrido: { x: ['0%', '45%', '10%'], y: ['0%', '15%', '-10%'] } },
    { color: '--color-amber', alfa: 0.45, lugar: { right: '-10%', top: '-70%', width: '55%', height: '240%' }, dur: 8, recorrido: { x: ['0%', '-50%', '-15%'], y: ['0%', '-10%', '12%'] } },
    // El azul apenas: encima del dorado se vuelve gris.
    { color: '--color-blue', alfa: 0.18, lugar: { left: '30%', top: '-60%', width: '45%', height: '220%' }, dur: 10, recorrido: { x: ['0%', '-40%', '35%'], y: ['0%', '20%', '-15%'] } },
];

// Va como primer hijo de un elemento `relative`; lo que va encima tambien
// necesita `relative` para pintarse sobre ella. Con `layoutId` se desliza de
// una seccion a otra.
export function AuroraPill({ layoutId, rounded = true }) {
    const quieto = useReducedMotion();
    return (
        <motion.span
            layoutId={layoutId}
            transition={quieto ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
            className="absolute inset-0 overflow-hidden bg-[rgb(var(--color-card))] ring-1 ring-[rgb(var(--color-galaxy))]/50"
            // En el style (no en la clase) para que framer-motion corrija la curva mientras se desliza.
            style={rounded ? { borderRadius: 9999 } : undefined}
            aria-hidden="true"
        >
            {MANCHAS_AURORA.map((m) => (
                <motion.span
                    key={m.color}
                    className="absolute rounded-full blur-lg"
                    style={{ ...m.lugar, backgroundColor: `rgb(var(${m.color}) / ${m.alfa})` }}
                    animate={quieto ? undefined : m.recorrido}
                    transition={{ duration: m.dur, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
                />
            ))}
        </motion.span>
    );
}

export default function MenuSlide({menuItems, callsToAction, selectedLanguage, pathPage, cartItemCount }) {
    const { t } = useTranslation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const [profileImageUrl, setProfileImageUrl] = useState('');
    const [imgError, setImgError] = useState(false);
    const cognitoUserSession = getStorageValue('CognitoUserSession');
    const username = cognitoUserSession?.idToken.payload["cognito:username"];
    const userData = getStorageValue(`user_${username}`);
    const id = userData?.idusuario;

    const itemVariants = {
        hidden: { x: -10, opacity: 0 },
        visible: { x: 0, opacity: 1 },
    };

    useEffect(() => {
        const imageUrl = `${multimediaSrc}usr/${id}.jpg`;
        setProfileImageUrl(imageUrl);
        const image = new Image();
        image.src = imageUrl;
        image.onload = () => setImgError(false);
        image.onerror = () => setImgError(true);
    }, [id, multimediaSrc]);

    return (
    <Popover className="relative focus:ring-0">
        <Popover.Button
            onClick={() => setMobileMenuOpen(true)}
            aria-label={t('navbar.ariaGlobal')}
            className={BOTON_REDONDO}
        >
            <PiList className="size-[22px]" aria-hidden="true" />
        </Popover.Button>
        <Transition
                show={mobileMenuOpen}
                enter="transition ease-out duration-200 transform"
                enterFrom="opacity-0 translate-x-full"
                enterTo="opacity-100 translate-x-0"
                leave="transition ease-in duration-150 transform"
                leaveFrom="opacity-100 translate-x-0"
                leaveTo="opacity-0 translate-x-full"
                >
            <Dialog as="div" className="fixed inset-0 overflow-hidden z-40" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
                <div className="absolute inset-0 overflow-hidden">
                <Dialog.Panel className="fixed inset-y-0 right-0 pl-10 max-w-full flex sm:pl-16">
                    <Transition.Child
                    as="div"
                    className="w-screen max-w-md"
                    enter="transform transition ease-in-out duration-500 sm:duration-700"
                    enterFrom="translate-x-full"
                    enterTo="translate-x-0"
                    leave="transform transition ease-in-out duration-500 sm:duration-700"
                    leaveFrom="translate-x-0"
                    leaveTo="translate-x-full"
                    >
                    <div className="flex flex-col h-full bg-gradient-to-bl from-[rgb(var(--color-card))] via-[rgb(var(--color-bg))] to-[rgb(var(--color-galaxy))] shadow-xl overflow-y-auto">
                        <div className="px-5 pt-5 ">
                            <Dialog.Title className="text-xl font-semibold text-gray-900 flex justify-center">
                                <RefautomexLogo classAttr="h-14 w-auto" />
                            </Dialog.Title>
                        </div>
                        <div className="flex flex-col flex-1 mt-5">
                            <div className="grid grid-cols-2 divide-x divide-gray-900/5 ">
                                {callsToAction.map((action) => {
                                    const isActionActive = pathPage === action.href;
                                    return (
                                        <Link
                                            passHref
                                            key={action.key}
                                            href={{ pathname: action.href, query: { lang: selectedLanguage } }}
                                            onClick={() => setMobileMenuOpen(false)}
                                            className={`
                                            group relative flex items-center justify-center gap-x-6 my-0.5 p-2 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]
                                            ${isActionActive ? '' : 'shadow shadow-[rgb(var(--color-text))]/10'}
                                            `}
                                        >
                                            {isActionActive && <AuroraPill rounded={false} />}
                                            <div className={BOTON_REDONDO}>
                                                {action.kind === 'account' && userData?.idusuario && !imgError ? (
                                                    <img
                                                        src={profileImageUrl}
                                                        onError={() => setImgError(true)}
                                                        className="size-full rounded-full object-cover"
                                                        alt={t('account.photo')}
                                                    />
                                                ) : (
                                                    <action.icon className="size-[22px]" aria-hidden="true" />
                                                )}
                                                {action.kind === 'cart' && <CartBadge count={cartItemCount} />}
                                            </div>
                                            <div className="relative">
                                                <p className='text-md my-2'>{action.name}</p>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                            <nav className="flex-1 space-y-2 px-4 pt-3 border-t border-gray-200">
                            {menuItems.map((item) => {
                                const isActive = pathPage === item.link;
                                const Icon = isActive ? item.activeIcon ?? item.icon : item.icon;
                                return (
                                <Link
                                    key={item.key}
                                    href={{ pathname: item.link, query: { lang: selectedLanguage } }}
                                    passHref
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <motion.div
                                        variants={itemVariants}
                                        className={`
                                            group relative flex gap-6 rounded-full my-3 p-1.5 text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-text))]/40 hover:bg-[rgb(var(--color-card))]
                                            ${isActive ? '' : 'shadow shadow-[rgb(var(--color-text))]/10'}
                                            `}
                                    >
                                        {isActive && <AuroraPill />}
                                        <div className="relative mt-1 flex size-8 flex-none items-center justify-center rounded-full shadow shadow-[rgb(var(--color-galaxy))] bg-[rgb(var(--color-bg))]">
                                            <Icon className="size-5" aria-hidden="true" />
                                        </div>
                                        <div className="relative">
                                            <p className='text-md my-2'>{item.name}</p>
                                        </div>
                                    </motion.div>
                                </Link>
                                );
                            })}
                            </nav>
                        </div>
                    </div>
                    </Transition.Child>
                </Dialog.Panel>
                </div>
                <div className="absolute top-0 right-0 pt-4 pr-4">
                <button
                    type="button"
                    className="rounded-md focus:outline-none focus:ring-2 focus:ring-white"
                    onClick={() => setMobileMenuOpen(false)}
                >
                    <span className="sr-only">{t('common.closePanel')}</span>
                    <XMarkIcon className="h-6 w-6 text-red-500" aria-hidden="true" />
                </button>
                </div>
            </Dialog>
        </Transition>
    </Popover>
    )
}
