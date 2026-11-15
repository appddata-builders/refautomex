'use client';

import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    LabelList,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis,
    YAxis,
    ZAxis,
} from 'recharts';
import { CHART_COLORS, fmt, monthLabel } from './statistics-model';

// Los mismos ejes, rejilla y tooltip que Historial de ventas.
const AXIS_TICK = { fill: 'rgb(var(--color-text))', fontSize: 11 };
const GRID = 'rgb(var(--color-border))';
const MUTED = 'rgb(var(--color-gray-base))';
const LABEL = { fill: 'rgb(var(--color-text))', fontSize: 11 };
const BOX = {
    backgroundColor: 'rgb(var(--color-card))',
    border: '1px solid rgb(var(--color-border))',
    borderRadius: '0.75rem',
    color: 'rgb(var(--color-text))',
    fontSize: 12,
    padding: '6px 10px',
    maxWidth: 280,
};
const LEGEND = { color: 'rgb(var(--color-text))', fontSize: 12 };

// Tooltip con las lineas que diga `lineas(renglon)`; la primera en negritas.
const tooltip = (lineas) => function ChartTip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const [titulo, ...resto] = lineas(payload[0].payload);
    return (
        <div style={BOX}>
            <p className="font-semibold">{titulo}</p>
            {resto.map((linea) => <p key={linea} className="tabular-nums opacity-80">{linea}</p>)}
        </div>
    );
};

// En un eje de meses solo se escribe el anio, en enero y en el primer mes.
const yearTick = (mes, index) => (index === 0 || String(mes).endsWith('-01') ? String(mes).slice(0, 4) : '');

const corta = (texto, max) => {
    const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim();
    return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
};

