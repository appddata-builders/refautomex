import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Title from '../title';
import { FaUsersViewfinder } from 'react-icons/fa6';
import { FaSearch } from 'react-icons/fa';
import { IoMdCloudDone } from 'react-icons/io';
import { GoClockFill } from 'react-icons/go';
import { BiSolidUserCircle } from 'react-icons/bi';
import { useTranslation } from '@/app/lib/text/text-provider';

const normalizeStatus = (invoice) => {
    const emitida = String(invoice?.emitida || '').toUpperCase(); // 'P' | 'F'
    const hasUuid = Boolean(invoice?.uuid || invoice?.uuid_sat || invoice?.uuid_cfdi);
    if (emitida === 'F' || hasUuid) return 'finalizada';
    return 'pendiente';
};

const shapeInvoice = (invoice) => ({
    id: invoice.idfactura ?? invoice.idFactura ?? invoice.id_factura ?? invoice.id,
    folio: invoice.folio ?? invoice.folio_factura ?? invoice.folioVenta ?? null,
    nombre: invoice.nombre ?? invoice.cliente ?? invoice.razon_social ?? '---',
    email: invoice.email ?? '---',
    telefono: invoice.telefono ?? invoice.phone ?? '---',
    rfc: invoice.rfc ?? '---',
    domicilio: invoice.domicilio ?? invoice.direccion ?? '---',
    cp: invoice.cp ?? null,
    sucursal: invoice.sucursal ?? invoice.nombre_sucursal ?? invoice.branch ?? null,
    cfdi: invoice.cfdi ?? invoice.cfdi_clave ?? invoice.idcfdi ?? '---',
    regimen: invoice.regimen ?? invoice.idregimen ?? '---',
    createdAt: invoice.fecha ?? invoice.fecha_creacion ?? null,
    status: normalizeStatus(invoice),
});

const statusBadgeClass = (status) =>
    status === 'finalizada'
        ? 'bg-green-500 text-white'
        : 'bg-amber-500 text-[rgb(var(--color-text))]';

const isLikelyPlaceId = (val) => {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (trimmed.length < 5 || trimmed.length > 250) return false;
    // Google place_id no lleva espacios
    if (/\s/.test(trimmed)) return false;
    return true;
};

const normalizeFolioKey = (value) =>
    String(value ?? '').trim().toUpperCase();

const formatShortDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-MX', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    }).format(parsed);
};

const getDaysSince = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const diffMs = Date.now() - parsed.getTime();
    if (diffMs < 0) return 0;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

