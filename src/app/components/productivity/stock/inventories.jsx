'use client';

import { useContext, useState } from 'react';
import { FaBoxesPacking } from 'react-icons/fa6';
import { AuthContext } from '@/app/lib/auth-tracker';
import Title from '../title';
import AddRegister from './add-register';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function Inventories() {
    const { t } = useTranslation();
    const { userData } = useContext(AuthContext);
    const [resetKey, setResetKey] = useState(0);
    const isAdmin = String(userData?.categoria || '').toUpperCase() === 'A';

    const handleCancel = () => {
        setResetKey((prev) => prev + 1);
    };

    if (!isAdmin) {
        return (
            <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-transparent to-[rgb(var(--color-card))] backdrop-blur-md py-28">
                <Title
                    title={t('panel.inventories.title')}
                    icon={FaBoxesPacking}
                    back={t('panel.common.back')}
                    path="/productivity"
                />
                <div className="mx-auto max-w-4xl px-6 lg:px-8">
                    <div className="rounded-2xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-card))] p-6 text-sm text-[rgb(var(--color-text))] shadow-sm">
                        {t('panel.common.adminOnly')}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-transparent to-[rgb(var(--color-card))] backdrop-blur-md py-28">
            <Title
                title={t('panel.inventories.title')}
                icon={FaBoxesPacking}
                back={t('panel.common.back')}
                path="/productivity"
            />
            <div className="mx-auto max-w-6xl px-6 lg:px-8">
                <AddRegister
                    key={resetKey}
                    onCancelEdit={handleCancel}
                    onRefreshProducts={() => {}}
                />
            </div>
        </div>
    );
}
