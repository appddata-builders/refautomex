import React from 'react';
import { FaTriangleExclamation } from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';
import { matrixSlots } from './locations';

// Libre, ocupada o en conflicto: el mismo codigo de color en celdas, posiciones y leyenda.
const TONES = {
    free: 'border-dashed border-[rgb(var(--color-border))] text-[rgb(var(--color-gray-base))]',
    used: 'border-amber-500/50 bg-amber-400/25 text-[rgb(var(--color-text))]',
    conflict: 'border-[rgb(var(--color-error))]/60 bg-[rgb(var(--color-error))]/15 text-[rgb(var(--color-error))]',
};
const MATCH_RING = 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[rgb(var(--color-bg))]';

const toneOf = (count, conflict) => {
    if (conflict) return TONES.conflict;
    return count ? TONES.used : TONES.free;
};

export function StockPill({ existencia }) {
    const { t } = useTranslation();
    const count = Number(existencia) || 0;

    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${count > 0
                ? 'bg-[rgb(var(--color-success))]/15 text-[rgb(var(--color-success))]'
                : 'bg-[rgb(var(--color-gray))] text-[rgb(var(--color-gray-base))]'}`}
        >
            {count > 0 ? t('panel.assignment.stock', { count }) : t('panel.assignment.noStock')}
        </span>
    );
}

/**
 * Elige que se ve en el mapa: un anaquel (01, 02...) o un nivel especial (ENC,
 * EXT...). Solo se pinta el elegido, el que se esta trabajando. Mientras se
 * busca, los que tienen coincidencias llevan aro azul y el resto se atenua.
 */
export function ShelfPicker({ shelves, areas, selected, matchedKeys, onSelect }) {
    const { t } = useTranslation();

    const chip = (key, { conflicts = 0, count = null }) => {
        const isSelected = key === selected;
        const matched = Boolean(matchedKeys?.has(key));
        return (
            <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                aria-pressed={isSelected}
                className={`relative shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-sm font-semibold shadow-sm transition ${isSelected
                    ? 'border-amber-500 bg-amber-500 text-slate-900'
                    : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] hover:border-amber-500'} ${matched && !isSelected ? 'ring-2 ring-blue-500' : ''} ${matchedKeys && !matched && !isSelected ? 'opacity-40' : ''}`}
            >
                {key}
                {count !== null && (
                    <span className="ml-1.5 rounded-full bg-[rgb(var(--color-text))]/10 px-1.5 text-[11px]">{count}</span>
                )}
                {conflicts > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-[rgb(var(--color-error))]" aria-hidden="true" />
                )}
            </button>
        );
    };

    return (
        <nav
            aria-label={t('panel.assignment.statShelves')}
            className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 py-1 [scrollbar-width:none] sm:-mx-4 sm:px-4"
        >
            {shelves.map((shelf) => chip(shelf.shelf, { conflicts: shelf.conflicts }))}
            <span className="mx-1 h-6 w-px shrink-0 bg-[rgb(var(--color-border))]" aria-hidden="true" />
            {areas.map((area) => chip(area.code, { conflicts: area.conflicts, count: area.count }))}
        </nav>
    );
}

function MatrixCell({ code, matrix, searching, matched, onOpen }) {
    const { t } = useTranslation();
    const count = matrix?.items.length || 0;

    return (
        <button
            type="button"
            onClick={() => onOpen(code)}
            title={code}
            aria-label={`${t('panel.assignment.matrix', { code })}: ${count}`}
            className={`relative grid aspect-square min-h-11 place-items-center rounded-xl border text-sm font-bold transition hover:scale-105 active:scale-95 ${toneOf(count, matrix?.hasConflict)} ${searching && !matched ? 'opacity-25' : ''} ${matched ? MATCH_RING : ''}`}
        >
            {count || <span className="opacity-40">·</span>}
            {matrix?.hasConflict && (
                <FaTriangleExclamation className="absolute right-1 top-1 size-2.5" aria-hidden="true" />
            )}
        </button>
    );
}

function ConflictBadge({ count }) {
    if (!count) return null;
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-error))]/15 px-2.5 py-1 text-xs font-semibold text-[rgb(var(--color-error))]">
            <FaTriangleExclamation className="size-3" aria-hidden="true" />
            {count}
        </span>
    );
}

/**
 * Un anaquel como se ve de frente: un renglon por nivel y una columna por
 * seccion. Cada celda es una matriz con su numero de productos; tocarla abre
 * su detalle. Si no cabe, la cuadricula se desplaza de lado y los niveles se
 * quedan fijos a la izquierda.
 */