export default function Invoice() {
    const { t } = useTranslation();
    const [invoices, setInvoices] = useState([]);
    const [filter, setFilter] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [expanded, setExpanded] = useState(null);
    const [finalizingId, setFinalizingId] = useState(null);
    const [detailsByFolio, setDetailsByFolio] = useState({});
    const [detailsLoading, setDetailsLoading] = useState({});
    const [purchaseDateByFolio, setPurchaseDateByFolio] = useState({});
    const [branchByFolio, setBranchByFolio] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 25;
    const [placeCache, setPlaceCache] = useState({});
    const placeCacheRef = useRef({});
    const placesServiceRef = useRef(null);

    useEffect(() => {
        if (!placesServiceRef.current && typeof window !== 'undefined' && window.google?.maps?.places) {
            placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement('div'));
        }
    }, []);

    const fetchInvoices = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(buildApiUrl('/getInvoices'), {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' },
            });
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const payload = await response.json();
            const rows = Array.isArray(payload?.[0]) ? payload[0] : Array.isArray(payload) ? payload : [];
            console.log('GetInvoices payload (rows):', rows);
            const shaped = rows.map(shapeInvoice);
            setInvoices(shaped);
        } catch (err) {
            console.error('Error fetching invoices:', err);
            setError(err.message);
            setInvoices([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, []);

    const [activeTab, setActiveTab] = useState('pendientes');

    useEffect(() => {
        setExpanded(null);
    }, [activeTab]);

    const resolvePlace = useCallback((placeId) => {
        if (!placeId || placeCacheRef.current[placeId]) return;
        if (!isLikelyPlaceId(placeId)) return;
        const service = placesServiceRef.current;
        if (!service) return;

        service.getDetails(
            { placeId, fields: ['formatted_address'] },
            (place, status) => {
                const formatted =
                    status === window.google.maps.places.PlacesServiceStatus.OK
                        ? place?.formatted_address || placeId
                        : placeId;
                setPlaceCache((prev) => {
                    if (prev[placeId]) return prev;
                    const next = { ...prev, [placeId]: formatted };
                    placeCacheRef.current = next;
                    return next;
                });
            }
        );
    }, []);

    useEffect(() => {
        const uniquePlaceIds = Array.from(
            new Set(invoices.map((inv) => inv.domicilio).filter(Boolean))
        )
            .filter(isLikelyPlaceId)
            .slice(0, 50); // evita demasiadas llamadas
        uniquePlaceIds.forEach(resolvePlace);
    }, [invoices, resolvePlace]);

    const fetchDetails = useCallback(
        async (folio) => {
            const normalizedFolio = normalizeFolioKey(folio);
            if (!normalizedFolio) return;
            if (detailsByFolio[normalizedFolio] && purchaseDateByFolio[normalizedFolio]) return;
            setDetailsLoading((prev) => ({ ...prev, [normalizedFolio]: true }));
            try {
                const params = new URLSearchParams({ id: normalizedFolio });
                const endpoint = `${buildApiUrl('/getFolioHistory')}?${params.toString()}`;
                const response = await fetch(endpoint, {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });
                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }
                const payload = await response.json();
                const headers = Array.isArray(payload?.[0]) ? payload[0] : [];
                const details = Array.isArray(payload?.[1]) ? payload[1] : [];
                const header = headers.find(
                    (h) => normalizeFolioKey(h?.folio) === normalizedFolio
                ) || headers[0];
                const idventa = header?.idventa ?? header?.idVenta;
                const purchaseDate = header?.fecha_venta;
                const branchName = header?.sucursal;
                let resolvedPurchaseDate = purchaseDate;
                if (!resolvedPurchaseDate) {
                    try {
                        const searchParams = new URLSearchParams({
                            mode: 'folio',
                            term: normalizedFolio,
                        });
                        const searchResponse = await fetch(
                            `${buildApiUrl('/getHistorySearch')}?${searchParams.toString()}`,
                            {
                                cache: 'no-store',
                                headers: { Accept: 'application/json, text/plain, */*' },
                            }
                        );
                        if (searchResponse.ok) {
                            const searchPayload = await searchResponse.json();
                            const match = Array.isArray(searchPayload)
                                ? searchPayload.find(
                                    (row) => normalizeFolioKey(row?.folio) === normalizedFolio
                                )
                                : null;
                            resolvedPurchaseDate =
                                match?.fecha_venta ??
                                match?.fechaVenta ??
                                match?.fecha ??
                                resolvedPurchaseDate;
                        }
                    } catch (searchError) {
                        console.warn('Error resolving purchase date from history search:', searchError);
                    }
                }
                const filteredDetails = idventa
                    ? details.filter((d) => String(d.idventa ?? d.idVenta) === String(idventa))
                    : details;
                setDetailsByFolio((prev) => ({ ...prev, [normalizedFolio]: filteredDetails || [] }));
                if (resolvedPurchaseDate) {
                    setPurchaseDateByFolio((prev) => ({ ...prev, [normalizedFolio]: resolvedPurchaseDate }));
                }
                if (branchName) {
                    setBranchByFolio((prev) => ({ ...prev, [normalizedFolio]: branchName }));
                }
            } catch (err) {
                console.error('Error fetching folio details:', err);
                setDetailsByFolio((prev) => ({ ...prev, [normalizedFolio]: [] }));
            } finally {
                setDetailsLoading((prev) => ({ ...prev, [normalizedFolio]: false }));
            }
        },
        [detailsByFolio, purchaseDateByFolio]
    );

    const handleFinalize = useCallback(
        async (invoice) => {
            const targetId = invoice.id ?? invoice.folio;
            if (!targetId || finalizingId) return;
            setFinalizingId(targetId);
            try {
                const response = await fetch(buildApiUrl('/finalizeInvoice'), {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json, text/plain, */*',
                    },
                    body: JSON.stringify({
                        idfactura: invoice.id ?? null,
                        folio: invoice.folio ?? null,
                    }),
                });
                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }
                setInvoices((prev) =>
                    prev.map((inv) =>
                        (inv.id ?? inv.folio) === targetId
                            ? { ...inv, status: 'finalizada', emitida: 'F' }
                            : inv
                    )
                );
            } catch (err) {
                console.error('Error finalizing invoice:', err);
                setError(err.message);
            } finally {
                setFinalizingId(null);
            }
        },
        [finalizingId]
    );

    const filtered = useMemo(() => {
        const term = filter.trim().toLowerCase();
        if (!term) return invoices;
        return invoices.filter((inv) =>
            [
                inv.folio,
                inv.nombre,
                inv.email,
                inv.telefono,
                inv.rfc,
                inv.domicilio,
            ]
                .join(' ')
                .toLowerCase()
                .includes(term)
        );
    }, [filter, invoices]);

    const pending = filtered.filter((inv) => inv.status === 'pendiente');
    const finished = filtered.filter((inv) => inv.status === 'finalizada');
    const activeList = activeTab === 'pendientes' ? pending : finished;
    const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
    const paginatedInvoices = activeList.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, filter]);

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const renderRow = (invoice, idx) => {
        const key = invoice.id ?? invoice.folio ?? `inv-${idx}`;
        const isExpanded = expanded === invoice.id || expanded === invoice.folio;
        const address = invoice.domicilio ? (placeCache[invoice.domicilio] || invoice.domicilio) : '---';
        const detailKey = normalizeFolioKey(invoice.folio);
        const branchLabel = branchByFolio[detailKey] || invoice.sucursal || '---';
        const isPending = invoice.status === 'pendiente';
        const detailList = detailKey ? detailsByFolio[detailKey] : undefined;
        const isDetailLoading = detailKey ? detailsLoading[detailKey] : false;
        const purchaseDate = detailKey ? purchaseDateByFolio[detailKey] : null;
        const formattedPurchaseDate = formatShortDate(purchaseDate);
        const waitingDays = isPending ? getDaysSince(purchaseDate) : null;
        const toUpper = (val) => (typeof val === 'string' ? val.toUpperCase() : val ?? '---');
        const preserve = (val) => val ?? '---';
        return (
            <div
                key={key}
                className="bg-[rgb(var(--color-card))] shadow rounded-xl p-4 border border-[rgb(var(--color-border))] mb-3"
            >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="font-bold text-lg text-[rgb(var(--color-text))] break-words">
                        {invoice.folio || '---'}
                    </div>
                    <button
                        className="text-xs px-3 py-1 rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] hover:border-[rgb(var(--color-amber))] cursor-pointer"
                        onClick={() => {
                            const target = invoice.id ?? invoice.folio;
                            const nextExpanded = isExpanded ? null : target;
                            setExpanded(nextExpanded);
                            if (!isExpanded && invoice.folio) fetchDetails(invoice.folio);
                        }}
                    >
                        <div className="flex items-center gap-2 text-sm text-[rgb(var(--color-text))]/80">
                            <BiSolidUserCircle className="w-6 h-6" />
                            <span className="break-words truncate w-36">{invoice.nombre}</span>
                        </div>
                    </button>
                </div>
                {isExpanded && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-[rgb(var(--color-text))]">
                        <div className="break-words"><span className="font-semibold">{t('panel.invoice.name')} </span>{toUpper(invoice.nombre)}</div>
                        <div className="flex min-w-0 gap-2">
                            <span className="font-semibold">{t('panel.invoice.email')}</span>
                            <span className="min-w-0 break-all overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                                {preserve(invoice.email)}
                            </span>
                        </div>
                        <div className="break-words"><span className="font-semibold">{t('panel.invoice.phone')} </span>{invoice.telefono}</div>
                        <div className="break-words"><span className="font-semibold">{t('panel.invoice.rfc')} </span>{toUpper(invoice.rfc)}</div>
                        <div className="break-words"><span className="font-semibold">{t('panel.invoice.cfdi')} </span>{toUpper(invoice.cfdi)}</div>
                        <div className="break-words"><span className="font-semibold">{t('panel.invoice.regime')} </span>{toUpper(invoice.regimen)}</div>
                        <div className="break-words whitespace-pre-wrap"><span className="font-semibold">{t('panel.invoice.address')} </span>{toUpper(address)}</div>
                        <div className="break-words"><span className="font-semibold">{t('panel.invoice.cp')} </span>{invoice.cp || '---'}</div>
                        <div className="break-words"><span className="font-semibold text-[rgb(var(--color-amber))]">{t('panel.invoice.branch')} </span>{toUpper(branchLabel)}</div>
                        {formattedPurchaseDate && (
                            <div className="break-words"><span className="font-semibold text-[rgb(var(--color-amber))]">{t('panel.invoice.purchase')} </span>{formattedPurchaseDate}</div>
                        )}
                        {isPending && Number.isFinite(waitingDays) && (
                            <div className="break-words"><span className="font-semibold text-[rgb(var(--color-amber))]">{t('panel.invoice.waiting')} </span>{waitingDays} {t('panel.invoice.days')}</div>
                        )}
                        {isPending && (
                            <div className="sm:col-span-2 flex justify-end">
                                <button
                                    className="text-md px-3 py-2 rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-galaxy))] disabled:opacity-60 cursor-pointer text-[rgb(var(--color-text))]"
                                    disabled={!!finalizingId}
                                    onClick={() => handleFinalize(invoice)}
                                >
                                    {finalizingId === (invoice.id ?? invoice.folio) ? t('panel.providers.saving') : t('panel.invoice.finalize')}
                                </button>
                            </div>
                        )}
                        <div className="sm:col-span-2 mt-2">
                            <div className="text-sm font-semibold text-[rgb(var(--color-text))] mb-2">{t('panel.invoice.products')}</div>
                            {isDetailLoading && <p className="text-xs text-[rgb(var(--color-text))]">{t('panel.invoice.loadingProducts')}</p>}
                            {!isDetailLoading && detailList && detailList.length === 0 && (
                                <p className="text-xs text-[rgb(var(--color-text))]/80">{t('panel.invoice.noDetail')}</p>
                            )}
                            {!isDetailLoading && Array.isArray(detailList) && detailList.length > 0 && (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-xs text-left text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))] rounded-lg">
                                        <thead className="bg-[rgb(var(--color-card))]">
                                            <tr>
                                                <th className="py-2 px-3">{t('panel.invoice.partNumber')}</th>
                                                <th className="py-2 px-3">{t('panel.capture.descriptionLabel')}</th>
                                                <th className="py-2 px-3">{t('panel.capture.quantity')}</th>
                                                <th className="py-2 px-3">{t('panel.invoice.price')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detailList.map((d, i) => (
                                                <tr key={`${invoice.folio}-det-${i}`} className="bg-[rgb(var(--color-bg))] border-t border-[rgb(var(--color-border))]">
                                                    <td className="py-2 px-3 break-words">{toUpper(d.num_parte ?? d.numParte)}</td>
                                                    <td className="py-2 px-3 break-words">
                                                        {toUpper(d.concepto_comodin ?? d.descripcion ?? d.descripcion_producto)}
                                                    </td>
                                                    <td className="py-2 px-3">{d.cantidad ?? d.cant ?? d.cant_detalle ?? '---'}</td>
                                                    <td className="py-2 px-3">$ {d.precio_venta ?? d.precio ?? d.precio_detalle ?? '---'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] backdrop-blur-md pt-28">
            <Title
                title={t('panel.invoice.title')}
                icon={FaUsersViewfinder}
                back={t('panel.common.back')}
                path="/productivity"
            />

            <div className="mx-auto max-w-7xl px-4 lg:px-0 mt-6">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setActiveTab('pendientes')}
                                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border transition cursor-pointer ${
                                    activeTab === 'pendientes'
                                        ? 'bg-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))] border-[rgb(var(--color-galaxy))]'
                                        : 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] border-[rgb(var(--color-border))] hover:border-[rgb(var(--color-galaxy))]'
                                }`}
                            >
                                <GoClockFill className="text-[rgb(var(--color-text))]" />
                                {t('panel.invoice.tabPending')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('finalizadas')}
                                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border transition cursor-pointer ${
                                    activeTab === 'finalizadas'
                                        ? 'bg-emerald-500 text-[rgb(var(--color-text))] border-emerald-500'
                                        : 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] border-[rgb(var(--color-border))] hover:border-emerald-500'
                                }`}
                            >
                                <IoMdCloudDone className="text-[rgb(var(--color-text))]" />
                                {t('panel.invoice.tabFinished')}
                            </button>
                        </div>
                        <div className="flex items-center gap-2 bg-[rgb(var(--color-card))] rounded-full px-3 py-2 shadow border border-[rgb(var(--color-border))] w-full lg:w-auto">
                            <FaSearch className="text-[rgb(var(--color-text))]/70" />
                            <input
                                type="text"
                                placeholder={t('panel.invoice.searchPlaceholder')}
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                className="bg-transparent outline-none text-sm text-[rgb(var(--color-text))] w-full lg:w-72"
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-6 bg-[rgb(var(--color-card))] rounded-2xl p-5 shadow">
                    <div className="flex items-center gap-2 text-[rgb(var(--color-text))] font-semibold mb-4">
                        {activeTab === 'pendientes' ? (
                            <>
                                <GoClockFill className="text-amber-500" /> {t('panel.invoice.tabPending')}
                            </>
                        ) : (
                            <>
                                <IoMdCloudDone className="text-green-600" /> {t('panel.invoice.tabFinished')}
                            </>
                        )}
                    </div>
                    {isLoading && <p className="text-sm text-[rgb(var(--color-text))]">{t('common.loading')}</p>}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    {!isLoading && !error && activeTab === 'pendientes' && pending.length === 0 && (
                        <p className="text-sm text-[rgb(var(--color-text))]">{t('panel.capture.noPendingInvoices')}</p>
                    )}
                    {!isLoading && !error && activeTab === 'pendientes' && paginatedInvoices.map(renderRow)}
                    {!isLoading && !error && activeTab === 'finalizadas' && finished.length === 0 && (
                        <p className="text-sm text-[rgb(var(--color-text))]">{t('panel.invoice.noFinished')}</p>
                    )}
                    {!isLoading && !error && activeTab === 'finalizadas' && paginatedInvoices.map(renderRow)}
                    {!isLoading && !error && activeList.length > PAGE_SIZE && (
                        <div className="flex items-center justify-center gap-3 pt-4 text-xs text-[rgb(var(--color-text))]/80">
                            <button
                                type="button"
                                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className={`px-3 py-1 rounded-full border ${
                                    currentPage === 1
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'hover:bg-[rgb(var(--color-card-white))]'
                                }`}
                            >
                                {t('common.prev')}
                            </button>
                            <span>
                                {t('panel.common.pageOf', { page: currentPage, total: totalPages })}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className={`px-3 py-1 rounded-full border ${
                                    currentPage === totalPages
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'hover:bg-[rgb(var(--color-card-white))]'
                                }`}
                            >
                                {t('common.next')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
