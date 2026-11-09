import React, { useState } from 'react';
import { FaWhatsapp } from 'react-icons/fa';
import { useRouter } from 'next/navigation';
import { IoMdCloseCircle } from "react-icons/io";
import { useTranslation } from '@/app/lib/text/text-provider';

export default function WhatsAppButton (){
  const { t } = useTranslation();
  const [showLabel, setShowLabel] = useState(true);
  const router = useRouter();
  const pathPage = router.pathname;

  const handleWhatsAppClick = () => {
    const message = t('index.video.whatsapp');
    const phoneNumber = "5639557232";
    const whatsappURL = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

    window.open(whatsappURL, '_blank');
  };

  const handleCloseLabel = () => {
    setShowLabel(false);
  };

  if (pathPage === '/calidad' || pathPage === '/productivity') {
    return null;
  }

  return (
    <div className="z-30">
      {showLabel && (
        <>
          <div className="fixed bottom-6 left-20 bg-green-100 text-white text-sm p-0.5 border-x-4 shadow-md border-green-700 justify-between motion-safe:animate-bounce">
            <span className='my-auto text-green-700 font-bold xl:text-md 2xl:text-xl'>{t('index.video.contact')}</span>
            <button
              onClick={handleCloseLabel}
              className="bg-red-600 rounded-full absolute -left-2.5 -top-2.5 animate-out"
            >
              <IoMdCloseCircle className='text-slate-50' size={15} />
            </button>

          </div>
        </>
      )}

      <button
        onClick={handleWhatsAppClick}
        className="bg-gradient-to-b from-green-100 via-[#41e179] to-[#23c75c] hover:bg-gradient-to-br
                  font-semibold p-3 rounded-full shadow-2xl border-slate-600 border-b animate-out
                  w-14 h-14 flex items-center justify-center transition-transform hover:scale-105"
      >
        <FaWhatsapp className="text-white h-8 w-8 bg-transparent" />
      </button>

    </div>
  );
};


