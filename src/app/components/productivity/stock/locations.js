/**
 * Modelo de ubicaciones del almacen. Funciones puras: las usan el selector de
 * matriz, la migracion y Asignacion de productos, que recibe las filas de
 * /getWarehouseMap ({ num_parte, descripcion, existencia, localizacion }).
 *
 * Una ubicacion es un contenedor, guion e indice (1-99, sin cero a la izquierda):
 *   - Matriz de anaquel: anaquel + nivel + seccion, 01A05-3.
 *   - Nivel especial (ENC, EXT, OBS, INT): no tiene anaquel ni seccion, ENC-3.
 * Todo lo demas ('', '0', '01A0512', 'BODEGA') esta por ubicar.
 */

export const TWO_DIGITS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
export const LEVELS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
export const SPECIAL_LEVELS = ['ENC', 'EXT', 'OBS', 'INT'];

export const UNASSIGNED = '0';
export const MAX_INDEX = 99;

// La misma forma que valida el servidor (UBICACION_VALIDA en
// api/refautomex/[...path]/localizaciones.js).
const LOCATION_PATTERN = new RegExp(
    `^(?:([0-9]{2})([A-Z])([0-9A-Z]{2})|(${SPECIAL_LEVELS.join('|')}))-([1-9][0-9]?)$`
);

export const isSpecialLevel = (level) => SPECIAL_LEVELS.includes(level);

// Codigo del contenedor: 01A05, o ENC si el nivel es especial. Vacio mientras falte algo.
export const matrixCode = ({ anaquel, nivel, seccion }) => {
    if (isSpecialLevel(nivel)) return nivel;
    return anaquel && nivel && seccion ? `${anaquel}${nivel}${seccion}` : '';
};

export const splitMatrix = (code) => (isSpecialLevel(code)
    ? { anaquel: '', nivel: code, seccion: '' }
    : { anaquel: code.slice(0, 2), nivel: code.slice(2, 3), seccion: code.slice(3, 5) });

export const parseLocation = (text) => {
    const match = LOCATION_PATTERN.exec(text || '');
    if (!match) return null;
    const [, shelf, level, section, special, index] = match;
    if (special) {
        return { special: true, shelf: null, level: special, section: null, index: Number(index), matrix: special };
    }
    return { special: false, shelf, level, section, index: Number(index), matrix: `${shelf}${level}${section}` };
};

export const isValidLocation = (text) => LOCATION_PATTERN.test(text || '');

export const matchesTerm = (row, term) => {
    if (!term) return true;
    const needle = term.trim().toLowerCase();
    return [row.num_parte, row.descripcion, row.localizacion]
        .some((value) => String(value || '').toLowerCase().includes(needle));
};

// Niveles y secciones van en rango continuo, del primero al ultimo usado: en el
// anaquel fisico los huecos existen, y una matriz vacia es justo donde cabe algo.
const levelRange = (levels) => {
    const codes = [...levels].map((level) => level.charCodeAt(0));
    const first = Math.min(...codes);
    return Array.from({ length: Math.max(...codes) - first + 1 }, (_, i) => String.fromCharCode(first + i));
};

const sectionRange = (sections) => {
    const list = [...sections];
    if (!list.every((section) => /^[0-9]{2}$/.test(section))) return list.sort();
    const numbers = list.map(Number);
    const first = Math.min(...numbers);
    return Array.from(
        { length: Math.max(...numbers) - first + 1 },
        (_, i) => String(first + i).padStart(2, '0')
    );
};

/**
 * { shelves, areas, matrices, unassigned, stats }
 *   shelves:    [{ shelf, levels, sections, count, matrixCount, conflicts }] ordenados
 *   areas:      los niveles especiales, siempre los cuatro: [{ code, count, conflicts }]
 *   matrices:   Map(codigo -> { code, special, shelf, level, section, items, hasConflict });
 *               los niveles especiales entran con su codigo (ENC)
 *   unassigned: filas por ubicar, primero las que tienen existencia
 *   stats:      { located, unassigned, conflicts, shelves }; conflictos = ubicaciones
 *               que comparten dos o mas productos
 */
