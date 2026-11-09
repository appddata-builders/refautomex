'use client';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { forwardRef, useContext, useDeferredValue, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { AuthContext } from '@/app/lib/auth-tracker';
import { FaCheck, FaCircleExclamation, FaLock, FaMagnifyingGlass, FaPlus, FaStore, FaXmark } from 'react-icons/fa6';
import { LuListPlus } from 'react-icons/lu';
import { useTranslation } from '@/app/lib/text/text-provider';
import { buildWebPricing, parseWarehouseProducts } from '../stock/inventory-model';

const PAGE = 30;

const parseProductRoutes = (raw) => {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
            return [];
        }
    }
    return [];
};

export const resolveProductImage = (ruta, multimediaSrc = process.env.NEXT_PUBLIC_S3 || '') => {
    if (!ruta) return `${multimediaSrc}productos/no-img.png`;
    return ruta.startsWith('http') ? ruta : `${multimediaSrc}${ruta}`;
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Marca cada palabra buscada dentro del texto. Tambien la usa Captura.
export const highlightText = (text, searchTerm) => {
    const value = String(text ?? '');
    if (!searchTerm || !searchTerm.trim()) return value;
    const words = searchTerm.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return value;
    const normalizedWords = words.map((word) => word.toLowerCase());
    const regex = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
    return value.split(regex).map((segment, index) => {
        if (!segment) return null;
        return normalizedWords.includes(segment.toLowerCase())
            ? <mark key={`${segment}-${index}`} className="rounded-sm bg-[rgb(var(--color-refautomex))]/35 px-0.5 text-[rgb(var(--color-text))]">{segment}</mark>
            : <span key={`${segment}-${index}-plain`}>{segment}</span>;
    });
};

// Lo que mira cada modo de busqueda. "Todo" es el que se usa por omision:
// cada palabra tiene que estar en el numero de parte, la descripcion o la
// ubicacion, asi que "balata 03A" encuentra las balatas del anaquel 03A.
const FIELDS = {
    Todo: ['num_parte', 'descripcion', 'localizacion'],
    Descripcion: ['descripcion'],
    Parte: ['num_parte'],
    Localizacion: ['localizacion'],
    Existentes: ['descripcion', 'num_parte'],
};

const SEARCH_TYPE_KEYS = {
    Todo: 'panel.findProducts.modeAll',
    Descripcion: 'panel.findProducts.modeDescription',
    Parte: 'panel.findProducts.modePart',
    Localizacion: 'panel.findProducts.modeLocation',
    Existentes: 'panel.findProducts.modePending',
};

const BASE_SEARCH_TYPES = ['Descripcion', 'Parte', 'Localizacion', 'Existentes'];

const filterProducts = (products, searchTerm, searchType) => {
    const words = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const fields = FIELDS[searchType] || FIELDS.Todo;
    const source = searchType === 'Existentes' ? products.filter((p) => p.__origin === 'pending') : products;
    if (!words.length) return source;
    const matches = source.filter((product) => words.every((word) =>
        fields.some((field) => String(product[field] ?? '').toLowerCase().includes(word))));
    // Primero lo que empieza con la primera palabra (en parte, luego en el campo
    // del modo), y despues en orden natural: 0111 antes que 01110.
    const first = words[0];
    const rank = (product) => {
        if (String(product.num_parte ?? '').toLowerCase().startsWith(first)) return 0;
        return fields.some((field) => String(product[field] ?? '').toLowerCase().startsWith(first)) ? 1 : 2;
    };
    const key = searchType === 'Descripcion' ? 'descripcion' : searchType === 'Localizacion' ? 'localizacion' : 'num_parte';
    return [...matches].sort((a, b) => rank(a) - rank(b)
        || String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { numeric: true, sensitivity: 'base' }));
};

// Los valores de relleno del catalogo ("Not asigned", "Sin categoria") no dicen
// nada del producto: no se muestran como etiqueta.
const isPlaceholder = (value) => /^\s*(not\s*as+ign|sin\s+categor)/i.test(String(value ?? ''));

