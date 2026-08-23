'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';
import { motion, Variants } from 'framer-motion';
import { CgMoreO } from 'react-icons/cg';
import { MdOutlineViewInAr, MdDelete } from 'react-icons/md';
import { FaCircleMinus, FaCirclePlus } from 'react-icons/fa6';
import { createPortal } from 'react-dom';
import Spinner from '@/app/components/principal/spinner';
import ProductOverview from '@/app/components/principal/products/product-overview';
import { useCart } from '@/app/lib/shopping-context';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import {
  parseProductRoutes,
  resolveProductImage,
} from '@/app/lib/product-images';

const GROUP_PAGE_SIZE = 16;

const gridVariants = {
  hidden: { opacity: 0, y: 40 },
  show: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.015, duration: 0.4 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.9, rotate: -1 },
  show: (i) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    rotate: 0,
    transition: {
      delay: i * 0.0005,
      duration: 0.05,
      ease: [0.25, 0.8, 0.5, 1],
      type: 'spring',
      stiffness: 500,
      damping: 8,
    },
  }),
};

const PREFERRED_ORDER = ['motor', 'direction', 'collision', 'electrical', 'brakes', 'accessories'];
const MIN_QTY = 1;
const MAX_QTY = 20;

function normalizeGrupo(grupo) {
  return (grupo || '').toLowerCase().trim();
}

function displayGrupo(grupo) {
  const g = normalizeGrupo(grupo);
  if (!g) return 'Sin grupo';
  return g.charAt(0).toUpperCase() + g.slice(1);
}

const coerceQuantity = (value) => {
  const num = Number(value);
  if (Number.isNaN(num)) return MIN_QTY;
  return Math.min(Math.max(num, MIN_QTY), MAX_QTY);
};

