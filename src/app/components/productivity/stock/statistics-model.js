/**
 * Calculos de Almacen -> Estadistico sobre lo que devuelve getSalesStatistics
 * (api/refautomex/[...path]/estadistico.js). Sin React: lo usan la pantalla y
 * las graficas.
 */

export const TOP = 50;
export const PAGE_SIZE = 50;
const IVA = 1.16;

// Los colores de las graficas de Historial de ventas, en el mismo orden.
export const CHART_COLORS = [
    'rgb(245 158 11)',
    'rgb(16 185 129)',
    'rgb(59 130 246)',
    'rgb(244 63 94)',
    'rgb(139 92 246)',
    'rgb(14 165 233)',
];

const norm = (texto) => String(texto ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// El catalogo no tiene grupo ni categoria asignados (todo es "Not asigned"),
// asi que la familia sale de la primera palabra de la descripcion. Van en
// orden: "LIQUIDO FRENOS" es quimico antes que freno, "TAPON BIRLO" es
// tornilleria antes que motor. Lo que no empata es Otros.
export const FAMILIAS = [
    { id: 'sparkPlugs', patron: /^BUJIA/ },
    { id: 'chemicals', patron: /^(ACEITE|ANTICONGELANTE|LIQUIDO|LIMPIADOR|ADITIVO|GRASA|SILICON|AEROSOL)/ },
    { id: 'filters', patron: /^FILTRO/ },
    { id: 'brakes', patron: /^(BALATA|ZAPATA|DISCO|TAMBOR|CILINDRO|AJUSTADOR)|FRENO/ },
    { id: 'fasteners', patron: /^(GRAPA|TORNILLO|RONDANA|TUERCA|PERNO|BIRLO|TAPON BIRLO|ABRAZADERA|ESPARRAGO|PIJA|CHAVETA|SEGURO)/ },
    { id: 'seals', patron: /^(GOMA|JUNTA|RETEN|EMPAQUE|SELLO|LIGA|BUJE|HULE)/ },
    { id: 'bearings', patron: /^(BALERO|RODAMIENTO)/ },
    { id: 'suspension', patron: /^(AMORTIGUADOR|ROTULA|TERMINAL DIRECCION|HORQUILLA|BARRA|MUELLE|RESORTE|SOPORTE|MAZA)/ },
    { id: 'electrical', patron: /^(FOCO|FUSIBLE|PASTILLA|SWITCH|BOBINA|RELEVADOR|RELAY|CABLE|TERMINAL|SENSOR|BULBO|ARNES|CUARTO|BATERIA|ALTERNADOR|MARCHA|INTERRUPTOR)/ },
    { id: 'body', patron: /^(DESLIZADOR|MANIJA|MACHETA|MOLDURA|EMBLEMA|ESPEJO|CHAPA|ELEVADOR|CALAVERA|FARO|MICA|REJILLA|TOLVA|FUNDA)/ },
    { id: 'engine', patron: /^(TUBO|BANDA|MANGUERA|REPUESTO|TAPON|TAPA|BOMBA|TERMOSTATO|CLUTCH|KIT|VALVULA|CHICOTE|TOMA|PISTON|ANILLO|CADENA|POLEA|TENSOR|CARBURADOR|ENGRANE|CRUCETA|FLECHA|PUNTERIA|METAL|VARILLA|PALANCA|RADIADOR|MOTOVENTILADOR|DEPOSITO)/ },
];
export const OTHER_FAMILY = 'other';

export const familyOf = (descripcion) => {
    const texto = norm(descripcion);
    return FAMILIAS.find((familia) => familia.patron.test(texto))?.id ?? OTHER_FAMILY;
};

const sum = (rows, key) => rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);

