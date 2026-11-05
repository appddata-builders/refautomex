import React, { useState } from 'react';
import { FaCircleExclamation, FaGlobe, FaLock, FaPlus, FaStore, FaTrashCan } from 'react-icons/fa6';
import { IoTicket } from 'react-icons/io5';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';
import Sheet, { SheetHeader } from './sheet';
import BranchTicket from './branch-ticket';
import { Field, INPUT_CLASS } from './product-form';
import { formatCount, isWebBranch, pluralKey } from './inventory-model';

const CREATE_TITLE_ID = 'inventarios-nueva-sucursal';
const DELETE_TITLE_ID = 'inventarios-eliminar-sucursal';

/**
 * Sucursales: alta, baja y datos del ticket. Una sucursal solo se borra si
 * nunca se uso (sin productos, ventas ni empleados); las demas llevan candado y
 * dicen por que. El servidor lo vuelve a revisar al borrar (deleteSucursal).
 */
export default function InventoryBranches({ branches, onChanged, notify }) {
    const { t } = useTranslation();
    const [ticketId, setTicketId] = useState(null);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [toDelete, setToDelete] = useState(null);
    const [busy, setBusy] = useState(false);
    const [sheetError, setSheetError] = useState('');

    const physical = branches.filter((branch) => !isWebBranch(branch));

    const lockReasons = (branch) => {
        if (isWebBranch(branch)) return t('panel.inventories.lockWeb');
        const uses = [
            branch.productos > 0 && t(pluralKey('panel.inventories.useProducts', branch.productos), { count: formatCount(branch.productos) }),
            branch.ventas > 0 && t(pluralKey('panel.inventories.useSales', branch.ventas), { count: formatCount(branch.ventas) }),
            branch.empleados > 0 && t(pluralKey('panel.inventories.useEmployees', branch.empleados), { count: formatCount(branch.empleados) }),
        ].filter(Boolean);
        return uses.length ? t('panel.inventories.lockUsed', { uses: uses.join(', ') }) : '';
    };

    const closeSheets = () => {
        if (busy) return;
        setCreating(false);
        setToDelete(null);
        setSheetError('');
    };

    const handleCreate = async (event) => {
        event.preventDefault();
        const clean = name.trim().replace(/\s+/g, ' ').toUpperCase();
        if (clean.length < 2) {
            setSheetError(t('panel.inventories.branchNameRequired'));
            return;
        }
        setBusy(true);
        setSheetError('');
        try {
            const response = await fetch(buildApiUrl('/newSucursal'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sucursal: clean }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.details || t('panel.inventories.branchCreateError'));
            setCreating(false);
            setName('');
            await onChanged();
            notify({
                message: t('panel.inventories.branchCreated', { branch: data.sucursal || clean }),
                action: { label: t('panel.addRegister.ticketsTitle'), onClick: () => setTicketId(data.idsucursal) },
            });
        } catch (error) {
            setSheetError(error.message);
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!toDelete) return;
        setBusy(true);
        setSheetError('');
        try {
            const response = await fetch(buildApiUrl('/deleteSucursal'), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idsucursal: toDelete.idsucursal }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.details || t('panel.inventories.branchDeleteError'));
            const removed = toDelete.sucursal;
            setToDelete(null);
            await onChanged();
            notify({ message: t('panel.inventories.branchDeleted', { branch: removed }) });
        } catch (error) {
            setSheetError(error.message);
            // Si alguien la uso mientras tanto, el candado tiene que aparecer.
            onChanged();
        } finally {
            setBusy(false);
        }
    };

    if (ticketId !== null && physical.length) {
        return (
            <BranchTicket
                branches={physical}
                branchId={ticketId}
                onBranchChange={setTicketId}
                onBack={() => setTicketId(null)}
                onSaved={() => onChanged()}
            />
        );
    }

    return (
        <>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {branches.map((branch) => {
                    const web = isWebBranch(branch);
                    const reason = lockReasons(branch);
                    const Icon = web ? FaGlobe : FaStore;
                    const stats = [
                        [t('panel.inventories.statProducts'), branch.productos],
                        [t('panel.inventories.statSales'), branch.ventas],
                        [t('panel.inventories.statEmployees'), branch.empleados],
                    ];
                    return (
                        <li key={branch.idsucursal} className="flex flex-col gap-3 rounded-2xl bg-[rgb(var(--color-bg))] p-4 shadow-sm">
                            <div className="flex items-start gap-3">
                                <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${web ? 'bg-sky-500/20' : 'bg-amber-500 text-slate-900'}`}>
                                    <Icon className="size-5" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <h3 className="truncate font-bold">{branch.sucursal}</h3>
                                    <p className="truncate text-xs text-[rgb(var(--color-gray-base))]">
                                        {web ? t('panel.inventories.webBranch') : branch.direccion || t('panel.inventories.noAddress')}
                                    </p>
                                </div>
                                {reason ? (
                                    <span
                                        title={reason}
                                        aria-label={reason}
                                        className="grid size-9 shrink-0 place-items-center rounded-full bg-[rgb(var(--color-gray))] text-[rgb(var(--color-gray-base))]"
                                    >
                                        <FaLock className="size-3.5" aria-hidden="true" />
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setToDelete(branch)}
                                        aria-label={t('panel.inventories.deleteBranch', { branch: branch.sucursal })}
                                        title={t('panel.inventories.deleteBranch', { branch: branch.sucursal })}
                                        className="grid size-9 shrink-0 place-items-center rounded-full text-[rgb(var(--color-error))] hover:bg-[rgb(var(--color-error))]/10"
                                    >
                                        <FaTrashCan className="size-3.5" aria-hidden="true" />
                                    </button>
                                )}
                            </div>

                            <dl className="grid grid-cols-3 gap-2">
                                {stats.map(([label, value]) => (
                                    <div key={label} className="min-w-0 rounded-xl bg-[rgb(var(--color-card))] px-2.5 py-2">
                                        <dt className="truncate text-[11px] text-[rgb(var(--color-gray-base))]">{label}</dt>
                                        <dd className="text-lg font-bold tabular-nums">{formatCount(value)}</dd>
                                    </div>
                                ))}
                            </dl>

                            <p className="flex items-start gap-1.5 text-xs text-[rgb(var(--color-gray-base))]">
                                {reason ? <FaLock className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> : <FaTrashCan className="mt-0.5 size-3 shrink-0" aria-hidden="true" />}
                                {reason || t('panel.inventories.canDelete')}
                            </p>

                            {!web && (
                                <button
                                    type="button"
                                    onClick={() => setTicketId(branch.idsucursal)}
                                    className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--color-border))] text-sm font-semibold hover:border-amber-400 hover:bg-amber-400/15"
                                >
                                    <IoTicket className="size-4 text-amber-500" aria-hidden="true" />
                                    {t('panel.addRegister.ticketsTitle')}
                                </button>
                            )}
                        </li>
                    );
                })}

                <li>
                    <button
                        type="button"
                        onClick={() => {
                            setCreating(true);
                            setSheetError('');
                        }}
                        className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[rgb(var(--color-border))] p-4 text-[rgb(var(--color-gray-base))] transition hover:border-amber-400 hover:text-[rgb(var(--color-text))]"
                    >
                        <span className="grid size-11 place-items-center rounded-full bg-amber-500 text-slate-900 shadow">
                            <FaPlus className="size-4" aria-hidden="true" />
                        </span>
                        <span className="font-semibold">{t('panel.inventories.newBranch')}</span>
                        <span className="text-xs">{t('panel.inventories.newBranchHint')}</span>
                    </button>
                </li>
            </ul>

            <Sheet isOpen={creating} onClose={closeSheets} locked={busy} labelledBy={CREATE_TITLE_ID}>
                <form onSubmit={handleCreate} className="space-y-4">
                    <SheetHeader
                        icon={FaStore}
                        title={t('panel.inventories.newBranch')}
                        titleId={CREATE_TITLE_ID}
                        subtitle={t('panel.inventories.newBranchSubtitle')}
                        onClose={closeSheets}
                        closeDisabled={busy}
                    />
                    <Field label={t('panel.inventories.branchName')} error={sheetError}>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value.toUpperCase());
                                setSheetError('');
                            }}
                            maxLength={45}
                            autoComplete="off"
                            placeholder="ATIZAPAN"
                            className={`${INPUT_CLASS} uppercase`}
                        />
                    </Field>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={closeSheets} disabled={busy} className="h-11 rounded-xl px-4 font-semibold hover:bg-[rgb(var(--color-text))]/10">
                            {t('panel.common.cancel')}
                        </button>
                        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow hover:bg-amber-400 disabled:opacity-60">
                            {busy ? t('panel.providers.saving') : t('panel.inventories.createBranch')}
                        </button>
                    </div>
                </form>
            </Sheet>

            <Sheet isOpen={Boolean(toDelete)} onClose={closeSheets} locked={busy} labelledBy={DELETE_TITLE_ID}>
                <SheetHeader
                    icon={FaTrashCan}
                    title={t('panel.inventories.deleteTitle', { branch: toDelete?.sucursal || '' })}
                    titleId={DELETE_TITLE_ID}
                    subtitle={t('panel.inventories.deleteSubtitle')}
                    onClose={closeSheets}
                    closeDisabled={busy}
                />
                {sheetError && (
                    <p role="alert" className="flex items-center gap-2 rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2 text-sm text-[rgb(var(--color-error))]">
                        <FaCircleExclamation className="size-4 shrink-0" aria-hidden="true" />
                        {sheetError}
                    </p>
                )}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={closeSheets} disabled={busy} className="h-11 rounded-xl px-4 font-semibold hover:bg-[rgb(var(--color-text))]/10">
                        {t('panel.common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={busy}
                        className="h-11 rounded-xl bg-red-600 px-5 font-semibold text-white shadow hover:bg-red-500 disabled:opacity-60"
                    >
                        {busy ? t('panel.common.deleting') : t('panel.common.delete')}
                    </button>
                </div>
            </Sheet>
        </>
    );
}
