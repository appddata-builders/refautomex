import React from 'react';
import { FaLayerGroup, FaTriangleExclamation } from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';

// Libre, ocupada o en conflicto: el mismo codigo de color en celdas, posiciones y leyenda.
const TONES = {
    free: 'border-dashed border-[rgb(var(--color-border))] text-[rgb(var(--color-gray-base))]',
    used: 'border-amber-500/50 bg-amber-400/25 text-[rgb(var(--color-text))]',
    conflict: 'border-[rgb(var(--color-error))]/60 bg-[rgb(var(--color-error))]/15 text-[rgb(var(--color-error))]',
};
const MATCH_RING = 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[rgb(var(--color-bg))]';

const toneOf = (items = [], conflict = false) => {
    if (conflict) return TONES.conflict;
    return items.length ? TONES.used : TONES.free;
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
 * Elige el anaquel que se esta trabajando: es el unico que se pinta. Mientras
 * se busca, los que tienen coincidencias llevan aro azul y el resto se atenua.
 */
export function ShelfPicker({ shelves, selected, matchedKeys, onSelect }) {
    const { t } = useTranslation();

    return (
        <nav
            aria-label={t('panel.assignment.statShelves')}
            className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 py-1 [scrollbar-width:none] sm:-mx-4 sm:px-4"
        >
            {shelves.map(({ shelf, conflicts }) => {
                const isSelected = shelf === selected;
                const matched = Boolean(matchedKeys?.has(shelf));
                return (
                    <button
                        key={shelf}
                        type="button"
                        onClick={() => onSelect(shelf)}
                        aria-pressed={isSelected}
                        className={`relative shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-sm font-semibold shadow-sm transition ${isSelected
                            ? 'border-amber-500 bg-amber-500 text-slate-900'
                            : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] hover:border-amber-500'} ${matched && !isSelected ? 'ring-2 ring-blue-500' : ''} ${matchedKeys && !matched && !isSelected ? 'opacity-40' : ''}`}
                    >
                        {shelf}
                        {conflicts > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-[rgb(var(--color-error))]" aria-hidden="true" />
                        )}
                    </button>
                );
            })}
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
            className={`relative grid aspect-square min-h-11 place-items-center rounded-xl border text-sm font-bold transition hover:scale-105 active:scale-95 ${toneOf(matrix?.items, matrix?.hasConflict)} ${searching && !matched ? 'opacity-25' : ''} ${matched ? MATCH_RING : ''}`}
        >
            {count || <span className="opacity-40">·</span>}
            {matrix?.hasConflict && (
                <FaTriangleExclamation className="absolute right-1 top-1 size-2.5" aria-hidden="true" />
            )}
        </button>
    );
}

/**
 * Un anaquel como se ve de frente: un renglon por nivel y una columna por
 * seccion, y abajo sus niveles especiales, de un solo recuadro porque no tienen
 * secciones. Cada recuadro es un contenedor con su numero de productos; cuales
 * indices ocupan se ve al tocarlo, en su detalle. Si no cabe, la cuadricula se
 * desplaza de lado y los niveles se quedan fijos a la izquierda.
 */
export function ShelfCard({ shelf, matrices, matchedMatrices, onOpenMatrix, onEditLevels }) {
    const { t } = useTranslation();
    const searching = Boolean(matchedMatrices);
    // Sin secciones (solo niveles especiales, o anaquel recien armado) queda
    // una columna, del mismo ancho que las demas.
    const columns = `2.25rem repeat(${Math.max(shelf.sections.length, 1)}, minmax(2.75rem, 4rem))`;

    return (
        <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] p-4 shadow-sm">
            <header className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-bold">{t('panel.assignment.shelf', { shelf: shelf.shelf })}</h3>
                    <p className="text-xs text-[rgb(var(--color-gray-base))]">
                        {t('panel.assignment.shelfSummary', { products: shelf.count, matrices: shelf.matrixCount })}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {shelf.conflicts > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-error))]/15 px-2.5 py-1 text-xs font-semibold text-[rgb(var(--color-error))]">
                            <FaTriangleExclamation className="size-3" aria-hidden="true" />
                            {shelf.conflicts}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => onEditLevels(shelf.shelf)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold transition hover:border-amber-500"
                    >
                        <FaLayerGroup className="size-3.5 text-amber-600" aria-hidden="true" />
                        {t('panel.assignment.editLevels')}
                    </button>
                </div>
            </header>

            <div className="-mx-4 overflow-x-auto px-4 pb-1">
                {/* Celdas de 44 a 64 px: se encogen hasta caber, se pueden tocar con el
                    pulgar y no se inflan en anaqueles de pocas secciones. */}
                <div className="grid gap-1.5" style={{ gridTemplateColumns: columns }}>
                    <span aria-hidden="true" />
                    {shelf.sections.length ? shelf.sections.map((section) => (
                        <span key={section} className="text-center text-[11px] font-medium text-[rgb(var(--color-gray-base))]">
                            {section}
                        </span>
                    )) : <span aria-hidden="true" />}

                    {shelf.levels.map(({ level, special }) => {
                        // col-start-1: cada nivel abre renglon aunque el anterior
                        // (uno especial) no haya llenado todas las columnas.
                        const label = (
                            <span className="sticky left-0 z-10 col-start-1 grid place-items-center bg-[rgb(var(--color-bg))] text-[11px] font-bold text-[rgb(var(--color-gray-base))]">
                                {level}
                            </span>
                        );

                        if (special) {
                            const code = `${shelf.shelf}${level}`;
                            return (
                                <React.Fragment key={level}>
                                    {label}
                                    <MatrixCell
                                        code={code}
                                        matrix={matrices.get(code)}
                                        searching={searching}
                                        matched={searching && matchedMatrices.has(code)}
                                        onOpen={onOpenMatrix}
                                    />
                                </React.Fragment>
                            );
                        }

                        return (
                            <React.Fragment key={level}>
                                {label}
                                {shelf.sections.length ? shelf.sections.map((section) => {
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
                                }) : (
                                    <span className={`grid aspect-square min-h-11 place-items-center rounded-xl border text-xs ${TONES.free}`}>—</span>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
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
