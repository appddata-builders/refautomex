import React, { useMemo, useRef, useState } from 'react';
import {
    FaCheck,
    FaCircleCheck,
    FaCircleExclamation,
    FaCopy,
    FaGlobe,
    FaLock,
    FaPlus,
    FaStore,
    FaTrashCan,
    FaXmark,
} from 'react-icons/fa6';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';
import FindProducts from '../sales/find-products';
import Sheet, { SheetHeader } from './sheet';
import { INPUT_CLASS } from './product-form';
import { UNASSIGNED } from './locations';
import {
    UTILITIES,
    branchIdsOf,
    eligibility,
    financeFor,
    formatCount,
    formatMoney,
    pluralKey,
    hasGroup,
    isWebBranch,
    newBatchRow,
    repeatedLocationsOf,
    validateBatchRow,
} from './inventory-model';

const postJson = async (path, method, body) => {
    const response = await fetch(buildApiUrl(path), {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
};

const REMOVE_TITLE_ID = 'inventarios-quitar-producto';

function StepTitle({ step, done, children, aside }) {
    return (
        <div className="flex items-center gap-2">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-[rgb(var(--color-success))] text-white' : 'bg-amber-500 text-slate-900'}`}>
                {done ? <FaCheck className="size-3" aria-hidden="true" /> : step}
            </span>
            <h3 className="min-w-0 flex-1 truncate font-bold">{children}</h3>
            {aside}
        </div>
    );
}

/**
 * Asignar a sucursal: el detalle (ubicacion, existencia, precio) de uno o
 * varios productos en una sucursal, de una vez. A la izquierda la lista de
 * productos por estado; a la derecha la sucursal destino y el lote. Al guardar
 * se da de alta cada renglon con /newProductDetail; los que fallan se quedan en
 * el lote con su motivo y los que entran salen de el.
 *
 * El lote y la sucursal viven en Inventarios: asi Estado de productos y el
 * alta pueden mandar productos aqui sin perder lo que ya se capturo.
 */
export default function InventoryAssign({
    products,
    productsByPart,
    branches,
    groups,
    branchId,
    onBranchChange,
    filter,
    onFilterChange,
    batch,
    setBatch,
    onSaved,
    onRemoved,
}) {
    const { t } = useTranslation();
    const [progress, setProgress] = useState(null);
    // Producto que se va a quitar de la sucursal elegida (hoja de confirmacion).
    const [removing, setRemoving] = useState(null);
    const [removeBusy, setRemoveBusy] = useState(false);
    const [removeError, setRemoveError] = useState('');
    const finderRef = useRef(null);

    const branch = branches.find((item) => String(item.idsucursal) === String(branchId)) || null;
    const web = isWebBranch(branch);
    const saving = progress !== null;
    const inBatch = useMemo(() => new Set(batch.map((row) => row.num_parte)), [batch]);

    const branchCounts = useMemo(() => {
        const counts = new Map();
        products.active.forEach((product) => {
            branchIdsOf(product).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
        });
        return counts;
    }, [products.active]);

    const addProduct = (product) => {
        if (inBatch.has(product.num_parte)) {
            setBatch((rows) => rows.filter((row) => row.num_parte !== product.num_parte));
            return;
        }
        setBatch((rows) => [...rows, newBatchRow(product)]);
    };

    const updateRow = (part, patch) => {
        setBatch((rows) => rows.map((row) => {
            if (row.num_parte !== part) return row;
            const cleared = Object.keys(patch).reduce((acc, field) => ({ ...acc, [field]: undefined }), row.errors || {});
            return { ...row, ...patch, errors: cleared, error: '' };
        }));
    };

    const removeRow = (part) => setBatch((rows) => rows.filter((row) => row.num_parte !== part));

    const copyFrom = (part, detail) => {
        const location = String(detail.localizacion || '').trim().toUpperCase();
        updateRow(part, {
            localizacion: location === UNASSIGNED ? '' : location,
            precio: detail.precio ? String(detail.precio) : '',
            utilidad: detail.utilidad ? Number(detail.utilidad) : UTILITIES[1],
        });
    };

    const eligibilityMessage = (result) => {
        return result.reason === 'already' ? t('panel.inventories.alreadyInBranch', { branch: branch?.sucursal }) : '';
    };

    const finderViews = [
        {
            id: 'pending',
            label: t('panel.inventories.tabPending'),
            filter: (product) => productsByPart.get(product.num_parte)?.status === 'E',
            emptyMessage: t('panel.inventories.empty_pending'),
        },
        {
            id: 'missing',
            label: branch ? t('panel.inventories.tabMissingIn', { branch: branch.sucursal }) : t('panel.inventories.tabMissing'),
            filter: (product) => {
                const model = productsByPart.get(product.num_parte);
                return Boolean(branch && model?.status === 'A' && eligibility(model, branch).ok);
            },
            emptyMessage: branch ? t('panel.inventories.empty_missing') : t('panel.inventories.pickBranchForMissing'),
        },
        ...(branch ? [{
            id: 'inBranch',
            label: t('panel.inventories.tabInBranch', { branch: branch.sucursal }),
            filter: (product) => branchIdsOf(productsByPart.get(product.num_parte)).has(String(branch.idsucursal)),
            emptyMessage: t('panel.inventories.empty_inBranch'),
        }] : []),
        { id: 'all', label: t('panel.inventories.tabAll'), emptyMessage: t('panel.inventories.empty_all') },
    ];

    // El boton de cada producto en el buscador, segun el lote y la sucursal.
    const productAction = (product) => {
        const model = productsByPart.get(product.num_parte);
        if (!model) return null;
        if (inBatch.has(model.num_parte)) {
            return { label: t('panel.inventories.inBatch'), tone: 'added', icon: FaCheck, iconOnly: true, onClick: () => addProduct(model), title: t('panel.inventories.removeFromBatch', { part: model.num_parte }) };
        }
        // Lo que ya esta en la sucursal elegida se puede quitar de ella.
        if (branch && !eligibility(model, branch).ok) {
            return {
                label: t('panel.inventories.removeFromBranch', { branch: branch.sucursal }),
                tone: 'danger',
                icon: FaTrashCan,
                iconOnly: true,
                onClick: () => {
                    setRemoveError('');
                    setRemoving(model);
                },
            };
        }
        return { label: t('panel.assignment.add'), tone: 'primary', icon: FaPlus, iconOnly: true, onClick: () => addProduct(model), title: t('panel.inventories.addToBatch', { part: model.num_parte }) };
    };

    const rowIssue = (row) => {
        const product = productsByPart.get(row.num_parte);
        if (!product) return t('panel.inventories.productGone');
        if (!branch) return '';
        const result = eligibility(product, branch);
        return result.ok ? '' : eligibilityMessage(result);
    };

    // Quitar un producto de la sucursal elegida (/deleteProductDetail). Sus
    // ventas y compras no se tocan; si no queda en ninguna sucursal vuelve a
    // "Sin asignar" (status 'E').
    const handleRemove = async () => {
        if (!removing || !branch) return;
        setRemoveBusy(true);
        setRemoveError('');
        try {
            const response = await fetch(buildApiUrl('/deleteProductDetail'), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refaccion: removing.num_parte, idsucursal: branch.idsucursal }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.details || t('panel.inventories.removeError'));
            const part = removing.num_parte;
            setRemoving(null);
            finderRef.current?.refreshProducts?.();
            onRemoved({ part, branch: branch.sucursal });
        } catch (error) {
            setRemoveError(error.message);
        } finally {
            setRemoveBusy(false);
        }
    };

    const removingHere = removing ? removing.detalles.filter((detail) => String(detail.idsucursal) === String(branch?.idsucursal)) : [];
    const removingStock = removingHere.reduce((acc, detail) => acc + (Number(detail.existencia) || 0), 0);
    const removingKeeps = removing
        ? [...new Set(removing.detalles.filter((detail) => String(detail.idsucursal) !== String(branch?.idsucursal)).map((detail) => detail.sucursal))]
        : [];

    const blocked = batch.some((row) => rowIssue(row));

    const handleSave = async () => {
        if (!branch || !batch.length || saving) return;

        const repeated = web ? new Set() : repeatedLocationsOf(batch);
        const checked = batch.map((row) => ({
            ...row,
            localizacion: row.localizacion.trim().toUpperCase(),
            errors: validateBatchRow(row, { web, repeatedLocations: repeated }),
            error: '',
        }));
        if (checked.some((row) => Object.keys(row.errors).length) || blocked) {
            setBatch(checked);
            return;
        }

        const pendingRows = [...checked];
        let saved = 0;
        setProgress({ done: 0, total: pendingRows.length });

        for (let i = 0; i < pendingRows.length; i += 1) {
            const row = pendingRows[i];
            const product = productsByPart.get(row.num_parte);
            const location = web ? UNASSIGNED : row.localizacion || UNASSIGNED;
            const { aiva, costo } = financeFor(row.precio, row.utilidad);
            try {
                if (location !== UNASSIGNED) {
                    const params = new URLSearchParams({ localizacion: location, idsucursal: branch.idsucursal, num_parte: row.num_parte });
                    const response = await fetch(`${buildApiUrl('/verifyLocation')}?${params}`, { cache: 'no-store' });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(t('panel.warehouse.locationCheckError'));
                    if (data.exists) {
                        pendingRows[i] = { ...row, errors: { localizacion: 'locationTaken' } };
                        continue;
                    }
                }

                // Si se eligio grupo para WEB se guarda antes del detalle, con la
                // fila completa de producto porque patchProduct la reescribe. Es
                // opcional: sin grupo, el sitio lo muestra en "Otros".
                if (web && !hasGroup(product) && hasGroup(row)) {
                    const group = await postJson('/patchProduct', 'PATCH', {
                        refaccion: row.num_parte,
                        idsucursal: branch.idsucursal,
                        localizacion: UNASSIGNED,
                        descripcion: product.descripcion,
                        existencia: '0',
                        costo,
                        precio: row.precio,
                        utilidad: row.utilidad,
                        mod_ini: product.mod_ini ?? '',
                        mod_fin: product.mod_fin ?? '',
                        idmarca: product.idmarca ?? '',
                        idgrupo: row.idgrupo,
                        idcategoria: product.idcategoria || 1,
                    });
                    if (!group.ok) throw new Error(t('panel.addRegister.webGroupError'));
                }

                const result = await postJson('/newProductDetail', 'POST', {
                    refaccion: row.num_parte,
                    idsucursal: branch.idsucursal,
                    localizacion: location,
                    existencia: web ? '0' : String(row.existencia).trim(),
                    costo,
                    precio: row.precio,
                    aiva,
                    utilidad: row.utilidad,
                    status: 'A',
                });
                if (!result.ok) throw new Error(result.data?.details || t('panel.addRegister.detailRetry'));
                pendingRows[i] = null;
                saved += 1;
            } catch (error) {
                pendingRows[i] = { ...row, error: error.message };
            } finally {
                setProgress({ done: i + 1, total: pendingRows.length });
            }
        }

        const left = pendingRows.filter(Boolean);
        setBatch(left);
        setProgress(null);
        onSaved({ saved, failed: left.length, branch: branch.sucursal });
        // Las insignias de sucursal del buscador vienen de su propia carga.
        if (saved) finderRef.current?.refreshProducts?.();
    };

    const fieldError = (row, field) => {
        const key = row.errors?.[field];
        return key ? t(`panel.inventories.${key}`, { location: row.localizacion }) : '';
    };

    const groupOptions = groups.filter((option) => option.label && String(option.value) !== '0');

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
            {/* El buscador de todo el panel, con las pestanas de este modulo. El
                boton de cada producto lo agrega o lo quita del lote. */}
            <section className="min-w-0 overflow-hidden rounded-2xl bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))] lg:sticky lg:top-24">
                <FindProducts
                    ref={finderRef}
                    branch={branch ? { id: branch.idsucursal, label: branch.sucursal } : undefined}
                    showAllBranches
                    includePendingProducts
                    views={finderViews}
                    view={filter}
                    onViewChange={onFilterChange}
                    productAction={productAction}
                    listClassName="max-h-[60vh] lg:max-h-[calc(100dvh-22rem)]"
                />
            </section>

            <section className="min-w-0 space-y-5 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-5">
                <div className="space-y-3">
                    <StepTitle step="1" done={Boolean(branch)}>{t('panel.inventories.targetBranch')}</StepTitle>
                    <div role="radiogroup" aria-label={t('panel.inventories.targetBranch')} className="flex flex-wrap gap-2">
                        {branches.map((item) => {
                            const selected = String(item.idsucursal) === String(branchId);
                            const Icon = isWebBranch(item) ? FaGlobe : FaStore;
                            return (
                                <button
                                    key={item.idsucursal}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    disabled={saving}
                                    onClick={() => onBranchChange(item.idsucursal)}
                                    className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition ${selected
                                        ? 'border-amber-500 bg-amber-500 text-slate-900 shadow'
                                        : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] hover:border-amber-400'}`}
                                >
                                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                                    <span className="leading-tight">
                                        <span className="block text-sm font-semibold">{item.sucursal}</span>
                                        <span className={`block text-xs ${selected ? 'text-slate-900/70' : 'text-[rgb(var(--color-gray-base))]'}`}>
                                            {t(pluralKey('panel.inventories.branchProducts', branchCounts.get(String(item.idsucursal))), { count: formatCount(branchCounts.get(String(item.idsucursal)) || 0) })}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {web && <p className="text-xs text-[rgb(var(--color-gray-base))]">{t('panel.inventories.webRule')}</p>}
                </div>

                <div className="space-y-3">
                    <StepTitle
                        step="2"
                        done={batch.length > 0}
                        aside={batch.length > 0 && !saving && (
                            <button
                                type="button"
                                onClick={() => setBatch([])}
                                className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10"
                            >
                                {t('panel.inventories.clearBatch')}
                            </button>
                        )}
                    >
                        {t('panel.inventories.batchTitle', { count: batch.length })}
                    </StepTitle>

                    {batch.length === 0 ? (
                        <ol className="grid gap-2 rounded-2xl border border-dashed border-[rgb(var(--color-border))] p-4 text-sm sm:grid-cols-2">
                            {['guideBranch', 'guideAdd', 'guideFill', 'guideSave'].map((key, index) => (
                                <li key={key} className="flex gap-2">
                                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[rgb(var(--color-gray))] text-xs font-bold">{index + 1}</span>
                                    <span className="text-[rgb(var(--color-gray-base))]">{t(`panel.inventories.${key}`)}</span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <>
                            {!web && <p className="text-xs text-[rgb(var(--color-gray-base))]">{t('panel.inventories.locationHint')}</p>}
                            <ul className="space-y-3">
                                {batch.map((row) => {
                                    const product = productsByPart.get(row.num_parte);
                                    const issue = rowIssue(row);
                                    const { aiva, costo } = financeFor(row.precio, row.utilidad);
                                    const utilityOptions = UTILITIES.includes(Number(row.utilidad))
                                        ? UTILITIES
                                        : [...UTILITIES, Number(row.utilidad)].filter((value) => value > 0).sort((a, b) => a - b);
                                    const others = (product?.detalles || []).filter((detail) => String(detail.idsucursal) !== String(branchId) && !isWebBranch(detail));
                                    const hasErrors = issue || row.error || Object.values(row.errors || {}).some(Boolean);
                                    return (
                                        <li
                                            key={row.num_parte}
                                            className={`space-y-3 rounded-2xl border bg-[rgb(var(--color-bg))] p-3 ${hasErrors ? 'border-[rgb(var(--color-error))]/60' : 'border-[rgb(var(--color-border))]'}`}
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-semibold tabular-nums">
                                                        {row.num_parte}
                                                        {product?.status === 'E' && (
                                                            <span className="ml-2 rounded-full bg-amber-400/25 px-2 align-middle text-xs font-semibold">{t('panel.inventories.badgePending')}</span>
                                                        )}
                                                    </p>
                                                    <p className="truncate text-sm text-[rgb(var(--color-gray-base))]">{product?.descripcion}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeRow(row.num_parte)}
                                                    disabled={saving}
                                                    aria-label={t('panel.inventories.removeFromBatch', { part: row.num_parte })}
                                                    className="grid size-9 shrink-0 place-items-center rounded-full text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10 disabled:opacity-40"
                                                >
                                                    <FaXmark className="size-4" />
                                                </button>
                                            </div>

                                            {issue ? (
                                                <p role="alert" className="flex items-center gap-2 text-sm text-[rgb(var(--color-error))]">
                                                    <FaLock className="size-3.5 shrink-0" aria-hidden="true" />
                                                    {issue}
                                                </p>
                                            ) : (
                                                <>
                                                    {web ? (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <p className="col-span-2 text-xs text-[rgb(var(--color-gray-base))]">{t('panel.inventories.webNoStock')}</p>
                                                            {!hasGroup(product) && (
                                                                <label className="col-span-2 block">
                                                                    <span className="mb-1 block text-xs font-medium">{t('panel.inventories.webGroupOptional')}</span>
                                                                    <select
                                                                        value={row.idgrupo}
                                                                        onChange={(e) => updateRow(row.num_parte, { idgrupo: e.target.value })}
                                                                        disabled={saving}
                                                                        className={INPUT_CLASS}
                                                                    >
                                                                        <option value="">{t('panel.addRegister.pickGroupPlaceholder')}</option>
                                                                        {groupOptions.map((option) => (
                                                                            <option key={option.value} value={option.value}>{option.label}</option>
                                                                        ))}
                                                                    </select>
                                                                    {fieldError(row, 'idgrupo') && <span className="mt-1 block text-xs text-[rgb(var(--color-error))]">{fieldError(row, 'idgrupo')}</span>}
                                                                </label>
                                                            )}
                                                        </div>
                                                    ) : null}
                                                    <div className={`grid gap-2 ${web ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
                                                        {!web && (
                                                            <>
                                                                <label className="block min-w-0">
                                                                    <span className="mb-1 block text-xs font-medium">{t('panel.tableDesc.locationTitle')}</span>
                                                                    <input
                                                                        type="text"
                                                                        value={row.localizacion}
                                                                        onChange={(e) => updateRow(row.num_parte, { localizacion: e.target.value.toUpperCase() })}
                                                                        placeholder={t('panel.assignment.statUnassigned')}
                                                                        disabled={saving}
                                                                        autoComplete="off"
                                                                        className={`${INPUT_CLASS} uppercase`}
                                                                    />
                                                                    {fieldError(row, 'localizacion') && <span className="mt-1 block text-xs text-[rgb(var(--color-error))]">{fieldError(row, 'localizacion')}</span>}
                                                                </label>
                                                                <label className="block min-w-0">
                                                                    <span className="mb-1 block text-xs font-medium">{t('panel.tableDesc.stockTitle')}</span>
                                                                    <input
                                                                        type="number"
                                                                        inputMode="numeric"
                                                                        min="0"
                                                                        step="1"
                                                                        value={row.existencia}
                                                                        onChange={(e) => updateRow(row.num_parte, { existencia: e.target.value })}
                                                                        disabled={saving}
                                                                        className={`${INPUT_CLASS} tabular-nums`}
                                                                    />
                                                                    {fieldError(row, 'existencia') && <span className="mt-1 block text-xs text-[rgb(var(--color-error))]">{fieldError(row, 'existencia')}</span>}
                                                                </label>
                                                            </>
                                                        )}
                                                        <label className="block min-w-0">
                                                            <span className="mb-1 block text-xs font-medium">{t('panel.addRegister.utility')}</span>
                                                            <select
                                                                value={row.utilidad}
                                                                onChange={(e) => updateRow(row.num_parte, { utilidad: Number(e.target.value) })}
                                                                disabled={saving}
                                                                className={INPUT_CLASS}
                                                            >
                                                                {utilityOptions.map((value) => (
                                                                    <option key={value} value={value}>{Math.round((value - 1) * 100)}%</option>
                                                                ))}
                                                            </select>
                                                        </label>
                                                        <label className="block min-w-0">
                                                            <span className="mb-1 block text-xs font-medium">{t('panel.inventories.priceWithTax')}</span>
                                                            <span className="relative block">
                                                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-gray-base))]">$</span>
                                                                <input
                                                                    type="number"
                                                                    inputMode="decimal"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={row.precio}
                                                                    onChange={(e) => updateRow(row.num_parte, { precio: e.target.value })}
                                                                    disabled={saving}
                                                                    className={`${INPUT_CLASS} pl-7 tabular-nums`}
                                                                />
                                                            </span>
                                                            {fieldError(row, 'precio') && <span className="mt-1 block text-xs text-[rgb(var(--color-error))]">{fieldError(row, 'precio')}</span>}
                                                        </label>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[rgb(var(--color-gray-base))]">
                                                        <span className="tabular-nums">{t('panel.capture.cost')}: <strong className="text-[rgb(var(--color-text))]">{formatMoney(costo)}</strong></span>
                                                        <span className="tabular-nums">{t('panel.addRegister.aiva')}: <strong className="text-[rgb(var(--color-text))]">{formatMoney(aiva)}</strong></span>
                                                        {others.map((detail) => (
                                                            <button
                                                                key={detail.idsucursal}
                                                                type="button"
                                                                onClick={() => copyFrom(row.num_parte, detail)}
                                                                disabled={saving}
                                                                className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--color-border))] px-2 py-0.5 font-medium hover:border-amber-400 hover:text-[rgb(var(--color-text))]"
                                                            >
                                                                <FaCopy className="size-3" aria-hidden="true" />
                                                                {t('panel.inventories.copyFrom', { branch: detail.sucursal })}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}

                                            {row.error && (
                                                <p role="alert" className="flex items-center gap-2 text-sm text-[rgb(var(--color-error))]">
                                                    <FaCircleExclamation className="size-3.5 shrink-0" aria-hidden="true" />
                                                    {row.error}
                                                </p>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>

                <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl bg-[rgb(var(--color-bg))] p-3 shadow-lg sm:flex-row sm:items-center">
                    <p className="min-w-0 flex-1 text-sm text-[rgb(var(--color-gray-base))]">
                        {saving
                            ? t('panel.inventories.savingProgress', { done: progress.done, total: progress.total })
                            : !branch
                                ? t('panel.inventories.pickBranchFirst')
                                : batch.length === 0
                                    ? t('panel.inventories.batchEmpty')
                                    : blocked
                                        ? t('panel.inventories.batchBlocked')
                                        : t(pluralKey('panel.inventories.batchReady', batch.length), { count: batch.length, branch: branch.sucursal })}
                    </p>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!branch || batch.length === 0 || saving || blocked}
                        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {saving
                            ? <span className="size-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" aria-hidden="true" />
                            : <FaCircleCheck className="size-4" aria-hidden="true" />}
                        {t('panel.inventories.saveBatch', { count: batch.length })}
                    </button>
                </div>
            </section>

            <Sheet isOpen={Boolean(removing)} onClose={() => !removeBusy && setRemoving(null)} locked={removeBusy} labelledBy={REMOVE_TITLE_ID}>
                <SheetHeader
                    icon={FaTrashCan}
                    title={t('panel.inventories.removeTitle', { part: removing?.num_parte || '', branch: branch?.sucursal || '' })}
                    titleId={REMOVE_TITLE_ID}
                    subtitle={removing?.descripcion}
                    onClose={() => setRemoving(null)}
                    closeDisabled={removeBusy}
                />
                <ul className="space-y-2 text-sm">
                    <li>
                        {removingKeeps.length
                            ? t('panel.inventories.removeKeeps', { branches: removingKeeps.join(', ') })
                            : t('panel.inventories.removeToPending')}
                    </li>
                    {removingStock > 0 && (
                        <li className="flex items-start gap-2 rounded-xl bg-amber-400/20 p-2">
                            <FaCircleExclamation className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                            {t('panel.inventories.removeStockWarn', { count: removingStock })}
                        </li>
                    )}
                    <li className="text-[rgb(var(--color-gray-base))]">{t('panel.inventories.removeSalesNote')}</li>
                </ul>
                {removeError && <p role="alert" className="rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2 text-sm text-[rgb(var(--color-error))]">{removeError}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setRemoving(null)} disabled={removeBusy} className="h-11 rounded-xl px-4 font-semibold hover:bg-[rgb(var(--color-text))]/10">
                        {t('panel.common.cancel')}
                    </button>
                    <button type="button" onClick={handleRemove} disabled={removeBusy} className="h-11 rounded-xl bg-red-600 px-5 font-semibold text-white shadow hover:bg-red-500 disabled:opacity-60">
                        {removeBusy ? t('panel.common.deleting') : t('panel.inventories.removeConfirm', { branch: branch?.sucursal || '' })}
                    </button>
                </div>
            </Sheet>
        </div>
    );
}
