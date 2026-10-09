/**
 * Modelo de ubicaciones del almacen. Funciones puras: las usan el selector de
 * matriz, la migracion y Asignacion de productos, que recibe las filas de
 * /getWarehouseMap ({ iddetalle, num_parte, descripcion, existencia,
 * localizacion }) y los niveles guardados de /getShelfLayout ([{ anaquel, niveles }]).
 *
 * Cada fila es un renglon de inventario y se identifica por `iddetalle`: el
 * mismo producto puede aparecer dos veces en una sucursal. Solo llegan productos
 * activos: lo dado de baja o fuera del catalogo no juega en el mapa.
 *
 * Una ubicacion es un contenedor, guion e indice. El indice empieza en 0 y no
 * lleva cero a la izquierda (0-99). El contenedor siempre es de un anaquel:
 *   - Matriz: anaquel + nivel + seccion, 01A05-0.
 *   - Nivel especial (ENC, EXT, OBS, INT): anaquel + nivel, sin seccion, 01ENC-0.
 * Todo lo demas ('', '0', '01A0512', 'BODEGA') esta por ubicar.
 */

export const TWO_DIGITS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
export const LEVELS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
export const SPECIAL_LEVELS = ['ENC', 'EXT', 'OBS', 'INT'];

export const UNASSIGNED = '0';
export const MAX_INDEX = 99;

// La misma forma que valida el servidor (UBICACION_VALIDA en
// api/refautomex/[...path]/localizaciones.js). La seccion es de dos digitos:
// con letras, '01ENC' o '01USB' se leian como nivel E/U y seccion NC/SB.
const LOCATION_PATTERN = new RegExp(
    `^([0-9]{2})(?:(${SPECIAL_LEVELS.join('|')})|([A-Z])([0-9]{2}))-(0|[1-9][0-9]?)$`
);

export const isSpecialLevel = (level) => SPECIAL_LEVELS.includes(level);

// Codigo del contenedor: 01A05, o 01ENC si el nivel es especial (no lleva
// seccion). Vacio mientras falte algo.
export const matrixCode = ({ anaquel, nivel, seccion }) => {
    if (isSpecialLevel(nivel)) return anaquel ? `${anaquel}${nivel}` : '';
    return anaquel && nivel && seccion ? `${anaquel}${nivel}${seccion}` : '';
};

export const splitMatrix = (code) => {
    const level = code.slice(2);
    return isSpecialLevel(level)
        ? { anaquel: code.slice(0, 2), nivel: level, seccion: '' }
        : { anaquel: code.slice(0, 2), nivel: code.slice(2, 3), seccion: code.slice(3, 5) };
};

