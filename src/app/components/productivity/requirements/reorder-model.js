/**
 * Modelo de Faltantes. Funciones puras sobre lo que devuelve
 * /getReorderAnalysis: por producto, sus ventas de los ultimos 12 meses con
 * datos (u3, u12, serie), su existencia y su historial de compras por
 * proveedor (`compras`, de la mas reciente a la mas vieja).
 *
 * La cantidad sugerida depende de cuantos meses se quieren cubrir, que elige
 * quien pide; por eso se calcula aqui y no en el servidor.
 */

// Faltantes deja aqui (sessionStorage) el pedido de un proveedor y Captura lo
// abre como captura nueva cuando llega la factura.
export const CAPTURE_HANDOFF_KEY = 'captura-desde-faltantes';

export const COVERAGE_OPTIONS = [0.5, 1, 2, 3];
export const DEFAULT_COVERAGE = 1;
// La llave de texto de cada opcion: el punto de 0.5 partiria la llave en dos.
export const coverageKey = (value) => `panel.missing.cover_${String(value).replace('.', '_')}`;
// Vendido en menos meses que esto es ocasional: no entra solo al pedido.
export const REGULAR_MONTHS = 2;
// El proveedor mas barato se busca entre los que surtieron en este lapso antes
// de la ultima compra; uno que fue barato hace cinco anios ya no cuenta.
const PROVIDER_WINDOW_DAYS = 730;
const NONE_PROVIDER = 'NINGUNO';

export const STATUS_ORDER = ['out', 'urgent', 'soon', 'ok', 'idle'];

// Venta mensual: la mitad pesa lo reciente (los ultimos 3 meses con datos) y
// la otra mitad el anio, para que una racha no dispare ni hunda el pedido.
export const monthlyRate = (product, monthCount) => {
    if (!monthCount || !product.u12) return 0;
    const recent = Math.min(3, monthCount);
    return 0.5 * (product.u3 / recent) + 0.5 * (product.u12 / monthCount);
};

const daysBetween = (a, b) => (new Date(a) - new Date(b)) / 86400000;

/**
 * Proveedor sugerido: el de menor ultimo costo entre los que surtieron en los
 * dos anios previos a la compra mas reciente; a igual costo, el mas reciente.
 * Sin compras, el proveedor que tiene el producto (si no es NINGUNO).
 */
export const recommendProvider = (product, providersById) => {
    const purchases = product.compras || [];
    if (!purchases.length) {
        const assigned = providersById.get(product.idproveedor);
        return assigned && assigned.empresa !== NONE_PROVIDER
            ? { idproveedor: assigned.idproveedor, cost: Number(product.costo) || 0, reason: 'assigned' }
            : null;
    }
    const latest = purchases[0];
    const candidates = purchases.filter((p) => daysBetween(latest.ultima, p.ultima) <= PROVIDER_WINDOW_DAYS);
    const best = candidates.reduce((min, p) => (Number(p.ultimo_costo) < Number(min.ultimo_costo) ? p : min), candidates[0]);
    return {
        idproveedor: best.idproveedor,
        cost: Number(best.ultimo_costo) || Number(product.costo) || 0,
        reason: best.idproveedor === latest.idproveedor ? 'last' : 'cheaper',
        lastProvider: latest.idproveedor,
        typicalQty: Number(best.cantidad_tipica) || null,
    };
};

// Costo de un producto con un proveedor dado: el de su ultima compra con el,
// o el costo actual si nunca se le compro.
export const costWith = (product, idproveedor) => {
    const purchase = (product.compras || []).find((p) => p.idproveedor === idproveedor);
    return Number(purchase?.ultimo_costo) || Number(product.costo) || 0;
};

export const analyzeProducts = (data, coverage, providersById) => {
    const monthCount = data?.meses?.length || 0;
    return (data?.productos || []).map((product) => {
        const rate = monthlyRate(product, monthCount);
        const stock = Number(product.existencia) || 0;
        const months = rate > 0 ? stock / rate : Infinity;
        const target = rate * coverage;
        let suggested = rate > 0 ? Math.max(0, Math.ceil(target - stock)) : 0;
        if (stock <= 0 && rate > 0) suggested = Math.max(1, suggested);

        let status = 'ok';
        if (rate <= 0) status = stock <= 0 ? 'idle' : 'ok';
        else if (stock <= 0) status = 'out';
        else if (months < coverage / 2) status = 'urgent';
        else if (months < coverage) status = 'soon';

        const regular = product.meses_con_venta >= REGULAR_MONTHS;
        const recommendation = recommendProvider(product, providersById);
        return {
            ...product,
            stock,
            rate,
            months,
            suggested,
            status,
            regular,
            recommendation,
            // Lo que se deja de vender al mes si no hay: ordena dentro de cada estado.
            atStake: rate * (Number(product.precio) || 0),
            autoInclude: regular && suggested > 0 && ['out', 'urgent', 'soon'].includes(status),
        };
    }).sort((a, b) => (
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.atStake - a.atStake
    ));
};

/**
 * El pedido: lo que el analisis propone mas lo que se cambio a mano.
 * `overrides` es { num_parte: { qty, idproveedor } }; qty 0 lo saca.
 */
export const buildPlan = (rows, overrides) => rows.flatMap((row) => {
    const override = overrides[row.num_parte];
    const qty = override?.qty ?? (row.autoInclude ? row.suggested : 0);
    if (!(qty > 0)) return [];
    const idproveedor = override?.idproveedor ?? row.recommendation?.idproveedor ?? null;
    const cost = idproveedor ? costWith(row, idproveedor) : Number(row.costo) || 0;
    return [{ row, qty, idproveedor, cost, amount: qty * cost }];
});

export const groupByProvider = (plan, providersById) => {
    const groups = new Map();
    plan.forEach((item) => {
        const key = item.idproveedor ?? 'none';
        if (!groups.has(key)) {
            groups.set(key, { key, provider: providersById.get(item.idproveedor) || null, items: [], units: 0, amount: 0 });
        }
        const group = groups.get(key);
        group.items.push(item);
        group.units += item.qty;
        group.amount += item.amount;
    });
    return [...groups.values()].sort((a, b) => (a.key === 'none') - (b.key === 'none') || b.amount - a.amount);
};

// Huecos en los meses con datos, para decir de donde sale la demanda:
// ['2024-11', '2026-10'] -> [{ from: '2024-12', to: '2026-09' }].
export const monthGaps = (months) => {
    const gaps = [];
    const index = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
    const label = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    for (let i = 1; i < months.length; i += 1) {
        const prev = index(months[i - 1]);
        const next = index(months[i]);
        if (next - prev > 1) gaps.push({ from: label(prev + 1), to: label(next - 1) });
    }
    return gaps;
};

export const formatMonth = (month, style = 'short') => {
    const [year, m] = month.split('-').map(Number);
    return new Date(year, m - 1, 1).toLocaleDateString('es-MX', { month: style, year: 'numeric' });
};

export const formatRate = (rate) => (rate >= 10 ? Math.round(rate).toString() : rate.toFixed(1));