const formatPrice = (value) => (Number(value) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

// La insignia WEB del almacen: su precio y si cubre la comision de Stripe,
// lo mismo que dice Inventarios -> Precios WEB (buildWebPricing).
const webBadge = (pricing, t) => {
    const price = formatPrice(pricing.check.current);
    if (pricing.status === 'covered') {
        return { tone: 'bg-sky-500/15', Icon: FaCheck, price, title: t('panel.findProducts.webCovered', { price }) };
    }
    if (pricing.notWorth) {
        return {
            tone: 'bg-amber-400/30',
            Icon: FaStore,
            price,
            title: t('panel.findProducts.webNotWorth', { price, percent: `${(pricing.raise * 100).toFixed(1)} %` }),
        };
    }
    if (pricing.status === 'short') {
        return {
            tone: 'bg-[rgb(var(--color-error))]/15',
            Icon: FaCircleExclamation,
            price,
            title: t('panel.findProducts.webShort', { price, suggested: formatPrice(pricing.check.suggested) }),
        };
    }
    return { tone: 'bg-sky-500/15', Icon: null, price, title: t('panel.findProducts.webNoReference', { price }) };
};

const ACTION_TONES = {
    primary: 'bg-amber-500 text-slate-900 shadow hover:bg-amber-400',
    added: 'bg-emerald-500/20 text-[rgb(var(--color-text))] hover:bg-emerald-500/30',
    outline: 'border border-[rgb(var(--color-border))] text-[rgb(var(--color-text))] hover:border-amber-400 hover:bg-amber-400/15',
    danger: 'border border-[rgb(var(--color-error))]/40 text-[rgb(var(--color-error))] hover:bg-[rgb(var(--color-error))]/10',
    muted: 'text-[rgb(var(--color-gray-base))]',
};

/**
 * El buscador de productos del panel: Tickets, Gestion de Almacen, Asignacion
 * de productos, Captura e Inventarios lo usan. Arriba van las pestanas del
 * modulo (`views`), el buscador y los modos de busqueda; abajo, la lista con la
 * foto de cada producto, su parte, ubicacion, descripcion, sucursales, precio y
 * existencia.
 *
 * Datos: getAllProducts de la sucursal (`branch`, o la del usuario) o de todas
 * (`showAllBranches`), mas WEB (`includeWebBranch`) y los que existen sin
 * sucursal (`includePendingProducts`). Un producto que esta en varias se junta
 * en un renglon con una insignia por sucursal, y muestra los datos de la
 * sucursal elegida.
 *
 * Acciones, de menos a mas especifica:
 *   - onAddProduct / onRemoveProduct / addedItems: agregar y quitar (Tickets,
 *     Almacen, Captura). Con `folio` la lista es de solo lectura.
 *   - onProductPick (+ selectedProducts, pickActionLabel): elegir uno (Asignacion).
 *   - productAction(product): el modulo decide boton, texto y que hace
 *     (Inventarios). Devuelve { label, tone, disabled, title, icon, iconOnly,
 *     onClick }. Agregar y quitar van solo con icono (+ y palomita); el texto
 *     queda en el title y en el aria-label.
 *
 * `views` son las pestanas del modulo: [{ id, label, filter, emptyMessage,
 * group }]. Las seguidas con el mismo `group` van juntas bajo ese titulo, y
 * con grupos cada bloque ocupa su propio renglon (Inventarios: Por asignar y,
 * abajo, Existentes: Productos, En sucursal). Se pueden controlar con `view` y
 * `onViewChange`.
 */
const FindProducts = forwardRef(({
    onAddProduct,
    onRemoveProduct,
    addedItems = [],
    isWarehouse,
    isCapture,
    isMissing,
    folio,
    includeWebBranch = true,
    includePendingProducts = true,
    showAllBranches = false,
    onProductPick,
    selectedProducts = [],
    hideSearchModeToggle = false,
    allowedSearchTypes,
    hideSearchInput = false,
    branch,
    // Para modulos que solo muestran parte del catalogo. Se aplica antes de
    // buscar, asi que tambien cuenta en los resultados y en las pestanas.
    productFilter,
    pickActionLabel,
    emptyMessage,
    // Para modulos que saben mas que la copia de getAllProducts (Asignacion:
    // la ubicacion actual despues de mover). Recibe y devuelve un producto.
    decorateProduct,
    views,
    view,
    onViewChange,
    productAction,
    listClassName = 'max-h-[34rem]',
}, ref) => {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');
    const deferredTerm = useDeferredValue(searchTerm);
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [limit, setLimit] = useState(PAGE);
    const [stockAlerts, setStockAlerts] = useState({});
    // Solo en el almacen: num_parte -> si su precio de WEB cubre Stripe.
    const [webPricing, setWebPricing] = useState(() => new Map());
    const [ownView, setOwnView] = useState(views?.[0]?.id ?? null);
    const multimediaSrc = process.env.NEXT_PUBLIC_S3 || '';
    const isPickerMode = typeof onProductPick === 'function';

    const { userData } = useContext(AuthContext);
    const resolvedBranchId = branch?.id ?? userData?.idsucursal ?? 2;
    const userBranchId = resolvedBranchId ? String(resolvedBranchId) : null;
    const userBranchLabel = branch?.label ?? userData?.sucursal ?? '';

    const searchTypes = useMemo(() => {
        const allowed = Array.isArray(allowedSearchTypes) && allowedSearchTypes.length
            ? BASE_SEARCH_TYPES.filter((type) => allowedSearchTypes.includes(type))
            : BASE_SEARCH_TYPES.filter((type) => type !== 'Existentes' || includePendingProducts);
        return ['Todo', ...allowed];
    }, [allowedSearchTypes, includePendingProducts]);
    const [searchType, setSearchType] = useState('Todo');

    const activeViewId = view ?? ownView;
    const activeView = views?.find((item) => item.id === activeViewId) ?? views?.[0] ?? null;
    const changeView = (id) => {
        setLimit(PAGE);
        if (onViewChange) onViewChange(id);
        else setOwnView(id);
    };

    const createProductRecord = (product, origin = 'active') => {
        const rutas = parseProductRoutes(product.rutas);
        const primaryImage = rutas.length > 0 ? rutas[0] : '';
        return {
            ...product,
            rutas,
            ruta: primaryImage,
            imageSrc: resolveProductImage(primaryImage, multimediaSrc),
            __origin: origin,
            branchBadges: [],
            variants: [],
        };
    };

    const buildBadgeLabel = (product) => {
        if (product.__origin === 'web') return t('panel.findProducts.badgeWeb');
        if (product.__origin === 'pending') return t('panel.findProducts.badgeUnassigned');
        return product.sucursal || t('panel.common.branch');
    };

    const mergeProducts = (records = []) => {
        const map = new Map();
        records.forEach((record) => {
            if (!record?.num_parte) return;
            const key = record.num_parte;
            const badge = { label: buildBadgeLabel(record), type: record.__origin || 'active', idsucursal: record.idsucursal };
            if (!map.has(key)) {
                map.set(key, { ...record, branchBadges: [badge], variants: [record] });
                return;
            }
            const existing = map.get(key);
            existing.variants.push(record);
            if (!existing.branchBadges.some((item) => item.label === badge.label && item.type === badge.type)) {
                existing.branchBadges.push(badge);
            }
            // Los datos que se ven son los de la sucursal elegida; si no esta
            // ahi, los de una activa antes que los de WEB o los sin sucursal.
            const preferUserBranch = userBranchId
                && String(record.idsucursal) === userBranchId
                && String(existing.idsucursal) !== userBranchId
                && record.__origin === 'active';
            const preferActive = existing.__origin !== 'active' && record.__origin === 'active';
            const preferWeb = existing.__origin === 'pending' && record.__origin === 'web';
            if (preferUserBranch || preferActive || preferWeb) {
                map.set(key, { ...record, branchBadges: existing.branchBadges, variants: existing.variants });
            }
        });
        return Array.from(map.values());
    };

    const fetchBranchProducts = async (branchId) => {
        const response = await fetch(buildApiUrl('/getAllProducts'), {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
            body: JSON.stringify({ idsucursal: branchId }),
        });
        if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
        const payload = await response.json();
        if (!Array.isArray(payload?.[0])) throw new Error('Invalid products response');
        return payload[0].map((product) => createProductRecord(product, branchId === 1 ? 'web' : 'active'));
    };

    const fetchPendingProductsList = async () => {
        const response = await fetch(buildApiUrl('/getWarehouseProducts'), {
            cache: 'no-store',
            headers: { Accept: 'application/json, text/plain, */*' },
        });
        if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
        const data = await response.json();
        // La misma respuesta trae los precios de todas las sucursales: con eso
        // se sabe si el de WEB cubre la comision, sin pedir nada mas.
        if (isWarehouse) {
            setWebPricing(new Map(buildWebPricing(parseWarehouseProducts(data)).map((row) => [row.product.num_parte, row])));
        }
        return (data?.[0] || []).map((product) => createProductRecord({
            ...product,
            idsucursal: product.idsucursal ?? null,
            sucursal: product.sucursal || t('panel.common.pending'),
            existencia: product.existencia ?? 0,
            precio: product.precio ?? 0,
            costo: product.costo ?? 0,
            localizacion: product.localizacion || '—',
        }, 'pending'));
    };

    const fetchProducts = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const branchFilter = showAllBranches ? null : (userBranchId ? Number(userBranchId) : null);
            const [baseProducts, webProducts, pendingProducts] = await Promise.all([
                fetchBranchProducts(branchFilter),
                includeWebBranch && branchFilter !== null && Number(branchFilter) !== 1
                    ? fetchBranchProducts(1).catch((webError) => {
                        console.warn('No se pudieron cargar productos web:', webError);
                        return [];
                    })
                    : [],
                includePendingProducts
                    ? fetchPendingProductsList().catch((pendingError) => {
                        console.warn('No se pudieron cargar productos pendientes:', pendingError);
                        return [];
                    })
                    : [],
            ]);
            setProducts(mergeProducts([...baseProducts, ...webProducts, ...pendingProducts]));
        } catch (fetchError) {
            console.error('Error fetching products:', fetchError);
            setError(fetchError);
        } finally {
            setIsLoading(false);
        }
    };

    useImperativeHandle(ref, () => ({ refreshProducts: fetchProducts }));

    useEffect(() => {
        fetchProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userBranchId, showAllBranches, includePendingProducts, includeWebBranch]);

    useEffect(() => {
        setLimit(PAGE);
    }, [deferredTerm, searchType, isMissing]);

    // Lo que el modulo deja ver (filtro, decoracion y pestana) antes de buscar.
    const base = useMemo(() => {
        let source = productFilter ? products.filter(productFilter) : products;
        if (decorateProduct) source = source.map(decorateProduct);
        if (isMissing) source = source.filter((product) => product.existencia === 0);
        return source;
    }, [products, productFilter, decorateProduct, isMissing]);

    const viewCounts = useMemo(
        () => Object.fromEntries((views || []).map((item) => [item.id, item.filter ? base.filter(item.filter).length : base.length])),
        [views, base]
    );

    const filtered = useMemo(() => {
        const inView = activeView?.filter ? base.filter(activeView.filter) : base;
        return filterProducts(inView, deferredTerm, searchType);
    }, [base, activeView, deferredTerm, searchType]);

    const visible = filtered.slice(0, limit);

    const isProductAdded = (product) => (isPickerMode
        ? selectedProducts.includes(product.num_parte)
        : addedItems.some((item) => item.refaccion === product.num_parte));

    const toItem = (product) => ({
        idsucursal: userBranchId ? Number(userBranchId) : product.idsucursal,
        sucursal: userBranchLabel || product.sucursal,
        refaccion: product.num_parte,
        descripcion: product.descripcion,
        precio: product.precio,
        cantidad: 1,
        costo: product.costo,
        localizacion: product.localizacion,
        existencia: product.existencia,
        monto: product.precio,
        aIva: (product.precio / 1.16).toFixed(2),
        isPedido: false,
        utilidad: product.utilidad,
        ultimo: product.ultimo,
        marca: product.marca,
        idmarca: product.idmarca,
        mod_ini: product.mod_ini,
        mod_fin: product.mod_fin,
        grupo: product.grupo,
        idgrupo: product.idgrupo,
        categoria: product.categoria,
        idcategoria: product.idcategoria,
        rutas: product.rutas,
    });

    const handleAdd = (product) => {
        if (folio) return;
        if (isPickerMode) {
            onProductPick(product);
            return;
        }
        if (!isWarehouse && !isCapture && product.existencia === 0) {
            setStockAlerts((prev) => ({ ...prev, [product.num_parte]: true }));
        }
        onAddProduct?.(toItem(product));
    };

    const handleRemove = (product) => {
        if (folio) return;
        onRemoveProduct?.(product.num_parte);
    };

    const handleAddAll = () => {
        if (isPickerMode || folio) return;
        filtered.filter((product) => !isProductAdded(product)).forEach((product) => onAddProduct?.(toItem(product)));
    };

    // El boton de cada renglon: lo que diga el modulo, o el de agregar/quitar.
    const actionFor = (product) => {
        if (productAction) return productAction(product);
        if (folio) return null;
        const added = isProductAdded(product);
        if (isPickerMode) {
            const label = typeof pickActionLabel === 'function' ? pickActionLabel(product) : pickActionLabel;
            return { label: label || t('panel.findProducts.pick'), tone: added ? 'added' : 'primary', icon: added ? FaCheck : FaPlus, onClick: () => onProductPick(product) };
        }
        return added
            ? { label: t('panel.findProducts.added'), tone: 'added', icon: FaCheck, iconOnly: true, onClick: () => handleRemove(product), title: t('panel.findProducts.removeHint') }
            : { label: t('panel.findProducts.add'), tone: 'primary', icon: FaPlus, iconOnly: true, onClick: () => handleAdd(product) };
    };

    const branchMissing = (product) => Boolean(branch && showAllBranches
        && !product.variants?.some((variant) => String(variant.idsucursal) === String(branch.id)));

    // Pestanas seguidas con el mismo `group` forman un bloque con su titulo.
    // Con grupos, un bloque por renglon y sus pestanas del mismo ancho: asi no
    // se acomodan distinto cuando cambia un texto (el nombre de la sucursal).
    const viewSegments = (views || []).reduce((segments, item) => {
        const last = segments[segments.length - 1];
        if (item.group && last?.group === item.group) last.items.push(item);
        else segments.push({ group: item.group || null, items: [item] });
        return segments;
    }, []);
    const hasViewGroups = viewSegments.some((segment) => segment.group);

    const renderViewTab = (item) => (
        <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeView?.id === item.id}
            onClick={() => changeView(item.id)}
            title={item.label}
            className={`flex min-h-9 min-w-0 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-semibold transition ${activeView?.id === item.id
                ? 'bg-amber-500 text-slate-900 shadow'
                : 'text-[rgb(var(--color-gray-base))] hover:text-[rgb(var(--color-text))]'}`}
        >
            <span className="truncate">{item.label}</span>
            <span className={`shrink-0 rounded-full px-1.5 text-xs tabular-nums ${activeView?.id === item.id ? 'bg-slate-900/15' : 'bg-[rgb(var(--color-gray))]'}`}>
                {(viewCounts[item.id] ?? 0).toLocaleString('es-MX')}
            </span>
        </button>
    );

    const listEmpty = activeView?.emptyMessage || emptyMessage
        || t('panel.site.noRecords', { branch: userBranchLabel || t('panel.common.branch') });

    return (
        <div className={`relative flex w-full flex-col ${folio ? 'opacity-80' : ''}`}>
            <div className="space-y-2 p-3">
                {views?.length > 0 && (
                    <div role="tablist" className={`${hasViewGroups ? 'flex flex-col' : 'flex flex-wrap'} gap-1 rounded-xl bg-[rgb(var(--color-bg))] p-1`}>
                        {viewSegments.map((segment) => (segment.group ? (
                            <div
                                key={segment.items[0].id}
                                role="group"
                                aria-label={segment.group}
                                className="flex flex-col gap-0.5 rounded-lg border border-[rgb(var(--color-border))]/70 p-0.5"
                            >
                                <span className="px-2 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-gray-base))]">
                                    {segment.group}
                                </span>
                                <div className="grid auto-cols-fr grid-flow-col gap-1">{segment.items.map(renderViewTab)}</div>
                            </div>
                        ) : renderViewTab(segment.items[0])))}
                    </div>
                )}

                {!hideSearchInput && (
                    <label className="relative block">
                        <span className="sr-only">{t('panel.findProducts.searchAll')}</span>
                        <FaMagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[rgb(var(--color-gray-base))]" aria-hidden="true" />
                        <input
                            type="search"
                            name="client-search"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder={t(searchType === 'Todo' ? 'panel.findProducts.searchAll' : SEARCH_TYPE_KEYS[searchType])}
                            autoComplete="off"
                            className="h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] pl-10 pr-10 text-base uppercase text-[rgb(var(--color-text))] placeholder:normal-case placeholder:text-[rgb(var(--color-gray-base))] focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                aria-label={t('panel.findProducts.clear')}
                                className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10"
                            >
                                <FaXmark className="size-3.5" />
                            </button>
                        )}
                    </label>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                    {!hideSearchInput && !hideSearchModeToggle && (
                        <div role="radiogroup" aria-label={t('panel.findProducts.searchBy')} className="flex flex-wrap gap-1">
                            {searchTypes.map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    role="radio"
                                    aria-checked={searchType === type}
                                    onClick={() => setSearchType(type)}
                                    className={`h-8 rounded-full px-3 text-xs font-semibold transition ${searchType === type
                                        ? 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-bg))]'
                                        : 'bg-[rgb(var(--color-bg))] text-[rgb(var(--color-gray-base))] hover:text-[rgb(var(--color-text))]'}`}
                                >
                                    {t(SEARCH_TYPE_KEYS[type])}
                                </button>
                            ))}
                        </div>
                    )}
                    <span className="ml-auto flex items-center gap-2 text-xs text-[rgb(var(--color-gray-base))]">
                        {branch && !showAllBranches && <span className="truncate">{branch.label}</span>}
                        <span className="rounded-full bg-[rgb(var(--color-bg))] px-2 py-1 font-semibold tabular-nums">
                            {t('panel.findProducts.resultsCount', { count: filtered.length.toLocaleString('es-MX') })}
                        </span>
                        {isWarehouse && !isPickerMode && !folio && searchTerm.trim() && filtered.length > 0 && (
                            <button
                                type="button"
                                onClick={handleAddAll}
                                title={t('panel.findProducts.addAll')}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-amber-500 px-2.5 font-semibold text-slate-900 shadow hover:bg-amber-400"
                            >
                                <LuListPlus className="size-4" aria-hidden="true" />
                                {t('panel.findProducts.addAllShort')}
                            </button>
                        )}
                    </span>
                </div>
            </div>

            <div className={`overflow-y-auto border-t border-[rgb(var(--color-border))] ${listClassName}`}>
                {isLoading ? (
                    <ul aria-hidden="true" className="divide-y divide-[rgb(var(--color-border))]">
                        {[0, 1, 2, 3, 4].map((key) => (
                            <li key={key} className="flex items-center gap-3 px-3 py-3">
                                <span className="size-16 shrink-0 animate-pulse rounded-xl bg-[rgb(var(--color-gray))] sm:size-20" />
                                <span className="h-10 flex-1 animate-pulse rounded-lg bg-[rgb(var(--color-gray))]" />
                            </li>
                        ))}
                    </ul>
                ) : error ? (
                    <div role="alert" className="flex flex-col items-center gap-2 p-6 text-center text-sm">
                        <FaCircleExclamation className="size-5 text-[rgb(var(--color-error))]" aria-hidden="true" />
                        <p>{t('common.errorProducts')}</p>
                        <button type="button" onClick={fetchProducts} className="font-semibold underline">{t('common.retry')}</button>
                    </div>
                ) : visible.length === 0 ? (
                    <p role="status" className="p-6 text-center text-sm text-[rgb(var(--color-gray-base))]">
                        {deferredTerm.trim() ? t('panel.assignment.noMatches', { term: deferredTerm.trim().toUpperCase() }) : listEmpty}
                    </p>
                ) : (
                    <ul className="divide-y divide-[rgb(var(--color-border))]">
                        {visible.map((product) => {
                            const action = actionFor(product);
                            const missing = branchMissing(product);
                            const outOfStock = !missing && Number(product.existencia) === 0;
                            // La ubicacion de otra sucursal no sirve en esta: no se muestra.
                            const location = !missing && product.localizacion && product.localizacion !== '0' && product.localizacion !== '—'
                                ? product.localizacion
                                : null;
                            const ActionIcon = action?.icon;
                            // Tocar el renglon (foto, texto o precio) hace lo mismo que su boton,
                            // salvo cuando el boton borra algo: eso solo con el boton.
                            const rowClick = action && !action.disabled && action.tone !== 'danger' ? action.onClick : null;
                            return (
                                <li key={product.num_parte} className={isProductAdded(product) ? 'bg-amber-400/10' : ''}>
                                    <div className="flex items-center gap-2 px-3 py-3">
                                        <button
                                            type="button"
                                            onClick={rowClick || undefined}
                                            disabled={!rowClick}
                                            className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                                        >
                                            <img
                                                src={product.imageSrc || resolveProductImage(product.ruta, multimediaSrc)}
                                                alt=""
                                                loading="lazy"
                                                onError={(event) => {
                                                    const fallback = resolveProductImage('', multimediaSrc);
                                                    if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                                                }}
                                                className="size-16 shrink-0 rounded-xl bg-white object-cover shadow-sm sm:size-20"
                                            />
                                            <span className="block min-w-0 flex-1">
                                                <span className="flex flex-wrap items-baseline gap-x-2">
                                                    <span className="truncate text-base font-bold tabular-nums">{highlightText(product.num_parte, deferredTerm)}</span>
                                                    {location && (
                                                        <span className="rounded-md bg-[rgb(var(--color-bg))] px-1.5 text-sm font-semibold tabular-nums text-[rgb(var(--color-gray-base))]">
                                                            {highlightText(location, deferredTerm)}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-[rgb(var(--color-text))]/80">
                                                    {highlightText(product.descripcion, deferredTerm)}
                                                </span>
                                                <span className="mt-1 flex flex-wrap gap-1">
                                                    {(product.branchBadges || []).map((badge) => {
                                                        const isWebBadge = badge.type === 'web' || String(badge.label).toUpperCase() === 'WEB';
                                                        const pricing = isWarehouse && isWebBadge ? webPricing.get(product.num_parte) : null;
                                                        if (pricing) {
                                                            const { tone, Icon, price, title } = webBadge(pricing, t);
                                                            return (
                                                                <span
                                                                    key={`${badge.type}-${badge.label}`}
                                                                    title={title}
                                                                    className={`inline-flex items-center gap-1 rounded-full px-2 text-xs font-medium tabular-nums ${tone}`}
                                                                >
                                                                    {Icon && <Icon className="size-2.5 shrink-0" aria-hidden="true" />}
                                                                    <span aria-hidden="true">{badge.label} {price}</span>
                                                                    <span className="sr-only">{title}</span>
                                                                </span>
                                                            );
                                                        }
                                                        return (
                                                            <span
                                                                key={`${badge.type}-${badge.label}`}
                                                                className={`rounded-full px-2 text-xs font-medium ${badge.type === 'pending'
                                                                    ? 'bg-amber-400/25'
                                                                    : isWebBadge
                                                                        ? 'bg-sky-500/15'
                                                                        : 'bg-emerald-500/15'}`}
                                                            >
                                                                {badge.label}
                                                            </span>
                                                        );
                                                    })}
                                                    {[product.grupo, product.categoria].filter((chip) => chip && !isPlaceholder(chip)).map((chip) => (
                                                        <span key={chip} className="rounded-full bg-[rgb(var(--color-gray))] px-2 text-xs text-[rgb(var(--color-gray-base))]">{chip}</span>
                                                    ))}
                                                    {missing && (
                                                        <span className="rounded-full bg-[rgb(var(--color-error))]/10 px-2 text-xs font-medium">
                                                            {t('panel.findProducts.notInBranch', { branch: branch.label })}
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                            <span className="flex shrink-0 flex-col items-end gap-1">
                                                <span className="text-base font-bold tabular-nums">{formatPrice(product.precio)}</span>
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums ${outOfStock ? 'bg-[rgb(var(--color-error))]/15' : 'bg-[rgb(var(--color-bg))]'}`}
                                                    title={t('panel.findProducts.stockTitle')}
                                                >
                                                    {missing ? '—' : t('panel.findProducts.stock', { count: product.existencia ?? 0 })}
                                                </span>
                                            </span>
                                        </button>
                                        {action && (
                                            <button
                                                type="button"
                                                onClick={action.onClick}
                                                disabled={action.disabled}
                                                title={action.title || action.label}
                                                aria-label={`${action.label} ${product.num_parte}`}
                                                className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition disabled:cursor-not-allowed ${action.iconOnly ? 'w-10' : 'px-3'} ${ACTION_TONES[action.tone || 'primary']}`}
                                            >
                                                {ActionIcon ? <ActionIcon className={action.iconOnly ? 'size-4' : 'size-3'} aria-hidden="true" /> : action.disabled ? <FaLock className="size-3" aria-hidden="true" /> : null}
                                                {!action.iconOnly && <span className="hidden sm:inline">{action.label}</span>}
                                            </button>
                                        )}
                                    </div>
                                    {stockAlerts[product.num_parte] && Number(product.existencia) === 0 && (
                                        <div role="alert" className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-amber-400/25 px-3 py-1.5 text-xs font-semibold">
                                            <FaCircleExclamation className="size-3.5 shrink-0" aria-hidden="true" />
                                            <span className="flex-1">{t('panel.findProducts.noStock')}</span>
                                            <button
                                                type="button"
                                                onClick={() => setStockAlerts((prev) => {
                                                    const next = { ...prev };
                                                    delete next[product.num_parte];
                                                    return next;
                                                })}
                                                aria-label={t('panel.findProducts.closeAlert')}
                                                className="grid size-6 place-items-center rounded-full hover:bg-[rgb(var(--color-text))]/10"
                                            >
                                                <FaXmark className="size-3" />
                                            </button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {!isLoading && filtered.length > limit && (
                    <div className="p-3">
                        <button
                            type="button"
                            onClick={() => setLimit((n) => n + PAGE)}
                            className="h-10 w-full rounded-xl text-sm font-semibold text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10"
                        >
                            {t('panel.inventories.showMore', { shown: limit.toLocaleString('es-MX'), total: filtered.length.toLocaleString('es-MX') })}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});

FindProducts.displayName = 'FindProducts';

export default FindProducts;
