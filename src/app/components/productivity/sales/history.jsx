import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useState, useEffect, useRef, Fragment, useMemo, useCallback, useContext } from 'react';
import Title from '../title';
import { MdSell } from "react-icons/md";
import { FaSearch } from "react-icons/fa";
import { BiMoneyWithdraw } from 'react-icons/bi';
import { BiSolidUserCircle } from 'react-icons/bi';
import { GrStatusGoodSmall } from "react-icons/gr";
import { IoTicket } from "react-icons/io5";
import { FaArrowDown, FaArrowUp } from "react-icons/fa";
import { useTimeZoneContext } from '@/app/lib/time-zone-context';
import { useReactToPrint } from 'react-to-print';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Legend,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
} from 'recharts';
import ComponentToPrint, { prefetchBranchData } from './component-print';
import { AuthContext } from '@/app/lib/auth-tracker';
import { useTranslation } from '@/app/lib/text/text-provider';

const UTILITY_RATE = 0.3;
const currencyFormatter = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
});
const compactCurrencyFormatter = new Intl.NumberFormat('es-MX', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

const toNumber = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeFlag = (value) => {
    if (value === true || value === false) return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const normalized = value.trim().toUpperCase();
        return ['S', 'SI', 'YES', 'TRUE', '1', 'Y'].includes(normalized);
    }
    return false;
};

const linePalette = [
    'rgb(245 158 11)',
    'rgb(16 185 129)',
    'rgb(59 130 246)',
    'rgb(244 63 94)',
    'rgb(139 92 246)',
    'rgb(14 165 233)',
    'rgb(249 115 22)',
    'rgb(34 197 94)',
];

const getDetailRef = (detail) =>
    String(detail?.refaccion ?? detail?.num_parte ?? detail?.numero_parte ?? '').trim().toUpperCase();

const isSeminewDetail = (detail) => {
    if (!detail) return false;
    if (normalizeFlag(detail.isSeminew ?? detail.is_semi ?? detail.is_seminew ?? detail.seminew)) return true;
    const ref = getDetailRef(detail);
    return ref.startsWith('SEMI-') || ref.startsWith('SEMI');
};

const calculateDetailTotals = (details) => {
    const rows = Array.isArray(details) ? details : [];
    return rows.reduce(
        (acc, detail) => {
            const quantity = Number(detail?.cantidad ?? 0);
            if (!Number.isFinite(quantity) || quantity <= 0) return acc;

            const rawMonto = toNumber(detail?.monto_venta ?? detail?.monto ?? detail?.importe ?? 0);
            const fallbackUnitPrice = rawMonto > 0 ? rawMonto / quantity : 0;
            const unitPrice = toNumber(detail?.precio_venta ?? detail?.precio ?? fallbackUnitPrice);
            const lineTotal = rawMonto > 0 ? rawMonto : unitPrice * quantity;

            if (!Number.isFinite(lineTotal) || lineTotal <= 0) return acc;

            const semiNew = isSeminewDetail(detail);
            if (semiNew) {
                acc.providers += lineTotal;
                return acc;
            }

            const utility = lineTotal * UTILITY_RATE;
            acc.utility += utility;
            acc.providers += lineTotal - utility;
            return acc;
        },
        { utility: 0, providers: 0 }
    );
};

