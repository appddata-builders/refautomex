'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function RowTypeModal({ isOpen, toggleModal, onConfirm }) {
    const { t } = useTranslation();
  const scrollRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const body = document.body;

    const unlock = () => {
      body.style.removeProperty('overflow');
      body.style.removeProperty('position');
      body.style.removeProperty('top');
      body.style.removeProperty('width');
      window.scrollTo(0, scrollRef.current);
    };

    if (isOpen) {
      scrollRef.current = window.scrollY;
      body.style.top = `-${scrollRef.current}px`;
      body.style.position = 'fixed';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    } else {
      unlock();
    }

    return unlock;
  }, [isOpen]);

  const handleSelect = (type) => {
    onConfirm({ type });
    toggleModal();
  };

  const modalClasses = [
    'fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-200',
    isOpen ? 'visible opacity-100' : 'invisible opacity-0',
  ].join(' ');

  return (
    <div className={modalClasses}>
      <div className="fixed inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} aria-hidden="true" />
      <div className="relative bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] rounded-lg overflow-hidden shadow-xl transform transition-all sm:max-w-lg sm:w-full">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium">{t('panel.rowType.title')}</h3>
        </div>
        <div className="px-4 py-5 sm:p-6 space-y-4">
          <button
            onClick={() => handleSelect('nuevo')}
            className="w-full p-2 border border-[rgb(var(--color-text))]/20 flex justify-center rounded-md bg-[rgb(var(--color-bg))] hover:bg-[rgb(var(--color-gray))]"
          >
            {t('panel.rowType.new')}
          </button>
          <button
            onClick={() => handleSelect('seminuevo')}
            className="w-full p-2 border border-[rgb(var(--color-text))]/20 flex justify-center rounded-md bg-[rgb(var(--color-bg))] hover:bg-[rgb(var(--color-gray))]"
          >
            {t('panel.rowType.used')}
          </button>
        </div>
      </div>
    </div>
  );
}