export const parseLocation = (text) => {
    const match = LOCATION_PATTERN.exec(text || '');
    if (!match) return null;
    const [, shelf, special, level, section, index] = match;
    if (special) {
        return { special: true, shelf, level: special, section: null, index: Number(index), matrix: `${shelf}${special}` };
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

// Orden en el anaquel: las letras en orden y despues los niveles especiales.
export const sortLevels = (levels) => [...levels].sort((a, b) => {
    const specialA = SPECIAL_LEVELS.indexOf(a);
    const specialB = SPECIAL_LEVELS.indexOf(b);
    if (specialA === -1 && specialB === -1) return a.localeCompare(b);
    if (specialA === -1) return -1;
    if (specialB === -1) return 1;
    return specialA - specialB;
});

// Sin niveles guardados, las letras van en rango continuo del primero al
// ultimo usado: en el anaquel fisico los huecos existen.
const letterRange = (letters) => {
    if (!letters.length) return [];
    const codes = letters.map((letter) => letter.charCodeAt(0));
    const first = Math.min(...codes);
    return Array.from({ length: Math.max(...codes) - first + 1 }, (_, i) => String.fromCharCode(first + i));
};

const sectionRange = (sections) => {
    const list = [...sections];
    if (!list.every((section) => /^[0-9]{2}$/.test(section))) return list.sort();
    if (!list.length) return [];
    const numbers = list.map(Number);
    const first = Math.min(...numbers);
    return Array.from(
        { length: Math.max(...numbers) - first + 1 },
        (_, i) => String(first + i).padStart(2, '0')
    );
};

/**
 * { shelves, matrices, unassigned, stats }
 *   shelves:    [{ shelf, levels: [{ level, special, count }], sections, count,
 *                 matrixCount, conflicts, saved }] ordenados. Los niveles son los
 *               guardados (`layout`) mas cualquiera que tenga productos; sin nada
 *               guardado, las letras usadas en rango continuo y los especiales usados.
 *   matrices:   Map(codigo -> { code, special, shelf, level, section, items, hasConflict })
 *   unassigned: filas por ubicar, primero las que tienen existencia
 *   stats:      { located, unassigned, conflicts, shelves }; conflictos = ubicaciones
 *               que comparten dos o mas productos
 */
export const buildWarehouse = (rows = [], layout = []) => {
    const saved = new Map(layout.map((entry) => [entry.anaquel, entry.niveles]));
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
    const shelfOf = (code) => {
        if (!shelves.has(code)) {
            shelves.set(code, { shelf: code, perLevel: new Map(), sections: new Set(), count: 0, conflicts: 0, codes: new Set() });
        }
        return shelves.get(code);
    };

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

        const shelf = shelfOf(item.shelf);
        shelf.perLevel.set(item.level, (shelf.perLevel.get(item.level) || 0) + 1);
        if (!item.special) shelf.sections.add(item.section);
        shelf.codes.add(item.matrix);
        shelf.count += 1;
        if (item.conflict) shelf.conflicts += 1;
    }

    // Un anaquel con niveles guardados se ve aunque todavia no tenga productos.
    for (const code of saved.keys()) shelfOf(code);

    for (const matrix of matrices.values()) {
        matrix.items.sort((a, b) => a.index - b.index || a.iddetalle - b.iddetalle);
    }

    const shelfList = [...shelves.values()]
        .sort((a, b) => a.shelf.localeCompare(b.shelf))
        .map(({ codes, perLevel, sections, ...shelf }) => {
            const used = [...perLevel.keys()];
            const base = saved.has(shelf.shelf)
                ? saved.get(shelf.shelf)
                : [...letterRange(used.filter((level) => !isSpecialLevel(level))), ...used.filter(isSpecialLevel)];
            const levels = sortLevels(new Set([...base, ...used])).map((level) => ({
                level,
                special: isSpecialLevel(level),
                count: perLevel.get(level) || 0,
            }));
            return {
                ...shelf,
                saved: saved.has(shelf.shelf),
                matrixCount: codes.size,
                levels,
                sections: sectionRange(sections),
            };
        });

    const conflicts = [...perLocation.values()].filter((count) => count > 1).length;

    return {
        shelves: shelfList,
        matrices,
        unassigned: unassigned.sort((a, b) =>
            (Number(b.existencia) || 0) - (Number(a.existencia) || 0)
            || String(a.num_parte).localeCompare(String(b.num_parte))),
        stats: { located: located.length, unassigned: unassigned.length, conflicts, shelves: shelfList.length },
    };
};

/**
 * Posiciones 0..n de un contenedor para elegir indice: cada una con los
 * renglones que la ocupan (sin contar el que se esta moviendo, por su
 * iddetalle) y si es donde ese renglon ya esta. Los huecos entre posiciones ocupadas salen libres, y al
 * final siempre queda una libre mas `extra` (si la matriz tiene mas espacio
 * fisico del que se usa). Llegan por lo menos hasta `upTo` (un hueco agregado
 * mas alla de la ultima ocupada), sin pasar de MAX_INDEX.
 */
export const matrixSlots = (items = [], movingId = null, extra = 0, upTo = -1) => {
    const occupied = new Map();
    let current = null;

    for (const item of items) {
        if (item.iddetalle === movingId) {
            current = item.index;
            continue;
        }
        occupied.set(item.index, [...(occupied.get(item.index) || []), item]);
    }

    const highest = Math.max(-1, current ?? -1, ...occupied.keys());
    const length = Math.max(highest + 2 + extra, upTo + 1);
    return Array.from({ length: Math.min(MAX_INDEX + 1, length) }, (_, index) => ({
        index,
        occupants: occupied.get(index) || [],
        isCurrent: current === index,
    }));
};

export const firstFreeIndex = (slots) =>
    slots.find((slot) => slot.occupants.length === 0 && !slot.isCurrent)?.index ?? null;

/**
 * A donde iria el renglon que ocupa `code`-`index` si se le pone ahi a
 * `product` (la misma regla que lugarParaDesplazado en el servidor): al lugar
 * que deja `product` si ese lugar queda libre; si no (venia de por ubicar, o de
 * un conflicto donde se queda otro renglon), a la primera posicion libre de
 * `code`. Asi resolver un conflicto no duplica otro indice. null si no cabe.
 */
export const displacedLocation = (matrices, product, code, index, occupant) => {
    const origin = parseLocation(product.localizacion);
    if (origin) {
        const shared = (matrices.get(origin.matrix)?.items || [])
            .some((item) => item.localizacion === product.localizacion && item.iddetalle !== product.iddetalle);
        if (!shared) return product.localizacion;
    }

    const taken = new Set([index]);
    for (const item of matrices.get(code)?.items || []) {
        if (item.iddetalle !== product.iddetalle && item.iddetalle !== occupant.iddetalle) taken.add(item.index);
    }
    for (let free = 0; free <= MAX_INDEX; free += 1) {
        if (!taken.has(free)) return `${code}-${free}`;
    }
    return null;
};

// Aplica a las filas los movimientos que devolvio /patchAssignLocation.
export const applyMoves = (rows, moves = []) => {
    if (!moves.length) return rows;
    const destination = new Map(moves.map((move) => [move.iddetalle, move.a]));
    return rows.map((row) =>
        destination.has(row.iddetalle) ? { ...row, localizacion: destination.get(row.iddetalle) } : row
    );
};

/**
 * Pasos para deshacer una asignacion: cada producto vuelve a donde estaba, o a
 * por ubicar si no venia de una ubicacion valida. Solo un intercambio de verdad
 * (el desplazado tomo el lugar que se dejo) se deshace intercambiando; si el
 * desplazado fue a una posicion libre, cada uno regresa por su lado y en orden.
 */
export const undoSteps = (moves = []) => {
    const swapped = moves.length > 1 && moves[1].a === moves[0].de;
    return moves.map((move, i) => ({
        iddetalle: move.iddetalle,
        localizacion: isValidLocation(move.de) ? move.de : UNASSIGNED,
        intercambiar: i === 0 && swapped,
    }));
};

// Deshacer no se ofrece si el producto salio de un conflicto: regresarlo
// volveria a dejar dos renglones en el mismo indice. `rowsBefore` son las filas
// de antes de mover.
export const canUndo = (moves = [], rowsBefore = []) => {
    const [first] = moves;
    if (!first || !isValidLocation(first.de)) return Boolean(first);
    return !rowsBefore.some((row) => row.localizacion === first.de && row.iddetalle !== first.iddetalle);
};
