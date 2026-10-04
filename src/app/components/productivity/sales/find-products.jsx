'use client';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useContext, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { AuthContext } from '@/app/lib/auth-tracker';
import Spinner from '@/app/components/principal/spinner';
import { FaDeleteLeft, FaStar } from "react-icons/fa6";
import { LuListPlus } from "react-icons/lu";
import { TiInfo } from "react-icons/ti";
import { IoClose } from "react-icons/io5";
import { useTranslation } from '@/app/lib/text/text-provider';

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

const resolveProductImage = (ruta, multimediaSrc = '') => {
    if (!ruta) return `${multimediaSrc}productos/no-img.png`;
    return ruta.startsWith('http') ? ruta : `${multimediaSrc}${ruta}`;
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightText = (text, searchTerm) => {
    if (!searchTerm || !searchTerm.trim()) return text;
    const words = searchTerm.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return text;
    const normalizedWords = words.map(word => word.toLowerCase());
    const regex = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
    const segments = text.split(regex);

    return segments.map((segment, index) => {
        if (!segment) return null;
        const isMatch = normalizedWords.includes(segment.toLowerCase());
        if (isMatch) {
            return (
                <span
                    key={`${segment}-${index}`}
                    className="bg-[rgb(var(--color-refautomex))]/30 text-[rgb(var(--color-text))] px-0.5 rounded-sm"
                >
                    {segment}
                </span>
            );
        }
        return <span key={`${segment}-${index}-plain`}>{segment}</span>;
    });
};

const prioritizeMatches = (data, accessor, prioritizedWord, type) => {
    if (!prioritizedWord) {
        return [...data];
    }

    const normalizedWord = prioritizedWord.toLowerCase();

    return [...data].sort((a, b) => {
        const textA = accessor(a).toLowerCase();
        const textB = accessor(b).toLowerCase();

        const startsA = textA.startsWith(normalizedWord) ? 0 : 1;
        const startsB = textB.startsWith(normalizedWord) ? 0 : 1;

        if (startsA !== startsB) {
            return startsA - startsB;
        }

        if (type === 'num_parte') {
            const numA = parseInt(a.num_parte, 10);
            const numB = parseInt(b.num_parte, 10);
            if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
                return numA - numB;
            }
        }

        return accessor(a).localeCompare(accessor(b), undefined, { numeric: true, sensitivity: 'base' });
    });
};

function filterProductsByCategory(products, searchTerm, searchType) {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const searchWords = normalizedSearch ? normalizedSearch.split(/\s+/).filter(Boolean) : [];
    const prioritizedWord = searchWords[0] || '';

    let result = {
        dataProducts: [],
        type: ''
    };

    switch (searchType) {
        case 'Descripcion':
            result.dataProducts = products.filter(product =>
                searchWords.length === 0 ||
                searchWords.every(word => product.descripcion.toLowerCase().includes(word))
            );
            result.type = 'descripcion';
            break;
        case 'Parte':
            result.dataProducts = products.filter(product =>
                searchWords.length === 0 ||
                searchWords.every(word => product.num_parte.toLowerCase().includes(word))
            );
            result.type = 'num_parte';
            break;
        case 'Localizacion':
            result.dataProducts = products.filter(product =>
                searchWords.length === 0 ||
                searchWords.every(word => product.localizacion.toLowerCase().includes(word))
            );
            result.type = 'localizacion';
            break;
        case 'Existentes':
            result.dataProducts = products.filter(product =>
                product.__origin === 'pending' &&
                (searchWords.length === 0 ||
                    searchWords.every(word => product.descripcion.toLowerCase().includes(word)))
            );
            result.type = 'descripcion';
            break;
        default:
            result.dataProducts = products.filter(product =>
                searchWords.length === 0 ||
                searchWords.every(word => product.descripcion.toLowerCase().includes(word))
            );
            result.type = 'descripcion';
            break;
    }

    const accessorByType = {
        descripcion: (product) => product.descripcion || '',
        num_parte: (product) => product.num_parte || '',
        localizacion: (product) => product.localizacion || ''
    };

    const accessor = accessorByType[result.type] || ((product) => product.descripcion || '');
    result.dataProducts = prioritizeMatches(result.dataProducts, accessor, prioritizedWord, result.type);

    result.dataProducts = result.dataProducts.map(product => {
        const rutas = parseProductRoutes(product.rutas);
        const primaryImage = rutas.length > 0 ? rutas[0] : '';
        return {
            ...product,
            rutas,
            ruta: primaryImage,
            imageSrc: resolveProductImage(primaryImage, process.env.NEXT_PUBLIC_S3 || '')
        };
    });

    return result;
}