function useCategories(products) {
  const set = new Set(products.map(p => normalizeGrupo(p.grupo)).filter(Boolean));
  const arr = Array.from(set);
  return arr.sort((a, b) => {
    const ia = PREFERRED_ORDER.indexOf(a);
    const ib = PREFERRED_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default function CardProducts({ showSearchBar = true }) {
  const { t } = useTranslation();

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSection, setSelectedSection] = useState('Todos');
  const [groupPages, setGroupPages] = useState({});
  const [hasAnimated, setHasAnimated] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [prodOverview, setProdOverview] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [isMobile, setIsMobile] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [isModalMounted, setIsModalMounted] = useState(false);

  const { cart, addToCart, removeFromCart } = useCart();

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const fetchProducts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(buildApiUrl('/getProducts'), {
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            Accept: 'application/json, text/plain, */*',
          },
        });
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        const payload = await response.json();
        if (!isMounted) return;
        const raw = payload?.[0] ?? [];
        // `rutas` llega como array desde Postgres (json_agg) y como string
        // JSON desde el MySQL original: parseProductRoutes acepta las dos.
        const parsed = raw.map(p => ({
          ...p,
          rutasParsed: parseProductRoutes(p.rutas),
        }));
        setProducts(parsed);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Error fetching products:', err);
        if (isMounted) setError(err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchProducts();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [refreshIndex]);

  const categories = useCategories(products);

  const source = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const bySection = selectedSection === 'Todos'
      ? products
      : products.filter(p => normalizeGrupo(p.grupo) === normalizeGrupo(selectedSection));
    return bySection.filter(p => p.descripcion.toLowerCase().includes(term)).sort((a, b) => a.descripcion.localeCompare(b.descripcion));
  }, [products, searchTerm, selectedSection]);

  const groupedItems = useMemo(() => {
    const categoryOrder = categories;
    const map = new Map();
    source.forEach((product) => {
      const key = normalizeGrupo(product.grupo) || 'otros';
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: displayGrupo(product.grupo),
          items: [],
        });
      }
      map.get(key).items.push(product);
    });
    return Array.from(map.values()).sort((a, b) => {
      const ia = categoryOrder.indexOf(a.key);
      const ib = categoryOrder.indexOf(b.key);
      if (ia === -1 && ib === -1) return a.label.localeCompare(b.label);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [source, categories]);
  useEffect(() => { setGroupPages({}); }, [searchTerm, selectedSection]);

  const handleOpenOverview = (p) => {
    setProdOverview({ ...p, images: p.rutasParsed });
    setShowModal(true);
  };
  const handleCloseModal = () => {
    setShowModal(false);
    setProdOverview(null);
  };
  useEffect(() => {
    document.body.classList.toggle('overflow-hidden', showModal);
    return () => { document.body.classList.remove('overflow-hidden'); };
  }, [showModal]);

  useEffect(() => {
    setIsModalMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const detectMobile = () => setIsMobile(window.innerWidth < 640);
    detectMobile();
    window.addEventListener('resize', detectMobile);
    return () => window.removeEventListener('resize', detectMobile);
  }, []);

  useEffect(() => {
    if (!products.length) return;
    setQuantities((prev) => {
      const next = { ...prev };
      let changed = false;
      products.forEach((product) => {
        if (next[product.num_parte] === undefined) {
          next[product.num_parte] = MIN_QTY;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [products]);

  useEffect(() => {
    if (!cart.length) return;
    setQuantities((prev) => {
      const next = { ...prev };
      let changed = false;
      cart.forEach((item) => {
        const qty = item.quantity || MIN_QTY;
        if (next[item.num_parte] !== qty) {
          next[item.num_parte] = qty;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [cart]);

  const handleIncrement = (id) => {
    setQuantities((prev) => {
      const current = coerceQuantity(prev[id]);
      if (current >= MAX_QTY) return prev;
      return { ...prev, [id]: current + 1 };
    });
  };

  const handleDecrement = (id) => {
    setQuantities((prev) => {
      const current = coerceQuantity(prev[id]);
      if (current <= MIN_QTY) return prev;
      return { ...prev, [id]: current - 1 };
    });
  };

  const handleQuantityInputChange = (id, value) => {
    if (value === '') {
      setQuantities((prev) => ({ ...prev, [id]: '' }));
      return;
    }
    const num = Number(value);
    if (!Number.isNaN(num) && num >= MIN_QTY && num <= MAX_QTY) {
      setQuantities((prev) => ({ ...prev, [id]: num }));
    }
  };

  const handleQuantityBlur = (id, value) => {
    setQuantities((prev) => ({
      ...prev,
      [id]: coerceQuantity(value),
    }));
  };

  const handleAddProduct = (product) => {
    const qty = coerceQuantity(quantities[product.num_parte]);
    addToCart(product, qty);
    setQuantities((prev) => ({ ...prev, [product.num_parte]: qty }));
  };

  const handleRemoveProduct = (product) => {
    removeFromCart(product);
    setQuantities((prev) => ({ ...prev, [product.num_parte]: MIN_QTY }));
  };

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="px-6 py-20 text-center text-[rgb(var(--color-text))] space-y-4">
        <p className="text-lg font-semibold">{t('common.error', { defaultValue: 'An error occurred while loading products.' })}</p>
        {error?.message && (
          <p className="text-sm text-[rgb(var(--color-text))]/70 break-words">
            {error.message}
          </p>
        )}
        <button
          type="button"
          onClick={() => setRefreshIndex((prev) => prev + 1)}
          className="inline-flex items-center rounded-full bg-[rgb(var(--color-text))] px-6 py-2 text-sm font-semibold text-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-med))]/70 hover:opacity-90 transition"
        >
          {t('common.retry', { defaultValue: 'Reintentar' })}
        </button>
      </div>
    );
  }

  const animationDisabled = isMobile;
  let animationCounter = 0;
  const GridComponent = animationDisabled ? 'div' : motion.div;
  const CardComponent = animationDisabled ? 'div' : motion.div;
  const ImageWrapper = animationDisabled ? 'div' : motion.div;
  const ProductImage = animationDisabled ? 'img' : motion.img;
  const ActionButton = animationDisabled ? 'button' : motion.button;

  return (
    <section className="relative isolate py-24 sm:py-32 bg-[rgb(var(--color-card))]">
      <div className="absolute inset-0 -z-10 bg-linear-to-br from-[rgb(var(--color-card))] via-[rgb(var(--color-gray))] to-[rgb(var(--color-bg))]" />
      <svg aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full stroke-[0.5] stroke-[rgb(var(--color-text))]/10">
        <defs>
          <pattern id="grid-pattern" width={200} height={200} patternUnits="userSpaceOnUse">
            <path d="M100 200V0.5M0.5 0.5H200" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
      </svg>

      <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
        <h2 className="text-4xl font-bold tracking-tight sm:text-5xl gradient-text-title py-1 pt-3">
          {t('products.title', { defaultValue: 'Productos' })}
        </h2>
        <p className="mt-4 text-lg text-[rgb(var(--color-text))]/70 max-w-2xl mx-auto">
          {t('products.subtitle', { defaultValue: 'Explora por categoría o visualiza todo el catálogo.' })}
        </p>

        <div className="mt-4 flex flex-col sm:flex-row justify-center items-center gap-4">
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="rounded-full bg-[rgb(var(--color-bg))] border border-[rgb(var(--color-text))]/20 text-[rgb(var(--color-text))] px-5 py-3 focus:ring-2 focus:ring-amber-400 outline-none"
          >
            <option value="Todos">{t('common.all', { defaultValue: 'Todos' })}</option>
            {categories.map((g) => (
              <option key={g} value={g}>{displayGrupo(g)}</option>
            ))}
          </select>

          {showSearchBar && (
            <input
              type="text"
              name="products-search"
              placeholder={t('products.filter', { defaultValue: 'Buscar producto…' })}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-md rounded-full px-5 py-3 bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] border border-[rgb(var(--color-text))]/20 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-galaxy))] placeholder:text-[rgb(var(--color-text))]/50"
            />
          )}
        </div>

        <GridComponent
          key="product-grid"
          {...(!animationDisabled
            ? {
                initial: hasAnimated ? 'show' : 'hidden',
                animate: 'show',
                onAnimationComplete: () => setHasAnimated(true),
                variants: gridVariants,
              }
            : {})}
          className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 will-change-transform transform-gpu"
        >
          {groupedItems.length === 0 && (
            <p className="col-span-full text-[rgb(var(--color-text))]/70 text-lg">
              {t('products.empty', { defaultValue: 'No se encontraron productos.' })}
            </p>
          )}

          {groupedItems.length > 0 && groupedItems.map((section) => {
            const totalGroupPages = Math.max(1, Math.ceil(section.items.length / GROUP_PAGE_SIZE));
            const currentGroupPage = Math.min(groupPages[section.key] || 1, totalGroupPages);
            const groupStart = (currentGroupPage - 1) * GROUP_PAGE_SIZE;
            const groupPageItems = section.items.slice(groupStart, groupStart + GROUP_PAGE_SIZE);
            return (
              <Fragment key={section.key}>
                <div className="col-span-full flex flex-col sm:flex-row sm:items-center sm:justify-between bg-[rgb(var(--color-bg))]/60 border border-dashed border-[rgb(var(--color-text))]/20 rounded-2xl px-5 py-3 mb-4">
                  <div className="text-left">
                    <p className="text-xs uppercase tracking-[0.25em] text-[rgb(var(--color-text))]/50">Categoría</p>
                    <p className="text-lg font-semibold text-[rgb(var(--color-text))]">{section.label}</p>
                  </div>
                  <span className="text-xs text-[rgb(var(--color-text))]/60 mt-2 sm:mt-0">
                    {section.items.length} {section.items.length === 1 ? 'producto' : 'productos'}
                  </span>
                </div>
                {groupPageItems.map((product) => {
                  const productInCart = cart.find(item => item.num_parte === product.num_parte);
                  const productId = product.num_parte;
                  const storedValue = quantities[productId];
                  const inputValue = productInCart
                    ? (productInCart.quantity || MIN_QTY)
                    : (storedValue === undefined ? MIN_QTY : storedValue);
                  const img = resolveProductImage(product.rutasParsed?.[0]);
                  const inCart = Boolean(productInCart);
                  const cardIndex = animationCounter++;
                  const groupLabel = displayGrupo(product.grupo);

                  return (
                    <CardComponent
                      key={product.num_parte}
                      {...(!animationDisabled ? { custom: cardIndex, variants: cardVariants } : {})}
                      className="group relative flex flex-col justify-between rounded-3xl shadow-lg overflow-hidden transition-all duration-500 hover:shadow-[rgb(var(--color-med))]/30 hover:-translate-y-1 hover:scale-[1.02)] bg-[rgb(var(--color-card))]"
                    >
                      <ImageWrapper
                        className="relative w-full aspect-square overflow-hidden"
                        {...(!animationDisabled
                          ? {
                              whileHover: { scale: 1.05 },
                              transition: { duration: 0.3 },
                            }
                          : {})}
                      >
                        <span className="absolute top-3 left-3 z-10 inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-[rgb(var(--color-gray))]/70 text-[rgb(var(--color-text))] shadow">
                          {groupLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenOverview(product)}
                          className="absolute top-3 right-3 z-10 flex items-center justify-center h-9 w-9 rounded-full bg-[rgb(var(--color-bg))]/80 shadow text-[rgb(var(--color-text))] hover:scale-105 transition-all"
                          aria-label={t('products.details', { defaultValue: 'Ver detalles' })}
                        >
                          <CgMoreO />
                        </button>
                        <ProductImage
                          src={img}
                          alt={product.descripcion}
                          className="h-full w-full object-contain object-center bg-white"
                        />
                      </ImageWrapper>

                      <div className="flex flex-col justify-between flex-1 p-4">
                        <h4 className="text-lg font-semibold linear-text-title text-center line-clamp-2" title={product.descripcion}>
                          {product.descripcion}
                        </h4>
                        <div className="flex items-center justify-center mt-2">
                          <span className="mt-1 text-base sm:text-lg font-semibold text-[rgb(var(--color-success))]">
                            $ {Math.ceil(Number(product.precio)).toFixed(2)} MXN
                          </span>
                        </div>
                        <div className="mt-6 grid grid-cols-2 items-center gap-2 border-t border-[rgb(var(--color-text))]/10 pt-4">
                          <div className={`col-span-1 flex ${inCart ? 'items-start justify-start' : 'items-center justify-center'} gap-2`}>
                            <button
                              type="button"
                              onClick={() => handleDecrement(productId)}
                              className={`${inCart ? 'cursor-not-allowed opacity-0 pointer-events-none' : 'cursor-pointer'} flex items-center justify-center h-6 w-6 rounded-full shadow shadow-[rgb(var(--color-med))]/70 text-[rgb(var(--color-med))] hover:bg-[rgb(var(--color-bg))]/60 transition`}
                              disabled={inCart}
                              aria-label={t('products.decrease', { defaultValue: 'Disminuir' })}
                            >
                              <FaCircleMinus />
                            </button>
                            <input
                              type="number"
                              min={MIN_QTY}
                              max={MAX_QTY}
                              value={inputValue}
                              disabled={inCart}
                              onChange={(e) => handleQuantityInputChange(productId, e.target.value)}
                              onBlur={(e) => handleQuantityBlur(productId, e.target.value)}
                              className="w-14 text-center rounded-md shadow shadow-[rgb(var(--color-galaxy))] bg-transparent text-[rgb(var(--color-text))] focus:outline-none focus:ring-1 focus:ring-amber-400"
                              placeholder={`${MIN_QTY}`}
                            />
                            <button
                              type="button"
                              onClick={() => handleIncrement(productId)}
                              className={`${inCart ? 'cursor-not-allowed opacity-0 pointer-events-none' : 'cursor-pointer'} flex items-center justify-center h-6 w-6 rounded-full shadow shadow-[rgb(var(--color-med))]/70 text-[rgb(var(--color-med))] hover:bg-[rgb(var(--color-bg))]/60 transition`}
                              disabled={inCart}
                              aria-label={t('products.increase', { defaultValue: 'Incrementar' })}
                            >
                              <FaCirclePlus />
                            </button>
                          </div>

                          <div className="col-span-1 flex justify-end">
                            {inCart ? (
                              <ActionButton
                                {...(!animationDisabled
                                  ? {
                                      whileTap: { scale: 0.95 },
                                      whileHover: { scale: 1.05 },
                                    }
                                  : {})}
                                onClick={() => handleRemoveProduct(product)}
                                className="flex items-center gap-2 rounded-full bg-red-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-all"
                              >
                                <MdDelete className="text-base" />
                                {t('products.remove', { defaultValue: 'Quitar' })}
                              </ActionButton>
                            ) : (
                              <ActionButton
                                {...(!animationDisabled
                                  ? {
                                      whileTap: { scale: 0.95 },
                                      whileHover: { scale: 1.05 },
                                    }
                                  : {})}
                                onClick={() => handleAddProduct(product)}
                                className="rounded-full cursor-pointer bg-[rgb(var(--color-text))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-card))] transition-all"
                              >
                                {t('products.add', { defaultValue: 'Agregar' })}
                              </ActionButton>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardComponent>
                    );
                })}
                {totalGroupPages > 1 && (
                  <div className="col-span-full flex items-center justify-center gap-3 -mt-2">
                    <button
                      onClick={() => setGroupPages(prev => ({
                        ...prev,
                        [section.key]: Math.max(1, currentGroupPage - 1),
                      }))}
                      disabled={currentGroupPage === 1}
                      className="rounded-full px-4 py-2 text-xs font-semibold shadow shadow-[rgb(var(--color-med))]/70 text-[rgb(var(--color-text))] disabled:opacity-40"
                    >
                      {t('common.prev', { defaultValue: 'Anterior' })}
                    </button>
                    <span className="text-[rgb(var(--color-text))]/70 text-xs">
                      {t('common.pageOf', {
                        defaultValue: '{{category}}: Página {{page}} de {{total}}',
                        category: section.label,
                        page: currentGroupPage,
                        total: totalGroupPages,
                      })}
                    </span>
                    <button
                      onClick={() => setGroupPages(prev => ({
                        ...prev,
                        [section.key]: Math.min(totalGroupPages, currentGroupPage + 1),
                      }))}
                      disabled={currentGroupPage === totalGroupPages}
                      className="rounded-full px-4 py-2 text-xs font-semibold shadow shadow-[rgb(var(--color-med))]/70 text-[rgb(var(--color-text))] disabled:opacity-40"
                    >
                      {t('common.next', { defaultValue: 'Siguiente' })}
                    </button>
                  </div>
                )}
              </Fragment>
            );
          })}
        </GridComponent>
      </div>

      {isModalMounted && showModal && prodOverview &&
        createPortal(
          <div className="fixed inset-0 z-[1400] flex items-center justify-center px-4 py-10">
            <div
              className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
              onClick={handleCloseModal}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative z-10 w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[rgb(var(--color-card))]/95 via-[rgb(var(--color-bg))] to-[rgb(var(--color-gray))]/95 shadow-[0_30px_70px_rgba(2,6,23,0.85)]"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 text-[rgb(var(--color-text))]">
                <div>
                  <p className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-[rgb(var(--color-text))]/50">
                    <MdOutlineViewInAr className="h-4 w-4" />
                    Detalle del producto
                  </p>
                  <h3 className="mt-1 text-lg font-semibold line-clamp-2">
                    {prodOverview.descripcion}
                  </h3>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="rounded-full border border-[rgb(var(--color-text))]/30 px-4 py-1 text-sm font-semibold text-[rgb(var(--color-text))] transition hover:bg-[rgb(var(--color-card))]"
                  aria-label={t('common.close', { defaultValue: 'Cerrar' })}
                >
                  {t('common.close', { defaultValue: 'Cerrar' })}
                </button>
              </div>
              <div className="max-h-[80vh] overflow-y-auto px-4 py-6 sm:px-8">
                <ProductOverview prodOverview={prodOverview} />
              </div>
            </motion.div>
          </div>,
          document.body
        )}
    </section>
  );
}
