import { useState } from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function FindFolio({ isOpen, onClose, onFilter }) {
    const { t } = useTranslation();
    const [folio, setFolio] = useState('');

    const handleApplyFilter = () => {
        onFilter({ folio });
        onClose();
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-[rgb(var(--color-gray-base))]/70 flex justify-center items-center z-50">
            <div className="bg-[rgb(var(--color-bg))] rounded-lg p-6 shadow-lg w-96 text-[rgb(var(--color-text))]">
                <h2 className="text-lg font-semibold">{t('panel.findFolio.title')}</h2>
                <div className="mt-4">
                    <label className='block text-sm text-[rgb(var(--color-text))] opacity-80 pt-1 pb-3 ml-2' >{t('panel.findFolio.hint')}</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="flex-1 p-2 border rounded bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]"
                            value={folio}
                            onChange={(e) => setFolio(e.target.value)}
                        />
                    </div>
                </div>

                {/* Buttons */}
                <div className="mt-6 flex justify-end gap-4">
                    <button
                        className="px-4 py-2 rounded-full border text-sm disabled:opacity-50"
                        onClick={onClose}
                    >
                        {t('panel.common.cancel')}
                    </button>
                    <button
                        className="px-4 py-2 rounded-full text-sm text-white bg-emerald-500 hover:bg-emerald-600"
                        onClick={handleApplyFilter}
                        disabled={!folio.trim()}
                    >
                        {t('panel.common.filter')}
                    </button>
                </div>
            </div>
        </div>
    );
}
