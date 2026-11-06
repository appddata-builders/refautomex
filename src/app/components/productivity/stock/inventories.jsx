'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FaBoxesPacking,
    FaCircleCheck,
    FaCircleExclamation,
    FaCirclePlus,
    FaDolly,
    FaStore,
} from 'react-icons/fa6';
import Title from '../title';
import PopPortal from '@/app/lib/pop-portal';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';
import ProductForm from './product-form';
import InventoryAssign from './inventory-assign';
import InventoryBranches from './inventory-branches';
import InventoryStatus from './inventory-status';
import { ASSIGN_HANDOFF_KEY, buildCoverage, newBatchRow, parseWarehouseProducts, pluralKey } from './inventory-model';

const TOAST_MS = 6000;
const PREFS_KEY = 'inventarios';
const TABS = ['product', 'assign', 'branches'];
const EMPTY_PRODUCTS = { pending: [], active: [] };
const EMPTY_CATALOGS = { groups: [], categories: [], brands: [], providers: [] };

const getJson = async (path) => {
    const response = await fetch(buildApiUrl(path), {
        cache: 'no-store',
        headers: { Accept: 'application/json, text/plain, */*' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.details || `Error ${response.status}`);
    return data;
};

const toOptions = (rows, value, label) => (Array.isArray(rows) ? rows : [])
    .map((row) => ({ value: row[value], label: row[label] }))
    .filter((option) => option.value !== null && option.value !== undefined);

// Solo la pestana: el lote no se guarda en el navegador, sus precios cambian.
const readTab = () => {
    try {
        const tab = JSON.parse(localStorage.getItem(PREFS_KEY))?.tab;
        return TABS.includes(tab) ? tab : null;
    } catch {
        return null;
    }
};

const saveTab = (tab) => {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ tab }));
    } catch {
        // Sin almacenamiento solo no se recuerda.
    }
};

/**
 * Inventarios: dar de alta productos, asignarlos a sucursales (uno o varios a
 * la vez) y administrar las sucursales. Arriba, Estado de productos dice que
 * falta por asignar y lleva directo a hacerlo.
 *
 * Quien entra aqui lo decide Permisos de perfil (productivity/page.jsx).
 */
