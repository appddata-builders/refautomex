import { buildApiUrl } from '@/app/lib/refautomex-api';
import { FaArrowDown, FaArrowUp, FaSearch } from "react-icons/fa";
import { FaMoneyBillTransfer, FaBook, FaBox } from "react-icons/fa6";
import { GrStatusGoodSmall } from "react-icons/gr";
import { GiAutoRepair } from 'react-icons/gi';
import { useState, useEffect, Fragment, useMemo, useCallback, useContext } from 'react';
import { SlMagnifierRemove } from "react-icons/sl";
import FindFolio from './find-folio';
import Title from '../title';
import { upperCase } from 'lodash';
import { AuthContext } from '@/app/lib/auth-tracker';
import { useTranslation } from '@/app/lib/text/text-provider';

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

const isWebBranch = (value) => {
    const normalized = normalizeBranchId(value);
    if (!normalized) return false;
    const upper = normalized.toUpperCase();
    return upper === '1' || upper === 'WEB';
};

export default function Site() {
    const { t } = useTranslation();
    const [visibleTooltip, setVisibleTooltip] = useState(null);
    const findTooltip = createTooltip(FaSearch, t('panel.site.findOrder'), 'find', visibleTooltip, setVisibleTooltip);
    const findRevertTooltip = createTooltip(FaSearch, t('panel.site.clearFilter'), 'find', visibleTooltip, setVisibleTooltip);
    const order = createTooltip(FaBox, t('panel.nav.orders'), 'order', visibleTooltip, setVisibleTooltip);
    const history = createTooltip(FaMoneyBillTransfer, t('panel.site.history'), 'history', visibleTooltip, setVisibleTooltip);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [requests, setRequests] = useState([]);
    const [error, setError] = useState(null);
    const [expandedFolio, setExpandedFolio] = useState(null);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState('');
    const [currentPartNumber, setCurrentPartNumber] = useState('');
    const [folioToChange, setFolioToChange] = useState('');
    const [idVenta, setIdVenta] = useState('');
    const [viewMode, setViewMode] = useState('P');
    const [isSearchingFolio, setIsSearchingFolio] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [finalizeError, setFinalizeError] = useState(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [branchOptions, setBranchOptions] = useState([]);
    const [branchMap, setBranchMap] = useState({});
    const [selectedBranch, setSelectedBranch] = useState('');
    const [branchInitialized, setBranchInitialized] = useState(false);
    const [employeeBranchMap, setEmployeeBranchMap] = useState({});
    const PAGE_SIZE = 25;
    const { userData } = useContext(AuthContext);
    const isAdmin = String(userData?.categoria || '').toUpperCase() === 'A';
    const userBranchId = normalizeBranchId(userData?.idsucursal);
    const userId = normalizeBranchId(userData?.idusuario);

    const formatDate = (dateString) => {
        const options = { year: 'numeric', month: 'long', day: 'numeric', locale: 'es-ES' };
        return new Date(dateString).toLocaleDateString('es-ES', options);
    };

    const handleFilter = async ({ folio }) => {
        setIsSearchingFolio(true);

        try {
            const params = new URLSearchParams({ id: folio });
            const endpoint = `${buildApiUrl('/getFolioHistory')}?${params.toString()}`;
            const response = await fetch(endpoint, {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' },
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();

            if (Array.isArray(data) && data.length >= 2) {
                const pedidos = Array.isArray(data[0]) ? data[0] : [];
                const detalles = Array.isArray(data[1]) ? data[1] : [];
                const matchedPedido = pedidos.find(p => p.folio === folio);
                if (!matchedPedido) {
                    alert(t('panel.site.orderNotFound', { folio }));
                    return;
                }

                const detallesFiltrados = detalles.filter(d => String(d.idventa) === String(matchedPedido.idventa));

                setRequests([
                    {
                        ...matchedPedido,
                        idventa: matchedPedido.idventa || matchedPedido.idVenta,
                        details: detallesFiltrados
                    }
                ]);
                setCurrentPage(1);
            } else {
                alert(t('panel.site.dataNotFound', { folio }));
                setRequests([]);
            }
        } catch (error) {
            console.error("Error al buscar por folio:", error);
            alert(t('panel.site.folioNotFound'));
            setRequests([]);
        }
    };

    const handleChangeStatus = async (e) => {
        e.preventDefault();

        if (!selectedStatus) {
            alert(t('panel.common.pickStatus'));
            return;
        }

        setIsUpdatingStatus(true);

        const update_data = {
            folio: folioToChange,
            status: selectedStatus,
            idventa: idVenta,
            num_parte: currentPartNumber,
        };

        //console.log('Datos a actualizar:', update_data);

        try {
            const response = await fetch(buildApiUrl('/patchHistoryStatus'), {
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

            // Primero actualizamos el producto individual
            const updatedRequests = requests.map(request => {
                if (request.folio === folioToChange) {
                    const updatedDetails = request.details.map(detail => {
                        if (detail.num_parte === currentPartNumber) {
                            return { ...detail, status_producto: selectedStatus };
                        }
                        return detail;
                    });
                    // Verificar si todos los detalles están entregados
                    const allDelivered = updatedDetails.every(d => d.status_producto === 'E');
                    const newParentStatus = allDelivered ? 'F' : 'P';
                    return {
                        ...request,
                        status: newParentStatus,
                        details: updatedDetails
                    };
                }
                return request;
            });
            setRequests(updatedRequests);
        } catch (error) {
            console.error('Error actualizando el estado:', error);
            alert(t('panel.common.statusUpdateError'));
        } finally {
            setIsUpdatingStatus(false);
        }

        setIsStatusModalOpen(false);
    };

    const toggleDetails = (folio, idven) => {
        setExpandedFolio(expandedFolio === folio ? null : folio);
        setIdVenta(idven);
    };

    const handleOpenStatusModal = (status, folio, num_parte) => {
        const request = requests.find(req => req.folio === folio);
        const detail = request?.details.find(d => d.num_parte === num_parte);
        setSelectedStatus(detail?.status_producto || 'P');
        setFolioToChange(folio);
        setCurrentPartNumber(num_parte);
        setIdVenta(request?.idventa || request?.idVenta);
        setIsStatusModalOpen(true);
    };

    const closeFinalizeModal = () => {
        setIsFinalizeModalOpen(false);
        setSelectedRequest(null);
        setFinalizeError(null);
    };

    const handleOpenFinalizeModal = (request) => {
        setSelectedRequest(request);
        setFinalizeError(null);
        setIsFinalizeModalOpen(true);
    };

    const handleFinalizeOrder = async () => {
        if (!selectedRequest) return;

        const pendingDetails = (selectedRequest.details || []).filter(
            (detail) => detail.status_producto !== 'E'
        );

        if (pendingDetails.length === 0) {
            setIsFinalizeModalOpen(false);
            setSelectedRequest(null);
            return;
        }

        setIsFinalizing(true);
        setFinalizeError(null);

        try {
            await Promise.all(
                pendingDetails.map((detail) =>
                    fetch(buildApiUrl('/patchHistoryStatus'), {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/json, text/plain, */*',
                        },
                        body: JSON.stringify({
                            folio: selectedRequest.folio,
                            status: 'E',
                            idventa: selectedRequest.idventa,
                            num_parte: detail.num_parte,
                        }),
                    }).then(response => {
                        if (!response.ok) {
                            throw new Error(`Error ${response.status}: ${response.statusText}`);
                        }
                    })
                )
            );

            await fetchData();
            setIsFinalizeModalOpen(false);
            setSelectedRequest(null);
        } catch (error) {
            console.error('Error finalizando pedido:', error);
            setFinalizeError(t('panel.site.finalizeError'));
        } finally {
            setIsFinalizing(false);
        }
    };

    const fetchData = async () => {
        try {
            const response = await fetch(buildApiUrl('/getSiteRequests'), {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' },
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const payload = await response.json();
            if (Array.isArray(payload) && payload.length >= 2) {
                const pedidos = Array.isArray(payload[0]) ? payload[0] : [];
                const detalles = Array.isArray(payload[1]) ? payload[1] : [];
                const filteredPedidos = pedidos.filter(pedido => pedido.status === viewMode);

                const requests = filteredPedidos.map(pedido => {
                    const detallesFiltrados = detalles.filter(detalle => String(detalle.idventa) === String(pedido.idventa));
                    return {
                        ...pedido,
                        idventa: pedido.idventa || pedido.idVenta, // unify casing
                        details: detallesFiltrados.length ? detallesFiltrados : []
                    };
                });

                setRequests(requests);
            } else {
                console.error("Estructura inesperada de response.data:", response.data);
                setRequests([]);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
            setError(error.message);
            setRequests([]);
        }
    };

    useEffect(() => {
        fetchData();
    }, [viewMode]);

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
                const rows = Array.isArray(payload?.[0]) ? payload[0] : Array.isArray(payload) ? payload : [];
                const options = rows
                    .map((branch) => ({
                        value: normalizeBranchId(branch.idsucursal ?? branch.idSucursal ?? branch.id),
                        label: branch.sucursal || branch.nombre || branch.branch || `Sucursal ${branch.idsucursal ?? branch.id}`,
                    }))
                    .filter((option) => option.value && !isWebBranch(option.value) && !String(option.label).toLowerCase().includes('web'));

                const names = options.reduce((acc, option) => {
                    if (option.value) acc[option.value] = option.label;
                    return acc;
                }, {});

                setBranchOptions(options);
                setBranchMap(names);
            } catch (error) {
                console.error('Error fetching sucursales:', error);
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
            } catch (error) {
                console.error('Error fetching empleados:', error);
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

    useEffect(() => {
        setCurrentPage(1);
    }, [viewMode]);

    useEffect(() => {
        if (!isSearchingFolio) {
            const finalized = requests.filter((req) => req.status === 'F');
            console.log('[Site] Estado actual', {
                viewMode,
                totalPedidos: requests.length,
                finalizados: finalized.length,
                detalleFinalizados: finalized.map((req) => ({
                    folio: req.folio,
                    idventa: req.idventa,
                })),
            });
        }
    }, [viewMode, requests, isSearchingFolio]);

    const resolveRequestBranchId = useCallback((request) => {
        if (!request) return null;
        const directBranch = normalizeBranchId(
            request.idsucursal ??
            request.idSucursal ??
            request.id_sucursal ??
            request.sucursalId ??
            request.branchId ??
            request.branch_id
        );
        if (directBranch) return directBranch;

        if (request.sucursal && branchOptions.length > 0) {
            const normalizedName = String(request.sucursal).trim().toLowerCase();
            const matched = branchOptions.find(
                (option) => option.label?.toLowerCase() === normalizedName
            );
            if (matched?.value) return matched.value;
        }

        const requestUserId = normalizeBranchId(
            request.idusuario ??
            request.idUsuario ??
            request.idempleado ??
            request.idEmpleado
        );
        if (requestUserId && employeeBranchMap[requestUserId]) {
            return employeeBranchMap[requestUserId];
        }

        return null;
    }, [branchOptions, employeeBranchMap]);

    const resolvedUserBranchId = userBranchId || (userId ? employeeBranchMap[userId] : null);
    const activeBranchId = isAdmin ? selectedBranch : resolvedUserBranchId;
    const visibleRequests = useMemo(() => {
        const baseRequests = Array.isArray(requests) ? requests : [];
        if (!activeBranchId) {
            return isAdmin ? baseRequests : [];
        }
        return baseRequests.filter((request) => {
            const branchId = resolveRequestBranchId(request);
            return branchId ? branchId === activeBranchId : false;
        });
    }, [requests, activeBranchId, resolveRequestBranchId, isAdmin]);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeBranchId]);

    const totalPages = Math.max(1, Math.ceil(visibleRequests.length / PAGE_SIZE));
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const paginatedRequests = isSearchingFolio
        ? visibleRequests
        : visibleRequests.slice(startIndex, startIndex + PAGE_SIZE);

    const selectedBranchLabel = activeBranchId
        ? (branchMap[activeBranchId] || t('panel.site.selectedBranch'))
        : (isAdmin ? t('panel.site.allBranches') : t('panel.site.noBranch'));

    const handlePrevPage = () => {
        setCurrentPage((prev) => Math.max(1, prev - 1));
    };

    const handleNextPage = () => {
        setCurrentPage((prev) => Math.min(totalPages, prev + 1));
    };

    return (
        <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] backdrop-blur-md pt-28">
            <Title
                title={t('panel.site.title')}
                icon={GiAutoRepair}
                back={t('panel.common.back')}
                path='/productivity'
            />
            <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-card))] p-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.25em] text-[rgb(var(--color-text))]">
                        {t('panel.common.branch')}
                    </div>
                    {isAdmin ? (
                        <select
                            value={selectedBranch}
                            onChange={(event) => setSelectedBranch(event.target.value)}
                            disabled={branchOptions.length === 0}
                            className="min-w-[220px] rounded-full border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] px-4 py-2 text-sm text-[rgb(var(--color-text))] shadow-inner outline-none focus:ring-2 focus:ring-[rgb(var(--color-text))]/70"
                        >
                            {branchOptions.length === 0 && (
                                <option value="" disabled>
                                    {t('panel.site.noBranches')}
                                </option>
                            )}
                            {branchOptions.map((branch) => (
                                <option key={branch.value} value={branch.value}>
                                    {branch.label}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <span className="rounded-full border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-text))] shadow-inner">
                            {selectedBranchLabel}
                        </span>
                    )}
                </div>
            </div>
            <div className="mx-auto max-w-7xl px-6 lg:px-8 mt-5">
                    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-x-4 gap-y-3 lg:mx-0 lg:max-w-none">
                        {!isSearchingFolio && visibleRequests.length === 0 && (
                            <div className="text-center text-sm text-[rgb(var(--color-text))] py-4">
                                {t('panel.site.noRecords', { branch: selectedBranchLabel })}
                            </div>
                        )}
                        {!isSearchingFolio && visibleRequests.length > PAGE_SIZE && (
                            <div className="flex items-center justify-center gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={handlePrevPage}
                                    disabled={currentPage === 1}
                                    className={`px-3 py-1 rounded-full border ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[rgb(var(--color-card))]'}`}
                                >
                                    {t('common.prev')}
                                </button>
                                <span className="text-sm text-[rgb(var(--color-text))]">
                                    {t('panel.common.pageOf', { page: currentPage, total: totalPages })}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleNextPage}
                                    disabled={currentPage === totalPages}
                                    className={`px-3 py-1 rounded-full border ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[rgb(var(--color-card))]'}`}
                                >
                                    {t('common.next')}
                                </button>
                            </div>
                        )}
                        <div className="relative h-[70vh] bg-[rgb(var(--color-bg))] rounded-2xl mb-5 flex justify-center shadow">
                            <div className='flex flex-col px-1 bg-[rgb(var(--color-card))] rounded-l-2xl pt-5 relative w-16'>
                                <div className='bg-[rgb(var(--color-card))] rounded-full shadow shadow-[rgb(var(--color-galaxy))] w-max absolute top-2 flex flex-col sm:ml-0.5'>
                                    {isSearchingFolio ? (
                                        <div
                                            className='green-circle-button relative'
                                            onClick={() => {
                                                setIsSearchingFolio(false);
                                                fetchData();
                                            }}
                                            onMouseEnter={findRevertTooltip.show}
                                            onMouseLeave={findRevertTooltip.hide}>
                                            <SlMagnifierRemove />
                                            {findRevertTooltip.tooltip}
                                        </div>
                                    ):(
                                        <div
                                            className='blue-circle-button relative'
                                            onClick={() => setIsModalOpen(true)}
                                            onMouseEnter={findTooltip.show}
                                            onMouseLeave={findTooltip.hide}>
                                            <FaSearch />
                                            {findTooltip.tooltip}
                                        </div>
                                    )}

                                    <FindFolio
                                            isOpen={isModalOpen}
                                            onClose={() => setIsModalOpen(false)}
                                            onFilter={handleFilter}
                                    />
                                </div>
                                {!isSearchingFolio && (
                                    <div className='bg-[rgb(var(--color-card))] rounded-full shadow shadow-[rgb(var(--color-galaxy))] w-max absolute top-16 flex flex-col sm:ml-0.5'>
                                        <div
                                            className={`${viewMode === 'P'
                                            ? 'p-3 m-1 rounded-full shadow hover:shadow-xl bg-amber-500 color-cultured cursor-pointer inline-block'
                                            : 'gray-circle-button'} relative`}
                                            onMouseEnter={order.show}
                                            onMouseLeave={order.hide}
                                            onClick={() => setViewMode('P')}
                                        >
                                            <FaBox />
                                            {order.tooltip}
                                        </div>
                                        <div
                                            className={`${viewMode === 'F'
                                            ? 'p-3 m-1 rounded-full shadow hover:shadow-xl bg-amber-500 color-cultured cursor-pointer inline-block'
                                            : 'gray-circle-button'} relative`}
                                            onMouseEnter={history.show}
                                            onMouseLeave={history.hide}
                                            onClick={() => setViewMode('F')}
                                        >
                                            <FaBook />
                                            {history.tooltip}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className='w-full h-full overflow-scroll'>
                                <table className="w-full lg:w-[1155px] text-sm text-left text-[rgb(var(--color-text))] mx-auto">
                                    <thead className="text-xs text-[rgb(var(--color-text))] uppercase bg-[rgb(var(--color-card))] text-center">
                                        <tr>
                                            <th scope="col" className="p-1.5">{t('panel.table.status')}</th>
                                            <th scope="col" className="py-2 px-8">{t('panel.table.folio')}</th>
                                            <th scope="col" className="py-2 px-8">{t('panel.table.client')}</th>
                                            <th scope="col" className="py-2 px-8">{t('panel.table.total')}</th>
                                            <th scope="col" className="py-2 px-8">{t('panel.table.delivery')}</th>
                                            <th scope="col" className="py-2 px-8">{t('panel.table.saleDay')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                            {Array.isArray(paginatedRequests) && paginatedRequests.map((item, index) => (
                                            <Fragment key={item.folio || index}>
                                                <tr className="bg-[rgb(var(--color-bg))]" >
                                                    <td className="py-4 px-4 relative flex-col justify-center items-center flex">
                                                        <button
                                                            className="relative flex h-5 w-5"
                                                        >
                                                            <GrStatusGoodSmall className={`relative inline-flex rounded-full h-5 w-5 animate-pulse
                                                            ${item.status === 'P' ? 'text-[rgb(var(--color-amber))]'
                                                                : 'text-[rgb(var(--color-error))]'}`}
                                                            />
                                                        </button>
                                                        <span
                                                            onClick={() => {
                                                                if (item.status === 'P') {
                                                                    handleOpenFinalizeModal(item);
                                                                }
                                                            }}
                                                            className={`
                                                            ${item.status === 'P' ? 'bg-[rgb(var(--color-amber))] cursor-pointer hover:opacity-80'
                                                            : 'bg-[rgb(var(--color-error))] cursor-default'}
                                                            text-sm text-[rgb(var(--color-text-base))] px-1 rounded-md mt-2`}
                                                        >
                                                            {item.status === 'P' ? t('panel.site.statusOrder')
                                                            : t('panel.site.statusFinished')}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-1 md:px-3 cursor-pointer font-medium bg-[rgb(var(--color-card))]"
                                                        onClick={() => toggleDetails(item.folio, item.idVenta)}
                                                    >
                                                        <div className='flex flex-col items-center text-[rgb(var(--color-text))]'>
                                                            <span className='font-semibold text-sm xl:text-lg truncate'>{item.folio}</span>
                                                            <span className='animate-out mt-2 rounded-full shadow shadow-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))] p-0.5'>
                                                                {expandedFolio === item.folio ? <FaArrowUp size={13}/> : <FaArrowDown size={13}/>}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-3 bg-[rgb(var(--color-gray))]">
                                                        <div className='flex flex-col items-center justify-center'>
                                                            <span className='text-lg text-[rgb(var(--color-text))]'>
                                                                {upperCase(item.nombre)}
                                                            </span>
                                                            <span className='font-bold text-[rgb(var(--color-text))]'>
                                                                {item.telefono}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 font-bold text-lg">
                                                        $ {item.total_venta}
                                                    </td>
                                                    <td className="py-4 px-2 m-1 cursor-pointer font-medium">
                                                        <span className='bg-[rgb(var(--color-error))] text-[rgb(var(--color-text-base))] lg:rounded-full p-1 flex flex-col items-center justify-center'>
                                                            {formatDate(item.f_entrega)}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-2 m-1 cursor-pointer font-medium">
                                                        <span className='flex flex-col items-center justify-center'>
                                                            {formatDate(item.f_pedido)}
                                                        </span>
                                                    </td>
                                                </tr>
                                                {expandedFolio === item.folio && (
                                                    <tr className="bg-[rgb(var(--color-bg))]">
                                                        <td colSpan="7" className="py-1 pb-3 px-1">
                                                            <div>
                                                                <table className="w-full text-sm text-left text-[rgb(var(--color-text))] mt-2 shadow">
                                                                    <thead className="text-xs text-[rgb(var(--color-text))] uppercase bg-[rgb(var(--color-card))]">
                                                                        <tr>
                                                                            <th scope="col" className="py-2 px-4">{t('panel.table.status')}</th>
                                                                            <th scope="col" className="py-2 px-4">{t('panel.table.partNumber')}</th>
                                                                            <th scope="col" className="py-2 px-4">{t('panel.table.description')}</th>
                                                                            <th scope="col" className="py-2 px-4">{t('panel.table.quantity')}</th>
                                                                            <th scope="col" className="py-2 px-4">{t('panel.table.unitPrice')}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {item.details && item.details.map((detail, i) => (
                                                                            <tr key={i} className="bg-[rgb(var(--color-gray))] border-b border-[rgb(var(--color-border))]">
                                                                                <td className="p-4 relative flex-col justify-center items-center flex">
                                                                                    <button
                                                                                        className="relative flex h-5 w-5"
                                                                                        onClick={() => handleOpenStatusModal(item.status, item.folio, detail.num_parte)}
                                                                                    >
                                                                                        <GrStatusGoodSmall className={`relative inline-flex rounded-full h-5 w-5 animate-pulse
                                                                                        ${detail.status_producto === 'P' ? 'text-[rgb(var(--color-success))]'
                                                                                            : 'text-[rgb(var(--color-text))]'}`}
                                                                                        />
                                                                                    </button>
                                                                                    <span
                                                                                        onClick={() => handleOpenStatusModal(item.status, item.folio, detail.num_parte)}
                                                                                        className={`
                                                                                        ${detail.status_producto === 'P' ? 'bg-[rgb(var(--color-success))] cursor-pointer hover:opacity-85'
                                                                                        : 'bg-[rgb(var(--color-blue))] cursor-pointer hover:opacity-85'}
                                                                                        text-sm text-[rgb(var(--color-text-base))] px-1 shadow rounded-md mt-2`}
                                                                                    >
                                                                                        {detail.status_producto === 'P' ? t('panel.common.pending')
                                                                                        : detail.status_producto === 'E' ? t('panel.common.delivered')
                                                                                        : t('panel.common.saleError')}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="py-2 px-4">{detail.num_parte}</td>
                                                                                <td className="py-2 px-4 uppercase">{detail.descripcion ? detail.descripcion : detail.concepto_comodin}</td>
                                                                                <td className="py-2 px-4">{detail.cantidad}</td>
                                                                                <td className="py-2 px-4">$ {detail.precio_venta}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr className='bg-[rgb(var(--color-card))] border-[rgb(var(--color-border))] border-b-2'>
                                                    <td colSpan={9} className='text-lg font-semibold text-[rgb(var(--color-text))] pl-1'>NOTA: {upperCase(item.nota)}</td>
                                                </tr>
                                            </Fragment>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                {/**Modal para Status */}
                {isStatusModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(var(--color-gray-base))]/70">
                        <div className="bg-[rgb(var(--color-bg))] p-6 rounded-lg shadow-lg w-80">
                            <h2 className="text-xl font-semibold mb-4 text-[rgb(var(--color-text))]">
                                ¿Cambiar status de
                                <br/>
                                {folioToChange}?
                            </h2>
                            <div className="mb-4">
                                <label htmlFor="status" className="block text-[rgb(var(--color-text))] mb-2">
                                    {t('panel.site.changeStatus')}
                                </label>
                                <select
                                    id="status"
                                    value={selectedStatus}
                                    onChange={(e) => setSelectedStatus(e.target.value)}
                                    className="w-full px-3 py-2 border border-[rgb(var(--color-border))] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]"
                                >
                                    <option value="P">{t('panel.common.pending')}</option>
                                    <option value="E">{t('panel.common.delivered')}</option>
                                </select>
                            </div>
                            <div className='py-4 px-4 relative flex-col justify-center items-center flex'>
                                <span className="relative flex h-5 w-5"
                                >
                                    <GrStatusGoodSmall className={`relative inline-flex rounded-full h-5 w-5 animate-pulse
                                    ${selectedStatus === 'P' ? 'text-[rgb(var(--color-success))]'
                                    : 'text-[rgb(var(--color-blue))]'}`}
                                    /></span>
                                <span className={`text-sm text-[rgb(var(--color-text))] px-1 shadow rounded-md mt-2`}
                                >
                                    {selectedStatus === 'P' ? t('panel.common.pending')
                                    : t('panel.common.delivered')}
                                </span>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setIsStatusModalOpen(false)}
                                    disabled={isUpdatingStatus}
                                    className="px-4 py-2 rounded-full border text-sm mr-2 disabled:opacity-50"
                                >
                                    {t('panel.common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleChangeStatus}
                                    disabled={isUpdatingStatus}
                                    className={`px-4 py-2 rounded-full text-sm text-white ${
                                        isUpdatingStatus
                                            ? 'bg-emerald-300 cursor-not-allowed'
                                            : 'bg-emerald-500 hover:bg-emerald-600'
                                    }`}
                                >
                                    {isUpdatingStatus ? t('panel.common.updating') : t('panel.common.continue')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {isFinalizeModalOpen && selectedRequest && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(var(--color-gray-base))]/70">
                        <div className="bg-[rgb(var(--color-bg))] p-6 rounded-lg shadow-xl w-96 max-w-full">
                            <h2 className="text-xl font-semibold mb-2 text-[rgb(var(--color-text))]">
                                {t('panel.site.finalizeTitle')}
                            </h2>
                            <p className="text-sm text-[rgb(var(--color-text))] mb-4">
                                {t('panel.site.finalizeHint')}{' '}
                                <span className="font-bold">{selectedRequest.folio}</span>.
                            </p>
                            <div className="bg-[rgb(var(--color-card))] rounded-lg p-3 mb-4 text-sm">
                                <p>{t('panel.site.totalProducts')} {selectedRequest.details?.length || 0}</p>
                                <p>
                                    {t('panel.orders.tabPending')}:{' '}
                                    {selectedRequest.details?.filter((detail) => detail.status_producto !== 'E')
                                        .length || 0}
                                </p>
                            </div>
                            {finalizeError && (
                                <p className="text-sm text-[rgb(var(--color-error))] mb-3">
                                    {finalizeError}
                                </p>
                            )}
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={closeFinalizeModal}
                                    className="px-4 py-2 rounded-full border text-sm"
                                    disabled={isFinalizing}
                                >
                                    {t('panel.common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleFinalizeOrder}
                                    className={`px-4 py-2 rounded-full text-sm text-white ${
                                        isFinalizing
                                            ? 'bg-emerald-400 cursor-not-allowed'
                                            : 'bg-emerald-500 hover:bg-emerald-600'
                                    }`}
                                    disabled={isFinalizing}
                                >
                                    {isFinalizing ? t('panel.site.finalizing') : t('panel.orders.finish')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>


    );
}
