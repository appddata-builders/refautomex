'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BsCashCoin, BsCreditCard2Front, BsCreditCard } from 'react-icons/bs';
import { FaMoneyBillTransfer } from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';

const paymentTypesMap = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
};

const paymentIcons = {
  '1': BsCashCoin,
  '2': BsCreditCard,
  '3': BsCreditCard2Front,
  '4': FaMoneyBillTransfer,
};

export default function PaymentTypeModal({ isOpen, toggleModal, onConfirm }) {
    const { t } = useTranslation();
  const [selectedPaymentType, setSelectedPaymentType] = useState(null);
  const scrollRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const body = document.body;

    const unlock = () => {
      body.style.removeProperty('overflow');
      body.style.removeProperty('position');
      body.style.removeProperty('width');
      body.style.removeProperty('top');
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

  const handleConfirm = () => {
    if (!selectedPaymentType) {
      alert(t('panel.paymentType.pickFirst'));
      return;
    }
    onConfirm(paymentTypesMap[selectedPaymentType]);
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
          <h3 className="text-lg leading-6 font-medium text-[rgb(var(--color-text))]">{t('panel.paymentType.title')}</h3>
        </div>
        <div className="px-4 py-5 sm:p-6">
          <div className="space-y-4">
            {Object.keys(paymentTypesMap).map((key) => {
              const Icon = paymentIcons[key];
              return (
                <button
                  key={key}
                  onClick={() => setSelectedPaymentType(key)}
                  className={`w-full p-2 border border-[rgb(var(--color-text))]/20 flex flex-row items-center justify-center rounded-md transition ${
                    selectedPaymentType === key ? 'bg-blue-500 text-white' : 'bg-[rgb(var(--color-bg))]'
                  }`}
                >
                  <Icon className="w-6 h-6 mx-3" />
                  {key === '1' && t('panel.paymentType.cash')}
                  {key === '2' && t('panel.paymentType.debit')}
                  {key === '3' && t('panel.paymentType.credit')}
                  {key === '4' && t('panel.paymentType.transfer')}
                </button>
              );
            })}
          </div>
          <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
            <button
              onClick={handleConfirm}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-500 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              {t('panel.common.confirm')}
            </button>
            <button
              onClick={toggleModal}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
            >
              {t('panel.common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