const LOG_TICKS = [1, 2, 4, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const logDomain = (values) => {
    const positivos = values.filter((v) => v > 0);
    if (!positivos.length) return [1, 10];
    return [Math.min(...positivos) / 1.3, Math.max(...positivos) * 1.3];
};
const logTicks = ([a, b]) => LOG_TICKS.filter((v) => v >= a && v <= b);

/** Ingreso de cada mes: catalogo, genericos y comodines, y partes que ya no estan. */
export function MonthlyIncomeChart({ mensual, labels }) {
    return (
        <div className="overflow-x-auto">
            <div className="h-72" style={{ minWidth: `${Math.max(480, mensual.length * 9)}px` }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mensual} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} barCategoryGap={1}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                        <XAxis dataKey="mes" tick={AXIS_TICK} interval={0} tickLine={false} tickFormatter={yearTick} />
                        <YAxis tick={AXIS_TICK} tickFormatter={fmt.compactMoney} width={56} />
                        <Tooltip
                            cursor={{ fill: 'rgb(var(--color-text) / 0.06)' }}
                            content={tooltip((m) => (m.con_ventas
                                ? [
                                    monthLabel(m.mes),
                                    `${labels.catalog}: ${fmt.money(m.ingreso)}`,
                                    `${labels.generic}: ${fmt.money(m.ingreso_generico)}`,
                                    `${labels.outside}: ${fmt.money(m.ingreso_fuera)}`,
                                    labels.ticketsPieces(m.tickets, m.piezas),
                                ]
                                : [monthLabel(m.mes), labels.noSales]))}
                        />
                        <Legend wrapperStyle={LEGEND} />
                        <Bar dataKey="ingreso" name={labels.catalog} stackId="ingreso" fill={CHART_COLORS[0]} />
                        <Bar dataKey="ingreso_generico" name={labels.generic} stackId="ingreso" fill={CHART_COLORS[2]} />
                        <Bar dataKey="ingreso_fuera" name={labels.outside} stackId="ingreso" fill={CHART_COLORS[4]} radius={[3, 3, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

/** Parte de las piezas y del ingreso del top 50 por familia. */
export function FamilyChart({ rows, familyName, labels }) {
    const data = rows.map((row) => ({ ...row, nombre: familyName(row.familia) }));
    return (
        <ResponsiveContainer width="100%" height={data.length * 46 + 48}>
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }} barGap={2} barCategoryGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} tickFormatter={fmt.percent0} />
                <YAxis type="category" dataKey="nombre" tick={AXIS_TICK} width={148} interval={0} />
                <Tooltip
                    cursor={{ fill: 'rgb(var(--color-text) / 0.06)' }}
                    content={tooltip((r) => [
                        r.nombre,
                        labels.products(r.productos),
                        `${labels.pieces}: ${fmt.count(r.piezas)} (${fmt.percent(r.sharePiezas)})`,
                        `${labels.income}: ${fmt.money(r.ingreso)} (${fmt.percent(r.shareIngreso)})`,
                    ])}
                />
                <Legend wrapperStyle={LEGEND} />
                <Bar dataKey="sharePiezas" name={labels.pieces} fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]}>
                    <LabelList dataKey="sharePiezas" position="right" formatter={fmt.percent0} style={LABEL} />
                </Bar>
                <Bar dataKey="shareIngreso" name={labels.income} fill={CHART_COLORS[2]} radius={[0, 3, 3, 0]}>
                    <LabelList dataKey="shareIngreso" position="right" formatter={fmt.percent0} style={LABEL} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

// Bujias y tornilleria se separan: son los dos extremos de como se compra.
const SCATTER_GROUPS = [
    { id: 'sparkPlugs', test: (p) => p.familia === 'sparkPlugs' },
    { id: 'fasteners', test: (p) => p.familia === 'fasteners' },
    { id: 'rest', test: (p) => p.familia !== 'sparkPlugs' && p.familia !== 'fasteners' },
];

/** Cada producto del top 50: cuantos tickets y cuantas piezas por ticket (escala log). */
export function PurchaseScatter({ top, labels }) {
    const puntos = top.filter((p) => p.tickets > 0 && p.piezas_ticket > 0);
    const dx = logDomain(puntos.map((p) => p.tickets));
    const dy = logDomain(puntos.map((p) => p.piezas_ticket));
    return (
        <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 12, right: 16, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis
                    type="number"
                    dataKey="tickets"
                    name={labels.tickets}
                    scale="log"
                    domain={dx}
                    ticks={logTicks(dx)}
                    tick={AXIS_TICK}
                    allowDataOverflow
                    label={{ value: labels.tickets, position: 'insideBottomRight', offset: -8, ...LABEL }}
                />
                <YAxis
                    type="number"
                    dataKey="piezas_ticket"
                    name={labels.perTicket}
                    scale="log"
                    domain={dy}
                    ticks={logTicks(dy)}
                    tick={AXIS_TICK}
                    width={44}
                    allowDataOverflow
                />
                <ZAxis range={[64, 64]} />
                <ReferenceLine
                    y={4}
                    stroke={MUTED}
                    strokeDasharray="4 3"
                    label={{ value: labels.set, position: 'insideTopRight', ...LABEL }}
                />
                <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={tooltip((p) => [
                        `#${p.lugar} · ${p.num_parte}`,
                        corta(p.descripcion, 60),
                        labels.ticketsPieces(p.tickets, p.piezas),
                        `${labels.perTicket}: ${fmt.dec2(p.piezas_ticket)}`,
                    ])}
                />
                <Legend wrapperStyle={LEGEND} />
                {SCATTER_GROUPS.map((grupo, i) => (
                    <Scatter
                        key={grupo.id}
                        name={labels.groups[grupo.id]}
                        data={puntos.filter(grupo.test)}
                        fill={CHART_COLORS[i]}
                        stroke="rgb(var(--color-card))"
                        strokeWidth={1.5}
                    />
                ))}
            </ScatterChart>
        </ResponsiveContainer>
    );
}

/** Los que mas suben y mas bajan: cambio de los 12 meses con ventas recientes contra los 12 anteriores. */
export function TrendChart({ rows, storeChange, labels }) {
    const data = rows.map((p) => ({ ...p, nombre: corta(`${p.num_parte} ${p.descripcion}`, 28) }));
    const valores = [0, ...data.map((p) => p.cambio), ...(storeChange === null ? [] : [storeChange])];
    const domain = [Math.min(...valores) * 1.1, Math.max(...valores) * 1.15];
    return (
        <ResponsiveContainer width="100%" height={data.length * 30 + 56}>
            <BarChart data={data} layout="vertical" margin={{ top: 24, right: 52, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={domain} tick={AXIS_TICK} tickFormatter={fmt.signed} />
                <YAxis type="category" dataKey="nombre" tick={{ ...AXIS_TICK, fontSize: 10 }} width={176} interval={0} />
                <ReferenceLine x={0} stroke={MUTED} />
                {storeChange !== null && (
                    <ReferenceLine
                        x={storeChange}
                        stroke={MUTED}
                        strokeDasharray="4 3"
                        label={{ value: labels.store(fmt.signed(storeChange)), position: 'top', ...LABEL }}
                    />
                )}
                <Tooltip
                    cursor={{ fill: 'rgb(var(--color-text) / 0.06)' }}
                    content={tooltip((p) => [
                        `#${p.lugar} · ${p.num_parte}`,
                        corta(p.descripcion, 60),
                        labels.periods(p.u12_previo, p.u12),
                        fmt.signed(p.cambio),
                    ])}
                />
                <Bar dataKey="cambio" radius={3}>
                    {data.map((p) => <Cell key={p.num_parte} fill={p.cambio >= 0 ? CHART_COLORS[1] : CHART_COLORS[3]} />)}
                    <LabelList dataKey="cambio" position="right" formatter={fmt.signed} style={LABEL} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

/** Un producto mes a mes, sobre el calendario de la tienda. */
export function ProductMonthlyChart({ mensual, labels }) {
    return (
        <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mensual} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={1}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="mes" tick={AXIS_TICK} interval={0} tickLine={false} tickFormatter={yearTick} />
                    <YAxis tick={AXIS_TICK} allowDecimals={false} width={36} />
                    <Tooltip
                        cursor={{ fill: 'rgb(var(--color-text) / 0.06)' }}
                        content={tooltip((m) => (m.piezas
                            ? [monthLabel(m.mes), labels.ticketsPieces(m.tickets, m.piezas), `${fmt.money(m.ingreso)} · ${labels.avgPrice} ${fmt.money2(m.precio_prom)}`]
                            : [monthLabel(m.mes), labels.noSales]))}
                    />
                    <Bar dataKey="piezas" name={labels.pieces} fill={CHART_COLORS[0]} radius={[2, 2, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

/** Minigrafica de los ultimos 12 meses con ventas, para el renglon del ranking. */
export function Sparkline({ serie, width = 96, height = 24 }) {
    const valores = Array.isArray(serie) ? serie : [];
    if (valores.length < 2) return null;
    const max = Math.max(1, ...valores);
    const x = (i) => 2 + (i * (width - 5)) / (valores.length - 1);
    const y = (v) => height - 2 - (v * (height - 5)) / max;
    const linea = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${x(0)},${height - 2} ${linea} ${x(valores.length - 1)},${height - 2}`;
    const ultimo = valores.length - 1;
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0 overflow-visible">
            <polygon points={area} fill={CHART_COLORS[0]} opacity="0.18" />
            <polyline points={linea} fill="none" stroke={CHART_COLORS[0]} strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx={x(ultimo)} cy={y(valores[ultimo])} r="2.5" fill={CHART_COLORS[0]} />
        </svg>
    );
}
