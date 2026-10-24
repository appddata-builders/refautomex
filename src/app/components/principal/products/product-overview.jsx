import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BiSearchAlt2 } from 'react-icons/bi';
import { FaExpand } from 'react-icons/fa';
import { createPortal } from 'react-dom';
import {
  PRODUCT_FALLBACK_IMAGE,
  resolveProductImages,
} from '@/app/lib/product-images';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function ProductOverview({ prodOverview }) {
  const { t } = useTranslation();
  const fallbackImage = PRODUCT_FALLBACK_IMAGE;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [expandedImage, setExpandedImage] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const descriptionText = prodOverview?.descripcion_larga || prodOverview?.descripcion;

  // `images` viene de card-products ya normalizado, pero el modal tambien se
  // abre con productos que traen `rutas` crudo del API.
  const imageList = useMemo(
    () => resolveProductImages(prodOverview?.images ?? prodOverview?.rutas),
    [prodOverview]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [prodOverview]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const selectedImage = imageList[selectedIndex] ?? fallbackImage;
  const thumbnails = imageList
    .map((image, index) => ({ image, index }))
    .filter(({ index }) => index !== selectedIndex);
  const hasMoreImages = thumbnails.length > 0;

  const handleZoomMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setZoomOrigin({
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
    });
  };

  const resetZoom = () => setZoomOrigin({ x: 50, y: 50 });

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <div className="w-full lg:w-1/2">
        <div
          className="group relative overflow-hidden rounded-3xl bg-black/90 shadow-2xl h-64 sm:h-80 lg:h-[420px]"
          onMouseMove={handleZoomMove}
          onMouseLeave={resetZoom}
        >
          <motion.img
            key={selectedImage}
            src={selectedImage}
            alt={prodOverview?.descripcion || t('checkout.productFallback')}
            className="h-full w-full object-contain bg-white"
            initial={{ opacity: 0.4, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            style={{ transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%` }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
            <BiSearchAlt2 className="text-4xl drop-shadow-lg" />
          </div>
          <button
            type="button"
            onClick={() => setExpandedImage(selectedImage)}
            className="absolute top-4 right-4 rounded-full bg-white/90 text-slate-900 p-2 shadow-lg transition hover:bg-white"
            aria-label={t('products.expandImage')}
          >
            <FaExpand />
          </button>
        </div>
      </div>

      <div className="flex w-full flex-col gap-6 lg:w-1/2">
        <div className="space-y-2 text-[rgb(var(--color-text))]">
          <p className="text-xs uppercase tracking-[0.35em] text-[rgb(var(--color-text))]/60">
            {prodOverview?.grupo || t('products.noCategory')}
          </p>
          <h3 className="text-2xl font-semibold leading-tight">
            {prodOverview?.descripcion}
          </h3>
          {prodOverview?.num_parte && (
            <p className="text-sm text-[rgb(var(--color-text))]/70">
              {t('products.partNumber')} <span className="font-medium">{prodOverview.num_parte}</span>
            </p>
          )}
        </div>

        <div>
          <span className="text-xs uppercase tracking-[0.35em] text-[rgb(var(--color-text))]/60">
            {t('products.description')}
          </span>
          <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--color-text))]/80 whitespace-pre-line">
            {descriptionText}
          </p>
        </div>

        <div className="rounded-2xl border border-[rgb(var(--color-text))]/10 bg-[rgb(var(--color-bg))]/60 px-5 py-4 text-[rgb(var(--color-text))]">
          <p className="text-xs uppercase tracking-[0.35em] text-[rgb(var(--color-text))]/50">
            {t('products.price')}
          </p>
          <p className="mt-1 text-3xl font-semibold text-[rgb(var(--color-success))]">
            $ {Math.ceil(Number(prodOverview?.precio || 0)).toFixed(2)} {t('promotions.currency')}
          </p>
        </div>

        {hasMoreImages && (
          <div className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-[0.35em] text-[rgb(var(--color-text))]/50">
              {t('products.morePhotos')}
            </p>
            <div className="flex flex-wrap gap-3">
              {thumbnails.map(({ image, index }) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className="h-16 w-16 overflow-hidden rounded-2xl border border-[rgb(var(--color-text))]/20 bg-[rgb(var(--color-card))] shadow transition hover:-translate-y-0.5 hover:shadow-lg"
                  aria-label={t('products.changePhoto')}
                >
                  <img src={image} alt={t('products.extraView')} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isMounted && expandedImage &&
        createPortal(
          <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm px-4">
            <div className="absolute inset-0" onClick={() => setExpandedImage(null)} />
            <div className="relative z-10 w-full max-w-4xl">
              <button
                type="button"
                onClick={() => setExpandedImage(null)}
                className="absolute -top-12 right-0 rounded-full border border-white/30 px-4 py-1 text-sm text-white hover:bg-white/10"
              >
                {t('common.close')}
              </button>
              <img
                src={expandedImage}
                alt={t('products.zoomView')}
                className="h-[70vh] w-full rounded-3xl bg-black object-contain"
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