const createTooltip = (icon, label, id, visibleTooltip, setVisibleTooltip) => {
    const show = () => setVisibleTooltip(id);
    const hide = () => setVisibleTooltip(null);
    const tooltip = visibleTooltip === id ? (
        <div
            className="absolute right-full -bottom-8 -left-4 opacity-90 bg-[rgb(var(--color-card))] shadow text-[rgb(var(--color-text))] text-xs rounded px-2 py-1 z-10"
            style={{ width: 'max-content', maxWidth: '16rem' }}
        >
            {label}
        </div>
    ) : null;

    return { show, hide, tooltip };
};

const PRODUCT_STATUS_VARIANTS = {
    active: {
        className: 'bg-[rgb(var(--color-gray))]/50 text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))]/50',
    },
    web: {
        className: 'bg-[rgb(var(--color-gray))]/50 text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))]/50',
    },
    pending: {
        className: 'bg-[rgb(var(--color-gray))]/50 text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))]/50',
    },
};

// Los modos de busqueda son valores de logica; la etiqueta visible sale de la
// base con esta tabla.
const SEARCH_TYPE_KEYS = {
    Descripcion: 'panel.findProducts.byDescription',
    Parte: 'panel.findProducts.byPart',
    Localizacion: 'panel.findProducts.byLocation',
    Existentes: 'panel.findProducts.byStock',
};

