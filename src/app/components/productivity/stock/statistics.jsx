'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaArrowsRotate, FaChartColumn, FaChartLine, FaCircleExclamation, FaRankingStar } from 'react-icons/fa6';
import Title from '../title';
import FindProducts from '../sales/find-products';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { obtenerIdToken } from '@/app/lib/cognito-manager';
import { useTranslation } from '@/app/lib/text/text-provider';
import { FamilyChart, MonthlyIncomeChart, ProductMonthlyChart, PurchaseScatter, Sparkline, TrendChart } from './statistics-charts';
import {
    FAMILIAS,
    OTHER_FAMILY,
    PAGE_SIZE,
    TOP,
    buildStats,
    dateLabel,
    familySummary,
    fmt,
    inventoryRows,
    median,
    monthLabel,
    pairRows,
    priceRows,
    summarize,
    trendRows,
} from './statistics-model';

// Las dos rutas piden sesion: son los ingresos de la tienda (estadistico.js).
const getStats = async (path) => {
    const token = await obtenerIdToken();
    const response = await fetch(buildApiUrl(path), {
        cache: 'no-store',
        headers: { Accept: 'application/json, text/plain, */*', Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.details || `Error ${response.status}`);
    return data;
};

const CARD = 'min-w-0 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:p-5';
const MUTED = 'text-[rgb(var(--color-gray-base))]';
const UP = 'text-[rgb(var(--color-success))]';
const DOWN = 'text-[rgb(var(--color-error))]';

function Kpi({ label, value, hint, accent = '' }) {
    return (
        <div className="min-w-0 rounded-2xl bg-[rgb(var(--color-bg))] p-3 shadow-sm">
            <span className={`block truncate text-xs font-medium ${MUTED}`}>{label}</span>
            <span className={`block text-2xl font-bold tabular-nums sm:text-3xl ${accent}`}>{value}</span>
            <span className={`block text-xs ${MUTED}`}>{hint}</span>
        </div>
    );
}

function Card({ id, title, subtitle, findings = [], children }) {
    const visibles = findings.filter(Boolean);
    return (
        <section id={id} className={CARD}>
            <header className="mb-3 space-y-1.5">
                <h2 className="text-lg font-bold">{title}</h2>
                {subtitle && <p className={`text-sm ${MUTED}`}>{subtitle}</p>}
                {visibles.length > 0 && (
                    <ul className="space-y-1 rounded-xl bg-amber-400/15 px-3 py-2 text-sm">
                        {visibles.map((texto) => <li key={texto}>{texto}</li>)}
                    </ul>
                )}
            </header>
            {children}
        </section>
    );
}

function DataTable({ columns, rows, rowKey, empty }) {
    if (!rows.length) return <p className={`text-sm ${MUTED}`}>{empty}</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                scope="col"
                                className={`whitespace-nowrap border-b border-[rgb(var(--color-border))] px-2 py-2 text-xs font-semibold uppercase tracking-wide ${MUTED} ${col.num ? 'text-right' : 'text-left'}`}
                            >
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={rowKey(row)} className="border-b border-[rgb(var(--color-border))]/60 last:border-0">
                            {columns.map((col) => (
                                <td key={col.key} className={`px-2 py-2 align-top ${col.num ? 'whitespace-nowrap text-right' : ''} ${col.className ?? ''}`}>
                                    {col.render(row)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Lo que el ranking agrega a cada renglon de FindProducts.
function RankLine({ s, t }) {
    if (!s) return null;
    return (
        <span className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs tabular-nums ${MUTED}`}>
            <span className="rounded-md bg-amber-500 px-1.5 font-bold text-slate-900">#{fmt.count(s.lugar)}</span>
            <span>{t('panel.statistics.rowPieces', { count: fmt.count(s.piezas) })}</span>
            <span>{t('panel.statistics.rowTickets', { count: fmt.count(s.tickets) })}</span>
            <span>{fmt.money(s.ingreso)}</span>
            {s.cambio !== null && <span className={`font-semibold ${s.cambio >= 0 ? UP : DOWN}`}>{fmt.signed(s.cambio)}</span>}
            <Sparkline serie={s.serie} />
        </span>
    );
}

function Fact({ label, value, accent = '' }) {
    return (
        <div className="min-w-0 rounded-xl bg-[rgb(var(--color-bg))] px-3 py-2">
            <dt className={`truncate text-[11px] font-medium uppercase tracking-wide ${MUTED}`}>{label}</dt>
            <dd className={`truncate text-base font-bold tabular-nums ${accent}`}>{value}</dd>
        </div>
    );
}

function ProductDetail({ s, detail, onRetry, familyName, labels, recentRange, t }) {
    if (!s) {
        return <div className={`${CARD} text-sm ${MUTED}`}>{t('panel.statistics.detailEmpty')}</div>;
    }
    const cobertura = s.cobertura === null ? '—' : t('panel.statistics.months', { count: fmt.dec1(s.cobertura) });
    return (
        <section className={CARD} aria-live="polite">
            <p className={`text-xs font-bold uppercase tracking-wider ${MUTED}`}>{t('panel.statistics.detailTitle')}</p>
            <h2 className="mt-1 flex flex-wrap items-baseline gap-2 text-lg font-bold">
                <span className="rounded-md bg-amber-500 px-1.5 text-slate-900 tabular-nums">#{fmt.count(s.lugar)}</span>
                <span className="tabular-nums">{s.num_parte}</span>
            </h2>
            <p className="mt-0.5 text-sm">{s.descripcion}</p>
            <p className="mt-1.5">
                <span className="rounded-full bg-[rgb(var(--color-gray))] px-2 text-xs">{familyName(s.familia)}</span>
            </p>

            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Fact label={t('panel.statistics.pieces')} value={fmt.count(s.piezas)} />
                <Fact label={t('panel.statistics.tickets')} value={fmt.count(s.tickets)} />
                <Fact label={t('panel.statistics.perTicket')} value={fmt.dec2(s.piezas_ticket)} />
                <Fact label={t('panel.statistics.income')} value={fmt.money(s.ingreso)} />
                <Fact label={t('panel.statistics.incomeRank')} value={`#${fmt.count(s.lugar_ingreso)}`} />
                <Fact label={t('panel.statistics.avgPrice')} value={fmt.money2(s.precio_prom)} />
                <Fact label={t('panel.statistics.lastPrice', { month: monthLabel(s.mes_ultimo_precio) })} value={fmt.money2(s.ultimo_precio)} />
                <Fact label={t('panel.statistics.catalogPrice')} value={fmt.money2(s.precio_catalogo)} />
                <Fact label={t('panel.statistics.margin')} value={fmt.percent0(s.margen)} accent={s.margen !== null && s.margen < 0 ? DOWN : ''} />
                <Fact label={t('panel.statistics.stock')} value={fmt.count(s.existencia)} accent={s.existencia === 0 ? DOWN : ''} />
                <Fact label={t('panel.statistics.coverage')} value={cobertura} accent={s.cobertura !== null && s.cobertura < 1 ? DOWN : ''} />
                <Fact
                    label={t('panel.statistics.change')}
                    value={fmt.signed(s.cambio)}
                    accent={s.cambio === null ? '' : s.cambio >= 0 ? UP : DOWN}
                />
            </dl>
            <p className={`mt-2 text-xs ${MUTED}`}>
                {t('panel.statistics.detailDates', { first: dateLabel(s.primera), last: dateLabel(s.ultima) })}
                {' '}
                {recentRange && t('panel.statistics.detailRecent', { range: recentRange, count: fmt.count(s.u12) })}
            </p>

            <h3 className="mt-4 text-sm font-bold">{t('panel.statistics.detailMonthly')}</h3>
            {detail.status === 'error' ? (
                <div role="alert" className="mt-2 flex items-center gap-2 text-sm">
                    <FaCircleExclamation className={`size-4 shrink-0 ${DOWN}`} aria-hidden="true" />
                    <span className="flex-1">{detail.message}</span>
                    <button type="button" onClick={onRetry} className="font-semibold underline">{t('panel.common.retry')}</button>
                </div>
            ) : detail.status !== 'ready' ? (
                <div className="mt-2 h-52 animate-pulse rounded-xl bg-[rgb(var(--color-bg))]" aria-hidden="true" />
            ) : (
                <ProductMonthlyChart mensual={detail.data.mensual} labels={labels} />
            )}

            <h3 className="mt-4 text-sm font-bold">{t('panel.statistics.detailWith')}</h3>
            {detail.status === 'ready' && (detail.data.acompanantes.length ? (
                <ul className="mt-1 space-y-1">
                    {detail.data.acompanantes.map((a) => (
                        <li key={a.num_parte} className="flex items-baseline gap-2 text-sm">
                            <strong className="shrink-0 tabular-nums">{a.num_parte}</strong>
                            <span className={`min-w-0 flex-1 truncate ${MUTED}`}>{a.descripcion}</span>
                            <span className="shrink-0 tabular-nums">
                                {t('panel.statistics.withCount', { count: fmt.count(a.tickets), share: fmt.percent0(a.de ? a.tickets / a.de : null) })}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className={`mt-1 text-sm ${MUTED}`}>{t('panel.statistics.detailWithNone')}</p>
            ))}
        </section>
    );
}

/**
 * Almacen -> Estadistico: el ranking de lo que mas se vende y lo que dicen
 * esas ventas. Ranking usa el buscador del panel (FindProducts) en paginas de
 * 50: la pagina 1 son los lugares 1-50, la 2 del 51 al 100. Analisis tiene
 * las graficas.
 *
 * Todo sale de getSalesStatistics, que se calcula en cada visita. Quien entra
 * lo decide Permisos de perfil, y la API lo vuelve a revisar.
 */
export default function Statistics() {
    const { t } = useTranslation();
    const [load, setLoad] = useState({ status: 'loading', message: '' });
    const [stats, setStats] = useState(null);
    const [tab, setTab] = useState('ranking');
    const [view, setView] = useState('all');
    const [selected, setSelected] = useState(null);
    const [detail, setDetail] = useState({ status: 'idle', data: null, message: '' });
    const [detailTry, setDetailTry] = useState(0);
    const detailCache = useRef(new Map());
    const detailRef = useRef(null);
    const tabsRef = useRef(null);
    const requestRef = useRef(0);

    const loadData = useCallback(async () => {
        const request = ++requestRef.current;
        setLoad({ status: 'loading', message: '' });
        try {
            const data = await getStats('/getSalesStatistics');
            if (request !== requestRef.current) return;
            detailCache.current.clear();
            setStats(buildStats(data));
            setLoad({ status: 'ready', message: '' });
        } catch (error) {
            if (request === requestRef.current) setLoad({ status: 'error', message: error.message });
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Al llegar el ranking se abre el primer lugar, o se queda el que estaba.
    useEffect(() => {
        if (!stats) return;
        setSelected((actual) => (actual && stats.byPart.has(actual) ? actual : stats.productos[0]?.num_parte ?? null));
    }, [stats]);

    useEffect(() => {
        if (!selected || !stats) return undefined;
        const guardado = detailCache.current.get(selected);
        if (guardado) {
            setDetail({ status: 'ready', data: guardado, message: '' });
            return undefined;
        }
        let vigente = true;
        setDetail({ status: 'loading', data: null, message: '' });
        getStats(`/getProductSalesStatistics?parte=${encodeURIComponent(selected)}`)
            .then((data) => {
                detailCache.current.set(selected, data);
                if (vigente) setDetail({ status: 'ready', data, message: '' });
            })
            .catch((error) => {
                if (vigente) setDetail({ status: 'error', data: null, message: error.message });
            });
        return () => {
            vigente = false;
        };
    }, [selected, stats, detailTry]);

    const familyName = useCallback((id) => t(`panel.statistics.family.${id}`), [t]);
    const summary = useMemo(() => (stats ? summarize(stats) : null), [stats]);
    const top = useMemo(() => (stats ? stats.productos.slice(0, TOP) : []), [stats]);
    const range = (meses) => (meses.length ? `${monthLabel(meses[0])} – ${monthLabel(meses.at(-1))}` : '');
    const recentRange = stats ? range(stats.recientes) : '';
    const previousRange = stats ? range(stats.previos) : '';

    const analysis = useMemo(() => {
        if (!stats) return null;
        const bujias = top.filter((p) => p.familia === 'sparkPlugs');
        const masDe = (campo) => top.reduce((m, p) => (p[campo] !== null && (!m || p[campo] > m[campo]) ? p : m), null);
        return {
            familias: familySummary(top),
            tendencia: trendRows(top),
            inventario: inventoryRows(top),
            precios: priceRows(top),
            pares: pairRows(stats.pares, stats.byPart).slice(0, 12),
            porIngreso: [...stats.productos].sort((a, b) => a.lugar_ingreso - b.lugar_ingreso).slice(0, 10),
            topEnIngreso: top.filter((p) => p.lugar_ingreso <= TOP).length,
            bujiasTicket: median(bujias.map((p) => p.piezas_ticket)),
            masFrecuente: masDe('tickets'),
            porLote: masDe('piezas_ticket'),
            medianaPrecio: median(top.map((p) => p.relacion_precio)),
            medianaMargen: median(top.map((p) => p.margen)),
        };
    }, [stats, top]);

    const labels = useMemo(() => ({
        catalog: t('panel.statistics.seriesCatalog'),
        generic: t('panel.statistics.seriesGeneric'),
        outside: t('panel.statistics.seriesOutside'),
        noSales: t('panel.statistics.noSales'),
        ticketsPieces: (tickets, piezas) => t('panel.statistics.ticketsPieces', { tickets: fmt.count(tickets), pieces: fmt.count(piezas) }),
        pieces: t('panel.statistics.pieces'),
        income: t('panel.statistics.income'),
        products: (n) => t('panel.statistics.productsCount', { count: fmt.count(n) }),
        tickets: t('panel.statistics.tickets'),
        perTicket: t('panel.statistics.perTicket'),
        set: t('panel.statistics.setOfFour'),
        groups: { sparkPlugs: familyName('sparkPlugs'), fasteners: familyName('fasteners'), rest: t('panel.statistics.groupRest') },
        store: (change) => t('panel.statistics.storeChange', { change }),
        periods: (previo, reciente) => t('panel.statistics.periods', { previous: fmt.count(previo), recent: fmt.count(reciente) }),
        avgPrice: t('panel.statistics.avgPrice'),
    }), [t, familyName]);

    // Lo que FindProducts necesita para ser el ranking.
    const byPart = stats?.byPart;
    const productFilter = useCallback((product) => Boolean(byPart?.has(product.num_parte)), [byPart]);
    const decorateProduct = useCallback((product) => ({ ...product, stats: byPart.get(product.num_parte) }), [byPart]);
    const sortProducts = useCallback((a, b) => a.stats.lugar - b.stats.lugar, []);
    const views = useMemo(() => {
        const todas = { id: 'all', label: t('panel.statistics.viewAll') };
        if (!stats) return [todas];
        const presentes = new Set(stats.productos.map((p) => p.familia));
        return [
            todas,
            ...[...FAMILIAS.map((f) => f.id), OTHER_FAMILY]
                .filter((id) => presentes.has(id))
                .map((id) => ({ id, label: familyName(id), filter: (product) => product.stats?.familia === id })),
        ];
    }, [stats, t, familyName]);

    const select = useCallback((parte) => {
        setSelected(parte);
        // En pantallas angostas el detalle queda debajo de la lista.
        if (window.matchMedia?.('(max-width: 1279px)').matches) {
            requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
    }, []);
    const openFromAnalysis = (parte) => {
        setTab('ranking');
        select(parte);
    };
    const productAction = useCallback((product) => ({
        label: t('panel.statistics.viewDetail'),
        tone: product.num_parte === selected ? 'added' : 'outline',
        icon: FaChartColumn,
        iconOnly: true,
        onClick: () => select(product.num_parte),
    }), [selected, select, t]);
    const renderProductExtra = useCallback((product) => <RankLine s={product.stats} t={t} />, [t]);

    const partButton = (parte) => (
        <button type="button" onClick={() => openFromAnalysis(parte)} className="font-bold tabular-nums underline decoration-dotted underline-offset-2 hover:text-amber-600">
            {parte}
        </button>
    );

    const tabs = [
        { id: 'ranking', icon: FaRankingStar, title: t('panel.statistics.tabRanking'), hint: t('panel.statistics.tabRankingHint') },
        { id: 'analysis', icon: FaChartLine, title: t('panel.statistics.tabAnalysis'), hint: t('panel.statistics.tabAnalysisHint') },
    ];

    const renderAnalysis = () => {
        if (!analysis || !summary) return null;
        const { familias } = analysis;
        const [f1, f2] = familias;
        const par = analysis.pares[0];
        return (
            <div className="space-y-5">
                <Card
                    id="ingreso-mensual"
                    title={t('panel.statistics.monthlyTitle')}
                    subtitle={t('panel.statistics.monthlySubtitle')}
                    findings={[
                        t('panel.statistics.monthlyFinding', { share: fmt.percent(summary.shareGenerico), amount: fmt.money(summary.generico) }),
                        summary.sinVentas > 0 && t('panel.statistics.gapFinding', { count: fmt.count(summary.sinVentas) }),
                    ]}
                >
                    <MonthlyIncomeChart mensual={stats.mensual} labels={labels} />
                </Card>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <Card
                        id="familias"
                        title={t('panel.statistics.familiesTitle')}
                        subtitle={t('panel.statistics.familiesSubtitle')}
                        findings={[
                            f1 && f2 && t('panel.statistics.familiesFinding', {
                                a: familyName(f1.familia),
                                b: familyName(f2.familia),
                                pieces: fmt.percent0(f1.sharePiezas + f2.sharePiezas),
                                income: fmt.percent0(f1.shareIngreso + f2.shareIngreso),
                            }),
                            t('panel.statistics.incomeRankFinding', { count: fmt.count(analysis.topEnIngreso) }),
                        ]}
                    >
                        <FamilyChart rows={familias} familyName={familyName} labels={labels} />
                    </Card>
                    <Card id="por-ingreso" title={t('panel.statistics.byIncomeTitle')} subtitle={t('panel.statistics.byIncomeSubtitle')}>
                        <DataTable
                            rows={analysis.porIngreso}
                            rowKey={(p) => p.num_parte}
                            empty={t('panel.statistics.emptyTable')}
                            columns={[
                                { key: 'lugar', label: '#', num: true, render: (p) => fmt.count(p.lugar_ingreso) },
                                { key: 'parte', label: t('panel.statistics.part'), render: (p) => partButton(p.num_parte) },
                                { key: 'desc', label: t('panel.statistics.description'), className: 'min-w-48', render: (p) => p.descripcion },
                                { key: 'piezas', label: t('panel.statistics.pieces'), num: true, render: (p) => fmt.count(p.piezas) },
                                { key: 'ingreso', label: t('panel.statistics.income'), num: true, render: (p) => fmt.money(p.ingreso) },
                                { key: 'rank', label: t('panel.statistics.piecesRank'), num: true, render: (p) => `#${fmt.count(p.lugar)}` },
                            ]}
                        />
                    </Card>
                </div>

                <Card
                    id="como-se-compra"
                    title={t('panel.statistics.purchaseTitle')}
                    subtitle={t('panel.statistics.purchaseSubtitle')}
                    findings={[
                        analysis.masFrecuente && t('panel.statistics.frequentFinding', {
                            part: analysis.masFrecuente.num_parte,
                            desc: analysis.masFrecuente.descripcion,
                            tickets: fmt.count(analysis.masFrecuente.tickets),
                            perTicket: fmt.dec2(analysis.masFrecuente.piezas_ticket),
                        }),
                        analysis.bujiasTicket !== null && t('panel.statistics.sparkPlugFinding', { perTicket: fmt.dec2(analysis.bujiasTicket) }),
                        analysis.porLote && t('panel.statistics.bulkFinding', {
                            part: analysis.porLote.num_parte,
                            desc: analysis.porLote.descripcion,
                            pieces: fmt.count(analysis.porLote.piezas),
                            tickets: fmt.count(analysis.porLote.tickets),
                        }),
                    ]}
                >
                    <PurchaseScatter top={top} labels={labels} />
                </Card>

                <Card
                    id="tendencia"
                    title={t('panel.statistics.trendTitle')}
                    subtitle={stats.previos.length
                        ? t('panel.statistics.trendSubtitle', { recent: recentRange, previous: previousRange })
                        : t('panel.statistics.trendNotEnough')}
                    findings={[
                        summary.cambioTienda !== null && t(
                            summary.cambioTienda < 0 ? 'panel.statistics.trendFindingDown' : 'panel.statistics.trendFindingUp',
                            { change: fmt.percent0(Math.abs(summary.cambioTienda)) }
                        ),
                    ]}
                >
                    {analysis.tendencia.length ? (
                        <TrendChart rows={analysis.tendencia} storeChange={summary.cambioTienda} labels={labels} />
                    ) : (
                        <p className={`text-sm ${MUTED}`}>{t('panel.statistics.trendEmpty')}</p>
                    )}
                </Card>

                <Card
                    id="juntos"
                    title={t('panel.statistics.pairsTitle')}
                    subtitle={t('panel.statistics.pairsSubtitle')}
                    findings={[
                        par && t('panel.statistics.pairsFinding', { a: par.a, b: par.b, tickets: fmt.count(par.tickets), share: fmt.percent0(par.shareA) }),
                    ]}
                >
                    <DataTable
                        rows={analysis.pares}
                        rowKey={(p) => `${p.a}-${p.b}`}
                        empty={t('panel.statistics.emptyPairs')}
                        columns={[
                            { key: 'a', label: t('panel.statistics.productA'), className: 'min-w-48', render: (p) => <>{partButton(p.a)} <span className={MUTED}>{p.descA}</span></> },
                            { key: 'b', label: t('panel.statistics.productB'), className: 'min-w-48', render: (p) => <>{partButton(p.b)} <span className={MUTED}>{p.descB}</span></> },
                            { key: 'tickets', label: t('panel.statistics.together'), num: true, render: (p) => fmt.count(p.tickets) },
                            { key: 'sa', label: t('panel.statistics.shareOfA'), num: true, render: (p) => fmt.percent0(p.shareA) },
                            { key: 'sb', label: t('panel.statistics.shareOfB'), num: true, render: (p) => fmt.percent0(p.shareB) },
                        ]}
                    />
                </Card>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <Card
                        id="inventario"
                        title={t('panel.statistics.stockTitle')}
                        subtitle={t('panel.statistics.stockSubtitle')}
                        findings={[t('panel.statistics.stockFinding', { out: fmt.count(summary.agotados), low: fmt.count(summary.bajos) })]}
                    >
                        <DataTable
                            rows={analysis.inventario}
                            rowKey={(p) => p.num_parte}
                            empty={t('panel.statistics.emptyStock')}
                            columns={[
                                { key: 'parte', label: t('panel.statistics.part'), render: (p) => partButton(p.num_parte) },
                                { key: 'desc', label: t('panel.statistics.description'), className: 'min-w-44', render: (p) => p.descripcion },
                                { key: 'ex', label: t('panel.statistics.stock'), num: true, render: (p) => <span className={p.existencia === 0 ? `font-bold ${DOWN}` : ''}>{fmt.count(p.existencia)}</span> },
                                { key: 'dem', label: t('panel.statistics.perMonth'), num: true, render: (p) => fmt.dec1(p.demanda_mes) },
                                { key: 'cob', label: t('panel.statistics.coverage'), num: true, render: (p) => fmt.dec1(p.cobertura) },
                            ]}
                        />
                    </Card>
                    <Card
                        id="precios"
                        title={t('panel.statistics.pricesTitle')}
                        subtitle={t('panel.statistics.pricesSubtitle')}
                        findings={[
                            analysis.medianaPrecio !== null && t('panel.statistics.pricesFinding', {
                                ratio: fmt.times(analysis.medianaPrecio),
                                margin: fmt.percent0(analysis.medianaMargen),
                            }),
                        ]}
                    >
                        <DataTable
                            rows={analysis.precios}
                            rowKey={(p) => p.num_parte}
                            empty={t('panel.statistics.emptyPrices')}
                            columns={[
                                { key: 'parte', label: t('panel.statistics.part'), render: (p) => partButton(p.num_parte) },
                                { key: 'desc', label: t('panel.statistics.description'), className: 'min-w-44', render: (p) => p.descripcion },
                                { key: 'cat', label: t('panel.statistics.catalogPrice'), num: true, render: (p) => fmt.money2(p.precio_catalogo) },
                                { key: 'ult', label: t('panel.statistics.lastCharged'), num: true, render: (p) => <>{fmt.money2(p.ultimo_precio)}<span className={`block text-xs ${MUTED}`}>{monthLabel(p.mes_ultimo_precio)}</span></> },
                                { key: 'rel', label: t('panel.statistics.ratio'), num: true, render: (p) => <span className={p.relacion_precio <= 0.8 ? `font-bold ${DOWN}` : ''}>{fmt.times(p.relacion_precio)}</span> },
                            ]}
                        />
                    </Card>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] pb-24 pt-28">
            <Title title={t('panel.statistics.title')} icon={FaChartLine} back={t('panel.common.back')} path="/productivity" />

            <div className="mx-auto mt-5 max-w-7xl space-y-5 px-2 sm:px-4 xl:px-8">
                <section className={CARD}>
                    <header className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-lg font-bold">{t('panel.statistics.summaryTitle')}</h2>
                            <p className={`text-sm ${MUTED}`}>
                                {summary
                                    ? t('panel.statistics.summarySubtitle', {
                                        from: monthLabel(summary.desde),
                                        to: monthLabel(summary.hasta),
                                        parts: fmt.count(summary.partes),
                                    })
                                    : t('panel.statistics.loading')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={loadData}
                            aria-label={t('panel.assignment.refresh')}
                            title={t('panel.assignment.refresh')}
                            className="grid size-10 shrink-0 place-items-center rounded-full bg-[rgb(var(--color-bg))] shadow-sm hover:bg-amber-400/30"
                        >
                            <FaArrowsRotate className={`size-4 ${load.status === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
                        </button>
                    </header>

                    {load.status === 'error' && !stats ? (
                        <div role="alert" className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-[rgb(var(--color-bg))] p-6 text-center">
                            <FaCircleExclamation className={`size-6 ${DOWN}`} aria-hidden="true" />
                            <p className="text-sm">{load.message || t('panel.common.unexpectedError')}</p>
                            <button type="button" onClick={loadData} className="h-11 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow">
                                {t('panel.common.retry')}
                            </button>
                        </div>
                    ) : !summary ? (
                        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-hidden="true">
                            {[0, 1, 2, 3].map((key) => <div key={key} className="h-24 animate-pulse rounded-2xl bg-[rgb(var(--color-bg))]" />)}
                        </div>
                    ) : (
                        <>
                            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                                <Kpi
                                    label={t('panel.statistics.kpiTopPieces')}
                                    value={fmt.percent(summary.sharePiezas)}
                                    hint={t('panel.statistics.kpiTopPiecesHint', { top: fmt.count(summary.topPiezas), total: fmt.count(summary.piezas) })}
                                />
                                <Kpi
                                    label={t('panel.statistics.kpiTopIncome')}
                                    value={fmt.percent(summary.shareIngreso)}
                                    hint={t('panel.statistics.kpiTopIncomeHint', { top: fmt.money(summary.topIngreso), total: fmt.money(summary.ingreso) })}
                                />
                                <Kpi
                                    label={t('panel.statistics.kpiGeneric')}
                                    value={fmt.percent(summary.shareGenerico)}
                                    hint={t('panel.statistics.kpiGenericHint', { amount: fmt.money(summary.generico) })}
                                    accent={summary.shareGenerico >= 0.25 ? 'text-amber-500' : ''}
                                />
                                <Kpi
                                    label={t('panel.statistics.kpiOut')}
                                    value={fmt.count(summary.agotados)}
                                    hint={t('panel.statistics.kpiOutHint', { count: fmt.count(summary.bajos) })}
                                    accent={summary.agotados ? DOWN : ''}
                                />
                            </div>
                            <p className={`mt-3 text-xs leading-relaxed ${MUTED}`}>
                                {stats.historial
                                    ? t('panel.statistics.sourceHistory', { from: dateLabel(stats.fuentes.historial_desde), to: dateLabel(stats.fuentes.historial_hasta) })
                                    : t('panel.statistics.sourceNoHistory')}
                                {' '}
                                {summary.sinVentas > 0 && `${t('panel.statistics.sourceGap', { count: fmt.count(summary.sinVentas) })} `}
                                {t('panel.statistics.sourceExcluded')}
                            </p>
                        </>
                    )}
                </section>

                <div ref={tabsRef} className="scroll-mt-28 space-y-4">
                    <div role="tablist" aria-label={t('panel.statistics.title')} className="grid grid-cols-2 gap-2 sm:gap-3">
                        {tabs.map(({ id, icon: Icon, title, hint }) => {
                            const activa = tab === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activa}
                                    onClick={() => setTab(id)}
                                    className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl p-3 text-center transition sm:flex-row sm:items-start sm:gap-3 sm:p-4 sm:text-left ${activa
                                        ? 'bg-amber-500 text-slate-900 shadow-lg'
                                        : 'bg-[rgb(var(--color-card))] shadow-sm hover:-translate-y-0.5 hover:shadow-md'}`}
                                >
                                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${activa ? 'bg-slate-900/15' : 'bg-amber-500/20 text-amber-600'}`}>
                                        <Icon className="size-5" aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-bold leading-tight sm:text-base">{title}</span>
                                        <span className={`mt-0.5 hidden text-xs leading-snug sm:block ${activa ? 'text-slate-900/75' : MUTED}`}>{hint}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {tab === 'ranking' ? (
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                            <div className="min-w-0 overflow-hidden rounded-2xl bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))]">
                                <FindProducts
                                    showAllBranches
                                    includeWebBranch={false}
                                    includePendingProducts={false}
                                    productFilter={productFilter}
                                    decorateProduct={stats ? decorateProduct : undefined}
                                    sortProducts={stats ? sortProducts : undefined}
                                    pageSize={PAGE_SIZE}
                                    views={views}
                                    view={view}
                                    onViewChange={setView}
                                    productAction={stats ? productAction : undefined}
                                    renderProductExtra={stats ? renderProductExtra : undefined}
                                    emptyMessage={load.status === 'loading' ? t('panel.statistics.loadingRanking') : t('panel.statistics.emptyRanking')}
                                    listClassName="max-h-[46rem]"
                                />
                            </div>
                            <div ref={detailRef} className="min-w-0 scroll-mt-28 xl:sticky xl:top-28 xl:self-start">
                                <ProductDetail
                                    s={selected ? stats?.byPart.get(selected) : null}
                                    detail={detail}
                                    onRetry={() => {
                                        detailCache.current.delete(selected);
                                        setDetailTry((n) => n + 1);
                                    }}
                                    familyName={familyName}
                                    labels={labels}
                                    recentRange={recentRange}
                                    t={t}
                                />
                            </div>
                        </div>
                    ) : (
                        renderAnalysis()
                    )}
                </div>
            </div>
        </div>
    );
}
