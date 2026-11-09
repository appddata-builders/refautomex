'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';
import { motion } from 'framer-motion';
import Spinner from '@/app/components/principal/spinner';
import ProductCard, { displayGrupo, normalizeGrupo, useEsMovil } from '@/app/components/principal/products/product-card';
import ProductDetailsModal from '@/app/components/principal/products/product-details-modal';
import { conOferta, useOfertas } from '@/app/lib/ofertas-tienda';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { parseProductRoutes } from '@/app/lib/product-images';

const GROUP_PAGE_SIZE = 16;

const gridVariants = {
  hidden: { opacity: 0, y: 40 },
  show: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.015, duration: 0.4 },
  },
};

const PREFERRED_ORDER = ['motor', 'direction', 'collision', 'electrical', 'brakes', 'accessories'];

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

/**
 * Productos: el catalogo de la tienda por categoria, con buscador. Cada
 * producto es una ProductCard (la misma del inicio y de Promociones) y sus
 * tres puntos abren ProductDetailsModal.
 */
export default function CardProducts({ showSearchBar = true }) {
  const { t } = useTranslation();

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSection, setSelectedSection] = useState('Todos');
  const [groupPages, setGroupPages] = useState({});
  const [hasAnimated, setHasAnimated] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const isMobile = useEsMovil();

  // Lo que esta en una promocion vigente se pinta y se agrega con su precio
  // de oferta (el mismo que cobra create-checkout-session).
  const { porParte, desfase } = useOfertas();
  const catalog = useMemo(() => products.map((product) => conOferta(product, porParte)), [products, porParte]);

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
      ? catalog
      : catalog.filter(p => normalizeGrupo(p.grupo) === normalizeGrupo(selectedSection));
    // Tambien por numero de parte: es lo primero que trae quien ya sabe que pieza necesita.
    return bySection
      .filter(p => `${p.descripcion} ${p.num_parte}`.toLowerCase().includes(term))
      .sort((a, b) => a.descripcion.localeCompare(b.descripcion));
  }, [catalog, searchTerm, selectedSection]);

  const groupedItems = useMemo(() => {
    const categoryOrder = categories;
    const map = new Map();
    source.forEach((product) => {
      const key = normalizeGrupo(product.grupo) || 'otros';
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: displayGrupo(product.grupo, t('products.noGroup')),
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

  // Los enlaces del inicio llegan ya filtrados: ?q= busca (un auto, una pieza
  // o un numero de parte) y ?grupo= elige la categoria. Se lee una vez al
  // abrir; despues el cliente filtra como siempre.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const grupo = params.get('grupo');
    if (q) setSearchTerm(q);
    if (grupo) setSelectedSection(normalizeGrupo(grupo));
  }, []);

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="px-6 py-20 text-center text-[rgb(var(--color-text))] space-y-4">
        <p className="text-lg font-semibold">{t('common.errorProducts')}</p>
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
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const animationDisabled = isMobile;
  let animationCounter = 0;
  const GridComponent = animationDisabled ? 'div' : motion.div;

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
          {t('products.title')}
        </h2>
        <p className="mt-4 text-lg text-[rgb(var(--color-text))]/70 max-w-2xl mx-auto">
          {t('products.subtitle')}
        </p>

        <div className="mt-4 flex flex-col sm:flex-row justify-center items-center gap-4">
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="rounded-full bg-[rgb(var(--color-bg))] border border-[rgb(var(--color-text))]/20 text-[rgb(var(--color-text))] px-5 py-3 focus:ring-2 focus:ring-amber-400 outline-none"
          >
            <option value="Todos">{t('common.all')}</option>
            {categories.map((g) => (
              <option key={g} value={g}>{displayGrupo(g, t('products.noGroup'))}</option>
            ))}
          </select>

          {showSearchBar && (
            <input
              type="text"
              name="products-search"
              placeholder={t('products.filter')}
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
              {t('products.empty')}
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
                    <p className="text-xs uppercase tracking-[0.25em] text-[rgb(var(--color-text))]/50">{t('products.category')}</p>
                    <p className="text-lg font-semibold text-[rgb(var(--color-text))]">{section.label}</p>
                  </div>
                  <span className="text-xs text-[rgb(var(--color-text))]/60 mt-2 sm:mt-0">
                    {section.items.length} {section.items.length === 1 ? t('products.countOne') : t('products.countMany')}
                  </span>
                </div>
                {groupPageItems.map((product) => (
                  <ProductCard
                    key={product.num_parte}
                    product={product}
                    onOpenDetails={setDetalle}
                    desfase={desfase}
                    animado={!animationDisabled}
                    index={animationCounter++}
                  />
                ))}
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
                      {t('common.prev')}
                    </button>
                    <span className="text-[rgb(var(--color-text))]/70 text-xs">
                      {t('common.pageOf', {
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
                      {t('common.next')}
                    </button>
                  </div>
                )}
              </Fragment>
            );
          })}
        </GridComponent>
      </div>

      <ProductDetailsModal product={detalle} onClose={() => setDetalle(null)} />
    </section>
  );
}