const FindProducts = forwardRef(({
    onAddProduct,
    onRemoveProduct,
    addedItems,
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
}, ref) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const [images, setImages] = useState([]);
    const [error, setError] = useState(null);
    const [showCards, setShowCards] = useState(true);
    const [searchType, setSearchType] = useState('descripcion');
    const [visibleTooltip, setVisibleTooltip] = useState(null);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [stockAlerts, setStockAlerts] = useState({});
    const deleteTooltip = createTooltip(FaDeleteLeft, t('panel.common.delete'), 'delete', visibleTooltip, setVisibleTooltip);
    const isPickerMode = typeof onProductPick === 'function';

    const { userData } = useContext(AuthContext);
    const resolvedBranchId = branch?.id ?? userData?.idsucursal ?? 2;
    const userBranchId = resolvedBranchId ? String(resolvedBranchId) : null;
    const userBranchLabel = branch?.label ?? userData?.sucursal ?? '';

    const handleSearchChange = (event) => {
        setSearchTerm(event.target.value);
    };

    const baseSearchTypes = ['Descripcion', 'Parte', 'Localizacion', 'Existentes'];
    const searchTypes = Array.isArray(allowedSearchTypes) && allowedSearchTypes.length
        ? baseSearchTypes.filter(type => allowedSearchTypes.includes(type))
        : baseSearchTypes;

    const handleTypeClick = () => {
        const currentTypeIndex = searchTypes.indexOf(searchType);
        const nextTypeIndex = (currentTypeIndex + 1) % searchTypes.length;
        setSearchType(searchTypes[nextTypeIndex]);
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
        if (product.__origin === 'web') {
            return t('panel.findProducts.badgeWeb');
        }
        if (product.__origin === 'pending') {
            return product.sucursal || t('panel.findProducts.badgeUnassigned');
        }
        return product.sucursal || t('panel.common.branch');
    };

    const mergeProducts = (records = []) => {
        const map = new Map();

        records.forEach((record) => {
            if (!record?.num_parte) {
                return;
            }
            const key = record.num_parte;
            const badgeLabel = buildBadgeLabel(record);
            const badgeType = record.__origin || 'active';
            const badge = {
                label: badgeLabel,
                type: badgeType,
                idsucursal: record.idsucursal,
            };

            if (!map.has(key)) {
                const base = {
                    ...record,
                    branchBadges: [badge],
                    variants: [record],
                };
                map.set(key, base);
                return;
            }

            const existing = map.get(key);
            existing.variants.push(record);
            const hasBadge = existing.branchBadges.some((item) => item.label === badge.label && item.type === badge.type);
            if (!hasBadge) {
                existing.branchBadges.push(badge);
            }

            const preferUserBranch =
                userBranchId &&
                String(record.idsucursal) === userBranchId &&
                String(existing.idsucursal) !== userBranchId &&
                record.__origin === 'active';

            const preferActive = existing.__origin !== 'active' && record.__origin === 'active';
            const preferWeb = existing.__origin === 'pending' && record.__origin === 'web';

            if (preferUserBranch || preferActive || preferWeb) {
                map.set(key, {
                    ...record,
                    branchBadges: existing.branchBadges,
                    variants: existing.variants,
                });
            } else {
                map.set(key, existing);
            }
        });

        return Array.from(map.values());
    };

    const fetchBranchProducts = async (branchId) => {
        const response = await fetch(buildApiUrl('/getAllProducts'), {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
            },
            body: JSON.stringify({
                idsucursal: branchId,
            }),
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const payload = await response.json();
        if (!Array.isArray(payload?.[0])) throw new Error('Invalid products response');
        const rawProducts = payload[0];
        return rawProducts.map((product) => createProductRecord(product, branchId === 1 ? 'web' : 'active'));
    };

    const fetchPendingProductsList = async () => {
        const response = await fetch(buildApiUrl('/getWarehouseProducts'), {
            cache: 'no-store',
            headers: { Accept: 'application/json, text/plain, */*' },
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const formattedExisting = (data?.[0] || []).map(product => createProductRecord({
            ...product,
            idsucursal: product.idsucursal ?? null,
            sucursal: product.sucursal || t('panel.common.pending'),
            existencia: product.existencia ?? 0,
            precio: product.precio ?? 0,
            costo: product.costo ?? 0,
            localizacion: product.localizacion || '—',
        }, 'pending'));
        return formattedExisting;
    };

    const fetchProducts = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const branchFilter = showAllBranches ? null : (userBranchId ? Number(userBranchId) : null);
            const baseProductsPromise = fetchBranchProducts(branchFilter);

            const webProductsPromise = (includeWebBranch && branchFilter !== null && Number(branchFilter) !== 1)
                ? fetchBranchProducts(1).catch((webError) => {
                    console.warn('No se pudieron cargar productos web:', webError);
                    return [];
                })
                : Promise.resolve([]);

            const pendingProductsPromise = includePendingProducts
                ? fetchPendingProductsList().catch((pendingError) => {
                    console.warn('No se pudieron cargar productos pendientes:', pendingError);
                    return [];
                })
                : Promise.resolve([]);

            const [baseProducts, webProducts, pendingProducts] = await Promise.all([
                baseProductsPromise,
                webProductsPromise,
                pendingProductsPromise,
            ]);

            const combined = mergeProducts([
                ...baseProducts,
                ...webProducts,
                ...pendingProducts,
            ]);
            setProducts(combined);
        } catch (error) {
            console.error('Error fetching products:', error);
            setError(error);
        } finally {
            setIsLoading(false);
        }
    };

    // Exponer `fetchProducts` para que pueda ser llamado desde el componente padre
    useImperativeHandle(ref, () => ({
        refreshProducts: fetchProducts,
    }));

    useEffect(() => {
        fetchProducts();
    }, [userBranchId, showAllBranches, includePendingProducts, includeWebBranch]);

    useEffect(() => {
        const result = filterProductsByCategory(products, searchTerm, searchType);
        setFilteredProducts(result.dataProducts);
    }, [searchTerm, products, searchType]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, searchType, products, isMissing]);

    const PAGE_SIZE = 25;
    const MAX_PRODUCTS = 100;
    const visibleProducts = filteredProducts
        .filter(product => !isMissing || product.existencia === 0)
        .slice(0, MAX_PRODUCTS);
    const totalPages = Math.max(1, Math.ceil(visibleProducts.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const paginatedProducts = visibleProducts.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

    const handleAddClick = (product) => {
        if (folio) return;

        if (isPickerMode) {
            onProductPick(product);
            return;
        }

        if (!isWarehouse && !isCapture && product.existencia === 0) {
            setStockAlerts((prev) => ({ ...prev, [product.num_parte]: true }));
        }

        onAddProduct({
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
    };


    const handleRemoveClick = (product) => {
        if (folio) return;
        onRemoveProduct(product.num_parte);
    };

    const dismissStockAlert = (numParte, event) => {
        event?.stopPropagation();
        setStockAlerts((prev) => {
            const next = { ...prev };
            delete next[numParte];
            return next;
        });
    };

    const handleAddAllClick = () => {
        if (isPickerMode) return;
        const newProducts = filteredProducts.filter(product => !isProductAdded(product));
        newProducts.forEach(product => {
            onAddProduct({
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
        });
    };

    const isProductAdded = (product) => {
        if (isPickerMode) {
            return selectedProducts.includes(product.num_parte);
        }
        return addedItems.some(item => item.refaccion === product.num_parte);
    };

    return (
        <div className="relative w-full max-w-[480px] lg:max-w-[520px] mx-auto overflow-x-hidden">
            {branch && <p className="px-3 pt-3 text-sm text-center">{t('panel.common.branch')}: {branch.label}</p>}
            {hideSearchInput ? (
                <div className="flex justify-center items-center py-3">
                    <div className="font-bold uppercase tracking-wide bg-[rgb(var(--color-card))] py-1 px-2 rounded-md shadow shadow-[rgb(var(--color-galaxy))] inline-flex items-center gap-2 text-xs">
                        <span className="opacity-70">{t('panel.findProducts.results')}</span>
                        <span className='text-[rgb(var(--color-refautomex))]'>{filteredProducts.length}</span>
                    </div>
                </div>
            ) : (
                <>
                    <div className='flex justify-center px-5 py-2 gap-x-4'>
                        <div className="flex justify-between items-center px-3 text-xs text-[rgb(var(--color-text))]">
                            <div className="font-bold uppercase tracking-wide bg-[rgb(var(--color-card))] py-1 px-2 rounded-md shadow shadow-[rgb(var(--color-galaxy))] inline-flex items-center gap-2">
                                <span className="opacity-50">{t('panel.findProducts.results')}</span>
                                <span className='text-[rgb(var(--color-text))]'>{filteredProducts.length}</span>
                            </div>
                        </div>
                        {!hideSearchModeToggle && (
                            <div className='flex justify-between items-center'>
                                <button
                                    type="button"
                                    onClick={handleTypeClick}
                                    className="inline-flex items-center gap-2 px-4 py-1 rounded-md w-[240px] bg-[rgb(var(--color-card))] cursor-pointer text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))] text-xs font-semibold tracking-wide uppercase transition hover:scale-105 hover:shadow-md"
                                >
                                    <span className="opacity-50">{t('panel.findProducts.by')}</span>
                                    <span className='text-[rgb(var(--color-text))]'>{t(SEARCH_TYPE_KEYS[searchType] ?? 'panel.findProducts.byDescription')}</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <div className='flex justify-center items-start m-0.5 mt-4 w-full'>
                        <input
                            type="text"
                            name="client-search"
                            placeholder={t('panel.findProducts.searchPlaceholder')}
                            value={searchTerm}
                            onChange={handleSearchChange}
                            className="uppercase w-[300px] block border-0 rounded-full py-1.5 p-3 -mt-1 text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))] placeholder:text-[rgb(var(--color-text))] bg-[rgb(var(--color-bg))] sm:text-sm sm:leading-6"
                        />
                        <div
                            onMouseEnter={deleteTooltip.show}
                            onMouseLeave={deleteTooltip.hide}
                            onClick={() => setSearchTerm('')}
                            className='mx-2 -mt-1 mb-1 text-sm font-bold leading-6 p-2 shadow rounded-full cursor-pointer relative bg-[rgb(var(--color-card))]'>
                            <FaDeleteLeft size={20}
                                className='text-md xl:text-lg leading-6 text-[rgb(var(--color-error))]'
                            />
                            {deleteTooltip.tooltip}
                        </div>
                    </div>
                    <div className='flex flex-row items-center justify-center mt-1 mb-2'>
                        {searchTerm && (
                            <div className="italic text-[rgb(var(--color-text))] font-bold ml-5 text-sm mt-1">
                                {t('panel.findProducts.searching')} {searchTerm.toUpperCase()}
                            </div>
                        )}
                        {isWarehouse && searchTerm.trim() && !isPickerMode && (
                            <button
                                onClick={handleAddAllClick}
                                className="ml-2 h-5 w-5 p-1 cursor-pointer rounded-full bg-amber-700 text-white flex items-center justify-center shadow-lg mt-0.5"
                                title={t('panel.findProducts.addAll')}
                            >
                                <LuListPlus className="size-4" />
                            </button>
                        )}
                    </div>
                </>
            )}
            <div className='flex justify-center overflow-y-auto h-[570px] w-full max-w-[520px] mx-auto'>
            {isLoading ? (
                <Spinner />
            ) : error ? (
                <div role="alert" className="p-6 text-center">
                    <p>{t('common.errorProducts')}</p>
                    <button type="button" onClick={fetchProducts} className="mt-3 underline">{t('common.retry')}</button>
                </div>
            ) : paginatedProducts.length === 0 ? (
                <p role="status" className="p-6 text-center">{t('panel.site.noRecords', { branch: userBranchLabel || t('panel.common.branch') })}</p>
            ) : (
                showCards && (
                    <div className="relative min-h-[30rem] w-full grow [container-type:inline-size] max-lg:mx-auto max-lg:max-w-sm">
                        <div className="absolute left-1/2 top-6 z-10 flex items-center space-x-1 bg-[rgb(var(--color-slate))] px-2 py-1 rounded-full transform -translate-x-1/2 shadow shadow-[rgb(var(--color-galaxy))]">
                            <FaStar className="w-3 h-3 text-amber-400 animate-bounce"/>
                            <p className="text-xs font-medium text-gray-300">{t('panel.findProducts.parts')}</p>
                        </div>
                        <div className="absolute inset-x-2 sm:inset-x-1 xl:inset-x-10 bottom-0 top-2.5 rounded-t-[12cqw] overflow-x-hidden overflow-y-auto border-x-[1cqw] border-t-[1cqw] shadow shadow-[rgb(var(--color-galaxy))] border-[rgb(var(--color-slate))] bg-[rgb(var(--color-gray))] pt-5 ">
                            <div className="p-1 mt-5">
                                <div className="pt-1 px-2 grid w-full grid-cols-2 gap-2 ">
                                    {paginatedProducts.map((product) => {
                                        const imageUrl = resolveProductImage(product.ruta, multimediaSrc);
                                        const isAdded = isProductAdded(product);
                                        const categoryLabel = product.categoria || product.category || (product.idcategoria ? `Categoria ${product.idcategoria}` : '');
                                        const branchBadges = product.branchBadges || [{ label: buildBadgeLabel(product), type: product.__origin || 'active' }];
                                        const metaChips = [];
                                        if (categoryLabel) {
                                            metaChips.push({
                                                key: 'cat',
                                                text: `${categoryLabel}`,
                                                className: 'text-[8px] font-semibold text-[rgb(var(--color-text))]/70 px-2 py-0.5 rounded-full bg-[rgb(var(--color-galaxy))]/50 shadow shadow-[rgb(var(--color-galaxy))]'
                                            });
                                        }
                                        if (product.grupo) {
                                            metaChips.push({
                                                key: 'grp',
                                                text: `${String(product.grupo || '').toUpperCase()}`,
                                                className: 'text-[8px] font-semibold text-[rgb(var(--color-text))]/70 px-2 py-0.5 rounded-full bg-[rgb(var(--color-galaxy))]/50 shadow shadow-[rgb(var(--color-galaxy))]'
                                            });
                                        }
                                        if (branchBadges.length) {
                                            metaChips.push({
                                                key: 'suc-label',
                                                text: ':',
                                                className: 'text-[8px] text-[rgb(var(--color-text))]/60'
                                            });
                                            branchBadges.forEach((badge, idx) => {
                                                const variant = PRODUCT_STATUS_VARIANTS[badge.type] || PRODUCT_STATUS_VARIANTS.active;
                                                metaChips.push({
                                                    key: `suc-${idx}-${badge.label}`,
                                                    text: badge.label,
                                                    className: `text-[8px] font-semibold px-2 py-0.5 rounded-full ${variant.className}`
                                                });
                                            });
                                        }
                                        return (
                                            <div
                                                key={product.num_parte}
                                                onClick={() =>
                                                    isAdded ? handleRemoveClick(product) : handleAddClick(product)
                                                }
                                                className={`relative flex h-full flex-col gap-2 rounded-xl cursor-pointer shadow shadow-[rgb(var(--color-galaxy))] p-2 transition-all duration-200 ${
                                                    isAdded
                                                    ? 'bg-[rgb(var(--color-gray))] ring-2 ring-[rgb(var(--color-gray-base))]'
                                                    : 'bg-[rgb(var(--color-bg))]'
                                                }`}
                                                >
                                                <div className="relative w-full aspect-square flex-shrink-0 overflow-hidden rounded-lg bg-white shadow shadow-[rgb(var(--color-galaxy))]">
                                                    <img
                                                    src={imageUrl}
                                                    alt={product.num_parte}
                                                    className="w-full h-full object-cover object-center"
                                                    />
                                                </div>
                                                <div className="flex flex-1 flex-col gap-2">
                                                    <div className="flex flex-1 flex-col overflow-hidden">
                                                        {metaChips.length > 0 && (
                                                            <div className="auto-marquee mb-1">
                                                                <div className="auto-marquee__track">
                                                                    {metaChips.map((chip) => (
                                                                        <span key={`${product.num_parte}-${chip.key}-a`} className={chip.className}>
                                                                            {chip.text}
                                                                        </span>
                                                                    ))}
                                                                    {metaChips.map((chip) => (
                                                                        <span
                                                                            key={`${product.num_parte}-${chip.key}-b`}
                                                                            className={chip.className}
                                                                            aria-hidden="true"
                                                                        >
                                                                            {chip.text}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div
                                                            className="text-[14px] leading-[1.25rem] text-[rgb(var(--color-text))] min-h-[4rem] max-h-[4rem] overflow-hidden font-bold"
                                                            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}
                                                        >
                                                            {highlightText(product.descripcion, searchTerm)}
                                                        </div>
                                                        <div className="mt-auto flex flex-col gap-1">
                                                            <div className="flex flex-row justify-between items-end">
                                                                <p className="text-sm font-bold text-[rgb(var(--color-success))]">
                                                                    ${' '}
                                                                    {(Number(product.precio)).toFixed(2)} MXN
                                                                </p>
                                                                <span
                                                                    className={`${
                                                                    product.existencia === 0 ? 'bg-[rgb(var(--color-error-base))]' : 'bg-[rgb(var(--color-galaxy))]'
                                                                    } text-[rgb(var(--color-text))] text-xs rounded-full h-7 w-7 flex items-center justify-center shadow shadow-[rgb(var(--color-galaxy))]`}
                                                                >
                                                                    {product.existencia}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col text-left mt-2 gap-1">
                                                            <p className="text-[14px] font-bold text-[rgb(var(--color-refautomex))]/70 px-2 truncate">
                                                                {highlightText(product.num_parte, searchTerm)}
                                                            </p>
                                                            {product.localizacion && product.localizacion !== '0' && (
                                                            <p className="text-[12px] font-bold text-[rgb(var(--color-text))]/50 px-2 truncate">
                                                                {highlightText(product.localizacion, searchTerm)}
                                                            </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {stockAlerts[product.num_parte] && product.existencia === 0 && (
                                                    <div className="absolute left-2 right-2 bottom-2 rounded-full bg-amber-400/90 text-[rgb(var(--color-card))] text-[10px] font-semibold flex items-center justify-center gap-1 py-1 shadow-lg shadow-amber-500/40">
                                                        <TiInfo className="text-base" />
                                                        <span>{t('panel.findProducts.noStock')}</span>
                                                        <button
                                                        type="button"
                                                        onClick={(e) => dismissStockAlert(product.num_parte, e)}
                                                        className="ml-2 text-[rgb(var(--color-card))] hover:text-white"
                                                        aria-label={t('panel.findProducts.closeAlert')}
                                                        >
                                                        <IoClose className="text-base" />
                                                        </button>
                                                    </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {totalPages > 1 && (
                                    <div className="sticky bottom-0 z-10 flex items-center justify-between px-3 py-2 bg-[rgb(var(--color-gray))] border-t border-[rgb(var(--color-slate))]">
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                            disabled={safePage === 1}
                                            className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))] disabled:opacity-40"
                                        >
                                            Anterior
                                        </button>
                                        <span className="text-xs font-semibold text-[rgb(var(--color-text))]">
                                            Pagina {safePage} de {totalPages}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                            disabled={safePage === totalPages}
                                            className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))] disabled:opacity-40"
                                        >
                                            Siguiente
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            )}
            </div>
            <style jsx>{`
                .auto-marquee {
                    position: relative;
                    overflow: hidden;
                }

                .auto-marquee__track {
                    display: inline-flex;
                    gap: 0.25rem;
                    align-items: center;
                    width: max-content;
                    animation: auto-marquee-scroll 20s linear infinite;
                }

                .auto-marquee:hover .auto-marquee__track {
                    animation-play-state: paused;
                }

                @keyframes auto-marquee-scroll {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(-50%);
                    }
                }
            `}</style>
        </div>
    );
});

FindProducts.displayName = 'FindProducts';

export default FindProducts;
