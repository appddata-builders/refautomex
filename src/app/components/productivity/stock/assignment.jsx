import React, { useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FaExchangeAlt } from 'react-icons/fa';
import {
    FaArrowsRotate,
    FaChevronDown,
    FaCircleCheck,
    FaCircleExclamation,
    FaEyeSlash,
    FaInbox,
    FaMagnifyingGlass,
    FaWarehouse,
    FaXmark,
} from 'react-icons/fa6';
import Title from '../title';
import FindProducts from '@/app/components/productivity/sales/find-products';
import { AuthContext } from '@/app/lib/auth-tracker';
import PopPortal from '@/app/lib/pop-portal';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';
import Sheet from './sheet';
import MigrateModal from './migrate-modal';
import {
    UNASSIGNED,
    applyMoves,
    buildWarehouse,
    canUndo,
    isValidLocation,
    matchesTerm,
    splitMatrix,
    undoSteps,
} from './locations';
import { MapLegend, ShelfCard, ShelfPicker } from './assignment-map';
import { LevelsEditor, MatrixDetail, PlaceForm, SHEET_TITLE_ID } from './assignment-sheets';

const TOAST_MS = 6000;
const REFRESH_MS = 60000;
const PREFS_KEY = 'asignacion-productos';
const SEARCH_TYPES = ['Descripcion', 'Parte', 'Localizacion'];
const AMBER_CIRCLE = 'p-3 m-1 rounded-full shadow hover:shadow-xl bg-amber-500 text-slate-900 cursor-pointer inline-block';

// WEB no tiene almacen fisico: todo su catalogo vive en '0'.
const isWebBranch = (branch) =>
    Number(branch.idsucursal) === 1 || String(branch.sucursal || '').trim().toUpperCase() === 'WEB';

// Lo que recuerda este navegador: si la lista de productos esta abierta, en que
// pestana, y que anaquel se trabajaba en cada sucursal. Sin almacenamiento la
// pantalla usa los valores por defecto y nada mas.
const readPrefs = () => {
    try {
        return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
        return {};
    }
};

const savePrefs = (patch) => {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
    } catch {
        // Sin almacenamiento solo no se recuerda.
    }
};

/**
 * Asignacion de productos. A la izquierda, el mismo buscador de productos de
 * los demas modulos (getAllProducts) con dos pestanas: lo que esta por ubicar y
 * todos. A la derecha, los botones del modulo y el anaquel que se esta
 * trabajando, con sus niveles (que se pueden agregar o quitar). Cada cambio se
 * guarda al momento con /patchAssignLocation, que no deja dos productos en el
 * mismo lugar, y el aviso que sale despues permite deshacerlo.
 *
 * Un administrador puede cambiar de sucursal y migrar matrices; un empleado
 * trabaja en la suya.
 */
