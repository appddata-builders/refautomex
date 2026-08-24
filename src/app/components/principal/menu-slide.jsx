import { Popover, Transition, Dialog } from '@headlessui/react'
import { motion } from 'framer-motion';
import { FaBarsStaggered } from "react-icons/fa6";
import { IoBagHandleOutline } from "react-icons/io5";
import { FaUserCircle } from "react-icons/fa";
import { useState, useEffect } from 'react';
import { getStorageValue } from "@/app/lib/storage-values";
import { XMarkIcon } from '@heroicons/react/20/solid';
import RefautomexLogo from '@/app/components/refautomex-logo';
import Link from 'next/link'
import { useTranslation } from '@/app/lib/text/text-provider';

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
        <Popover.Button onClick={() => setMobileMenuOpen(true)}
        className="p-2 m-2 text-sm font-semibold leading-6 rounded-full shadow-xl
        bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] focus:ring-0">
            <FaBarsStaggered size={20} />
            {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-0.5 bg-red-500 text-white text-xs font-semibold rounded-full h-6 w-6 flex items-center justify-center shadow shadow-[rgb(var(--color-galaxy))]">
                    {cartItemCount}
                </span>
            )}
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
                                            group relative flex items-center justify-center gap-x-6 my-0.5 p-2 bg-[rgb(var(--color-card))]
                                            ${isActionActive
                                                ? 'gradient-text-title'
                                                : 'text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-text))]/10'}
                                            `}
                                        >
                                            <div className={`relative text-sm font-bold leading-6 m-1 ${userData?.idusuario && action.icon === FaUserCircle ? '' : 'p-2.5'}
                                            mt-1 flex flex-none items-center justify-center rounded-full shadow bg-[rgb(var(--color-gray))]`}>
                                                {userData?.idusuario && action.icon === FaUserCircle ? (
                                                    <div className="flex h-10 w-10 items-center justify-center bg-[rgb(var(--color-card))] border border-slate-300 animate-out shadow-lg rounded-full overflow-hidden">
                                                        <img src={profileImageUrl} onError={() => setImgError(true)} className="w-full h-full object-cover bg-[rgb(var(--color-card))]"/>
                                                    </div>
                                                ) : (
                                                    <action.icon
                                                        className={`h-6 w-6 ${isActionActive ? 'text-yellow-500' : 'text-[rgb(var(--color-text))]'}`}
                                                        aria-hidden="true"
                                                    />
                                                )}

                                            {cartItemCount > 0 && action.icon === IoBagHandleOutline && (
                                                <span className="absolute -top-2 -left-2 bg-red-500 border-2 border-red-800 animate-up text-white text-xs font-semibold rounded-full h-7 w-7 flex items-center justify-center shadow-lg">
                                                    {cartItemCount}
                                                </span>
                                            )}
                                            </div>
                                            <div>
                                                <p className='text-md my-2'>{action.name}</p>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                            <nav className="flex-1 space-y-2 px-4 pt-3 border-t border-gray-200">
                            {menuItems.map((item) => {
                                const isActive = pathPage === item.link;
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
                                            group relative flex gap-6 rounded-full my-3 p-1.5 shadow shadow-[rgb(var(--color-text))]/40 hover:bg-[rgb(var(--color-card))]
                                            ${isActive
                                                ? 'gradient-text-title'
                                                : 'text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-text))]/10'}
                                            `}
                                    >
                                        <div className="mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-full shadow shadow-[rgb(var(--color-galaxy))] bg-[rgb(var(--color-bg))]">
                                            <item.icon
                                                className={`h-6 w-6 ${isActive ? 'text-[rgb(var(--color-galaxy))]' : 'text-[rgb(var(--color-text))]'}`}
                                                aria-hidden="true"
                                            />
                                        </div>
                                        <div>
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
