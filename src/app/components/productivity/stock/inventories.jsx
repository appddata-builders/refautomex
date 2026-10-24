'use client';

import { useState } from 'react';
import { FaBoxesPacking } from 'react-icons/fa6';
import Title from '../title';
import AddRegister from './add-register';
import { useTranslation } from '@/app/lib/text/text-provider';

// Quien entra aqui lo decide Permisos de perfil (productivity/page.jsx); antes
// esta pantalla se cerraba sola a quien no fuera admin.
export default function Inventories() {
    const { t } = useTranslation();
    const [resetKey, setResetKey] = useState(0);

    const handleCancel = () => {
        setResetKey((prev) => prev + 1);
    };

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