export const buildWarehouse = (rows = []) => {
    const perLocation = new Map();
    const located = [];
    const unassigned = [];

    for (const row of rows) {
        const location = parseLocation(row.localizacion);
        if (!location) {
            unassigned.push(row);
            continue;
        }
        located.push({ ...row, ...location });
        perLocation.set(row.localizacion, (perLocation.get(row.localizacion) || 0) + 1);
    }

    const shelves = new Map();
    const matrices = new Map();

    for (const item of located) {
        item.conflict = perLocation.get(item.localizacion) > 1;

        let matrix = matrices.get(item.matrix);
        if (!matrix) {
            matrix = {
                code: item.matrix,
                special: item.special,
                shelf: item.shelf,
                level: item.level,
                section: item.section,
                items: [],
                hasConflict: false,
            };
            matrices.set(item.matrix, matrix);
        }
        matrix.items.push(item);
        matrix.hasConflict ||= item.conflict;

        if (item.special) continue;

        let shelf = shelves.get(item.shelf);
        if (!shelf) {
            shelf = { shelf: item.shelf, levels: new Set(), sections: new Set(), count: 0, conflicts: 0, codes: new Set() };
            shelves.set(item.shelf, shelf);
        }
        shelf.levels.add(item.level);
        shelf.sections.add(item.section);
        shelf.codes.add(item.matrix);
        shelf.count += 1;
        if (item.conflict) shelf.conflicts += 1;
    }

    for (const matrix of matrices.values()) {
        matrix.items.sort((a, b) => a.index - b.index || String(a.num_parte).localeCompare(String(b.num_parte)));
    }

    const conflicts = [...perLocation.values()].filter((count) => count > 1).length;
    const shelfList = [...shelves.values()]
        .sort((a, b) => a.shelf.localeCompare(b.shelf))
        .map(({ codes, levels, sections, ...shelf }) => ({
            ...shelf,
            matrixCount: codes.size,
            levels: levelRange(levels),
            sections: sectionRange(sections),
        }));

    const areas = SPECIAL_LEVELS.map((code) => {
        const items = matrices.get(code)?.items || [];
        return { code, count: items.length, conflicts: items.filter((item) => item.conflict).length };
    });

    return {
        shelves: shelfList,
        areas,
        matrices,
        unassigned: unassigned.sort((a, b) =>
            (Number(b.existencia) || 0) - (Number(a.existencia) || 0)
            || String(a.num_parte).localeCompare(String(b.num_parte))),
        stats: { located: located.length, unassigned: unassigned.length, conflicts, shelves: shelfList.length },
    };
};

/**
 * Posiciones 1..n de un contenedor para elegir indice: cada una con los
 * productos que la ocupan (sin contar al que se esta moviendo) y si es donde ese
 * producto ya esta. Siempre deja una posicion libre al final, hasta MAX_INDEX.
 */
export const matrixSlots = (items = [], movingPart = null) => {
    const occupied = new Map();
    let current = null;

    for (const item of items) {
        if (item.num_parte === movingPart) {
            current = item.index;
            continue;
        }
        occupied.set(item.index, [...(occupied.get(item.index) || []), item]);
    }

    const highest = Math.max(0, current ?? 0, ...occupied.keys());
    return Array.from({ length: Math.min(MAX_INDEX, highest + 1) }, (_, i) => ({
        index: i + 1,
        occupants: occupied.get(i + 1) || [],
        isCurrent: current === i + 1,
    }));
};

export const firstFreeIndex = (slots) =>
    slots.find((slot) => slot.occupants.length === 0 && !slot.isCurrent)?.index ?? null;

// Aplica a las filas los movimientos que devolvio /patchAssignLocation.
export const applyMoves = (rows, moves = []) => {
    if (!moves.length) return rows;
    const destination = new Map(moves.map((move) => [move.num_parte, move.a]));
    return rows.map((row) =>
        destination.has(row.num_parte) ? { ...row, localizacion: destination.get(row.num_parte) } : row
    );
};

/**
 * Pasos para deshacer una asignacion: cada producto vuelve a donde estaba, o a
 * por ubicar si no venia de una ubicacion valida. Solo el primero intercambia:
 * si hubo intercambio, regresar el producto devuelve al otro a su lugar, y el
 * segundo paso queda sin efecto.
 */
export const undoSteps = (moves = []) => moves.map((move, i) => ({
    num_parte: move.num_parte,
    localizacion: isValidLocation(move.de) ? move.de : UNASSIGNED,
    intercambiar: i === 0 && moves.length > 1,
}));
