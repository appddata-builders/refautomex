import React, { useEffect, useMemo, useState } from 'react';
import {
    FaCircleExclamation,
    FaLayerGroup,
    FaLocationDot,
    FaMinus,
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
    LEVELS,
    MAX_INDEX,
    SPECIAL_LEVELS,
    displacedLocation,
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

// El contenedor `code` como esta en la base ahora (loadMatrix), en vez de la
// foto del mapa. Se vuelve a pedir cuando cambia `refreshKey` (por ejemplo,
// despues de un rechazo del servidor). Mientras llega se usa `fallback`.
const useLiveMatrix = (code, loadMatrix, fallback, refreshKey) => {
    const [live, setLive] = useState(null);

    useEffect(() => {
        if (!code || !loadMatrix) return undefined;
        let cancelled = false;
        loadMatrix(code)
            .then((matrix) => { if (!cancelled) setLive(matrix); })
            .catch(() => { /* sin red se decide con el mapa; el servidor vuelve a revisar */ });
        return () => {
            cancelled = true;
        };
    }, [code, loadMatrix, fallback, refreshKey]);

    return live?.code === code ? live : fallback;
};

function ErrorNote({ message }) {
    if (!message) return null;
    return (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2.5 text-sm font-medium text-[rgb(var(--color-error))]">
            <FaCircleExclamation className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{message}</span>
        </div>
    );
}

/**
 * Lo que hay en un contenedor, posicion por posicion. Los huecos entre
 * posiciones ocupadas se ven como libres y se puede ubicar justo ahi; el boton
 * de abajo ubica en la primera libre.
 */
export function MatrixDetail({ code, matrix: mapMatrix, busyId, error, onMove, onUnassign, onAddHere, onClose, loadMatrix }) {
    const { t } = useTranslation();
    const matrix = useLiveMatrix(code, loadMatrix, mapMatrix, error);
    const items = matrix?.items || [];
    const { anaquel, nivel, seccion } = splitMatrix(code);
    // Hasta la ultima ocupada: la libre que sigue ya la cubre el boton de abajo.
    const lastUsed = items.length ? items[items.length - 1].index : -1;
    const slots = matrixSlots(items).filter((slot) => slot.index <= lastUsed);

    return (
        <>
            <SheetHeader
                icon={FaLayerGroup}
                title={t('panel.assignment.matrix', { code })}
                titleId={SHEET_TITLE_ID}
                subtitle={isSpecialLevel(nivel)
                    ? t('panel.assignment.specialPath', { shelf: anaquel, level: nivel })
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
                    {slots.map((slot) => (slot.occupants.length ? slot.occupants.map((item) => (
                        <li
                            key={item.iddetalle}
                            className={`flex items-center gap-3 rounded-2xl border p-3 ${item.conflict
                                ? 'border-[rgb(var(--color-error))]/50 bg-[rgb(var(--color-error))]/10'
                                : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'}`}
                        >
                            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[rgb(var(--color-text))] font-mono text-sm font-bold text-[rgb(var(--color-bg))]">
                                {item.index}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-mono text-sm font-semibold">{item.num_parte}</span>
                                <span className="block truncate text-xs text-[rgb(var(--color-gray-base))]">{item.descripcion || '—'}</span>
                                <span className="mt-1 block"><StockPill existencia={item.existencia} /></span>
                            </span>
                            <span className="flex shrink-0 flex-col gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => onMove(item)}
                                    disabled={busyId !== null}
                                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-40"
                                >
                                    {t('panel.assignment.move')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onUnassign(item)}
                                    disabled={busyId !== null}
                                    className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-medium transition hover:bg-[rgb(var(--color-text))]/5 disabled:opacity-40"
                                >
                                    {busyId === item.iddetalle ? t('panel.assignment.saving') : t('panel.assignment.unassign')}
                                </button>
                            </span>
                        </li>
                    )) : (
                        <li
                            key={`hueco-${slot.index}`}
                            className="flex items-center gap-3 rounded-2xl border border-dashed border-[rgb(var(--color-border))] p-3"
                        >
                            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-dashed border-[rgb(var(--color-border))] font-mono text-sm font-bold text-[rgb(var(--color-gray-base))]">
                                {slot.index}
                            </span>
                            <span className="min-w-0 flex-1 text-sm text-[rgb(var(--color-gray-base))]">{t('panel.assignment.gap')}</span>
                            <button
                                type="button"
                                onClick={() => onAddHere(slot.index)}
                                disabled={busyId !== null}
                                className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-amber-400 disabled:opacity-40"
                            >
                                {t('panel.assignment.placeInGap')}
                            </button>
                        </li>
                    )))}
                </ul>
            ) : (
                <p className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] px-4 py-6 text-center text-sm text-[rgb(var(--color-gray-base))]">
                    {t('panel.assignment.matrixEmpty')}
                </p>
            )}

            <ErrorNote message={error} />

            <button
                type="button"
                onClick={() => onAddHere(null)}
                disabled={busyId !== null}
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
 * resolverlo. `initialMatrix` llega con el anaquel que se esta trabajando, e
 * `initialIndex` con el hueco elegido en el detalle de la matriz. Si la matriz
 * tiene mas espacio del que se usa, "+" abre otra posicion.
 */
export function PlaceForm({ product, initialMatrix, initialIndex = null, matrices: mapMatrices, saving, error, onSubmit, onBack, onClose, loadMatrix }) {
    const { t } = useTranslation();
    const [matrix, setMatrix] = useState(() => ({ ...EMPTY_MATRIX, ...initialMatrix }));
    // El indice elegido vale solo para la matriz en la que se eligio: al cambiar
    // de matriz se vuelve a proponer la primera posicion libre.
    const [picked, setPicked] = useState(() => ({
        code: initialIndex === null ? null : matrixCode({ ...EMPTY_MATRIX, ...initialMatrix }),
        index: initialIndex,
    }));
    const [extra, setExtra] = useState(0);

    const code = matrixCode(matrix);
    // La matriz elegida, como esta en la base ahora: las posiciones libres se
    // calculan con esto y no con la foto del mapa.
    const liveMatrix = useLiveMatrix(code, loadMatrix, mapMatrices.get(code), error);
    const matrices = useMemo(() => {
        if (!code || !liveMatrix) return mapMatrices;
        const merged = new Map(mapMatrices);
        merged.set(code, liveMatrix);
        return merged;
    }, [code, liveMatrix, mapMatrices]);
    const slots = useMemo(
        () => (code ? matrixSlots(matrices.get(code)?.items, product.iddetalle, extra) : []),
        [code, matrices, product.iddetalle, extra]
    );
    const chosenIndex = picked.code === code ? picked.index : firstFreeIndex(slots);
    const slot = slots.find((candidate) => candidate.index === chosenIndex);
    // El indice 0 es valido: no basta con preguntar si hay indice.
    const target = code && chosenIndex !== null ? `${code}-${chosenIndex}` : '';
    const canGrow = slots.length <= MAX_INDEX;

    const addPosition = () => {
        setExtra((count) => count + 1);
        setPicked({ code, index: slots.length });
    };
    const occupants = slot?.occupants || [];
    const isSame = Boolean(slot?.isCurrent);
    const fromLocation = isValidLocation(product.localizacion) ? product.localizacion : '';
    // Una posicion ocupada por un renglon se puede usar: ese renglon se recorre
    // a donde no duplique indice (el mismo calculo que hace el servidor).
    const displaced = occupants.length === 1
        ? displacedLocation(matrices, product, code, chosenIndex, occupants[0])
        : null;
    const isSwap = Boolean(displaced);
    const isTrueSwap = isSwap && displaced === fromLocation;
    const isBlocked = occupants.length > 1 || (occupants.length === 1 && !displaced);
    const canSubmit = Boolean(target) && !isSame && !isBlocked && !saving;

    let summary = t('panel.assignment.summaryMove', { product: product.num_parte, location: target });
    if (!target) summary = t('panel.assignment.pickMatrix');
    else if (isSame) summary = t('panel.assignment.sameLocation');
    else if (occupants.length > 1) summary = t('panel.assignment.conflictHint');
    else if (isBlocked) summary = t('panel.assignment.noRoom', { code, other: occupants[0].num_parte });
    else if (isSwap) {
        summary = t('panel.assignment.summarySwap', {
            product: product.num_parte,
            location: target,
            other: occupants[0].num_parte,
            otherLocation: isValidLocation(displaced) ? displaced : t('panel.assignment.unassignedLabel'),
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
                                    <span className="font-mono text-base font-bold">{candidate.index}</span>
                                    <span className="w-full truncate text-center text-[10px] text-[rgb(var(--color-gray-base))]">{caption}</span>
                                </button>
                            );
                        })}
                        {canGrow && (
                            <button
                                type="button"
                                onClick={addPosition}
                                className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-amber-500/60 px-1 py-1.5 text-amber-600 transition hover:bg-amber-400/10"
                            >
                                <FaPlus className="size-3.5" aria-hidden="true" />
                                <span className="text-[10px] font-semibold">{t('panel.assignment.addPosition')}</span>
                            </button>
                        )}
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
                    ) : isTrueSwap && <FaRightLeft className="size-4" aria-hidden="true" />}
                    {saving && t('panel.assignment.saving')}
                    {!saving && (isTrueSwap ? t('panel.assignment.swap') : t('panel.assignment.assign'))}
                </button>
            </div>
        </>
    );
}

