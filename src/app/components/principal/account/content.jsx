'use client';

import { useContext, useEffect, useState } from "react";
import { MdArrowForward, MdLocationOn, MdOutlineCalendarMonth, MdOutlineMail, MdPhoneIphone, MdWeb } from "react-icons/md";
import { AiOutlineLogout } from "react-icons/ai";
import { FaUserCog } from "react-icons/fa";
import Spinner from "@/app/components/principal/spinner";
import { userPool } from '@/app/lib/cognito-manager';
import { useRouter, useSearchParams } from "next/navigation";
import { AuthContext } from '@/app/lib/auth-tracker';
import { getStorageValue, setStorageValue } from "@/app/lib/storage-values";
import { useTranslation } from '@/app/lib/text/text-provider';

export default function Refautomex({ loading, websiteData }) {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const [imgError, setImgError] = useState(false);
    const { isAuthenticated } = useContext(AuthContext);
    const router = useRouter();
    const searchParams = useSearchParams();
    const lang = searchParams.get('lang') || 'es';

    const cognitoUserSession = getStorageValue('CognitoUserSession');
    const username = cognitoUserSession?.idToken?.payload?.["cognito:username"];
    const userData = getStorageValue(`user_${username}`);
    const name = userData?.nombre;
    const lastName = userData?.apellido;
    const profileImageUrl = multimediaSrc && userData?.idusuario
        ? `${multimediaSrc}usr/${userData.idusuario}.jpg`
        : null;
    const birthDate = userData?.f_nacimiento
        ? String(userData.f_nacimiento).split('T')[0]
        : '';
    const initials = [name, lastName]
        .filter(Boolean)
        .map((part) => String(part).trim()[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    useEffect(() => {
        if (isAuthenticated === false) {
        router.replace(`/section/account?load=log-in&lang=${lang}`);
        }
    }, [isAuthenticated, lang, router]);

    const items = [
        {
        name: t('account.itemsHistoryTitle'),
        description: t('account.itemsHistoryDesc'),
        icon: MdWeb,
        path: `/section/refautomex?load=history&lang=${lang}`,
        },
        {
        name: t('account.itemsSettingsTitle'),
        description: t('account.itemsSettingsDesc'),
        icon: FaUserCog,
        path: `/section/refautomex?load=settings&lang=${lang}`,
        },
    ];
    const summaryItems = [
        { label: t('account.mail'), value: userData?.email, icon: MdOutlineMail },
        { label: t('account.phone'), value: userData?.telefono, icon: MdPhoneIphone },
        { label: t('account.address'), value: userData?.domicilio, icon: MdLocationOn },
        { label: t('account.birthdate'), value: birthDate, icon: MdOutlineCalendarMonth },
    ];

    if (isAuthenticated === false) return <Spinner />;

    return (
        <div className="relative overflow-hidden bg-gradient-to-t min-h-[800px] from-[rgb(var(--color-galaxy))]/50 via-[rgb(var(--color-card))] to-[rgb(var(--color-bg))] backdrop-blur-md py-28">
        <div className="pointer-events-none absolute -top-24 right-0 h-64 w-64 rounded-full bg-[rgb(var(--color-amber))]/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-[rgb(var(--color-galaxy))]/30 blur-3xl" />
        {loading ? (
            <Spinner />
        ) : (
            <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
                <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
                    <section className="rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]/60 p-6 shadow-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-5">
                                <div className="relative">
                                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[rgb(var(--color-card))] shadow-lg ring-2 ring-[rgb(var(--color-galaxy))]/30 overflow-hidden">
                                        {profileImageUrl && !imgError ? (
                                            <img
                                                src={profileImageUrl}
                                                alt={t('account.photo')}
                                                className="h-full w-full object-cover"
                                                onError={() => setImgError(true)}
                                            />
                                        ) : (
                                            <span className="text-2xl font-semibold text-[rgb(var(--color-amber))]">
                                                {initials || 'RM'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-3xl font-bold gradient-text-title">
                                        {t('account.dashboardTitle')}
                                    </p>
                                    <p className="mt-1 text-base text-[rgb(var(--color-text))]">
                                        {name ? `${t('account.services')} ${name}` : t('common.loading')}
                                    </p>
                                    <p className="mt-2 text-sm text-[rgb(var(--color-text))]/70">
                                        {t('account.dashboardSubtitle')}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => router.push(`/section/refautomex?load=settings&lang=${lang}`)}
                                className="inline-flex items-center justify-center gap-2 rounded-full bg-[rgb(var(--color-galaxy))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-text))] shadow hover:bg-[rgb(var(--color-amber))]/80 transition"
                            >
                                <FaUserCog className="h-4 w-4" />
                                {t('account.dashboardEdit')}
                            </button>
                        </div>

                        <div className="mt-8">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">
                                    {t('account.quickAccess')}
                                </h3>
                                <span className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--color-text))]/60">
                                    {t('meta.brand')}
                                </span>
                            </div>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                {items.map((item) => (
                                    <button
                                        type="button"
                                        key={item.name}
                                        className="group relative rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/70 p-4 text-left shadow hover:shadow-lg transition cursor-pointer"
                                        onClick={() => router.push(item.path)}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--color-bg))] shadow shadow-[rgb(var(--color-galaxy))]/40">
                                                <item.icon className="h-6 w-6 text-[rgb(var(--color-galaxy))]" aria-hidden="true" />
                                            </div>
                                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] shadow group-hover:bg-[rgb(var(--color-amber))]/20 transition">
                                                <MdArrowForward className="h-4 w-4" />
                                            </span>
                                        </div>
                                        <p className="mt-4 text-lg font-semibold text-[rgb(var(--color-text))]">
                                            {item.name}
                                        </p>
                                        <p className="mt-2 text-sm text-[rgb(var(--color-text))]/70">
                                            {item.description}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/80 p-5 shadow-lg mt-5">
                            <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">
                                {t('account.summaryTitle')}
                            </h3>
                            <p className="mt-1 text-sm text-[rgb(var(--color-text))]/70">
                                {t('account.summaryHelper')}
                            </p>
                            <dl className="mt-4 space-y-3">
                                {summaryItems.map((item) => {
                                    const value = item.value?.toString().trim();
                                    return (
                                        <div key={item.label} className="flex items-start gap-3 rounded-2xl bg-[rgb(var(--color-bg))]/70 p-3 shadow-sm">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--color-bg))] shadow shadow-[rgb(var(--color-galaxy))]">
                                                <item.icon className="h-4 w-4 text-[rgb(var(--color-galaxy))]" />
                                            </div>
                                            <div>
                                                <dt className="text-xs uppercase tracking-wide text-[rgb(var(--color-text))]/60">
                                                    {item.label}
                                                </dt>
                                                <dd className="text-sm font-medium text-[rgb(var(--color-text))]">
                                                    {value || t('account.summaryEmpty')}
                                                </dd>
                                            </div>
                                        </div>
                                    );
                                })}
                            </dl>
                        </div>
                        <button
                            type="button"
                            className="w-full rounded-3xl border border-red-200/60 bg-[rgb(var(--color-error))]/30 p-5 mt-5 text-left shadow hover:shadow-lg transition cursor-pointer"
                            onClick={() => {
                                try {
                                    setStorageValue('CognitoUserSession', null);
                                    userPool.getCurrentUser()?.signOut();
                                    router.replace('/');
                                } catch (err) {
                                    console.log('No existe cuenta activa', err);
                                }
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--color-bg))] shadow shadow-[rgb(var(--color-error))]/40">
                                    <AiOutlineLogout className="h-5 w-5 text-red-500" aria-hidden="true" />
                                </div>
                                <div>
                                    <p className="text-base font-semibold text-red-600">
                                        {t('account.logoutTitle')}
                                    </p>
                                    <p className="mt-1 text-sm text-red-500">
                                        {t('account.logoutDesc')}
                                    </p>
                                </div>
                            </div>
                        </button>
                    </section>
                </div>
            </div>
        )}
        </div>
    );
}
