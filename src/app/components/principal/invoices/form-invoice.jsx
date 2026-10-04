'use client';
import React, { useState, useContext, useEffect } from "react";
import { AuthContext } from '@/app/lib/auth-tracker';
import { MdOutlineNoAccounts, MdSwitchAccount } from "react-icons/md";
import { getStorageValue } from "@/app/lib/storage-values";
import { IoMdArrowRoundBack } from "react-icons/io";
import { useTranslation } from '@/app/lib/text/text-provider';
import FormData from '@/app/components/principal/invoices/form-data';

const initialFormState = {
  name: '',
  rfc: '',
  email: '',
  phone: '',
  placeId: '',
  CFDI: '',
  regime: '',
  ticket: '',
  CP: ''
};

export default function FormInvoice() {
  const { t } = useTranslation();
  const multimediaSrc = process.env.NEXT_PUBLIC_S3;
  const { isAuthenticated } = useContext(AuthContext);
  const [activeSection, setActiveSection] = useState(null);
  const [formState, setFormState] = useState(initialFormState);
  const [CFDI, setCFDI] = useState([]);

  const loadUserData = () => {
    const cognitoUserSession = getStorageValue('CognitoUserSession');
    const username = cognitoUserSession?.idToken.payload["cognito:username"];
    const userData = username ? getStorageValue(`user_${username}`) : null;

    if (userData) {
      const fullName = `${userData?.nombre || ''} ${userData?.apellido || ''}`.trim();

      return {
        ...initialFormState,
        name: fullName,
        rfc: userData?.rfc || '',
        email: userData?.email || '',
        phone: userData?.telefono || '',
        placeId: userData?.domicilio || '',
      };
    }
    return initialFormState;
  };

  const handleSectionClick = (key) => {
    if (key === 2) {
      setFormState(initialFormState);
    } else if (key === 1 && isAuthenticated) {
      setFormState(loadUserData());
    }
    setActiveSection(key);
  };

  const handleBackClick = () => {
    setActiveSection(null);
  };

  const sections = [
    {
      key: 1,
      name: t('invoice.titleSectionOne'),
      description: t('invoice.descSectionOne'),
      icon: MdSwitchAccount,
    },
    {
      key: 2,
      name: t('invoice.titleSectionTwo'),
      description: t('invoice.descSectionTwo'),
      icon: MdOutlineNoAccounts,
    },
  ];

  useEffect(() => {
    if (isAuthenticated) {
      const userData = loadUserData();
      setFormState(userData);
    }
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:px-16 xl:px-36 bg-gradient-to-b from-[rgb(var(--color-card))] to-[rgb(var(--color-gray))]">
        <div className="lg:h-[650px] lg:overflow-y-auto w-full sm:min-w-[600px] max-w-sm my-24 px-2 mx-auto">
          <h2 className="mt-6 text-3xl font-extrabold gradient-text-title">{t('invoice.title')}</h2>
          <p className='text-[rgb(var(--color-text))] text-shadow text-md'>{t('invoice.subtitle')}</p>

          {activeSection === null ? (
            <div className="flex flex-col space-y-4">
              {isAuthenticated ? (
                sections.map((section) => (
                  <div
                    key={section.key}
                    onClick={() => handleSectionClick(section.key)}
                    className="relative flex gap-x-6 py-6 my-4 animate-up bg-[rgb(var(--color-card-white))] rounded-xl px-4 shadow cursor-pointer"
                  >
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full shadow-sm ring-1 ring-gray-900/10">
                      <section.icon className="h-6 w-6 text-amber-400" aria-hidden="true" />
                    </div>
                    <div className="flex-auto">
                      <h3 className="text-sm font-semibold leading-6 text-amber-400">
                        {section.name}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[rgb(var(--color-text))] opacity-80">{section.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <FormData t={t} formState={formState} setFormState={setFormState}/>
              )}
            </div>
          ) : (
            <div>
              <div
                className="max-w-32 text-sm leading-6 xl:pr-1 flex rounded-3xl justify-center items-center bg-[rgb(var(--color-card))] relative cursor-pointer animate-out mt-4"
                onClick={handleBackClick}
              >
                <div className="text-sm font-bold leading-6 p-2 shadow bg-[rgb(var(--color-card-white))] hover:bg-zinc-50 rounded-full">
                  <IoMdArrowRoundBack size={10} className='leading-6 text-yellow-600' />
                </div>
                <div className='ml-1 mr-3 text-md xl:text-lg 2xl:text-lg leading-6 text-yellow-600'>
                  {t('invoice.back')}
                </div>
              </div>
              {activeSection === 1 && isAuthenticated && (
                <FormData t={t} formState={formState} setFormState={setFormState}/>
              )}
              {activeSection === 2 && (
                <FormData t={t} formState={formState} setFormState={setFormState}/>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="hidden lg:block relative w-0 flex-1">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={`${multimediaSrc}invoice.jpg`}
          alt={t('alt.invoice')}
        />
      </div>
    </div>
  );
}
