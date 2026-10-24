'use client';
import { FaStar } from "react-icons/fa6";
import { useTranslation } from '@/app/lib/text/text-provider';

export default function Spinner() {
    const { t } = useTranslation();

    return (
        <div className="bg-[rgb(var(--color-card))]">
            <div className="flex flex-col justify-center items-center h-screen w-screen
            bg-gradient-to-bl from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-galaxy))]/50" >
                <FaStar className="animate-bounce text-6xl text-yellow-500 h-12 w-12" />
                <div className="gradient-text-title italic font-semibold text-xl animate-pulse">
                    {t('navbar.spinner')}
                </div>
            </div>
        </div>

    );
}