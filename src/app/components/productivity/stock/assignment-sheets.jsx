import React, { useMemo, useState } from 'react';
import {
    FaCircleExclamation,
    FaLayerGroup,
    FaLocationDot,
    FaParachuteBox,
    FaPlus,
    FaRightLeft,
    FaTriangleExclamation,
} from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';
import { SheetHeader } from './sheet';
import MatrixPicker from './matrix-picker';
import { StockPill } from './assignment-map';
import {
    firstFreeIndex,
    isSpecialLevel,
    isValidLocation,
    matrixCode,
    matrixSlots,
    splitMatrix,
} from './locations';

// Todas las vistas de la hoja comparten este id: la hoja se titula con el
// encabezado de la vista que este arriba.
export const SHEET_TITLE_ID = 'assignment-sheet-title';

const EMPTY_MATRIX = { anaquel: '', nivel: '', seccion: '' };

function ErrorNote({ message }) {
    if (!message) return null;
    return (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2.5 text-sm font-medium text-[rgb(var(--color-error))]">
            <FaCircleExclamation className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{message}</span>
        </div>
    );
}

export function MatrixDetail({ code, matrix, busyPart, error, onMove, onUnassign, onAddHere, onClose }) {
    const { t } = useTranslation();
    const items = matrix?.items || [];
    const special = isSpecialLevel(code);
    const { anaquel, nivel, seccion } = splitMatrix(code);

    return (
        <>
            <SheetHeader
                icon={FaLayerGroup}
                title={special ? t('panel.assignment.area', { code }) : t('panel.assignment.matrix', { code })}
                titleId={SHEET_TITLE_ID}
                subtitle={special
                    ? t('panel.assignment.areaHint', { code })
                    : t('panel.assignment.matrixPath', { shelf: anaquel, level: nivel, section: seccion })}
                onClose={onClose}
            />

            {matrix?.hasConflict && (
                <div role="note" className="flex items-start gap-2.5 rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2.5 text-sm text-[rgb(var(--color-error))]">
                    <FaTriangleExclamation className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{t('panel.assignment.conflictHint')}</span>
                </div>
            )}

            {items.length ? (
                <ul className="space-y-2">
                    {items.map((item) => (
                        <li
                            key={item.num_parte}
                            className={`flex items-center gap-3 rounded-2xl border p-3 ${item.conflict
                                ? 'border-[rgb(var(--color-error))]/50 bg-[rgb(var(--color-error))]/10'
                                : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'}`}
                        >
                            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[rgb(var(--color-text))] font-mono text-sm font-bold text-[rgb(var(--color-bg))]">
                                -{item.index}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-mono text-sm font-semibold">{item.num_parte}</span>
                                <span className="block truncate text-xs text-[rgb(var(--color-gray-base))]">{item.descripcion}</span>
                                <span className="mt-1 block"><StockPill existencia={item.existencia} /></span>
                            </span>
                            <span className="flex shrink-0 flex-col gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => onMove(item)}
                                    disabled={Boolean(busyPart)}
                                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-40"
                                >
                                    {t('panel.assignment.move')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onUnassign(item)}
                                    disabled={Boolean(busyPart)}
                                    className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-medium transition hover:bg-[rgb(var(--color-text))]/5 disabled:opacity-40"
                                >
                                    {busyPart === item.num_parte ? t('panel.assignment.saving') : t('panel.assignment.unassign')}
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] px-4 py-6 text-center text-sm text-[rgb(var(--color-gray-base))]">
                    {t('panel.assignment.matrixEmpty')}
                </p>
            )}

            <ErrorNote message={error} />

            <button
                type="button"
                onClick={onAddHere}
                disabled={Boolean(busyPart)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-semibold text-slate-900 shadow transition hover:bg-amber-400 disabled:opacity-40"
            >
                <FaPlus className="size-4" aria-hidden="true" />
                {t('panel.assignment.assignHere')}
            </button>
        </>
    );
}

/**
 * Elegir matriz (o nivel especial) y posicion para un producto. Las posiciones
 * se ven con lo que hay en cada una: una libre se asigna, una ocupada se
 * intercambia, y una con dos productos (conflicto) no se puede usar hasta
 * resolverlo. `initialMatrix` llega con el anaquel que se esta trabajando.
 */
export function PlaceForm({ product, initialMatrix, matrices, saving, error, onSubmit, onBack, onClose }) {
    const { t } = useTranslation();
    const [matrix, setMatrix] = useState(() => ({ ...EMPTY_MATRIX, ...initialMatrix }));
    // El indice elegido vale solo para la matriz en la que se eligio: al cambiar
    // de matriz se vuelve a proponer la primera posicion libre.
    const [picked, setPicked] = useState({ code: null, index: null });

    const code = matrixCode(matrix);
    const slots = useMemo(
        () => (code ? matrixSlots(matrices.get(code)?.items, product.num_parte) : []),
        [code, matrices, product.num_parte]
    );
    const chosenIndex = picked.code === code ? picked.index : firstFreeIndex(slots);
    const slot = slots.find((candidate) => candidate.index === chosenIndex);
    const target = code && chosenIndex ? `${code}-${chosenIndex}` : '';
    const occupants = slot?.occupants || [];
    const isSwap = occupants.length === 1;
    const isBlocked = occupants.length > 1;
    const isSame = Boolean(slot?.isCurrent);
    const fromLocation = isValidLocation(product.localizacion) ? product.localizacion : '';
    const canSubmit = Boolean(target) && !isSame && !isBlocked && !saving;

    let summary = t('panel.assignment.summaryMove', { product: product.num_parte, location: target });
    if (!target) summary = t('panel.assignment.pickMatrix');
    else if (isSame) summary = t('panel.assignment.sameLocation');
    else if (isBlocked) summary = t('panel.assignment.conflictHint');
    else if (isSwap) {
        summary = t('panel.assignment.summarySwap', {
            product: product.num_parte,
            location: target,
            other: occupants[0].num_parte,
            otherLocation: fromLocation || t('panel.assignment.unassignedLabel'),
        });
    }

    const handleMatrixChange = (field, value) => setMatrix((current) => ({ ...current, [field]: value }));

    return (
        <>
            <SheetHeader
                icon={FaLocationDot}
                title={t('panel.assignment.placeTitle', { product: product.num_parte })}
                titleId={SHEET_TITLE_ID}
                subtitle={product.descripcion}
                onClose={onClose}
                closeDisabled={saving}
            />

            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[rgb(var(--color-gray-base))]">{t('panel.assignment.current')}:</span>
                <span className="rounded-lg bg-[rgb(var(--color-gray))] px-2 py-1 font-mono text-xs font-semibold">
                    {fromLocation || t('panel.assignment.unassignedLabel')}
                </span>
                <StockPill existencia={product.existencia} />
            </div>

            <MatrixPicker
                label={t('panel.migrate.target').replace(/:\s*$/, '')}
                icon={FaParachuteBox}
                iconClassName="text-amber-600"
                value={matrix}
                onChange={handleMatrixChange}
                allowSpecial
            />

            {code && (
                <section>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">
                        {t('panel.assignment.position')}
                    </h4>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {slots.map((candidate) => {
                            const selected = candidate.index === chosenIndex;
                            const taken = candidate.occupants.length;
                            let tone = 'border-dashed border-[rgb(var(--color-border))]';
                            if (taken > 1) tone = 'border-[rgb(var(--color-error))]/50 bg-[rgb(var(--color-error))]/10 text-[rgb(var(--color-error))]';
                            else if (taken) tone = 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]';
                            if (selected) tone = 'border-amber-500 bg-amber-400/20 ring-2 ring-amber-400';

                            let caption = t('panel.assignment.free');
                            if (candidate.isCurrent) caption = t('panel.assignment.current');
                            else if (taken) caption = candidate.occupants.map((occupant) => occupant.num_parte).join(', ');

                            return (
                                <button
                                    key={candidate.index}
                                    type="button"
                                    onClick={() => setPicked({ code, index: candidate.index })}
                                    aria-pressed={selected}
                                    className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 py-1.5 transition ${tone}`}
                                >
                                    <span className="font-mono text-base font-bold">-{candidate.index}</span>
                                    <span className="w-full truncate text-center text-[10px] text-[rgb(var(--color-gray-base))]">{caption}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            <p
                aria-live="polite"
                className={`min-h-10 text-center text-sm leading-snug ${isSwap || isBlocked ? 'font-medium text-amber-600' : 'text-[rgb(var(--color-gray-base))]'}`}
            >
                {summary}
            </p>

            <ErrorNote message={error} />

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                    type="button"
                    onClick={onBack || onClose}
                    disabled={saving}
                    className="h-12 rounded-xl border border-[rgb(var(--color-border))] px-5 font-medium transition hover:bg-[rgb(var(--color-text))]/5 disabled:opacity-50 sm:h-11"
                >
                    {onBack ? t('panel.common.goBack') : t('panel.common.cancel')}
                </button>
                <button
                    type="button"
                    onClick={() => onSubmit({ localizacion: target, intercambiar: isSwap })}
                    disabled={!canSubmit}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40 sm:h-11"
                >
                    {saving ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" aria-hidden="true" />
                    ) : isSwap && <FaRightLeft className="size-4" aria-hidden="true" />}
                    {saving && t('panel.assignment.saving')}
                    {!saving && (isSwap ? t('panel.assignment.swap') : t('panel.assignment.assign'))}
                </button>
            </div>
        </>
    );
}