/**
 * Los niveles de un anaquel: agregar los que tiene fisicamente (letras o
 * especiales) y quitar los que no. Un nivel con productos no se puede quitar
 * hasta moverlos; el servidor lo vuelve a revisar al guardar. Cada cambio se
 * guarda al momento.
 */
export function LevelsEditor({ shelf, saving, error, onSave, onClose }) {
    const { t } = useTranslation();
    const [toAdd, setToAdd] = useState('');
    const current = shelf.levels.map(({ level }) => level);
    const letters = LEVELS.filter((level) => !current.includes(level));
    const specials = SPECIAL_LEVELS.filter((level) => !current.includes(level));

    const handleAdd = async () => {
        if (await onSave(shelf.shelf, [...current, toAdd])) setToAdd('');
    };

    return (
        <>
            <SheetHeader
                icon={FaLayerGroup}
                title={t('panel.assignment.levelsTitle', { shelf: shelf.shelf })}
                titleId={SHEET_TITLE_ID}
                subtitle={t('panel.assignment.levelsHint')}
                onClose={onClose}
                closeDisabled={saving}
            />

            <ul className="space-y-2">
                {shelf.levels.map(({ level, special, count }) => (
                    <li
                        key={level}
                        className="flex items-center gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2.5"
                    >
                        <span className="grid h-10 min-w-10 place-items-center rounded-xl bg-[rgb(var(--color-text))] px-2 font-mono text-sm font-bold text-[rgb(var(--color-bg))]">
                            {level}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                            <span className="block font-semibold">
                                {special ? t('panel.assignment.levelSpecial') : t('panel.assignment.levelRegular')}
                            </span>
                            <span className="block text-xs text-[rgb(var(--color-gray-base))]">
                                {count ? t('panel.assignment.levelHasProducts', { count }) : t('panel.assignment.levelEmpty')}
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={() => onSave(shelf.shelf, current.filter((item) => item !== level))}
                            disabled={saving || count > 0}
                            aria-label={t('panel.assignment.removeLevel', { level })}
                            title={t('panel.assignment.removeLevel', { level })}
                            className="grid size-9 shrink-0 place-items-center rounded-full border border-[rgb(var(--color-border))] text-[rgb(var(--color-error))] transition hover:bg-[rgb(var(--color-error))]/10 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <FaMinus className="size-3.5" aria-hidden="true" />
                        </button>
                    </li>
                ))}
            </ul>

            <div className="flex gap-2">
                <select
                    value={toAdd}
                    onChange={(event) => setToAdd(event.target.value)}
                    disabled={saving}
                    aria-label={t('panel.assignment.addLevel')}
                    className="h-12 min-w-0 flex-1 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                    <option value="">{t('panel.assignment.addLevel')}</option>
                    {letters.length > 0 && (
                        <optgroup label={t('panel.migrate.level')}>
                            {letters.map((level) => <option key={level} value={level}>{level}</option>)}
                        </optgroup>
                    )}
                    {specials.length > 0 && (
                        <optgroup label={t('panel.assignment.specialLevels')}>
                            {specials.map((level) => <option key={level} value={level}>{level}</option>)}
                        </optgroup>
                    )}
                </select>
                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!toAdd || saving}
                    className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {saving
                        ? <span className="size-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" aria-hidden="true" />
                        : <FaPlus className="size-4" aria-hidden="true" />}
                    {t('panel.assignment.add')}
                </button>
            </div>

            <ErrorNote message={error} />
        </>
    );
}