export const median = (values) => {
    const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Cambio de los 12 meses con ventas mas recientes contra los 12 anteriores.
// Con menos de MIN_BASE piezas antes, un 1 -> 3 seria +200 % y no dice nada.
const MIN_BASE = 5;
export const changeOf = (recent, previous) => (previous >= MIN_BASE ? (recent - previous) / previous : null);

/**
 * La respuesta con cada producto completo: familia, piezas por ticket,
 * cambio, venta por mes, cobertura, margen y relacion precio cobrado /
 * catalogo. `byPart` para buscarlos por num_parte.
 */
export const buildStats = (data) => {
    const meses = Array.isArray(data?.meses) ? data.meses : [];
    const recientes = meses.filter((m) => m.n <= 12).sort((a, b) => a.mes.localeCompare(b.mes));
    const previos = meses.filter((m) => m.n > 12).sort((a, b) => a.mes.localeCompare(b.mes));
    const mesesRecientes = Math.max(1, recientes.length);

    const productos = (Array.isArray(data?.productos) ? data.productos : []).map((p) => {
        const demanda = p.u12 / mesesRecientes;
        const sinIva = p.precio_prom / IVA;
        return {
            ...p,
            familia: familyOf(p.descripcion),
            piezas_ticket: p.tickets ? p.piezas / p.tickets : null,
            cambio: changeOf(p.u12, p.u12_previo),
            demanda_mes: demanda,
            cobertura: demanda > 0 ? p.existencia / demanda : null,
            margen: p.costo > 0 && sinIva > 0 ? (sinIva - p.costo) / sinIva : null,
            relacion_precio: p.ultimo_precio && p.precio_catalogo ? p.ultimo_precio / p.precio_catalogo : null,
        };
    });

    return {
        historial: Boolean(data?.historial),
        fuentes: data?.fuentes || {},
        mensual: Array.isArray(data?.mensual) ? data.mensual : [],
        pares: Array.isArray(data?.pares) ? data.pares : [],
        recientes: recientes.map((m) => m.mes),
        previos: previos.map((m) => m.mes),
        productos,
        byPart: new Map(productos.map((p) => [p.num_parte, p])),
    };
};

/** Las cifras de arriba: totales, peso del top 50 y lo que falta en su inventario. */
export const summarize = (stats) => {
    const { mensual, productos } = stats;
    const top = productos.slice(0, TOP);
    const conVentas = mensual.filter((m) => m.con_ventas);
    const ingreso = sum(mensual, 'ingreso');
    const generico = sum(mensual, 'ingreso_generico');
    const fuera = sum(mensual, 'ingreso_fuera');
    const piezas = sum(mensual, 'piezas');
    const topPiezas = sum(top, 'piezas');
    const topIngreso = sum(top, 'ingreso');
    const todo = ingreso + generico + fuera;
    const u12 = sum(productos, 'u12');
    const previo = sum(productos, 'u12_previo');
    return {
        desde: conVentas[0]?.mes ?? null,
        hasta: conVentas.at(-1)?.mes ?? null,
        sinVentas: mensual.filter((m) => !m.con_ventas).length,
        tickets: sum(mensual, 'tickets'),
        piezas,
        ingreso,
        generico,
        fuera,
        partes: productos.length,
        topPiezas,
        topIngreso,
        sharePiezas: piezas ? topPiezas / piezas : 0,
        shareIngreso: ingreso ? topIngreso / ingreso : 0,
        shareGenerico: todo ? generico / todo : 0,
        agotados: top.filter((p) => p.existencia === 0).length,
        bajos: top.filter((p) => p.existencia > 0 && p.cobertura !== null && p.cobertura < 1).length,
        cambioTienda: previo > 0 ? (u12 - previo) / previo : null,
    };
};

/** El top 50 por familia: productos, piezas e ingreso, y su parte del top. */
export const familySummary = (top) => {
    const piezas = sum(top, 'piezas');
    const ingreso = sum(top, 'ingreso');
    const grupos = new Map();
    top.forEach((p) => {
        const g = grupos.get(p.familia) || { familia: p.familia, productos: 0, piezas: 0, ingreso: 0 };
        g.productos += 1;
        g.piezas += p.piezas;
        g.ingreso += p.ingreso;
        grupos.set(p.familia, g);
    });
    return [...grupos.values()]
        .map((g) => ({ ...g, sharePiezas: piezas ? g.piezas / piezas : 0, shareIngreso: ingreso ? g.ingreso / ingreso : 0 }))
        .sort((a, b) => b.piezas - a.piezas);
};

/** Los que mas suben y mas bajan del top 50 (sin los que no tienen base). */
export const trendRows = (top, count = 8) => {
    const con = top.filter((p) => p.cambio !== null).sort((a, b) => b.cambio - a.cambio);
    const sube = con.filter((p) => p.cambio > 0).slice(0, count);
    const baja = con.filter((p) => p.cambio < 0).slice(-count);
    return [...sube, ...baja];
};

/** Del top 50: los agotados y los que no llegan a un mes, primero los que menos duran. */
export const inventoryRows = (top) => top
    .filter((p) => p.existencia === 0 || (p.cobertura !== null && p.cobertura < 1))
    .sort((a, b) => (a.cobertura ?? 0) - (b.cobertura ?? 0) || b.demanda_mes - a.demanda_mes);

/** Del top 50: los que se cobraron 50 % arriba o 20 % abajo del catalogo. */
export const priceRows = (top) => top
    .filter((p) => p.relacion_precio !== null && (p.relacion_precio >= 1.5 || p.relacion_precio <= 0.8))
    .sort((a, b) => b.relacion_precio - a.relacion_precio);

/** Pares del top 50 con sus descripciones y que tanto de las ventas de cada uno son juntas. */
export const pairRows = (pares, byPart) => pares.map((par) => {
    const a = byPart.get(par.a);
    const b = byPart.get(par.b);
    return {
        ...par,
        descA: a?.descripcion ?? '',
        descB: b?.descripcion ?? '',
        shareA: a?.tickets ? par.tickets / a.tickets : null,
        shareB: b?.tickets ? par.tickets / b.tickets : null,
    };
});

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const monthLabel = (mes) => {
    if (!mes) return '—';
    const [y, m] = String(mes).split('-');
    return `${MESES[Number(m) - 1]} ${y}`;
};

export const dateLabel = (fecha) => {
    if (!fecha) return '—';
    const [y, m, d] = String(fecha).slice(0, 10).split('-');
    return `${Number(d)} ${MESES[Number(m) - 1]} ${y}`;
};

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const compact = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 });
const count = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ok = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

export const fmt = {
    money: (v) => (ok(v) ? money.format(v) : '—'),
    money2: (v) => (ok(v) ? money2.format(v) : '—'),
    compactMoney: (v) => (ok(v) ? `$${compact.format(v)}` : '—'),
    count: (v) => (ok(v) ? count.format(v) : '—'),
    dec1: (v) => (ok(v) ? dec1.format(v) : '—'),
    dec2: (v) => (ok(v) ? dec2.format(v) : '—'),
    percent: (v) => (ok(v) ? `${dec1.format(v * 100)} %` : '—'),
    percent0: (v) => (ok(v) ? `${count.format(v * 100)} %` : '—'),
    signed: (v) => {
        if (!ok(v)) return '—';
        const sign = v > 0 ? '+' : v < 0 ? '−' : '';
        return `${sign}${count.format(Math.abs(v * 100))} %`;
    },
    times: (v) => (ok(v) ? `${dec2.format(v)}×` : '—'),
};