export function ShelfCard({ shelf, matrices, matchedMatrices, onOpenMatrix }) {
    const { t } = useTranslation();
    const searching = Boolean(matchedMatrices);

    return (
        <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] p-4 shadow-sm">
            <header className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-bold">{t('panel.assignment.shelf', { shelf: shelf.shelf })}</h3>
                    <p className="text-xs text-[rgb(var(--color-gray-base))]">
                        {t('panel.assignment.shelfSummary', { products: shelf.count, matrices: shelf.matrixCount })}
                    </p>
                </div>
                <ConflictBadge count={shelf.conflicts} />
            </header>

            <div className="-mx-4 overflow-x-auto px-4 pb-1">
                {/* Celdas de 44 a 64 px: se encogen hasta caber, se pueden tocar con el
                    pulgar y no se inflan en anaqueles de pocas secciones. Si ni a 44 px
                    caben, la cuadricula se desplaza de lado. */}
                <div
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: `1.75rem repeat(${shelf.sections.length}, minmax(2.75rem, 4rem))` }}
                >
                    <span aria-hidden="true" />
                    {shelf.sections.map((section) => (
                        <span key={section} className="text-center text-[11px] font-medium text-[rgb(var(--color-gray-base))]">
                            {section}
                        </span>
                    ))}

                    {shelf.levels.map((level) => (
                        <React.Fragment key={level}>
                            <span className="sticky left-0 z-10 grid place-items-center bg-[rgb(var(--color-bg))] text-xs font-bold text-[rgb(var(--color-gray-base))]">
                                {level}
                            </span>
                            {shelf.sections.map((section) => {
                                const code = `${shelf.shelf}${level}${section}`;
                                return (
                                    <MatrixCell
                                        key={code}
                                        code={code}
                                        matrix={matrices.get(code)}
                                        searching={searching}
                                        matched={searching && matchedMatrices.has(code)}
                                        onOpen={onOpenMatrix}
                                    />
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </section>
    );
}

/**
 * Un nivel especial (ENC, EXT, OBS, INT): sin anaquel ni seccion, solo
 * posiciones. Se ve cada posicion con lo que tiene y al final una libre.
 */
export function AreaCard({ area, matrix, matchedParts, onOpen }) {
    const { t } = useTranslation();
    const slots = matrixSlots(matrix?.items);

    return (
        <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] p-4 shadow-sm">
            <header className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-bold">{t('panel.assignment.area', { code: area.code })}</h3>
                    <p className="text-xs text-[rgb(var(--color-gray-base))]">{t('panel.assignment.areaHint', { code: area.code })}</p>
                </div>
                <ConflictBadge count={area.conflicts} />
            </header>

            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 xl:grid-cols-6">
                {slots.map((slot) => {
                    const taken = slot.occupants.length;
                    const matched = Boolean(matchedParts) && slot.occupants.some((item) => matchedParts.has(item.num_parte));
                    return (
                        <button
                            key={slot.index}
                            type="button"
                            onClick={() => onOpen(area.code)}
                            className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-1.5 py-2 transition hover:scale-[1.02] active:scale-95 ${toneOf(taken, taken > 1)} ${matchedParts && !matched ? 'opacity-25' : ''} ${matched ? MATCH_RING : ''}`}
                        >
                            <span className="font-mono text-sm font-bold">{area.code}-{slot.index}</span>
                            <span className="w-full truncate text-center text-[11px]">
                                {taken
                                    ? slot.occupants.map((item) => item.num_parte).join(', ')
                                    : t('panel.assignment.free')}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

export function MapLegend() {
    const { t } = useTranslation();
    const items = [
        { label: t('panel.assignment.legendFree'), className: TONES.free },
        { label: t('panel.assignment.legendUsed'), className: TONES.used },
        { label: t('panel.assignment.legendConflict'), className: TONES.conflict },
        { label: t('panel.assignment.legendMatch'), className: 'border-[rgb(var(--color-border))] ring-2 ring-blue-500' },
    ];

    return (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-xs text-[rgb(var(--color-gray-base))]">
            {items.map(({ label, className }) => (
                <li key={label} className="flex items-center gap-1.5">
                    <span className={`size-3.5 rounded border ${className}`} aria-hidden="true" />
                    {label}
                </li>
            ))}
        </ul>
    );
}
