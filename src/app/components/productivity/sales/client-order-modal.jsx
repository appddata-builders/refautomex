'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MdStars,
  MdNoAccounts,
  MdMarkEmailRead,
  MdOutlineCalendarMonth,
  MdDriveFileRenameOutline,
} from 'react-icons/md';
import { IoPhonePortraitOutline } from 'react-icons/io5';
import { CgDanger } from 'react-icons/cg';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function ClientOrderModal({ isOpen, toggleModal, onSubmit }) {
    const { t } = useTranslation();
  const [hasAccount, setHasAccount] = useState(false);
  const [missingFieldsWarning, setMissingFieldsWarning] = useState(false);
  const [formData, setFormData] = useState({
    nombreCompleto: '',
    fechaEntrega: '',
    telefono: '',
    email: '',
  });

  const scrollRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      if (typeof window !== 'undefined') {
        scrollRef.current = window.scrollY;
        document.body.style.top = `-${scrollRef.current}px`;
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
      }
    } else {
      if (typeof window !== 'undefined') {
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('width');
        document.body.style.removeProperty('top');
        window.scrollTo(0, scrollRef.current);
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('width');
        const currentTop = document.body.style.top;
        document.body.style.removeProperty('top');
        if (currentTop) {
          window.scrollTo(0, scrollRef.current);
        }
      }
    };
  }, [isOpen]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setMissingFieldsWarning(false);
  };

  const handleFormSubmit = () => {
    const hasMissingRequiredFields =
      (!hasAccount && (!formData.nombreCompleto || !formData.fechaEntrega || !formData.telefono)) ||
      (hasAccount && (!formData.email || !formData.fechaEntrega));

    if (hasMissingRequiredFields) {
      setMissingFieldsWarning(true);
      return;
    }

    onSubmit(formData, hasAccount);
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
          <h3 className="text-lg leading-6 font-medium text-gray-900">{t('panel.clientOrder.title')}</h3>
        </div>
        <div className="px-4 py-5 sm:p-6 space-y-6">
          <div className="flex items-center mb-8">
            <button
              onClick={() => setHasAccount(true)}
              className={`flex flex-row mx-2 p-2 border rounded-md transition ${
                hasAccount ? 'bg-amber-500 text-white' : 'bg-[rgb(var(--color-bg))]'
              }`}
            >
              <MdStars className="w-6 h-6 mx-1" /> {t('panel.clientOrder.hasAccount')}
            </button>
            <button
              onClick={() => setHasAccount(false)}
              className={`flex flex-row mx-2 p-2 border rounded-md transition ${
                !hasAccount ? 'bg-blue-500 text-white' : 'bg-[rgb(var(--color-bg))]'
              }`}
            >
              <MdNoAccounts className="w-6 h-6 mx-1" /> {t('panel.clientOrder.noAccount')}
            </button>
          </div>

          {!hasAccount ? (
            <div className="space-y-4">
              <div className="flex items-center">
                <label className="w-1/4 flex flex-row">
                  <MdDriveFileRenameOutline className="w-6 h-6 mx-1" />
                  {t('panel.clientOrder.name')}
                </label>
                <input
                  type="text"
                  name="nombreCompleto"
                  value={formData.nombreCompleto}
                  onChange={handleInputChange}
                  className="w-3/4 p-2 border rounded bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]"
                />
              </div>
              <div className="flex items-center">
                <label className="w-1/4 flex flex-row">
                  <MdOutlineCalendarMonth className="w-6 h-6 mx-1" />
                  {t('panel.clientOrder.delivery')}
                </label>
                <input
                  type="date"
                  name="fechaEntrega"
                  value={formData.fechaEntrega}
                  onChange={handleInputChange}
                  className="w-3/4 p-2 border rounded bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]"
                />
              </div>
              <div className="flex items-center">
                <label className="w-1/4 flex flex-row">
                  <IoPhonePortraitOutline className="w-6 h-6 mx-1" />
                  {t('panel.clientOrder.phone')}
                </label>
                <input
                  type="text"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleInputChange}
                  className="w-3/4 p-2 border rounded bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center">
                <label className="w-1/4 flex flex-row">
                  <MdMarkEmailRead className="w-6 h-6 mx-1" />
                  {t('panel.clientOrder.email')}
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-3/4 p-2 border rounded bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]"
                />
              </div>
              <div className="flex items-center">
                <label className="w-1/4 flex flex-row">
                  <MdOutlineCalendarMonth className="w-6 h-6 mx-1" />
                  {t('panel.clientOrder.delivery')}
                </label>
                <input
                  type="date"
                  name="fechaEntrega"
                  value={formData.fechaEntrega}
                  onChange={handleInputChange}
                  className="w-3/4 p-2 border rounded bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]"
                />
              </div>
            </div>
          )}

          <div className="h-12 top-3 left-2 relative">
            {missingFieldsWarning && (
              <div className="absolute flex bg-red-100 text-red-800 p-3 rounded mb-4 text-sm animate-out">
                <CgDanger className="text-red-800 w-5 h-5 mr-1" />
                <span>{t('panel.clientOrder.missingFields')}</span>
              </div>
            )}
          </div>
          <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
            <button
              onClick={handleFormSubmit}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-500 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              OK
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