const parseSaleDate = (dateInput) => {
    if (!dateInput) return null;
    if (typeof dateInput === "string") {
        const datePart = dateInput.includes("T")
            ? dateInput.split("T")[0]
            : dateInput;
        const [year, month, day] = datePart.split("-").map((part) => Number(part));
        if (!year || !month || !day) return null;
        const parsed = new Date(year, month - 1, day);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(dateInput);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildDateKey = (date, granularity) => {
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    if (granularity === 'year') return `${year}`;
    if (granularity === 'month') return `${year}-${month}`;
    return `${year}-${month}-${day}`;
};

const formatChartLabel = (key, granularity, includeYear = false) => {
    if (!key) return '';
    const locale = 'es-MX';
    if (granularity === 'year') return key;
    if (granularity === 'month') {
        const [year, month] = key.split('-').map((part) => Number(part));
        const parsed = new Date(year, (month || 1) - 1, 1);
        return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(parsed);
    }
    const [year, month, day] = key.split('-').map((part) => Number(part));
    const parsed = new Date(year, (month || 1) - 1, day || 1);
    return new Intl.DateTimeFormat(locale, includeYear
        ? { day: '2-digit', month: '2-digit', year: '2-digit' }
        : { day: '2-digit', month: 'short' }
    ).format(parsed);
};

const sanitizeDateKey = (value, granularity) => {
    if (!value) return '';
    let raw = String(value).trim();
    if (!raw) return '';
    if (raw.includes('T')) raw = raw.split('T')[0];
    if (raw.includes(' ')) raw = raw.split(' ')[0];
    if (granularity === 'month') return raw.slice(0, 7);
    if (granularity === 'day') return raw.slice(0, 10);
    return raw;
};

const createTooltip = (icon, label, id, visibleTooltip, setVisibleTooltip) => {
    const show = () => setVisibleTooltip(id);
    const hide = () => setVisibleTooltip(null);
    const tooltip = visibleTooltip === id ? (
        <div
            className="absolute left-full ml-3 top-1/2 transform -translate-y-1/2 opacity-90 bg-[rgb(var(--color-card))] shadow text-[rgb(var(--color-text))] text-xs rounded px-2 py-1 z-10"
            style={{ width: 'max-content', maxWidth: '16rem' }}
        >
            {label}
        </div>
    ) : null;

    return { show, hide, tooltip };
};

const normalizeBranchId = (value) => {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
};

const normalizeSaleId = (value) => {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
};

const normalizeFolioInput = (value) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return '';
    if (/^(t|w)-/i.test(trimmed)) return trimmed.toUpperCase();
    return trimmed;
};

const normalizeBranchesPayload = (payload) => {
    if (Array.isArray(payload?.[0])) return payload[0];
    if (Array.isArray(payload)) return payload;
    return [];
};

const isWebBranch = (value) => {
    const normalized = normalizeBranchId(value);
    if (!normalized) return false;
    const upper = normalized.toUpperCase();
    return upper === '1' || upper === 'WEB';
};

export default function History() {
    const { t } = useTranslation();
    const [visibleTooltip, setVisibleTooltip] = useState(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [imageErrors, setImageErrors] = useState({});
    const [sales, setSales] = useState([]);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchMode, setSearchMode] = useState('date');
    const [searchTerm, setSearchTerm] = useState('');
    const [pendingSearchMode, setPendingSearchMode] = useState('date');
    const [pendingSearchTerm, setPendingSearchTerm] = useState('');
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState('');
    const [folioToChange, setFolioToChange] = useState('');
    const [expandedFolio, setExpandedFolio] = useState(null);
    const [ticketData, setTicketData] = useState(null);
    const [branchOptions, setBranchOptions] = useState([]);
    const [branchMap, setBranchMap] = useState({});
    const [selectedBranch, setSelectedBranch] = useState('');
    const [branchInitialized, setBranchInitialized] = useState(false);
    const [employeeBranchMap, setEmployeeBranchMap] = useState({});
    const [chartView, setChartView] = useState('day');
    const [viewMode, setViewMode] = useState('table');
    const [salesSummary, setSalesSummary] = useState(null);
    const [salesIndex, setSalesIndex] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 50;
    const { userData } = useContext(AuthContext);
    const userBranchId = normalizeBranchId(userData?.idsucursal);
    const componentRef = useRef(null);
    const chartRef = useRef(null);
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        onAfterPrint: () => setTicketData(null),
    });

    const findTooltip = createTooltip(FaSearch, t('panel.history.findTicket'), 'find', visibleTooltip, setVisibleTooltip);
    const withdrawTooltip = createTooltip(BiMoneyWithdraw, t('panel.history.withdraw'), 'withdraw', visibleTooltip, setVisibleTooltip);

    const formatDate = (dateInput, timeZone) => {
        if (!dateInput) return t('panel.history.noDate');

        let date;
        if (typeof dateInput === "string") {
            const datePart = dateInput.includes("T")
                ? dateInput.split("T")[0]
                : dateInput;
            const [year, month, day] = datePart.split("-");
            date = new Date(year, month - 1, day);
        } else {
            date = new Date(dateInput);
        }

        if (isNaN(date.getTime())) {
            console.error("Fecha inválida recibida:", dateInput);
            return t('panel.history.invalidDate');
        }

        return new Intl.DateTimeFormat("es-MX", {
            timeZone,
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
        }).format(date);
    };

    const timeZone = useTimeZoneContext();
    // Aplicamos la zona horaria detectada en toda la app
    const formattedCurrentDate = formatDate(currentDate, timeZone);

    const fetchData = async (date) => {
        setError(null);
        try {
            // Convertir la fecha a `YYYY-MM-DD` asegurando que sea un string
            const formattedDate = typeof date === "string"
                ? date
                : new Intl.DateTimeFormat("es-MX", {
                    timeZone,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }).format(new Date(date)).split('/').reverse().join('-'); // Convierte `DD/MM/YYYY` a `YYYY-MM-DD`

            const params = new URLSearchParams({ id: formattedDate });
            const endpoint = `${buildApiUrl('/getHistory')}?${params.toString()}`;
            const response = await fetch(endpoint, {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' },
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (Array.isArray(data)) {
                setSales(data);
                setSalesSummary(null);
                setSalesIndex([]);
            } else if (data && typeof data === 'object') {
                const daySales = Array.isArray(data.sales) ? data.sales : [];
                setSales(daySales);
                setSalesSummary({
                    monthDaily: Array.isArray(data.monthDaily) ? data.monthDaily : [],
                    yearMonthly: Array.isArray(data.yearMonthly) ? data.yearMonthly : [],
                });
                const indexSales = Array.isArray(data.salesIndex) && data.salesIndex.length
                    ? data.salesIndex
                    : daySales;
                setSalesIndex(indexSales);
            } else {
                setSales([]);
                setSalesSummary(null);
                setSalesIndex([]);
            }
        } catch (error) {
            console.error("Error fetching history:", error);
            setError(error.message);
            setSales([]);
            setSalesSummary(null);
            setSalesIndex([]);
        }
    };

    useEffect(() => {
        if (timeZone) {
            fetchData(currentDate);
        }
    }, [currentDate, timeZone]);

    useEffect(() => {
        if (ticketData) {
            handlePrint();
        }
    }, [ticketData, handlePrint]);

    useEffect(() => {
        const fetchBranches = async () => {
            try {
                const response = await fetch(buildApiUrl('/getSucursal'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const normalized = normalizeBranchesPayload(payload);
                const filtered = normalized.filter((branch) => !isWebBranch(branch.idsucursal));
                const options = filtered
                    .map((branch) => ({
                        value: normalizeBranchId(branch.idsucursal),
                        label: branch.sucursal || `Sucursal ${branch.idsucursal}`,
                    }))
                    .filter((option) => Boolean(option.value));
                const names = options.reduce((acc, option) => {
                    if (option.value) acc[option.value] = option.label;
                    return acc;
                }, {});
                setBranchOptions(options);
                setBranchMap(names);
            } catch (err) {
                console.error('Error fetching sucursales:', err);
            }
        };

        fetchBranches();
    }, []);

    useEffect(() => {
        const fetchEmployeeBranches = async () => {
            try {
                const response = await fetch(buildApiUrl('/getAllEmployees'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const map = (Array.isArray(payload) ? payload : []).reduce((acc, employee) => {
                    const branchId = normalizeBranchId(employee.idsucursal ?? employee.idSucursal);
                    const userId = normalizeBranchId(employee.idusuario ?? employee.idUsuario);
                    if (!branchId || !userId || isWebBranch(branchId)) return acc;
                    acc[userId] = branchId;
                    return acc;
                }, {});
                setEmployeeBranchMap(map);
            } catch (err) {
                console.error('Error fetching empleados:', err);
            }
        };

        fetchEmployeeBranches();
    }, []);

    useEffect(() => {
        if (branchInitialized || branchOptions.length === 0) return;
        const normalizedUserBranch = userBranchId && !isWebBranch(userBranchId) ? userBranchId : null;
        const hasUserBranch = normalizedUserBranch
            ? branchOptions.some((option) => option.value === normalizedUserBranch)
            : false;
        if (hasUserBranch) {
            setSelectedBranch(normalizedUserBranch);
        } else if (branchOptions[0]?.value) {
            setSelectedBranch(branchOptions[0].value);
        }
        setBranchInitialized(true);
    }, [branchInitialized, branchOptions, userBranchId]);

    const handleImageError = (userId) => {
        if (!userId) return;
        setImageErrors((prev) => ({ ...prev, [userId]: true }));
    };

    const fetchHistorySearch = useCallback(async ({ mode, term }) => {
        const normalizedMode = String(mode || '').toLowerCase();
        const normalizedTerm = normalizedMode === 'folio'
            ? normalizeFolioInput(term)
            : String(term ?? '').trim();
        if (!normalizedTerm) {
            setSalesIndex([]);
            return;
        }
        setError(null);
        try {
            const params = new URLSearchParams({
                mode: normalizedMode,
                term: normalizedTerm,
            });
            const response = await fetch(`${buildApiUrl('/getHistorySearch')}?${params.toString()}`, {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' },
            });
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const payload = await response.json();
            setSalesIndex(Array.isArray(payload) ? payload : []);
        } catch (error) {
            console.error('Error fetching history search:', error);
            setSalesIndex([]);
            setError(error.message);
        }
    }, []);

    const handleSearch = () => {
        const nextMode = pendingSearchMode;
        setSearchMode(nextMode);
        setCurrentPage(1);
        if (nextMode === 'date') {
            setCurrentDate(selectedDate);
            setSearchTerm('');
        } else if (nextMode === 'folio') {
            const normalized = normalizeFolioInput(pendingSearchTerm);
            setSearchTerm(normalized);
            fetchHistorySearch({ mode: 'folio', term: normalized });
        } else if (nextMode === 'employee') {
            const trimmed = pendingSearchTerm.trim();
            setSearchTerm(trimmed);
            fetchHistorySearch({ mode: 'employee', term: trimmed });
        } else {
            setSearchTerm(pendingSearchTerm.trim());
        }
        setIsModalOpen(false);
    };

    const handleSearchModeChange = (event) => {
        const nextMode = event.target.value;
        setPendingSearchMode(nextMode);
        if (nextMode === 'date') {
            setPendingSearchTerm('');
        }
    };

    const resolveSaleId = useCallback((sale) => (
        normalizeSaleId(
            sale?.idVenta ??
            sale?.idventa ??
            sale?.id_venta ??
            sale?.idVenta
        )
    ), []);

    const resolveSaleBranchId = useCallback((sale) => {
        if (!sale) return null;
        const directBranch = normalizeBranchId(
            sale.idsucursal ??
            sale.idSucursal ??
            sale.id_sucursal ??
            sale.sucursalId ??
            sale.branchId ??
            sale.branch_id
        );
        if (directBranch) return directBranch;

        const fallbackBranchId = normalizeBranchId(sale.sucursal);
        if (fallbackBranchId && !isWebBranch(fallbackBranchId)) return fallbackBranchId;

        if (sale.sucursal && branchOptions.length > 0) {
            const normalizedName = String(sale.sucursal).trim().toLowerCase();
            const matched = branchOptions.find(
                (option) => option.label?.toLowerCase() === normalizedName
            );
            if (matched?.value) return matched.value;
        }

        const saleUserId = normalizeBranchId(
            sale.idusuario ??
            sale.idUsuario ??
            sale.idempleado ??
            sale.idEmpleado
        );
        if (saleUserId && employeeBranchMap[saleUserId]) {
            return employeeBranchMap[saleUserId];
        }
        return null;
    }, [branchOptions, employeeBranchMap]);

    const resolveBranchLabel = useCallback((sale) => {
        const branchId = resolveSaleBranchId(sale);
        if (!branchId) return null;
        return branchMap[branchId] || sale.sucursal || null;
    }, [branchMap, resolveSaleBranchId]);

    const fetchSaleDetails = useCallback(async (saleId) => {
        if (!saleId) return [];
        const params = new URLSearchParams({ idVenta: saleId });
        const response = await fetch(`${buildApiUrl('/getSaleDetails')}?${params.toString()}`, {
            cache: 'no-store',
            headers: { Accept: 'application/json, text/plain, */*' },
        });
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        const payload = await response.json();
        return Array.isArray(payload) ? payload : [];
    }, []);

    const updateSaleDetails = useCallback((saleId, details) => {
        if (!saleId) return;
        const normalizedId = normalizeSaleId(saleId);
        if (!normalizedId) return;
        const attachDetails = (list) => (
            Array.isArray(list)
                ? list.map((sale) => {
                    const currentId = resolveSaleId(sale);
                    if (!currentId || currentId !== normalizedId) return sale;
                    return { ...sale, details };
                })
                : list
        );
        setSales((prev) => attachDetails(prev));
        setSalesIndex((prev) => attachDetails(prev));
    }, [resolveSaleId]);

    const visibleSales = useMemo(() => {
        const baseSales = Array.isArray(sales) ? sales : [];
        const noBranchFilter = !selectedBranch;
        return baseSales.filter((sale) => {
            const branchId = resolveSaleBranchId(sale);
            const fallbackBranch = normalizeBranchId(sale?.sucursal);
            if ((branchId && isWebBranch(branchId)) || (!branchId && fallbackBranch && isWebBranch(fallbackBranch))) {
                return false;
            }
            if (noBranchFilter) return true;
            return branchId ? branchId === selectedBranch : false;
        });
    }, [sales, selectedBranch, resolveSaleBranchId]);

    useEffect(() => {
        setExpandedFolio(null);
    }, [selectedBranch]);

    useEffect(() => {
        setExpandedFolio(null);
    }, [currentPage]);

    useEffect(() => {
        if (viewMode !== 'table') return;
        const now = new Date();
        setCurrentDate(now);
        setSelectedDate(now.toISOString().split('T')[0]);
        setSearchMode('date');
        setSearchTerm('');
        setPendingSearchMode('date');
        setPendingSearchTerm('');
    }, [viewMode]);

    useEffect(() => {
        if (!isModalOpen) return;
        setPendingSearchMode(searchMode);
        setPendingSearchTerm(searchTerm);
    }, [isModalOpen, searchMode, searchTerm]);

    const activeSales = useMemo(
        () => (Array.isArray(visibleSales) ? visibleSales.filter((item) => item.status === 'A') : []),
        [visibleSales]
    );
    const hasSalesForDate = Array.isArray(visibleSales) && visibleSales.length > 0;
    const showDateControls = searchMode === 'date';

    const allBranchSales = useMemo(() => {
        const baseSales = Array.isArray(salesIndex) && salesIndex.length
            ? salesIndex
            : (Array.isArray(sales) ? sales : []);
        if (searchMode === 'folio') {
            return baseSales;
        }
        return baseSales.filter((sale) => {
            const branchId = resolveSaleBranchId(sale);
            const fallbackBranch = normalizeBranchId(sale?.sucursal);
            if ((branchId && isWebBranch(branchId)) || (!branchId && fallbackBranch && isWebBranch(fallbackBranch))) {
                return false;
            }
            return true;
        });
    }, [sales, salesIndex, resolveSaleBranchId, searchMode]);

    const filteredSales = useMemo(() => {
        const sourceSales = searchMode === 'date' ? visibleSales : allBranchSales;
        if (!Array.isArray(sourceSales)) return [];
        if (searchMode === 'date') return sourceSales;
        const term = searchTerm.trim().toLowerCase();
        if (!term) return sourceSales;
        if (searchMode === 'folio') {
            return sourceSales.filter((sale) =>
                String(sale?.folio ?? '').toLowerCase().includes(term)
            );
        }
        if (searchMode === 'employee') {
            return sourceSales.filter((sale) =>
                String(sale?.empleado ?? '').toLowerCase().includes(term)
            );
        }
        return sourceSales;
    }, [visibleSales, allBranchSales, searchMode, searchTerm]);

    const totalPages = useMemo(() => {
        const count = Array.isArray(filteredSales) ? filteredSales.length : 0;
        return Math.max(1, Math.ceil(count / PAGE_SIZE));
    }, [filteredSales, PAGE_SIZE]);

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const paginatedSales = useMemo(() => {
        if (!Array.isArray(filteredSales)) return [];
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        return filteredSales.slice(startIndex, startIndex + PAGE_SIZE);
    }, [filteredSales, currentPage, PAGE_SIZE]);

    const activeFilteredSales = useMemo(
        () => (Array.isArray(paginatedSales) ? paginatedSales.filter((item) => item.status === 'A') : []),
        [paginatedSales]
    );

    const activeSalesAll = useMemo(
        () => (Array.isArray(allBranchSales) ? allBranchSales.filter((item) => item.status === 'A') : []),
        [allBranchSales]
    );

    const anchorDate = useMemo(() => parseSaleDate(currentDate) || new Date(), [currentDate]);
    const chartViewLabel = chartView === 'month' ? t('panel.history.unitMonth') : chartView === 'year' ? t('panel.history.unitYear') : t('panel.history.unitDay');
    const formattedMonthLabel = useMemo(
        () => new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(anchorDate),
        [anchorDate]
    );
    const showMultiBranchLines = !selectedBranch;
    const branchSeriesKeys = useMemo(() => {
        const seen = new Set();
        const list = [];
        const addBranch = (branchId, label) => {
            if (!branchId || isWebBranch(branchId) || seen.has(branchId)) return;
            seen.add(branchId);
            list.push({
                id: branchId,
                label: label || branchMap[branchId] || `Sucursal ${branchId}`,
                dataKey: `branch_${branchId}`,
            });
        };

        if (selectedBranch) {
            addBranch(selectedBranch, branchMap[selectedBranch]);
            return list;
        }

        branchOptions.forEach((option) => {
            addBranch(option.value, option.label);
        });

        const addFromRow = (row) => {
            const branchId = normalizeBranchId(
                row?.idsucursal ?? row?.idSucursal ?? row?.branchId ?? row?.branch_id
            );
            if (!branchId) return;
            addBranch(branchId, row?.sucursal);
        };

        (salesSummary?.monthDaily || []).forEach(addFromRow);
        (salesSummary?.yearMonthly || []).forEach(addFromRow);
        activeSalesAll.forEach((sale) => {
            const branchId = resolveSaleBranchId(sale) || normalizeBranchId(sale?.sucursal);
            addBranch(branchId, sale?.sucursal);
        });

        return list.sort((a, b) => {
            const aNum = Number(a.id);
            const bNum = Number(b.id);
            if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
                return aNum - bNum;
            }
            return a.label.localeCompare(b.label);
        });
    }, [branchMap, branchOptions, salesSummary, activeSalesAll, resolveSaleBranchId, selectedBranch]);

    const chartDayTotal = activeSales.reduce((acc, item) => acc + toNumber(item.total_venta || 0), 0);
    const tableTotal = activeFilteredSales.reduce((acc, item) => acc + toNumber(item.total_venta || 0), 0);

    const { totalUtility, totalProviders } = useMemo(() => {
        const totals = activeFilteredSales.reduce(
            (acc, sale) => {
                const metrics = calculateDetailTotals(sale?.details);
                acc.providers += metrics.providers;
                acc.utility += metrics.utility;
                return acc;
            },
            { utility: 0, providers: 0 }
        );
        return {
            totalUtility: totals.utility,
            totalProviders: totals.providers,
        };
    }, [activeFilteredSales]);

    const buildSummarySeries = useCallback(
        (rows, granularity, includeYear = false) => {
            const totals = rows.reduce((acc, row) => {
                const key = sanitizeDateKey(row?.sale_key ?? row?.key ?? '', granularity);
                if (!key) return acc;
                const branchId = normalizeBranchId(
                    row?.idsucursal ?? row?.idSucursal ?? row?.branchId ?? row?.branch_id
                );
                if (selectedBranch && branchId !== selectedBranch) return acc;
                if (selectedBranch && !branchId) return acc;
                const totalValue = toNumber(row?.total ?? row?.total_venta ?? row?.venta_total ?? 0);
                acc[key] = (acc[key] || 0) + totalValue;
                return acc;
            }, {});
            return Object.entries(totals)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, value]) => ({
                    key,
                    total: value,
                    label: formatChartLabel(key, granularity, includeYear),
                }));
        },
        [selectedBranch]
    );

    const monthlySeries = useMemo(() => {
        if (!salesSummary?.monthDaily?.length) return [];
        return buildSummarySeries(salesSummary.monthDaily, 'day', true);
    }, [buildSummarySeries, salesSummary]);

    const monthlyBranchSeries = useMemo(() => {
        if (!salesSummary?.monthDaily?.length) return [];
        const totals = salesSummary.monthDaily.reduce((acc, row) => {
            const key = sanitizeDateKey(row?.sale_key ?? row?.key ?? '', 'day');
            if (!key) return acc;
            const branchId = normalizeBranchId(
                row?.idsucursal ?? row?.idSucursal ?? row?.branchId ?? row?.branch_id
            );
            if (!branchId || isWebBranch(branchId)) return acc;
            if (selectedBranch && branchId !== selectedBranch) return acc;
            const dataKey = `branch_${branchId}`;
            if (!acc[key]) {
                acc[key] = {
                    key,
                    label: formatChartLabel(key, 'day', true),
                };
            }
            acc[key][dataKey] = (acc[key][dataKey] || 0) + toNumber(row?.total ?? row?.total_venta ?? 0);
            return acc;
        }, {});
        return Object.values(totals).sort((a, b) => a.key.localeCompare(b.key));
    }, [salesSummary, selectedBranch]);

    const yearlySeries = useMemo(() => {
        if (!salesSummary?.yearMonthly?.length) return [];
        return buildSummarySeries(salesSummary.yearMonthly, 'month');
    }, [buildSummarySeries, salesSummary]);

    const daySeries = useMemo(() => {
        const key = buildDateKey(anchorDate, 'day');
        if (!key) return [];
        return [
            {
                key,
                total: chartDayTotal,
                label: formatChartLabel(key, 'day', true),
            },
        ];
    }, [anchorDate, chartDayTotal]);

    const dayBranchSeries = useMemo(() => {
        if (!showMultiBranchLines) return [];
        const key = buildDateKey(anchorDate, 'day');
        if (!key) return [];
        const totals = {};
        activeSalesAll.forEach((sale) => {
            const date = parseSaleDate(sale?.fecha_venta ?? sale?.fecha ?? sale?.fechaVenta);
            if (!date) return;
            const dateKey = buildDateKey(date, 'day');
            if (dateKey !== key) return;
            const branchId = resolveSaleBranchId(sale) || normalizeBranchId(sale?.sucursal);
            if (!branchId || isWebBranch(branchId)) return;
            const dataKey = `branch_${branchId}`;
            totals[dataKey] = (totals[dataKey] || 0) + toNumber(sale?.total_venta ?? sale?.total ?? 0);
        });
        return [
            {
                key,
                label: formatChartLabel(key, 'day', true),
                ...totals,
            },
        ];
    }, [showMultiBranchLines, activeSalesAll, anchorDate, resolveSaleBranchId]);

    const fallbackSeries = useMemo(() => {
        const totals = activeSales.reduce((acc, sale) => {
            const date = parseSaleDate(sale?.fecha_venta ?? sale?.fecha ?? sale?.fechaVenta);
            const key = buildDateKey(date, 'day');
            if (!key) return acc;
            acc[key] = (acc[key] || 0) + toNumber(sale?.total_venta ?? sale?.total ?? 0);
            return acc;
        }, {});
        return Object.entries(totals)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => ({
                key,
                total: value,
                label: formatChartLabel(key, 'day', true),
            }));
    }, [activeSales]);

    const periodChartData = useMemo(() => {
        if (chartView === 'month') {
            if (showMultiBranchLines) {
                return monthlyBranchSeries.length > 0 ? monthlyBranchSeries : [];
            }
            return monthlySeries.length > 0 ? monthlySeries : fallbackSeries;
        }
        if (showMultiBranchLines) {
            return dayBranchSeries.length > 0 ? dayBranchSeries : [];
        }
        return daySeries.length > 0 ? daySeries : fallbackSeries;
    }, [
        chartView,
        monthlySeries,
        monthlyBranchSeries,
        daySeries,
        dayBranchSeries,
        fallbackSeries,
        showMultiBranchLines,
    ]);

    const yearlyBranchChartData = useMemo(() => {
        const totalsByMonth = {};
        const addValue = (monthKey, dataKey, value) => {
            if (!monthKey || !dataKey) return;
            if (!totalsByMonth[monthKey]) {
                totalsByMonth[monthKey] = {
                    key: monthKey,
                    label: formatChartLabel(monthKey, 'month'),
                };
            }
            totalsByMonth[monthKey][dataKey] = (totalsByMonth[monthKey][dataKey] || 0) + value;
        };

        const addSummaryRow = (row) => {
            const monthKey = sanitizeDateKey(row?.sale_key ?? row?.key ?? '', 'month');
            if (!monthKey) return;
            const [yearPart] = monthKey.split('-');
            if (Number(yearPart) !== anchorDate.getFullYear()) return;
            const branchId = normalizeBranchId(
                row?.idsucursal ?? row?.idSucursal ?? row?.branchId ?? row?.branch_id
            );
            if (!branchId || isWebBranch(branchId)) return;
            if (selectedBranch && branchId !== selectedBranch) return;
            const totalValue = toNumber(row?.total ?? row?.total_venta ?? 0);
            addValue(monthKey, `branch_${branchId}`, totalValue);
        };

        if (salesSummary?.yearMonthly?.length) {
            salesSummary.yearMonthly.forEach(addSummaryRow);
        } else {
            activeSalesAll.forEach((sale) => {
                const date = parseSaleDate(sale?.fecha_venta ?? sale?.fecha ?? sale?.fechaVenta);
                if (!date || date.getFullYear() !== anchorDate.getFullYear()) return;
                const monthKey = buildDateKey(date, 'month');
                const branchId = resolveSaleBranchId(sale) || normalizeBranchId(sale?.sucursal);
                if (!branchId || isWebBranch(branchId)) return;
                if (selectedBranch && branchId !== selectedBranch) return;
                const totalValue = toNumber(sale?.total_venta ?? sale?.total ?? 0);
                addValue(monthKey, `branch_${branchId}`, totalValue);
            });
        }

        return Object.values(totalsByMonth).sort((a, b) => a.key.localeCompare(b.key));
    }, [salesSummary, activeSalesAll, anchorDate, resolveSaleBranchId, selectedBranch]);

    const yearChartData = useMemo(() => {
        if (showMultiBranchLines) return yearlyBranchChartData;
        return yearlySeries;
    }, [showMultiBranchLines, yearlyBranchChartData, yearlySeries]);

    const chartTotal = useMemo(() => {
        const sumBranchValues = (item) => branchSeriesKeys.reduce(
            (acc, branch) => acc + (item[branch.dataKey] || 0),
            0
        );
        if (chartView === 'year') {
            if (showMultiBranchLines) {
                return yearlyBranchChartData.reduce((acc, item) => acc + sumBranchValues(item), 0);
            }
            return yearlySeries.reduce((acc, item) => acc + item.total, 0);
        }
        if (showMultiBranchLines) {
            return periodChartData.reduce((acc, item) => acc + sumBranchValues(item), 0);
        }
        return periodChartData.reduce((acc, item) => acc + item.total, 0);
    }, [
        chartView,
        showMultiBranchLines,
        yearlyBranchChartData,
        yearlySeries,
        periodChartData,
        branchSeriesKeys,
    ]);
    const periodChartMinWidth = Math.max(periodChartData.length * 72, 520);
    const yearlyChartMinWidth = Math.max(yearChartData.length * 72, 520);

    const selectedBranchLabel = selectedBranch
        ? (branchMap[selectedBranch] || t('panel.site.selectedBranch'))
        : t('panel.site.allBranches');

    const buildTicketDataFromSale = (sale) => {
        if (!sale) return null;

        const items = (sale.details || []).map((detail) => {
            const quantity = Number(detail.cantidad) || 0;
            const parsedPrice = parseFloat(detail.precio_venta ?? detail.precio ?? 0);
            const price = Number.isFinite(parsedPrice) ? parsedPrice : 0;
            const parsedMonto = parseFloat(detail.monto ?? price * quantity);
            const monto = Number.isFinite(parsedMonto) ? parsedMonto : price * quantity;
            return {
                refaccion: detail.num_parte || detail.refaccion || 'S/N',
                descripcion: detail.descripcion || detail.concepto_comodin || '',
                cantidad: quantity,
                precio: price,
                monto,
            };
        });

        const subtotal = items.reduce((acc, item) => acc + (item.monto || 0), 0);
        const parsedDiscount = parseFloat(sale.descuento);
        const discount = Number.isFinite(parsedDiscount) ? parsedDiscount : 0;
        const parsedTotal = parseFloat(sale.total_venta ?? subtotal);
        const totalTicket = Number.isFinite(parsedTotal) ? parsedTotal : subtotal;

        return {
            items,
            subtotal,
            discount,
            total: totalTicket,
            currentDate: formatDate(sale.fecha_venta, timeZone),
            employee: sale.empleado || '',
            folio: sale.folio || '',
            notes: sale.nota || '',
            branchId: resolveSaleBranchId(sale),
            branchName: resolveBranchLabel(sale) || sale.sucursal || '',
        };
    };

    const handleTicketPrint = async (sale) => {
        const ticket = buildTicketDataFromSale(sale);
        if (!ticket) return;
        let branchSnapshot = null;
        if (ticket.branchId) {
            try {
                branchSnapshot = await prefetchBranchData(ticket.branchId);
            } catch (error) {
                console.error('Error al cargar la sucursal para el ticket:', error);
            }
        }
        setTicketData({ ...ticket, branchSnapshot });
    };

    const toggleDetails = useCallback(async (sale) => {
        if (!sale) return;
        const folio = sale.folio ?? '';
        const saleId = resolveSaleId(sale);
        const shouldExpand = expandedFolio !== folio;
        setExpandedFolio(shouldExpand ? folio : null);

        if (shouldExpand && saleId && !Array.isArray(sale.details)) {
            try {
                const details = await fetchSaleDetails(saleId);
                updateSaleDetails(saleId, details);
            } catch (err) {
                console.error('Error fetching sale details:', err);
            }
        }
    }, [expandedFolio, fetchSaleDetails, resolveSaleId, updateSaleDetails]);

    const handleChangeStatus = async (e) => {
        e.preventDefault();

        if (!selectedStatus) {
            alert(t('panel.common.pickStatus'));
            return;
        }

        const update_data = {
            folio: folioToChange,
            status: selectedStatus,
        };

        try {
            const response = await fetch(buildApiUrl('/patchSaleStatus'), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*',
                },
                body: JSON.stringify(update_data),
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            if(response){

                setSales((prevSales) =>
                    prevSales.map((sale) =>
                        sale.folio === folioToChange ? { ...sale, status: selectedStatus } : sale
                    )
                );
            }
        } catch (error) {
            console.error('Error actualizando el estado:', error);
            alert(t('panel.common.statusUpdateError'));
        }

        setIsStatusModalOpen(false);
    };

    const handleOpenStatusModal = (status, folio) => {
        setSelectedStatus(status);
        setFolioToChange(folio);
        setIsStatusModalOpen(true);
    };

    const maxDate = new Date();
    const maxMonthKey = buildDateKey(maxDate, 'month');
    const maxYear = maxDate.getFullYear();

    const canShiftMonth = (offset) => {
        const baseDate = parseSaleDate(currentDate) || maxDate;
        const next = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
        const nextKey = buildDateKey(next, 'month');
        if (!nextKey) return false;
        return nextKey <= maxMonthKey;
    };

    const shiftChartMonth = (offset) => {
        if (!canShiftMonth(offset)) return;
        const baseDate = parseSaleDate(currentDate) || maxDate;
        const next = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
        setCurrentDate(next);
        setSelectedDate(next.toISOString().split('T')[0]);
    };

    const canShiftYear = (offset) => {
        const baseDate = parseSaleDate(currentDate) || maxDate;
        const nextYear = baseDate.getFullYear() + offset;
        return nextYear <= maxYear;
    };

    const shiftChartYear = (offset) => {
        if (!canShiftYear(offset)) return;
        const baseDate = parseSaleDate(currentDate) || new Date();
        const next = new Date(baseDate);
        next.setFullYear(baseDate.getFullYear() + offset);
        setCurrentDate(next);
        setSelectedDate(next.toISOString().split('T')[0]);
    };

    return (
        <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] backdrop-blur-md pt-28">
            <Title
                title={t('panel.history.title')}
                icon={MdSell}
                back={t('panel.common.back')}
                path='/productivity'
            />
            <div>
                <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-[rgb(var(--color-text))]">
                    <div className="flex items-center justify-center sm:justify-between gap-3 w-full">
                        <div>
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`m-1 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide shadow border cursor-pointer ${viewMode === 'table'
                                    ? 'bg-amber-500 text-white border-amber-500'
                                    : 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] border-[rgb(var(--color-border))]'}`}
                            >
                                {t('panel.history.tabTable')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('charts')}
                                className={`m-1 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide shadow border cursor-pointer ${viewMode === 'charts'
                                    ? 'bg-amber-500 text-white border-amber-500'
                                    : 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] border-[rgb(var(--color-border))]'}`}
                            >
                                {t('panel.history.tabCharts')}
                            </button>
                        </div>
                        <div>
                            <label className="m-1 text-sm text-[rgb(var(--color-text))]/80">{t('panel.common.branch')}</label>
                            <select
                                value={selectedBranch}
                                onChange={(e) => setSelectedBranch(e.target.value)}
                                disabled={branchOptions.length === 0}
                                className="bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))] rounded-xl m-1 px-3 py-2 text-sm shadow outline-none cursor-pointer"
                            >
                                <option value="">{t('panel.history.allBranches')}</option>
                                {branchOptions.map((branch) => (
                                    <option key={branch.value} value={branch.value}>
                                        {branch.value === userBranchId ? t('panel.history.currentBranch', { branch: branch.label }) : branch.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
                <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-4 flex flex-wrap items-center gap-2 text-[rgb(var(--color-text))]">

                </div>
                <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-5">
                    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-6 lg:mx-0 lg:max-w-none">
                        {viewMode === 'table' && (
                        <div>
                            <div className="text-xl uppercase font-semibold italic text-center sm:text-left">
                                {formattedCurrentDate}
                            </div>
                            <div className="relative h-[470px] bg-[rgb(var(--color-card))] rounded-2xl my-5 flex justify-center shadow">
                                <div className='flex flex-col px-1 bg-[rgb(var(--color-card))] rounded-l-2xl pt-5'>
                                    <div
                                        className='blue-circle-button relative'
                                        onClick={() => setIsModalOpen(true)}
                                        onMouseEnter={findTooltip.show}
                                        onMouseLeave={findTooltip.hide}>
                                        <FaSearch />
                                        {findTooltip.tooltip}
                                    </div>
                                {showDateControls && hasSalesForDate && (
                                    <div
                                        className='gray-circle-button relative'
                                        onMouseEnter={withdrawTooltip.show}
                                        onMouseLeave={withdrawTooltip.hide}>
                                        <BiMoneyWithdraw />
                                        {withdrawTooltip.tooltip}
                                    </div>
                                )}
                                </div>
                                <div className='w-full h-full overflow-scroll'>
                                {!filteredSales || filteredSales.length === 0 ? (
                                    <div className="flex justify-center items-center h-full text-[rgb(var(--color-text))]">
                                        {t('panel.history.noRecords', { branch: selectedBranchLabel })}
                                    </div>
                                ) : (
                                    <>
                                    {filteredSales.length > PAGE_SIZE && (
                                        <div className="flex items-center justify-center gap-4 py-2 text-xs text-[rgb(var(--color-text))]">
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
                                    <table className="w-full lg:w-[1300px] text-sm text-left text-[rgb(var(--color-text))] mx-auto">
                                            <thead className="text-xs text-[rgb(var(--color-text))] uppercase bg-[rgb(var(--color-card))] text-center">
                                                <tr>
                                                    <th scope="col" className="p-1.5">{t('panel.table.status')}</th>
                                                    <th scope="col" className="py-2 px-8">{t('panel.table.folio')}</th>
                                                    <th scope="col" className="py-2 px-8">{t('panel.table.total')}</th>
                                                    <th scope="col" className="py-2 px-8">{t('panel.table.employee')}</th>
                                                    <th scope="col" className="py-2 px-8">{t('panel.table.action')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                            {Array.isArray(paginatedSales) && paginatedSales.map((item, index) => {
                                                const branchLabel = resolveBranchLabel(item);
                                                return (
                                                        <Fragment key={item.folio || index}>
                                                            <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))]">
                                                                <td className="py-4 px-4 relative flex-col justify-center items-center flex">
                                                                    <button
                                                                        className="relative flex h-5 w-5"
                                                                        onClick={() => handleOpenStatusModal(item.status, item.folio)}
                                                                    >
                                                                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
                                                                        ${item.status === 'A' ? 'bg-green-500'
                                                                            : item.status === 'C' ? 'bg-red-500'
                                                                            : item.status === 'D' ? 'bg-amber-500'
                                                                            : 'bg-blue-500'}`}
                                                                        ></span>
                                                                        <GrStatusGoodSmall className={`relative inline-flex rounded-full h-5 w-5
                                                                        ${item.status === 'A' ? 'text-green-500'
                                                                            : item.status === 'C' ? 'text-red-500'
                                                                            : item.status === 'D' ? 'text-amber-500'
                                                                            : 'text-blue-500'}`}
                                                                        />
                                                                    </button>
                                                                    <span className={`
                                                                        ${item.status === 'A' ? 'bg-[rgb(var(--color-success))]'
                                                                        : item.status === 'C' ? 'bg-[rgb(var(--color-error))]'
                                                                        : item.status === 'D' ? 'bg-[rgb(var(--color-amber))]'
                                                                        : 'bg-blue-200'}
                                                                        text-sm text-[rgb(var(--color-text-base))] px-1 shadow rounded-md mt-2`}
                                                                    >
                                                                        {item.status === 'A' ? t('panel.history.statusActive')
                                                                        : item.status === 'C' ? t('panel.history.statusCanceled')
                                                                        : item.status === 'D' ? t('panel.history.statusReturned')
                                                                        : t('panel.common.saleError')}
                                                                    </span>
                                                                </td>
                                                                <td className="py-4 px-3 cursor-pointer font-medium bg-[rgb(var(--color-galaxy))] text-center"
                                                                    onClick={() => toggleDetails(item)}
                                                                >
                                                                    <div className='flex flex-col items-center'>
                                                                        <span className='font-semi text-xs xl:text-lg truncate'>{item.folio}</span>
                                                                        <span className='animate-out mt-2 rounded-full shadow border border-slate-700 p-0.5'>
                                                                            {expandedFolio === item.folio ? <FaArrowUp size={13}/> : <FaArrowDown size={13}/>}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-4 px-8 font-bold text-lg">
                                                                    <div className='flex flex-col items-center'>
                                                                        <span>
                                                                            $ {item.total_venta}
                                                                        </span>
                                                                        <span className='bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] rounded-xl px-2 mx-2 text-xs shadow bottom-1 left-5'>
                                                                            {item.metodopago}
                                                                        </span>
                                                                    </div>

                                                                </td>
                                                                <td className="py-4 px-8 relative flex flex-1 justify-center items-center">
                                                                    <div className="absolute left-0 translate-y-2.5 translate-x-6 lg:-translate-x-4 top-1/4 mx-3 text-md xl:text-lg leading-6 xl:pr-1 flex justify-center items-center text-[rgb(var(--color-text))] bg-[rgb(var(--color-card))] cursor-pointer">
                                                                        {item.idusuario && !imageErrors[item.idusuario] ? (
                                                                            <div className="flex h-9 w-9 items-center justify-center bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-card-white))] hover:border-[rgb(var(--color-amber))] animate-out shadow-lg rounded-full overflow-hidden">
                                                                                <img
                                                                                    src={`${multimediaSrc}usr/${item.idusuario}.jpg`}
                                                                                    onError={() => handleImageError(item.idusuario)}
                                                                                    className="w-full h-full object-cover bg-gray-50"
                                                                                    alt={`Empleado ${item.empleado || item.idusuario}`}
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            <BiSolidUserCircle className="w-9 h-9 rounded-full shadow-xl border border-indigo-100 my-auto animate-out" />
                                                                        )}
                                                                        <div className='ml-1.5 mr-2 text-sm italic hidden lg:flex flex-col'>
                                                                            <span>
                                                                                {item.empleado}
                                                                            </span>
                                                                            {branchLabel && (
                                                                            <span className='mt-1 text-[0.65rem] uppercase tracking-wide rounded-full border border-[rgb(var(--color-border))] px-2 py-0.5 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))] justify-center items-center flex w-28'>
                                                                                {branchLabel}
                                                                            </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="py-4 px-3 text-center">
                                                                    <button
                                                                        type="button"
                                                                        className='relative p-3 m-1 rounded-full shadow hover:shadow-xl bg-amber-500 color-cultured cursor-pointer inline-block'
                                                                        onClick={() => handleTicketPrint(item)}
                                                                        aria-label={t('panel.tickets.ticket')}
                                                                    >
                                                                        <IoTicket />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            {expandedFolio === item.folio && (
                                                                <tr className="bg-[rgb(var(--color-card))]">
                                                                    <td colSpan="6" className="py-1 pb-3 px-1">
                                                                        <div>
                                                                            <table className="w-full text-sm text-left text-[rgb(var(--color-text))] mt-2 shadow">
                                                                                <thead className="text-xs text-[rgb(var(--color-text))] uppercase bg-[rgb(var(--color-card))]">
                                                                                    <tr>
                                                                                        <th scope="col" className="py-2 px-4">{t('panel.table.partNumber')}</th>
                                                                                        <th scope="col" className="py-2 px-4">{t('panel.table.description')}</th>
                                                                                        <th scope="col" className="py-2 px-4">{t('panel.table.quantity')}</th>
                                                                                        <th scope="col" className="py-2 px-4">{t('panel.table.unitPrice')}</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {item.details && item.details.map((detail, i) => (
                                                                                        <tr key={`${detail.num_parte || 'detail'}-${i}`} className="bg-[rgb(var(--color-bg))] border-b border-[rgb(var(--color-border))]">
                                                                                            <td className="py-2 px-4">{detail.num_parte}</td>
                                                                                            <td className="py-2 px-4 uppercase">{detail.descripcion ? detail.descripcion : detail.concepto_comodin}</td>
                                                                                            <td className="py-2 px-4">{detail.cantidad}</td>
                                                                                            <td className="py-2 px-4">$ {detail.precio_venta}</td>
                                                                                        </tr>
                                                                                    ))}
                                                                                    <tr className='bg-[rgb(var(--color-galaxy))]'>
                                                                                        <td className="py-2 px-4 text-[rgb(var(--color-text))]"> {t('panel.history.note')} {item.nota}</td>
                                                                                    </tr>
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </Fragment>
                                                    );
                                                })}
                                                <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))]">
                                                    <td className="py-4 px-6 font-bold" colSpan="3">{t('panel.table.total2')}</td>
                                                <td className="py-4 px-6 font-bold text-lg text-[rgb(var(--color-text))]" colSpan="2">$ {tableTotal.toFixed(2)}</td>
                                                </tr>
                                                {showDateControls && (
                                                    <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))]">
                                                        <td className="py-3 px-6 font-semibold text-[rgb(var(--color-text))]" colSpan="3">{t('panel.history.estimatedProfit')}</td>
                                                        <td className="py-3 px-6 font-semibold text-[rgb(var(--color-text))]" colSpan="2">
                                                            {currencyFormatter.format(totalUtility)}
                                                        </td>
                                                    </tr>
                                                )}
                                                {showDateControls && (
                                                    <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))]">
                                                        <td className="py-3 px-6 font-semibold text-[rgb(var(--color-text))]" colSpan="3">{t('panel.history.providerPayment')}</td>
                                                        <td className="py-3 px-6 font-semibold text-[rgb(var(--color-text))]" colSpan="2">
                                                            {currencyFormatter.format(totalProviders)}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </>
                                    )}
                                </div>
                            </div>
                        </div>
                        )}
                        {viewMode === 'charts' && (
                        <div ref={chartRef} className="bg-[rgb(var(--color-card))] rounded-2xl shadow p-6 mb-10">
                            <div className="flex flex-col gap-4 text-[rgb(var(--color-text))]">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold uppercase tracking-wide">
                                            {chartView === 'year'
                                                ? showMultiBranchLines
                                                    ? t('panel.history.yearlyByBranch')
                                                    : t('panel.history.yearlyOf', { branch: selectedBranchLabel })
                                                : showMultiBranchLines
                                                    ? t('panel.history.salesByBranch')
                                                    : t('panel.history.salesOf', { branch: selectedBranchLabel })}
                                        </h3>
                                        <p className="text-xs text-[rgb(var(--color-text))]/70">
                                            {chartView === 'year'
                                                ? t('panel.history.comparative', { year: anchorDate.getFullYear() })
                                                : t('panel.history.viewBy', { unit: chartViewLabel })} {t('panel.history.viewTotal')} {currencyFormatter.format(chartTotal)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setChartView('day')}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide shadow border cursor-pointer ${chartView === 'day'
                                                ? 'bg-amber-500 text-white border-amber-500'
                                                : 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] border-[rgb(var(--color-border))]'}`
                                            }
                                        >
                                            {t('panel.history.day')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setChartView('month')}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide shadow border cursor-pointer ${chartView === 'month'
                                                ? 'bg-amber-500 text-white border-amber-500'
                                                : 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] border-[rgb(var(--color-border))]'}`
                                            }
                                        >
                                            {t('panel.history.month')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setChartView('year')}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide shadow border cursor-pointer ${chartView === 'year'
                                                ? 'bg-amber-500 text-white border-amber-500'
                                                : 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] border-[rgb(var(--color-border))]'}`
                                            }
                                        >
                                            {t('panel.history.year')}
                                        </button>
                                    </div>
                                </div>
                                {chartView === 'month' && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => shiftChartMonth(-1)}
                                            className="px-2.5 py-1 rounded-full border border-[rgb(var(--color-border))] text-xs uppercase tracking-wide shadow hover:bg-[rgb(var(--color-card-white))] cursor-pointer"
                                        >
                                            &larr; {t('panel.history.month')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const now = new Date();
                                                setCurrentDate(now);
                                                setSelectedDate(now.toISOString().split('T')[0]);
                                            }}
                                            className="px-2.5 py-1 rounded-full border border-[rgb(var(--color-border))] text-xs uppercase tracking-wide shadow hover:bg-[rgb(var(--color-card-white))] cursor-pointer"
                                        >
                                            {t('panel.history.current')}
                                        </button>
                                        <span className="text-xs font-semibold uppercase tracking-wide">
                                            {formattedMonthLabel}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => shiftChartMonth(1)}
                                            disabled={!canShiftMonth(1)}
                                            className={`px-2.5 py-1 rounded-full border text-xs uppercase tracking-wide shadow cursor-pointer ${
                                                canShiftMonth(1)
                                                    ? 'border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-card-white))]'
                                                    : 'border-[rgb(var(--color-border))] opacity-40 cursor-not-allowed'
                                            }`}
                                        >
                                            {t('panel.history.month')} &rarr;
                                        </button>
                                    </div>
                                )}
                                {chartView === 'year' && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => shiftChartYear(-1)}
                                            className="px-2.5 py-1 rounded-full border border-[rgb(var(--color-border))] text-xs uppercase tracking-wide shadow hover:bg-[rgb(var(--color-card-white))] cursor-pointer"
                                        >
                                            &larr; {t('panel.history.year')}
                                        </button>
                                        <span className="text-xs font-semibold uppercase tracking-wide">
                                            {anchorDate.getFullYear()}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => shiftChartYear(1)}
                                            disabled={!canShiftYear(1)}
                                            className={`px-2.5 py-1 rounded-full border text-xs uppercase tracking-wide shadow cursor-pointer ${
                                                canShiftYear(1)
                                                    ? 'border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-card-white))]'
                                                    : 'border-[rgb(var(--color-border))] opacity-40 cursor-not-allowed'
                                            }`}
                                        >
                                            {t('panel.history.year')} &rarr;
                                        </button>
                                    </div>
                                )}
                            </div>
                            {chartView === 'year' ? (
                                yearChartData.length === 0 ? (
                                    <div className="mt-6 text-sm text-[rgb(var(--color-text))]/70">
                                        {t('panel.history.notEnoughYear')}
                                    </div>
                                ) : (
                                    <div className="mt-6 overflow-x-auto">
                                        <div className="h-72" style={{ minWidth: `${yearlyChartMinWidth}px` }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={yearChartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
                                                    <XAxis dataKey="label" tick={{ fill: 'rgb(var(--color-text))', fontSize: 11 }} interval={0} />
                                                    <YAxis
                                                        tick={{ fill: 'rgb(var(--color-text))', fontSize: 11 }}
                                                        tickFormatter={(value) => compactCurrencyFormatter.format(value)}
                                                    />
                                                    <RechartsTooltip
                                                        formatter={(value) => currencyFormatter.format(value)}
                                                        contentStyle={{
                                                            backgroundColor: 'rgb(var(--color-card))',
                                                            border: '1px solid rgb(var(--color-border))',
                                                            borderRadius: '0.75rem',
                                                            color: 'rgb(var(--color-text))',
                                                        }}
                                                    />
                                                    {showMultiBranchLines ? (
                                                        <>
                                                            {branchSeriesKeys.length > 1 && (
                                                                <Legend wrapperStyle={{ color: 'rgb(var(--color-text))', fontSize: 12 }} />
                                                            )}
                                                            {branchSeriesKeys.map((branch, index) => (
                                                                <Bar
                                                                    key={branch.dataKey}
                                                                    dataKey={branch.dataKey}
                                                                    name={branch.label}
                                                                    fill={linePalette[index % linePalette.length]}
                                                                />
                                                            ))}
                                                        </>
                                                    ) : (
                                                        <Bar
                                                            dataKey="total"
                                                            name={t('panel.history.seriesSales')}
                                                            fill="rgb(245 158 11)"
                                                        />
                                                    )}
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )
                            ) : (
                                periodChartData.length === 0 ? (
                                    <div className="mt-6 text-sm text-[rgb(var(--color-text))]/70">
                                        No hay ventas para graficar en esta vista.
                                    </div>
                                ) : (
                                    <div className="mt-6 overflow-x-auto">
                                        <div className="h-72" style={{ minWidth: `${periodChartMinWidth}px` }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={periodChartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" />
                                                    <XAxis dataKey="label" tick={{ fill: 'rgb(var(--color-text))', fontSize: 11 }} interval={0} />
                                                    <YAxis
                                                        tick={{ fill: 'rgb(var(--color-text))', fontSize: 11 }}
                                                        tickFormatter={(value) => compactCurrencyFormatter.format(value)}
                                                    />
                                                    <RechartsTooltip
                                                        formatter={(value) => currencyFormatter.format(value)}
                                                        contentStyle={{
                                                            backgroundColor: 'rgb(var(--color-card))',
                                                            border: '1px solid rgb(var(--color-border))',
                                                            borderRadius: '0.75rem',
                                                            color: 'rgb(var(--color-text))',
                                                        }}
                                                    />
                                                    {showMultiBranchLines ? (
                                                        <>
                                                            {branchSeriesKeys.length > 1 && (
                                                                <Legend wrapperStyle={{ color: 'rgb(var(--color-text))', fontSize: 12 }} />
                                                            )}
                                                            {branchSeriesKeys.map((branch, index) => (
                                                                <Bar
                                                                    key={branch.dataKey}
                                                                    dataKey={branch.dataKey}
                                                                    name={branch.label}
                                                                    fill={linePalette[index % linePalette.length]}
                                                                />
                                                            ))}
                                                        </>
                                                    ) : (
                                                        <Bar
                                                            dataKey="total"
                                                            name={t('panel.history.seriesSales')}
                                                            fill="rgb(245 158 11)"
                                                        />
                                                    )}
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )
                            )}
                            <p className="mt-4 text-[0.7rem] text-[rgb(var(--color-text))]/60">
                                {t('panel.history.profitNote')}
                            </p>
                        </div>
                        )}
                    </div>
                </div>
            </div>
            {/*Modal para Buscar */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.6)]">
                    <div className="bg-[rgb(var(--color-card))] p-6 rounded-lg shadow-lg w-80">
                        <h2 className="text-xl font-semibold mb-4 text-[rgb(var(--color-text))]">{t('panel.history.searchTitle')}</h2>
                        <div className="mb-4">
                            <label htmlFor="searchMode" className="block text-[rgb(var(--color-text))] mb-2">{t('panel.history.searchBy')}</label>
                            <select
                                id="searchMode"
                                value={pendingSearchMode}
                                onChange={handleSearchModeChange}
                                className="w-full px-3 py-2 border border-[rgb(var(--color-border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]"
                            >
                                <option value="date">{t('panel.common.date')}</option>
                                <option value="folio">{t('panel.history.folio')}</option>
                                <option value="employee">{t('panel.history.employee')}</option>
                            </select>
                        </div>
                        {pendingSearchMode === 'date' ? (
                            <div className="mb-4">
                                <label htmlFor="startDate" className="block text-[rgb(var(--color-text))] mb-2">{t('panel.history.dateLabel')}</label>
                                <input
                                    type="date"
                                    id="startDate"
                                    name="startDate"
                                    max={new Date().toISOString().split('T')[0]}
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-[rgb(var(--color-border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]"
                                    required
                                />
                            </div>
                        ) : (
                            <div className="mb-4">
                                <label htmlFor="searchTerm" className="block text-[rgb(var(--color-text))] mb-2">
                                    {pendingSearchMode === 'folio' ? t('panel.history.folioLabel') : t('panel.history.employeeLabel')}
                                </label>
                                <input
                                    type="text"
                                    id="searchTerm"
                                    name="searchTerm"
                                    value={pendingSearchTerm}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setPendingSearchTerm(
                                            pendingSearchMode === 'folio' ? normalizeFolioInput(value) : value
                                        );
                                    }}
                                    className="w-full px-3 py-2 border border-[rgb(var(--color-border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]"
                                    placeholder={pendingSearchMode === 'folio' ? t('panel.history.folioPlaceholder') : t('panel.history.employeePlaceholder')}
                                />
                            </div>
                        )}
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded mr-2"
                            >
                                {t('panel.common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleSearch}
                                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded flex items-center"
                            >
                                <FaSearch className="mr-2" /> {t('panel.history.search')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/**Modal para Status */}
            {isStatusModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.6)]">
                    <div className="bg-[rgb(var(--color-card))] p-6 rounded-lg shadow-lg w-80">
                        <h2 className="text-xl font-semibold mb-4 text-[rgb(var(--color-text))]">
                            {t('panel.history.changeStatusTitle')}
                            <br/>
                            {folioToChange}?
                        </h2>
                        <div className="mb-4">
                            <label htmlFor="status" className="block text-[rgb(var(--color-text))] mb-2">
                                {t('panel.history.pickNewStatus')}
                            </label>
                            <select
                                id="status"
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                className="w-full px-3 py-2 border border-[rgb(var(--color-border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]"
                            >
                                <option value="A">{t('panel.history.statusActive')}</option>
                                <option value="C">{t('panel.history.statusCanceled')}</option>
                                <option value="D">{t('panel.history.statusReturned')}</option>
                                <option value="E">{t('panel.common.saleError')}</option>
                            </select>
                        </div>
                        <div className='py-4 px-4 relative flex-col justify-center items-center flex'>
                            <span className="relative flex h-5 w-5"
                            >
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
                                ${selectedStatus === 'A' ? 'bg-green-500'
                                : selectedStatus === 'C' ? 'bg-red-500'
                                : selectedStatus === 'D' ? 'bg-amber-500'
                                : 'bg-blue-500'}`}
                                ></span>
                                <GrStatusGoodSmall className={`relative inline-flex rounded-full h-5 w-5
                                ${selectedStatus === 'A' ? 'text-green-500'
                                : selectedStatus === 'C' ? 'text-red-500'
                                : selectedStatus === 'D' ? 'text-amber-500'
                                : 'text-blue-500'}`}
                                /></span>
                            <span className={`
                                ${selectedStatus === 'A' ? 'bg-green-200'
                                : selectedStatus === 'C' ? 'bg-red-200'
                                : selectedStatus === 'D' ? 'bg-amber-200'
                                : 'bg-blue-200'}
                                text-sm text-[rgb(var(--color-text-base))] px-1 shadow rounded-md mt-2`}
                            >
                                {selectedStatus === 'A' ? t('panel.history.statusActive')
                                : selectedStatus === 'C' ? t('panel.history.statusCanceled')
                                : selectedStatus === 'D' ? t('panel.history.statusReturned')
                                : t('panel.common.saleError')}
                            </span>
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setIsStatusModalOpen(false)}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded mr-2"
                            >
                                {t('panel.common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleChangeStatus}
                                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                            >
                                {t('panel.common.continue')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {ticketData && (
                <div className="hidden">
                    <ComponentToPrint
                        ref={componentRef}
                        items={ticketData.items}
                        subtotal={ticketData.subtotal}
                        discount={ticketData.discount}
                        total={ticketData.total}
                        currentDate={ticketData.currentDate}
                        employee={ticketData.employee}
                        folio={ticketData.folio}
                        notes={ticketData.notes}
                        branchName={ticketData.branchName}
                        phones={ticketData.branchSnapshot ? [ticketData.branchSnapshot.phone1, ticketData.branchSnapshot.phone2].filter(Boolean) : undefined}
                        whatsapps={ticketData.branchSnapshot ? [ticketData.branchSnapshot.whatsapp1, ticketData.branchSnapshot.whatsapp2].filter(Boolean) : undefined}
                        address={ticketData.branchSnapshot?.address || ''}
                        branchId={ticketData.branchId}
                        useDefaults={false}
                    />
                </div>
            )}
        </div>
    );
}
