/**
 * Modelo de Inventarios. Funciones puras: las usan el estado de productos, la
 * asignacion por lote y Sucursales.
 *
 * Los productos salen de /getWarehouseProducts: [sinDetalle, conDetalle]. Los
 * de status 'E' existen en el catalogo pero no estan en ninguna sucursal; los
 * de 'A' llegan un renglon por detalle y aqui se agrupan por num_parte. Las
 * sucursales salen de /getSucursalUsage, con lo que impide borrarlas.
 */

import { webPriceCheck } from '@/app/lib/stripe-fees';
import { UNASSIGNED, isValidLocation } from './locations';

// Asignacion de productos deja aqui (sessionStorage) lo que no esta en una
// sucursal, y Inventarios lo abre en el lote de esa sucursal.
export const ASSIGN_HANDOFF_KEY = 'inventarios-asignar';

export const IVA_FACTOR = 1.16;
export const UTILITIES = [1.25, 1.3, 1.35];
export const DEFAULT_UTILITY = 1.3;

// WEB no tiene almacen fisico: todo su catalogo vive en '0' y sin existencia.
export const isWebBranch = (branch) =>
    Number(branch?.idsucursal) === 1 || String(branch?.sucursal || '').trim().toUpperCase() === 'WEB';

// El grupo 0 es "Not asigned": el sitio no muestra productos sin grupo.
export const hasGroup = (product) => {
    const id = product?.idgrupo;
    return id !== null && id !== undefined && String(id).trim() !== '' && String(id) !== '0';
};

export const parseWarehouseProducts = (data) => {
    const pending = (data?.[0] || []).map((product) => ({ ...product, status: 'E', detalles: [] }));
    const grouped = new Map();
    (data?.[1] || []).forEach((row) => {
        if (!grouped.has(row.num_parte)) {
            grouped.set(row.num_parte, {
                num_parte: row.num_parte,
                descripcion: row.descripcion,
                mod_ini: row.mod_ini,
                mod_fin: row.mod_fin,
                idgrupo: row.idgrupo,
                grupo: row.grupo,
                idcategoria: row.idcategoria,
                idmarca: row.idmarca,
                status: 'A',
                detalles: [],
            });
        }
        grouped.get(row.num_parte).detalles.push({
            idsucursal: row.idsucursal,
            sucursal: row.sucursal,
            localizacion: row.localizacion,
            existencia: row.existencia,
            precio: row.precio,
            costo: row.costo,
            utilidad: row.utilidad,
        });
    });
    const byPart = (a, b) => String(a.num_parte).localeCompare(String(b.num_parte), 'es', { numeric: true });
    return { pending: pending.sort(byPart), active: [...grouped.values()].sort(byPart) };
};

export const branchIdsOf = (product) => new Set((product?.detalles || []).map((detail) => String(detail.idsucursal)));

/**
 * Si un producto puede ir a una sucursal: cualquiera que no lo tenga ya.
 *
 * WEB incluida. El alta anterior solo dejaba subir a WEB lo que ya estaba en
 * todas las sucursales fisicas, pero el sitio no lo necesita: lista lo que
 * tiene renglon en WEB, esta activo y tiene grupo (getProducts), y una venta
 * del sitio descuenta de WEB (idsucursal 1) y se surte desde Entregas. Un
 * producto puede estar solo en WEB.
 */
export const eligibility = (product, branch) => {
    if (!product || !branch) return { ok: true };
    return branchIdsOf(product).has(String(branch.idsucursal)) ? { ok: false, reason: 'already' } : { ok: true };
};

/**
 * Lo que se pinta en Estado de productos: cuantos faltan en cada sucursal y
 * cuantos activos no estan en todas las fisicas.
 */
export const buildCoverage = (products, branches) => {
    const physical = branches.filter((branch) => !isWebBranch(branch));
    const web = branches.find(isWebBranch) || null;
    const counts = new Map(branches.map((branch) => [String(branch.idsucursal), 0]));
    let incomplete = 0;

    products.active.forEach((product) => {
        const ids = branchIdsOf(product);
        ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
        if (!physical.every((branch) => ids.has(String(branch.idsucursal)))) incomplete += 1;
    });

    const total = products.active.length;
    const rows = [...physical, ...(web ? [web] : [])].map((branch) => {
        const count = counts.get(String(branch.idsucursal)) || 0;
        const isWeb = isWebBranch(branch);
        return {
            branch,
            isWeb,
            count,
            missing: Math.max(total - count, 0),
            percent: total ? Math.round((count / total) * 100) : 0,
        };
    });

    return { total, pending: products.pending.length, incomplete, rows };
};

// Alza maxima que vale la pena en WEB. La cuota fija de Stripe ($3 + IVA)
// cuesta lo mismo en una refaccion de $20 que en una de $2,000: con base de
// unos $34 o menos, cubrirla pide subir mas de 15 %, y a ese precio el cliente
// lo compara con el mostrador. Esos se marcan "mejor en mostrador" en vez de
// sugerir solo el alza.
export const WEB_MAX_RAISE = 0.15;

/**
 * Precios WEB: por cada producto que esta en WEB, si su precio cubre la
 * comision de Stripe contra la sucursal fisica mas cara (webPriceCheck).
 * `status`: 'short' le falta, 'covered' ya la cubre, 'noReference' no hay
 * sucursal fisica ni costo contra que comparar. `raise` es cuanto sube el
 * sugerido sobre el precio de mostrador, y `notWorth` si pasa de WEB_MAX_RAISE.
 */