export default function Assignment() {
    const { t } = useTranslation();
    const { userData } = useContext(AuthContext);
    const isAdmin = String(userData?.categoria || '').toUpperCase() === 'A';

    const [branches, setBranches] = useState([]);
    const [branchId, setBranchId] = useState(null);
    const [rows, setRows] = useState([]);
    // Niveles guardados por anaquel (/getShelfLayout): [{ anaquel, niveles }].
    const [layout, setLayout] = useState([]);
    const [load, setLoad] = useState({ status: 'loading', message: '' });
    const [attempt, setAttempt] = useState(0);
    const [term, setTerm] = useState('');
    const searchTerm = useDeferredValue(term.trim());
    // Anaquel que se esta trabajando: es lo unico que se pinta.
    const [selected, setSelected] = useState(null);
    const [showUnassigned, setShowUnassigned] = useState(true);
    // Pestana del buscador: 'unassigned' (solo por ubicar) o 'all' (todos).
    const [phoneTab, setPhoneTab] = useState('unassigned');
    // Matriz que espera su producto despues de "Ubicar un producto aqui".
    const [placeTarget, setPlaceTarget] = useState(null);
    // Pila de vistas de la hoja: la ultima es la visible y "Volver" la quita.
    // `closingView` la conserva mientras dura la animacion de cierre.
    const [views, setViews] = useState([]);
    const [closingView, setClosingView] = useState(null);
    const [saving, setSaving] = useState(false);
    // Renglon que se esta quitando (por su iddetalle) mientras guarda.
    const [busyId, setBusyId] = useState(null);
    const [sheetError, setSheetError] = useState('');
    const [toast, setToast] = useState(null);
    const [migrateOpen, setMigrateOpen] = useState(false);
    const [tooltip, setTooltip] = useState(null);
    const requestRef = useRef(0);
    const toastTimer = useRef(null);
    const findProductsRef = useRef(null);
    const phoneRef = useRef(null);

    useEffect(() => {
        const prefs = readPrefs();
        setShowUnassigned(prefs.showUnassigned ?? true);
        if (prefs.phoneTab === 'all') setPhoneTab('all');
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadBranches = async () => {
            try {
                const response = await fetch(buildApiUrl('/getSucursal'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });
                const data = await response.json().catch(() => null);
                if (!response.ok || !Array.isArray(data)) throw new Error(data?.details || t('panel.assignment.loadError'));
                if (!cancelled) setBranches(data.filter((branch) => !isWebBranch(branch)));
            } catch (error) {
                if (!cancelled) setLoad({ status: 'error', message: error.message });
            }
        };
        loadBranches();
        return () => {
            cancelled = true;
        };
    }, [attempt, t]);

    useEffect(() => {
        if (!branches.length) return;
        const own = branches.find((branch) => String(branch.idsucursal) === String(userData?.idsucursal));
        setBranchId((current) => {
            if (!isAdmin) return own?.idsucursal ?? null;
            return current ?? own?.idsucursal ?? branches[0].idsucursal;
        });
    }, [branches, isAdmin, userData?.idsucursal]);

    // `silent` refresca sin pantalla de carga, despues de guardar: trae lo que
    // otra persona haya movido mientras tanto.
    const loadMap = useCallback(async (id, silent = false) => {
        const request = ++requestRef.current;
        if (!silent) setLoad({ status: 'loading', message: '' });
        try {
            const params = new URLSearchParams({ idsucursal: String(id) }).toString();
            const options = { cache: 'no-store', headers: { Accept: 'application/json, text/plain, */*' } };
            // Los niveles guardados no detienen el mapa: sin ellos se deducen.
            const [response, savedLevels] = await Promise.all([
                fetch(`${buildApiUrl('/getWarehouseMap')}?${params}`, options),
                fetch(`${buildApiUrl('/getShelfLayout')}?${params}`, options)
                    .then((res) => (res.ok ? res.json() : []))
                    .catch(() => []),
            ]);
            const data = await response.json().catch(() => null);
            if (!response.ok || !Array.isArray(data)) throw new Error(data?.details || t('panel.assignment.loadError'));
            if (request !== requestRef.current) return;
            setRows(data);
            setLayout(Array.isArray(savedLevels) ? savedLevels : []);
            setLoad({ status: 'ready', message: '' });
        } catch (error) {
            if (request !== requestRef.current) return;
            // Un refresco silencioso que falla deja el mapa como estaba, salvo que
            // la pantalla siga cargando: entonces muestra el error y no se queda girando.
            setLoad((current) => (silent && current.status !== 'loading'
                ? current
                : { status: 'error', message: error.message }));
        }
    }, [t]);

    useEffect(() => {
        if (branchId) loadMap(branchId);
    }, [branchId, attempt, loadMap]);

    // Lo que hay en un contenedor en este momento (/getMatrixRows). El detalle de
    // la matriz y el formulario de ubicar lo piden al abrirse: asi una posicion
    // "libre" es libre en la base, no en la foto del mapa, que puede tener un
    // minuto o no ver lo que otra persona acaba de mover.
    const loadMatrix = useCallback(async (code) => {
        const params = new URLSearchParams({ idsucursal: String(branchId), matriz: code });
        const response = await fetch(`${buildApiUrl('/getMatrixRows')}?${params.toString()}`, {
            cache: 'no-store',
            headers: { Accept: 'application/json, text/plain, */*' },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data)) throw new Error(data?.details || t('panel.assignment.loadError'));
        return buildWarehouse(data).matrices.get(code) ?? { code, items: [], hasConflict: false };
    }, [branchId, t]);

    // Lo que mueven otras personas (o Gestion de Almacen) tambien llega: el mapa
    // se refresca solo cada minuto y al volver a la pestana, si esta a la vista.
    useEffect(() => {
        if (!branchId) return undefined;
        const refresh = () => {
            if (document.visibilityState === 'visible') loadMap(branchId, true);
        };
        const timer = setInterval(refresh, REFRESH_MS);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [branchId, loadMap]);

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    const warehouse = useMemo(() => buildWarehouse(rows, layout), [rows, layout]);
    const keys = useMemo(() => warehouse.shelves.map((shelf) => shelf.shelf), [warehouse]);

    // Al cargar una sucursal se vuelve al anaquel que se trabajaba en ella.
    useEffect(() => {
        if (!branchId || load.status !== 'ready') return;
        setSelected((current) => {
            if (current && keys.includes(current)) return current;
            const saved = readPrefs().selected?.[branchId];
            return saved && keys.includes(saved) ? saved : keys[0];
        });
    }, [branchId, keys, load.status]);

    const search = useMemo(() => {
        if (!searchTerm) return null;
        const parts = new Set(rows.filter((row) => matchesTerm(row, searchTerm)).map((row) => row.num_parte));
        const matrices = new Set();
        const matchedKeys = new Set();
        let located = 0;
        for (const matrix of warehouse.matrices.values()) {
            const hits = matrix.items.filter((item) => parts.has(item.num_parte)).length;
            if (!hits) continue;
            located += hits;
            matrices.add(matrix.code);
            matchedKeys.add(matrix.shelf);
        }
        return { parts, matrices, matchedKeys, located };
    }, [rows, searchTerm, warehouse]);

    // Si lo buscado no esta en el anaquel que se ve, se salta al primero que lo tenga.
    useEffect(() => {
        if (!search?.matchedKeys.size) return;
        setSelected((current) => (search.matchedKeys.has(current)
            ? current
            : keys.find((key) => search.matchedKeys.has(key))));
    }, [search, keys]);

    const unassignedParts = useMemo(
        () => new Set(warehouse.unassigned.map((row) => row.num_parte)),
        [warehouse]
    );
    const onlyUnassigned = useCallback((product) => unassignedParts.has(product.num_parte), [unassignedParts]);

    // El buscador trae su propia copia (getAllProducts) y no se entera de lo que
    // se mueve aqui: sin esto seguia mostrando el indice anterior. Se le pasa la
    // ubicacion actual del mapa, al momento y sin volver a cargarlo.
    const currentLocations = useMemo(() => {
        const byPart = new Map();
        for (const row of rows) {
            if (!row.localizacion || row.localizacion === UNASSIGNED) continue;
            byPart.set(row.num_parte, [...(byPart.get(row.num_parte) || []), row.localizacion]);
        }
        return byPart;
    }, [rows]);
    const withCurrentLocation = useCallback(
        (product) => ({ ...product, localizacion: (currentLocations.get(product.num_parte) || []).join(' · ') || UNASSIGNED }),
        [currentLocations]
    );

    const branchName = branches.find((branch) => branch.idsucursal === branchId)?.sucursal;
    const selectedShelf = warehouse.shelves.find((shelf) => shelf.shelf === selected);
    // Lo que se ubica desde el buscador llega con el anaquel que se esta trabajando.
    const workingMatrix = { anaquel: selected || '' };

    const selectKey = (key) => {
        setSelected(key);
        savePrefs({ selected: { ...readPrefs().selected, [branchId]: key } });
    };

    const toggleUnassigned = () => {
        const next = !showUnassigned;
        setShowUnassigned(next);
        savePrefs({ showUnassigned: next });
    };

    const changePhoneTab = (tab) => {
        setPhoneTab(tab);
        savePrefs({ phoneTab: tab });
    };

    const showToast = (next) => {
        clearTimeout(toastTimer.current);
        setToast(next);
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
    };

    const openView = (view) => {
        setSheetError('');
        setViews((stack) => [...stack, view]);
    };

    const goBack = () => {
        setSheetError('');
        setViews((stack) => stack.slice(0, -1));
    };

    const closeSheet = () => {
        setClosingView(views[views.length - 1] ?? null);
        setViews([]);
        setSheetError('');
    };

    const refreshAll = () => {
        if (!branchId) {
            setAttempt((n) => n + 1);
            return;
        }
        loadMap(branchId);
        findProductsRef.current?.refreshProducts?.();
    };

    const assign = async ({ iddetalle, localizacion, intercambiar = false }) => {
        try {
            const response = await fetch(buildApiUrl('/patchAssignLocation'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
                body: JSON.stringify({ idsucursal: branchId, iddetalle, localizacion, intercambiar }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) return { ok: false, message: data?.details || t('panel.assignment.saveError') };
            const moves = data?.movimientos || [];
            setRows((current) => applyMoves(current, moves));
            return { ok: true, moves };
        } catch (error) {
            console.error('Error asignando ubicacion:', error);
            return { ok: false, message: t('panel.assignment.saveError') };
        }
    };

    // Guarda y avisa. Tras un error tambien se refresca: lo normal es que otra
    // persona haya ocupado el lugar y la hoja debe mostrarlo.
    const runAssignment = async (request) => {
        setSheetError('');
        const before = rows;
        const result = await assign(request);
        loadMap(branchId, true);
        if (!result.ok) {
            setSheetError(result.message);
            return false;
        }
        if (result.moves.length) showToast({ moves: result.moves, undoable: canUndo(result.moves, before) });
        return true;
    };

    const handlePlace = async (iddetalle, request) => {
        setSaving(true);
        const ok = await runAssignment({ iddetalle, ...request });
        setSaving(false);
        if (ok) closeSheet();
    };

    const handleUnassign = async (item) => {
        setBusyId(item.iddetalle);
        await runAssignment({ iddetalle: item.iddetalle, localizacion: UNASSIGNED });
        setBusyId(null);
    };

    const handleUndo = async (moves) => {
        setToast(null);
        for (const step of undoSteps(moves)) {
            const result = await assign(step);
            if (!result.ok) {
                showToast({ error: result.message });
                loadMap(branchId, true);
                return;
            }
        }
        showToast({ message: t('panel.assignment.undone') });
        loadMap(branchId, true);
    };

    // Producto elegido en el buscador: va a la matriz (y posicion) que lo
    // esperaba, o al anaquel en curso. El buscador trae productos y aqui se
    // mueven renglones de inventario: si el producto esta dos veces en la
    // sucursal se toma el que esta por ubicar, y si no, el primero.
    const handlePick = (product) => {
        const own = rows.filter((row) => row.num_parte === product.num_parte);
        const row = own.find((item) => !isValidLocation(item.localizacion)) ?? own[0];
        if (!row) {
            showToast({ error: t('panel.assignment.saveError') });
            return;
        }
        const initialMatrix = placeTarget ? splitMatrix(placeTarget.code) : workingMatrix;
        const initialIndex = placeTarget?.index ?? null;
        setPlaceTarget(null);
        openView({ type: 'place', id: row.iddetalle, initialMatrix, initialIndex });
    };

    // "Ubicar aqui": en la matriz, o en un hueco exacto si viene `index`.
    const handleAddHere = (code, index = null) => {
        closeSheet();
        setPlaceTarget({ code, index });
        setShowUnassigned(true);
        requestAnimationFrame(() => phoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    // Guarda la lista completa de niveles del anaquel. Devuelve si se guardo,
    // para que el editor limpie su selector.
    const handleSaveLevels = async (shelf, niveles) => {
        setSaving(true);
        setSheetError('');
        try {
            const response = await fetch(buildApiUrl('/patchShelfLevels'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
                body: JSON.stringify({ idsucursal: branchId, anaquel: shelf, niveles }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setSheetError(data?.details || t('panel.assignment.levelsSaveError'));
                return false;
            }
            setLayout((current) => [
                ...current.filter((entry) => entry.anaquel !== shelf),
                { anaquel: shelf, niveles: data.niveles },
            ]);
            return true;
        } catch (error) {
            console.error('Error guardando niveles:', error);
            setSheetError(t('panel.assignment.levelsSaveError'));
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleMigrate = async ({ source, target }) => {
        try {
            const response = await fetch(buildApiUrl('/patchMigrate'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source, target, idsucursal: branchId }),
            });
            const data = await response.json().catch(() => ({}));
            const message = data?.message || data?.details
                || (response.ok ? t('panel.warehouse.migrateOk') : t('panel.warehouse.migrateFailed'));
            if (response.ok) refreshAll();
            return { ok: response.ok, message };
        } catch (error) {
            console.error('Error al migrar matrices:', error);
            return { ok: false, message: t('panel.warehouse.migrateError') };
        }
    };

    const handleBranchChange = (event) => {
        setViews([]);
        setToast(null);
        setPlaceTarget(null);
        setSelected(null);
        setBranchId(Number(event.target.value));
    };

    const describeMoves = (moves) => moves
        .map((move) => t('panel.assignment.moved', {
            product: move.num_parte,
            location: isValidLocation(move.a) ? move.a : t('panel.assignment.unassignedLabel'),
        }))
        .join(' · ');

    const renderView = (view) => {
        if (!view) return null;

        if (view.type === 'matrix') {
            return (
                <MatrixDetail
                    key={view.code}
                    code={view.code}
                    matrix={warehouse.matrices.get(view.code)}
                    busyId={busyId}
                    error={sheetError}
                    onMove={(item) => openView({ type: 'place', id: item.iddetalle, initialMatrix: splitMatrix(item.matrix) })}
                    onUnassign={handleUnassign}
                    onAddHere={(index) => handleAddHere(view.code, index)}
                    onClose={closeSheet}
                    loadMatrix={loadMatrix}
                />
            );
        }

        if (view.type === 'levels') {
            const shelf = warehouse.shelves.find((item) => item.shelf === view.shelf);
            if (!shelf) return null;
            return (
                <LevelsEditor
                    key={view.shelf}
                    shelf={shelf}
                    saving={saving}
                    error={sheetError}
                    onSave={handleSaveLevels}
                    onClose={closeSheet}
                />
            );
        }

        const product = rows.find((row) => row.iddetalle === view.id);
        if (!product) return null;
        return (
            <PlaceForm
                key={`${view.id}-${JSON.stringify(view.initialMatrix)}-${view.initialIndex}`}
                product={product}
                initialMatrix={view.initialMatrix}
                initialIndex={view.initialIndex}
                matrices={warehouse.matrices}
                saving={saving}
                error={sheetError}
                onSubmit={(request) => handlePlace(view.id, request)}
                onBack={views.length > 1 ? goBack : null}
                onClose={closeSheet}
                loadMatrix={loadMatrix}
            />
        );
    };

    const stats = [
        { label: t('panel.assignment.statLocated'), value: warehouse.stats.located },
        { label: t('panel.assignment.statUnassigned'), value: warehouse.stats.unassigned, accent: warehouse.stats.unassigned > 0 && 'text-amber-600' },
        { label: t('panel.assignment.statConflicts'), value: warehouse.stats.conflicts, accent: warehouse.stats.conflicts > 0 && 'text-[rgb(var(--color-error))]' },
        { label: t('panel.assignment.statShelves'), value: warehouse.stats.shelves },
    ];

    // Los botones del modulo, como en Gestion de Almacen: circulos con su tooltip.
    const moduleButtons = [
        { id: 'refresh', icon: FaArrowsRotate, label: t('panel.assignment.refresh'), className: 'blue-circle-button', onClick: refreshAll },
        {
            id: 'unassigned',
            icon: showUnassigned ? FaEyeSlash : FaInbox,
            label: showUnassigned ? t('panel.assignment.hideUnassigned') : t('panel.assignment.showUnassigned'),
            className: AMBER_CIRCLE,
            onClick: toggleUnassigned,
        },
        ...(isAdmin ? [{
            id: 'migrate',
            icon: FaExchangeAlt,
            label: t('panel.warehouse.migrate'),
            className: AMBER_CIRCLE,
            onClick: () => setMigrateOpen(true),
        }] : []),
    ];

    const phoneTabs = [
        { id: 'unassigned', label: t('panel.assignment.tabUnassigned'), count: warehouse.stats.unassigned },
        { id: 'all', label: t('panel.assignment.tabAll'), count: rows.length },
    ];
    // El hueco exacto (01A05-1) si "Ubicar aqui" vino de una posicion libre; si no, la matriz.
    const targetLabel = placeTarget
        ? `${placeTarget.code}${placeTarget.index === null ? '' : `-${placeTarget.index}`}`
        : '';
    let pickLabel = phoneTab === 'unassigned' ? t('panel.assignment.assign') : t('panel.assignment.place');
    if (placeTarget) pickLabel = t('panel.assignment.placeHere', { code: targetLabel });

    const visibleView = views[views.length - 1] ?? closingView;
    // Sin userData todavia no se sabe la sucursal: se sigue viendo la carga.
    const noBranch = Boolean(userData) && branches.length > 0 && !branchId;

    return (
        <div className="min-h-screen bg-gradient-to-b from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] pb-24 pt-28">
            <Title
                title={t('panel.assignment.title')}
                icon={FaWarehouse}
                back={t('panel.common.back')}
                path="/productivity"
            />

            <div className="mx-auto mt-5 max-w-[1700px] space-y-4 px-2 xl:px-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <label className="flex items-center gap-2 rounded-2xl bg-[rgb(var(--color-bg))] p-3 shadow-sm sm:w-80">
                        <span className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">
                            {t('panel.common.branch')}
                        </span>
                        {isAdmin ? (
                            <select
                                value={branchId ?? ''}
                                onChange={handleBranchChange}
                                className="h-11 min-w-0 flex-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                            >
                                {branches.map((branch) => (
                                    <option key={branch.idsucursal} value={branch.idsucursal}>{branch.sucursal}</option>
                                ))}
                            </select>
                        ) : (
                            <span className="rounded-xl bg-[rgb(var(--color-card))] px-3 py-2 font-semibold">{branchName || '—'}</span>
                        )}
                    </label>
                    {load.status === 'ready' && (
                        <dl className="grid flex-1 grid-cols-4 gap-2">
                            {stats.map(({ label, value, accent }) => (
                                <div key={label} className="min-w-0 rounded-2xl bg-[rgb(var(--color-bg))] px-2.5 py-2.5 shadow-sm sm:px-4">
                                    <dt className="truncate text-[11px] font-medium text-[rgb(var(--color-gray-base))] sm:text-xs">{label}</dt>
                                    <dd className={`text-xl font-bold tabular-nums ${accent || ''}`}>{value.toLocaleString('es-MX')}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>

                {noBranch && (
                    <p className="rounded-2xl bg-[rgb(var(--color-bg))] p-6 text-center text-sm shadow-sm">{t('panel.warehouse.noBranch')}</p>
                )}

                <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-3 lg:items-start">
                    {/* Productos: el mismo buscador de los demas modulos, plegable, con dos
                        pestanas: solo lo que esta por ubicar, o todos los que existen. */}
                    <section
                        ref={phoneRef}
                        className="min-w-0 scroll-mt-28 overflow-hidden rounded-xl bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))] lg:rounded-2xl"
                    >
                        <button
                            type="button"
                            onClick={toggleUnassigned}
                            aria-expanded={showUnassigned}
                            className="flex w-full items-center gap-2 px-4 py-3 text-left"
                        >
                            <FaInbox className="size-4 text-amber-600" aria-hidden="true" />
                            <span className="flex-1 font-bold">{t('panel.assignment.products')}</span>
                            {!showUnassigned && warehouse.stats.unassigned > 0 && (
                                <span className="rounded-full bg-amber-400/30 px-2 text-xs font-semibold">
                                    {t('panel.assignment.unassignedCount', { count: warehouse.stats.unassigned })}
                                </span>
                            )}
                            <FaChevronDown
                                className={`size-3.5 transition-transform ${showUnassigned ? 'rotate-180' : ''}`}
                                aria-hidden="true"
                            />
                        </button>
                        <div className={showUnassigned ? 'block pb-2' : 'hidden'}>
                            <div role="tablist" className="mx-3 mb-2 grid grid-cols-2 gap-1 rounded-xl bg-[rgb(var(--color-bg))] p-1">
                                {phoneTabs.map(({ id, label, count }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        role="tab"
                                        aria-selected={phoneTab === id}
                                        onClick={() => changePhoneTab(id)}
                                        className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${phoneTab === id
                                            ? 'bg-amber-500 text-slate-900 shadow'
                                            : 'text-[rgb(var(--color-gray-base))]'}`}
                                    >
                                        {label}
                                        <span className={`rounded-full px-1.5 text-xs ${phoneTab === id ? 'bg-slate-900/15' : 'bg-[rgb(var(--color-gray))]'}`}>
                                            {count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {placeTarget && (
                                <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-amber-400/25 px-3 py-2 text-sm font-medium">
                                    <span className="flex-1">{t('panel.assignment.pickProduct', { code: targetLabel })}</span>
                                    <button
                                        type="button"
                                        onClick={() => setPlaceTarget(null)}
                                        aria-label={t('panel.common.cancel')}
                                        className="grid size-8 place-items-center rounded-full hover:bg-[rgb(var(--color-text))]/10"
                                    >
                                        <FaXmark className="size-3.5" />
                                    </button>
                                </div>
                            )}
                            {branchId && (
                                <FindProducts
                                    ref={findProductsRef}
                                    branch={{ id: branchId, label: branchName }}
                                    includeWebBranch={false}
                                    includePendingProducts={false}
                                    allowedSearchTypes={SEARCH_TYPES}
                                    onProductPick={handlePick}
                                    productFilter={phoneTab === 'unassigned' ? onlyUnassigned : undefined}
                                    decorateProduct={withCurrentLocation}
                                    pickActionLabel={pickLabel}
                                    emptyMessage={phoneTab === 'unassigned' ? t('panel.assignment.unassignedEmpty') : undefined}
                                />
                            )}
                        </div>
                    </section>

                    <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))] lg:col-span-2 lg:flex-row">
                        <div className="flex shrink-0 flex-row justify-center gap-1 bg-[rgb(var(--color-bg))] px-2 py-1 lg:flex-col lg:justify-start lg:px-1 lg:pt-10">
                            {moduleButtons.map(({ id, icon: Icon, label, className, onClick }) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={onClick}
                                    aria-label={label}
                                    onMouseEnter={() => setTooltip(id)}
                                    onMouseLeave={() => setTooltip(null)}
                                    className={`relative ${className}`}
                                >
                                    <Icon className={id === 'refresh' && load.status === 'loading' ? 'animate-spin' : ''} />
                                    {tooltip === id && (
                                        <span className="absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-[rgb(var(--color-card))] px-2 py-1 text-xs text-[rgb(var(--color-text))] opacity-90 shadow lg:left-full lg:top-1/2 lg:ml-3 lg:mt-0 lg:-translate-y-1/2 lg:translate-x-0">
                                            {label}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="min-w-0 flex-1 space-y-3 p-3 sm:p-4">
                            <label className="relative block">
                                <FaMagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[rgb(var(--color-gray-base))]" aria-hidden="true" />
                                <input
                                    type="search"
                                    value={term}
                                    onChange={(event) => setTerm(event.target.value)}
                                    placeholder={t('panel.assignment.search')}
                                    aria-label={t('panel.assignment.search')}
                                    className="h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] pl-10 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-amber-400"
                                />
                            </label>

                            {load.status === 'error' && (
                                <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl bg-[rgb(var(--color-bg))] p-6 text-center">
                                    <FaCircleExclamation className="size-6 text-[rgb(var(--color-error))]" aria-hidden="true" />
                                    <p className="text-sm">{load.message || t('panel.assignment.loadError')}</p>
                                    <button
                                        type="button"
                                        onClick={() => setAttempt((n) => n + 1)}
                                        className="h-11 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow"
                                    >
                                        {t('panel.common.retry')}
                                    </button>
                                </div>
                            )}

                            {load.status === 'loading' && !noBranch && (
                                <div className="flex flex-col items-center gap-3 p-10 text-sm text-[rgb(var(--color-gray-base))]">
                                    <span className="size-7 animate-spin rounded-full border-[3px] border-amber-500/30 border-t-amber-500" aria-hidden="true" />
                                    {t('panel.assignment.loading')}
                                </div>
                            )}

                            {load.status === 'ready' && !noBranch && (
                                <>
                                    <ShelfPicker
                                        shelves={warehouse.shelves}
                                        selected={selected}
                                        matchedKeys={search?.matchedKeys}
                                        onSelect={selectKey}
                                    />
                                    {search && (
                                        <p className="px-1 text-sm text-[rgb(var(--color-gray-base))]">
                                            {search.located
                                                ? t('panel.assignment.matches', { count: search.located })
                                                : t('panel.assignment.noMatches', { term: searchTerm })}
                                        </p>
                                    )}
                                    {!warehouse.shelves.length && (
                                        <p className="px-1 text-sm text-[rgb(var(--color-gray-base))]">{t('panel.assignment.emptyMap')}</p>
                                    )}
                                    {selectedShelf && (
                                        <ShelfCard
                                            shelf={selectedShelf}
                                            matrices={warehouse.matrices}
                                            matchedMatrices={search?.matrices}
                                            onOpenMatrix={(code) => openView({ type: 'matrix', code })}
                                            onEditLevels={(shelf) => openView({ type: 'levels', shelf })}
                                        />
                                    )}
                                    <MapLegend />
                                </>
                            )}
                        </div>
                    </section>
                </div>
            </div>

            <Sheet
                isOpen={views.length > 0}
                onClose={closeSheet}
                locked={saving || busyId !== null}
                labelledBy={SHEET_TITLE_ID}
                wide
            >
                {renderView(visibleView)}
            </Sheet>

            {isAdmin && (
                <MigrateModal
                    isOpen={migrateOpen}
                    toggleModal={() => setMigrateOpen((open) => !open)}
                    onSubmit={handleMigrate}
                />
            )}

            {/* En portal, igual que la hoja: dentro de <main> lo taparian los botones flotantes. */}
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
                            <span className="min-w-0 flex-1 truncate font-medium">
                                {toast.error || toast.message || describeMoves(toast.moves)}
                            </span>
                            {toast.moves && toast.undoable && (
                                <button
                                    type="button"
                                    onClick={() => handleUndo(toast.moves)}
                                    className="shrink-0 font-semibold text-amber-400 hover:text-amber-300"
                                >
                                    {t('panel.assignment.undo')}
                                </button>
                            )}
                        </div>
                    </div>
                </PopPortal>
            )}
        </div>
    );
}