export default function Inventories() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('product');
    const [products, setProducts] = useState(EMPTY_PRODUCTS);
    const [branches, setBranches] = useState([]);
    const [catalogs, setCatalogs] = useState(EMPTY_CATALOGS);
    const [load, setLoad] = useState({ status: 'loading', message: '' });
    const [assignBranchId, setAssignBranchId] = useState(null);
    const [assignFilter, setAssignFilter] = useState('toAssign');
    const [batch, setBatch] = useState([]);
    // Lo que manda Asignacion de productos; entra al lote cuando hay datos.
    const [handoff, setHandoff] = useState(null);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    const tabsRef = useRef(null);
    const requestRef = useRef(0);

    const loadData = useCallback(async () => {
        const request = ++requestRef.current;
        setLoad((prev) => ({ ...prev, status: 'loading' }));
        try {
            const [warehouse, usage] = await Promise.all([getJson('/getWarehouseProducts'), getJson('/getSucursalUsage')]);
            if (request !== requestRef.current) return;
            setProducts(parseWarehouseProducts(warehouse));
            setBranches(Array.isArray(usage) ? usage : []);
            setLoad({ status: 'ready', message: '' });
        } catch (error) {
            if (request === requestRef.current) setLoad({ status: 'error', message: error.message });
        }
    }, []);

    useEffect(() => {
        const saved = readTab();
        if (saved) setTab(saved);
        try {
            const raw = sessionStorage.getItem(ASSIGN_HANDOFF_KEY);
            if (raw) {
                sessionStorage.removeItem(ASSIGN_HANDOFF_KEY);
                const data = JSON.parse(raw);
                setTab('assign');
                setAssignBranchId(data.idsucursal ?? null);
                setAssignFilter('toAssign');
                setHandoff(data);
            }
        } catch {
            // Sin almacenamiento no hay nada que traer.
        }
        loadData();

        // Los catalogos solo los usa el alta; si alguno falla, su selector sale vacio.
        const catalog = (path, value, label) => getJson(path)
            .then((rows) => toOptions(rows, value, label))
            .catch((error) => {
                console.warn(`No se pudo cargar ${path}:`, error);
                return [];
            });
        Promise.all([
            catalog('/getGroups', 'idgrupo', 'grupo'),
            catalog('/getCategory', 'idcategoria', 'categoria'),
            catalog('/getBrands', 'idmarca', 'marca'),
            catalog('/getProviders', 'idproveedor', 'empresa'),
        ]).then(([groups, categories, brands, providers]) => setCatalogs({ groups, categories, brands, providers }));
    }, [loadData]);

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    const notify = useCallback((next) => {
        clearTimeout(toastTimer.current);
        setToast(next);
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
    }, []);

    const productsByPart = useMemo(
        () => new Map([...products.pending, ...products.active].map((product) => [product.num_parte, product])),
        [products]
    );
    const knownParts = useMemo(() => new Set(productsByPart.keys()), [productsByPart]);

    useEffect(() => {
        if (!handoff || load.status !== 'ready') return;
        setBatch((rows) => [
            ...rows,
            ...(handoff.partes || [])
                .filter((part) => !rows.some((row) => row.num_parte === part))
                .map((part) => newBatchRow(productsByPart.get(part) || { num_parte: part })),
        ]);
        setHandoff(null);
    }, [handoff, load.status, productsByPart]);
    const coverage = useMemo(() => buildCoverage(products, branches), [products, branches]);

    const changeTab = (next) => {
        setTab(next);
        saveTab(next);
    };

    // Lo que piden Estado de productos y el alta: abrir Asignar a sucursal con
    // una sucursal, una lista o un producto ya en el lote.
    const startAssign = ({ product, branchId, filter }) => {
        changeTab('assign');
        if (branchId !== undefined) setAssignBranchId(branchId);
        if (filter) setAssignFilter(filter);
        if (product) {
            setBatch((rows) => (rows.some((row) => row.num_parte === product.num_parte) ? rows : [...rows, newBatchRow(product)]));
        }
        tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleSaved = ({ saved, failed, branch }) => {
        loadData();
        if (saved && !failed) notify({ message: t(pluralKey('panel.inventories.savedAll', saved), { count: saved, branch }) });
        else if (saved) notify({ message: t('panel.inventories.savedSome', { count: saved, failed, branch }), error: true });
        else notify({ message: t('panel.inventories.savedNone'), error: true });
    };

    const tabs = [
        { id: 'product', icon: FaCirclePlus, title: t('panel.inventories.tabProduct'), hint: t('panel.inventories.tabProductHint') },
        {
            id: 'assign',
            icon: FaDolly,
            title: t('panel.inventories.tabAssign'),
            hint: t('panel.inventories.tabAssignHint'),
            badge: batch.length || null,
        },
        { id: 'branches', icon: FaStore, title: t('panel.inventories.tabBranches'), hint: t('panel.inventories.tabBranchesHint') },
    ];

    const renderTab = () => {
        if (load.status === 'error' && !branches.length) {
            return (
                <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl bg-[rgb(var(--color-card))] p-8 text-center">
                    <FaCircleExclamation className="size-6 text-[rgb(var(--color-error))]" aria-hidden="true" />
                    <p className="text-sm">{load.message || t('panel.common.unexpectedError')}</p>
                    <button type="button" onClick={loadData} className="h-11 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow">
                        {t('panel.common.retry')}
                    </button>
                </div>
            );
        }
        if (tab === 'assign') {
            return (
                <InventoryAssign
                    products={products}
                    productsByPart={productsByPart}
                    branches={branches}
                    groups={catalogs.groups}
                    branchId={assignBranchId}
                    onBranchChange={setAssignBranchId}
                    filter={assignFilter}
                    onFilterChange={setAssignFilter}
                    batch={batch}
                    setBatch={setBatch}
                    onSaved={handleSaved}
                    onRemoved={({ part, branch }) => {
                        loadData();
                        notify({ message: t('panel.inventories.removed', { part, branch }) });
                    }}
                />
            );
        }
        if (tab === 'branches') {
            return (
                <div className="rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-5">
                    <InventoryBranches branches={branches} onChanged={loadData} notify={notify} />
                </div>
            );
        }
        return (
            <div className="rounded-2xl bg-[rgb(var(--color-card))] p-4 shadow shadow-[rgb(var(--color-galaxy))] sm:p-6">
                <ProductForm
                    catalogs={catalogs}
                    knownParts={knownParts}
                    onCreated={loadData}
                    onAssign={(part) => startAssign({ product: productsByPart.get(part) || { num_parte: part }, filter: 'toAssign' })}
                />
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] pb-24 pt-28">
            <Title
                title={t('panel.inventories.title')}
                icon={FaBoxesPacking}
                back={t('panel.common.back')}
                path="/productivity"
            />

            <div className="mx-auto mt-5 max-w-7xl space-y-5 px-2 sm:px-4 xl:px-8">
                <InventoryStatus
                    coverage={coverage}
                    pending={products.pending}
                    loading={load.status === 'loading'}
                    onRefresh={loadData}
                    onShowPending={() => startAssign({ filter: 'toAssign' })}
                    onAssignProduct={(product) => startAssign({ product, filter: 'toAssign' })}
                    onBranchMissing={(branchId) => startAssign({ branchId, filter: 'toAssign' })}
                />

                <div ref={tabsRef} className="scroll-mt-28 space-y-4">
                    <div role="tablist" aria-label={t('panel.inventories.title')} className="grid grid-cols-3 gap-2 sm:gap-3">
                        {tabs.map(({ id, icon: Icon, title, hint, badge }) => {
                            const selected = tab === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={selected}
                                    onClick={() => changeTab(id)}
                                    className={`relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl p-3 text-center transition sm:flex-row sm:items-start sm:gap-3 sm:p-4 sm:text-left ${selected
                                        ? 'bg-amber-500 text-slate-900 shadow-lg'
                                        : 'bg-[rgb(var(--color-card))] shadow-sm hover:-translate-y-0.5 hover:shadow-md'}`}
                                >
                                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${selected ? 'bg-slate-900/15' : 'bg-amber-500/20 text-amber-600'}`}>
                                        <Icon className="size-5" aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-bold leading-tight sm:text-base">{title}</span>
                                        <span className={`mt-0.5 hidden text-xs leading-snug sm:block ${selected ? 'text-slate-900/75' : 'text-[rgb(var(--color-gray-base))]'}`}>{hint}</span>
                                    </span>
                                    {badge && (
                                        <span className={`absolute right-2 top-2 rounded-full px-1.5 text-xs font-bold tabular-nums ${selected ? 'bg-slate-900 text-amber-400' : 'bg-amber-500 text-slate-900'}`}>
                                            {badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {renderTab()}
                </div>
            </div>

            {/* En portal: dentro de <main> lo taparian los botones flotantes del sitio. */}
            {toast && (
                <PopPortal>
                    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex justify-center px-4">
                        <div
                            role="status"
                            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-[rgb(var(--color-text))] px-4 py-3 text-sm text-[rgb(var(--color-bg))] shadow-2xl"
                        >
                            {toast.error
                                ? <FaCircleExclamation className="size-4 shrink-0 text-red-400" aria-hidden="true" />
                                : <FaCircleCheck className="size-4 shrink-0 text-green-400" aria-hidden="true" />}
                            <span className="min-w-0 flex-1 font-medium">{toast.message}</span>
                            {toast.action && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        toast.action.onClick();
                                        setToast(null);
                                    }}
                                    className="shrink-0 font-semibold text-amber-400 hover:text-amber-300"
                                >
                                    {toast.action.label}
                                </button>
                            )}
                        </div>
                    </div>
                </PopPortal>
            )}
        </div>
    );
}