export const buildWebPricing = (products) => products.active.flatMap((product) => {
    const web = product.detalles.find(isWebBranch);
    if (!web) return [];
    const check = webPriceCheck({
        webPrice: web.precio,
        references: product.detalles
            .filter((detail) => !isWebBranch(detail))
            .map((detail) => ({ branch: detail.sucursal, price: detail.precio })),
        cost: web.costo,
    });
    const status = check.suggested === null ? 'noReference' : check.covered ? 'covered' : 'short';
    const raise = check.suggested !== null && check.base ? check.suggested / check.base - 1 : 0;
    return [{ product, web, check, status, raise, notWorth: status === 'short' && raise > WEB_MAX_RAISE }];
});

// Rangos del analisis: la cuota fija de Stripe pesa mas mientras mas barato.
export const WEB_PRICE_RANGES = [
    { id: 'under100', max: 100 },
    { id: 'under300', max: 300 },
    { id: 'under1000', max: 1000 },
    { id: 'over1000', max: Infinity },
];

// Totales de Precios WEB y el desglose por rango de precio.
export const summarizeWebPricing = (rows) => {
    const priced = rows.filter((row) => row.check.current !== null);
    const short = rows.filter((row) => row.status === 'short');
    const sum = (list, pick) => list.reduce((total, row) => total + pick(row), 0);
    return {
        total: rows.length,
        short: short.length,
        covered: rows.filter((row) => row.status === 'covered').length,
        noReference: rows.filter((row) => row.status === 'noReference').length,
        notWorth: short.filter((row) => row.notWorth).length,
        averageFee: priced.length ? sum(priced, (row) => row.check.fee) / priced.length : 0,
        gapTotal: sum(short, (row) => row.check.gap),
        ranges: WEB_PRICE_RANGES.map((range, index) => {
            const min = index ? WEB_PRICE_RANGES[index - 1].max : 0;
            const inRange = short.filter((row) => (row.check.current ?? 0) >= min && (row.check.current ?? 0) < range.max);
            const withPrice = inRange.filter((row) => row.check.current);
            return {
                ...range,
                count: inRange.length,
                averageFee: withPrice.length ? sum(withPrice, (row) => row.check.fee) / withPrice.length : 0,
                averageRaise: withPrice.length ? sum(withPrice, (row) => row.check.gap / row.check.current) / withPrice.length : 0,
            };
        }).filter((range) => range.count > 0),
    };
};

// Precio con IVA -> precio sin IVA y costo, como lo calculaba el alta.
export const financeFor = (price, utility) => {
    const parsedPrice = parseFloat(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return { aiva: '', costo: '' };
    const aiva = parsedPrice / IVA_FACTOR;
    const parsedUtility = parseFloat(utility);
    return {
        aiva: aiva.toFixed(2),
        costo: Number.isFinite(parsedUtility) && parsedUtility > 0 ? (aiva / parsedUtility).toFixed(2) : '',
    };
};

// Un renglon nuevo del lote. Si el producto ya esta en otra sucursal se
// propone su mismo precio y utilidad, como hacia el alta.
export const newBatchRow = (product) => {
    const reference = product?.detalles?.[0];
    return {
        num_parte: product.num_parte,
        localizacion: '',
        existencia: '',
        utilidad: reference?.utilidad ? Number(reference.utilidad) : DEFAULT_UTILITY,
        precio: reference?.precio ? String(reference.precio) : '',
        idgrupo: hasGroup(product) ? product.idgrupo : '',
        error: '',
    };
};

// Errores de un renglon antes de guardar: { campo: key de texto }. La
// ubicacion vacia es "por ubicar" ('0'), la misma marca que usa Asignacion de
// productos para lo que todavia no tiene lugar.
export const validateBatchRow = (row, { web, repeatedLocations }) => {
    const errors = {};
    if (!web) {
        const location = row.localizacion.trim();
        if (location && location !== UNASSIGNED && !isValidLocation(location)) errors.localizacion = 'locationFormat';
        else if (location && repeatedLocations.has(location)) errors.localizacion = 'locationRepeated';
        if (!/^[0-9]+$/.test(String(row.existencia).trim())) errors.existencia = 'stockRequired';
    }
    if (!(Number(row.utilidad) > 0)) errors.utilidad = 'utilityRequired';
    if (!(parseFloat(row.precio) > 0)) errors.precio = 'priceRequired';
    return errors;
};

// Ubicaciones que aparecen en mas de un renglon del lote.
export const repeatedLocationsOf = (rows) => {
    const seen = new Map();
    rows.forEach((row) => {
        const location = row.localizacion.trim();
        if (!location || location === UNASSIGNED) return;
        seen.set(location, (seen.get(location) || 0) + 1);
    });
    return new Set([...seen].filter(([, count]) => count > 1).map(([location]) => location));
};

export const matchesProduct = (product, term) => {
    if (!term) return true;
    const needle = term.toUpperCase();
    return String(product.num_parte).toUpperCase().includes(needle)
        || String(product.descripcion || '').toUpperCase().includes(needle);
};

export const formatCount = (value) => Number(value || 0).toLocaleString('es-MX');

// Los textos con cantidad tienen su forma de uno en `<key>One` ("1 producto").
export const pluralKey = (key, count) => (Number(count) === 1 ? `${key}One` : key);

export const formatMoney = (value) => {
    const number = parseFloat(value);
    return Number.isFinite(number)
        ? number.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
        : '—';
};
