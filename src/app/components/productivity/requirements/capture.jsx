import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useState, useEffect, useMemo, useRef } from 'react';
import Title from '../title';
import { HiClipboardDocumentList } from 'react-icons/hi2';
import { FaSearch, FaBox, FaChevronDown } from 'react-icons/fa';
import { FaMoneyBillTransfer } from 'react-icons/fa6';
import { FaSignature } from "react-icons/fa";
import { MdRateReview, MdDeleteForever } from "react-icons/md";
import NewCapture from './new-capture';
import { useTranslation } from '@/app/lib/text/text-provider';

const formatCurrency = (value = 0) => {
    const numericValue = Number(value) || 0;
    return numericValue.toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN'
    });
};

const formatDate = (value) => {
    if (!value) return '---';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

const getInvoiceId = (invoice) =>
    invoice?.idCompra ?? invoice?.idcompra ?? invoice?.id ?? invoice?.folio ?? invoice?.num_factura ?? invoice?.noFactura;

const getProviderId = (record) =>
    `${record?.idProveedor ?? record?.idproveedor ?? record?.id ?? ''}`;

const getProviderName = (record) =>
    record?.empresa ?? record?.proveedor ?? '---';

const getInvoiceAmount = (invoice) =>
    Number(invoice?.total ?? invoice?.monto_total ?? invoice?.importe ?? 0);

const getInvoiceDueDate = (invoice) =>
    invoice?.fecha_pago ??
    invoice?.fecha_vencimiento ??
    invoice?.fecha_venc ??
    invoice?.fecha_limite ??
    invoice?.fechaVencimiento ??
    invoice?.fecha_pago_estimada ??
    null;

const escapeHtml = (value = '') => {
    const stringValue = value == null ? '' : value.toString();
    return stringValue
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// `t` llega por parametro: la funcion arma el HTML de la ventana de impresion
// fuera del arbol de React, donde el hook no esta disponible.
const buildPrintableHtml = (type, providerGroups, issueDate, logoSrc, t) => {
    const docTitle = type === 'revision' ? t('panel.print.receipts') : t('panel.print.policy');
    const subtitle = type === 'revision'
        ? t('panel.print.receiptsSubtitle')
        : t('panel.print.policySubtitle');
    const sanitizedDate = escapeHtml(issueDate);
    const sanitizedLogo = escapeHtml(logoSrc);
    const sections = providerGroups.map((group, index) => {
        const invoiceRows = group.invoices.length
            ? group.invoices.map((invoice) => {
                const invoiceNumber = escapeHtml(invoice?.num_factura ?? invoice?.noFactura ?? '---');
                const purchaseDate = escapeHtml(formatDate(invoice?.fecha_compra ?? invoice?.fecha ?? invoice?.fecha_cap));
                const dueDate = escapeHtml(formatDate(getInvoiceDueDate(invoice)));
                const amount = escapeHtml(formatCurrency(getInvoiceAmount(invoice)));
                return `
                    <tr>
                        <td>${invoiceNumber}</td>
                        <td>${purchaseDate}</td>
                        <td>${dueDate}</td>
                        <td class="text-right">${amount}</td>
                    </tr>
                `;
            }).join('')
            : `<tr><td colspan="4" class="empty">${escapeHtml(t('panel.capture.noPendingInvoices'))}</td></tr>`;
        return `
            <section class="provider-section${index < providerGroups.length - 1 ? ' page-break' : ''}">
                <div class="provider-header">
                    <div>
                        <h2>${escapeHtml(group.providerName)}</h2>
                        <p>ID ${escapeHtml(group.providerId)} · ${group.invoices.length} ${escapeHtml(group.invoices.length === 1 ? t('panel.capture.invoiceOne') : t('panel.capture.invoiceMany'))}</p>
                    </div>
                    <div class="provider-total">
                        <span>${escapeHtml(t('panel.capture.totalToPay'))}</span>
                        <strong>${escapeHtml(formatCurrency(group.total))}</strong>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>${escapeHtml(t('panel.capture.invoice'))}</th>
                            <th>${escapeHtml(t('panel.capture.purchaseDate'))}</th>
                            <th>${escapeHtml(t('panel.capture.dueDate'))}</th>
                            <th>${escapeHtml(t('panel.capture.amount'))}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoiceRows}
                    </tbody>
                </table>
            </section>
        `;
    }).join('');

    return `
        <!DOCTYPE html>
        <html lang="es">
            <head>
                <meta charSet="utf-8" />
                <title>${docTitle} · ${escapeHtml(t('meta.brand'))}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 32px; color: #111827; background: #fff; }
                    .document-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 24px; }
                    .logo-block { display: flex; align-items: center; gap: 16px; }
                    .logo-block img { height: 60px; width: auto; }
                    .logo-block div { line-height: 1.2; }
                    .logo-block strong { font-size: 18px; display: block; }
                    .logo-block span { font-size: 12px; color: #6b7280; }
                    .meta { text-align: right; font-size: 13px; color: #374151; }
                    .meta span { font-weight: 600; color: #111827; }
                    h1 { font-size: 20px; margin-bottom: 16px; }
                    .provider-section { border: 1px solid #e5e7eb; border-radius: 16px; padding: 16px; margin-bottom: 24px; background: #f8fafc; }
                    .provider-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
                    .provider-header h2 { margin: 0; font-size: 18px; }
                    .provider-header p { margin: 0; color: #6b7280; font-size: 13px; }
                    .provider-total { text-align: right; }
                    .provider-total span { font-size: 12px; display: block; color: #6b7280; }
                    .provider-total strong { font-size: 20px; color: #111827; }
                    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                    th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 13px; text-align: left; }
                    th { background: #e5e7eb; font-weight: 600; text-transform: uppercase; font-size: 12px; }
                    td.text-right { text-align: right; }
                    .empty { text-align: center; color: #6b7280; padding: 16px 8px; font-style: italic; }
                    .page-break { page-break-after: always; }
                    @media print {
                        body { margin: 12mm; }
                        .provider-section { page-break-inside: avoid; }
                    }
                </style>
            </head>
            <body>
                <header class="document-header">
                    <div class="logo-block">
                        <img src="${sanitizedLogo}" alt="${escapeHtml(t('meta.brand'))}" />
                        <div>
                            <strong>${escapeHtml(t('panel.print.companyName'))}</strong>
                            <span>${escapeHtml(t('panel.print.companyTagline'))}</span>
                        </div>
                    </div>
                    <div class="meta">
                        <div><span>${escapeHtml(t('panel.print.document'))}</span> ${docTitle}</div>
                        <div><span>${escapeHtml(t('panel.print.issued'))}</span> ${sanitizedDate}</div>
                    </div>
                </header>
                <h1>${subtitle}</h1>
                ${sections || `<p>${escapeHtml(t('panel.capture.noProvidersToPrint'))}</p>`}
            </body>
        </html>
    `;
};

function ProviderCheckbox({ indeterminate, ...props }) {
    const checkboxRef = useRef(null);
    useEffect(() => {
        if (checkboxRef.current) {
            checkboxRef.current.indeterminate = Boolean(indeterminate);
        }
    }, [indeterminate]);
    return <input ref={checkboxRef} type="checkbox" {...props} />;
}

function PurchasesTable({
    groups,
    selectedInvoices,
    onToggleInvoice,
    onToggleProvider,
    onEdit,
    onDelete
}) {
    const { t } = useTranslation();
    const [expandedProviders, setExpandedProviders] = useState({});

    const toggleExpand = (providerId) => {
        setExpandedProviders((prev) => ({
            ...prev,
            [providerId]: !(prev[providerId] ?? true)
        }));
    };

    if (!groups.length) {
        return (
            <div className="py-16 text-center text-sm text-[rgb(var(--color-muted))]">
                No hay compras registradas con los filtros actuales.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {groups.map((group) => {
                const totalInvoices = group.invoices.length;
                const invoiceIds = group.invoices
                    .map((invoice) => getInvoiceId(invoice))
                    .filter(Boolean);
                const selectedCount = invoiceIds.filter((id) => selectedInvoices.includes(id)).length;
                const allSelected = totalInvoices > 0 && selectedCount === totalInvoices;
                const isIndeterminate = selectedCount > 0 && selectedCount < totalInvoices;
                const isExpanded = expandedProviders[group.providerId] ?? true;

                return (
                    <div key={group.providerId} className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-4">
                            <div className="flex items-center gap-3">
                                <ProviderCheckbox
                                    className="accent-[rgb(var(--color-galaxy))]"
                                    checked={allSelected}
                                    indeterminate={isIndeterminate}
                                    onChange={() => onToggleProvider(group.providerId)}
                                    disabled={totalInvoices === 0}
                                />
                                <div>
                                    <p className="font-semibold text-[rgb(var(--color-text))]">{group.providerName}</p>
                                    <p className="text-xs text-[rgb(var(--color-muted))]">
                                        ID {group.providerId} · {totalInvoices} {totalInvoices === 1 ? t('panel.capture.invoiceOne') : t('panel.capture.invoiceMany')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className="text-xs text-[rgb(var(--color-muted))]">{t('panel.capture.totalToPay')}</p>
                                    <p className="text-base font-bold text-[rgb(var(--color-text))]">
                                        {formatCurrency(group.total)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(group.providerId)}
                                    className="inline-flex items-center rounded-full border border-[rgb(var(--color-border))] p-2 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
                                >
                                    <FaChevronDown className={`transition-transform duration-200 ${isExpanded ? '' : 'rotate-180'}`} />
                                </button>
                            </div>
                        </div>
                        {isExpanded && (
                            <div className="border-t border-[rgb(var(--color-border))]">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left text-[rgb(var(--color-text))]">
                                        <thead className="text-xs uppercase bg-[rgb(var(--color-card))]">
                                            <tr>
                                                <th className="p-3">{t('panel.capture.select')}</th>
                                                <th className="p-3">{t('panel.capture.invoice')}</th>
                                                <th className="p-3">{t('panel.capture.state')}</th>
                                                <th className="p-3">{t('panel.capture.purchaseDate')}</th>
                                                <th className="p-3">{t('panel.capture.dueDate')}</th>
                                                <th className="p-3">{t('panel.capture.amountShort')}</th>
                                                <th className="p-3 text-center">{t('panel.capture.action')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.invoices.map((invoice, index) => {
                                                const realInvoiceId = getInvoiceId(invoice);
                                                const rowKey = realInvoiceId || `${group.providerId}-${index}`;
                                                const isSelectable = Boolean(realInvoiceId);
                                                const isChecked = isSelectable && selectedInvoices.includes(realInvoiceId);
                                                const amount = getInvoiceAmount(invoice);
                                                const dueDate = getInvoiceDueDate(invoice);
                                                const status = invoice?.estado ?? invoice?.status ?? t('panel.common.pending');
                                                return (
                                                    <tr key={rowKey} className="border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
                                                        <td className="p-3">
                                                            <input
                                                                type="checkbox"
                                                                className="accent-[rgb(var(--color-galaxy))]"
                                                                checked={isChecked}
                                                                disabled={!isSelectable}
                                                                onChange={() => isSelectable && onToggleInvoice(realInvoiceId)}
                                                            />
                                                        </td>
                                                        <td className="p-3 font-semibold">
                                                            {invoice?.num_factura ?? invoice?.noFactura ?? '---'}
                                                        </td>
                                                        <td className="p-3">
                                                            <span className="px-2 py-1 rounded-full text-xs bg-[rgb(var(--color-gray))] text-[rgb(var(--color-text))]">
                                                                {status}
                                                            </span>
                                                        </td>
                                                        <td className="p-3">{formatDate(invoice?.fecha_compra ?? invoice?.fecha ?? invoice?.fecha_cap)}</td>
                                                        <td className="p-3">{formatDate(dueDate)}</td>
                                                        <td className="p-3 font-semibold">{formatCurrency(amount)}</td>
                                                        <td className="p-3 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onEdit(invoice)}
                                                                    className="inline-flex items-center rounded-md bg-[rgb(var(--color-galaxy))] px-3 py-1 text-white text-xs font-semibold shadow hover:opacity-85"
                                                                >
                                                                    Detalle
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onDelete(invoice)}
                                                                    className="inline-flex items-center rounded-md bg-red-600 px-3 py-1 text-white text-xs font-semibold shadow hover:bg-red-700"
                                                                >
                                                                    <MdDeleteForever />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function PoliciesTable({ rows }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-[rgb(var(--color-text))]">
                <thead className="text-xs uppercase bg-[rgb(var(--color-card))]">
                    <tr>
                        <th className="p-3">{t('panel.capture.policyNumber')}</th>
                        <th className="p-3">{t('panel.capture.provider')}</th>
                        <th className="p-3">{t('panel.capture.paymentType')}</th>
                        <th className="p-3">{t('panel.capture.policyDate')}</th>
                        <th className="p-3">{t('panel.capture.amount')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="p-4 text-center text-[rgb(var(--color-muted))]">
                                {t('panel.capture.noPolicies')}
                            </td>
                        </tr>
                    ) : (
                        rows.map((policy) => {
                            const amount = policy?.importe ?? policy?.total ?? policy?.monto_total ?? 0;
                            const provider = policy?.empresa ?? policy?.proveedor ?? '---';
                            return (
                                <tr key={policy?.idPoliza ?? policy?.idpoliza ?? policy?.folio ?? `${provider}-${policy?.fecha}`}
                                    className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
                                    <td className="p-3 font-semibold">{policy?.idPoliza ?? policy?.idpoliza ?? '---'}</td>
                                    <td className="p-3">{provider}</td>
                                    <td className="p-3">{policy?.tipo_pago ?? policy?.tipo ?? '---'}</td>
                                    <td className="p-3">{formatDate(policy?.fecha_poliza ?? policy?.fecha)}</td>
                                    <td className="p-3 font-semibold">{formatCurrency(amount)}</td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}

function CaptureDetailView({ header, detail, onBack }) {
    const { t } = useTranslation();

    if (!header) {
        return (
            <div className="bg-white/70 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                {t('panel.capture.detailMissing')}
                <div className="mt-4">
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-slate-700"
                    >
                        {t('panel.common.goBack')}
                    </button>
                </div>
            </div>
        );
    }

    const totals = [
        { label: t('panel.capture.net'), value: formatCurrency(header.neto_total ?? header.netoTotal ?? 0) },
        { label: t('panel.capture.discount'), value: formatCurrency(header.descuento_total ?? header.descuentoTotal ?? 0) },
        { label: t('checkout.subtotal'), value: formatCurrency(header.subtotal ?? 0) },
        { label: t('checkout.total'), value: formatCurrency(header.total ?? 0) }
    ];

    const detailRows = Array.isArray(detail) ? detail : [];

    return (
        <div className="bg-[rgb(var(--color-card))] rounded-2xl shadow p-6 space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between border-b border-[rgb(var(--color-border))] pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-[rgb(var(--color-text))]">
                        Factura {header.num_factura ?? header.no_factura ?? header.factura ?? '---'}
                    </h2>
                    <p className="text-sm text-[rgb(var(--color-muted))]">
                        Proveedor: {header.empresa ?? header.proveedor ?? '---'}
                    </p>
                    <p className="text-sm text-[rgb(var(--color-muted))]">
                        Fecha de compra: {formatDate(header.fecha_compra ?? header.fecha ?? header.fecha_cap)}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center rounded-md bg-slate-800 px-4 py-2 text-white text-sm font-semibold shadow hover:bg-slate-700"
                >
                    Volver
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {totals.map((item) => (
                    <div key={item.label} className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
                        <p className="text-xs uppercase text-[rgb(var(--color-muted))]">{item.label}</p>
                        <p className="text-lg font-semibold text-[rgb(var(--color-text))]">{item.value}</p>
                    </div>
                ))}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-[rgb(var(--color-text))]">
                    <thead className="text-xs uppercase bg-[rgb(var(--color-card))]">
                        <tr>
                            <th className="p-3">{t('panel.capture.part')}</th>
                            <th className="p-3">{t('panel.capture.descriptionLabel')}</th>
                            <th className="p-3">{t('panel.capture.quantity')}</th>
                            <th className="p-3">{t('panel.capture.cost')}</th>
                            <th className="p-3">{t('panel.capture.discounts')}</th>
                            <th className="p-3">{t('panel.capture.amount')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {detailRows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-4 text-center text-[rgb(var(--color-muted))]">
                                    {t('panel.capture.noDetail')}
                                </td>
                            </tr>
                        ) : (
                            detailRows.map((item, index) => {
                                const ref = item.num_parte ?? item.ref ?? item.refaccion ?? `item-${index}`;
                                const description = item.descripcion ?? item.detalle ?? '---';
                                const quantity = item.cantidad ?? item.exis ?? item.existencia ?? item.qty ?? 0;
                                const cost = Number(item.costo ?? item.costo_actual ?? item.costo_a ?? 0);
                                const importTotal = Number(item.importe ?? cost * quantity);
                                const discounts = [item.d1, item.d2, item.d3, item.descuento_uno, item.descuento_dos, item.descuento_tres]
                                    .filter((value) => Number(value) > 0)
                                    .map((value) => `${Number(value * 100).toFixed(2)}%`)
                                    .join(', ') || 'N/A';

                                return (
                                    <tr key={`${ref}-${index}`} className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
                                        <td className="p-3 font-semibold">{ref}</td>
                                        <td className="p-3">{description}</td>
                                        <td className="p-3">{quantity}</td>
                                        <td className="p-3">{formatCurrency(cost)}</td>
                                        <td className="p-3">{discounts}</td>
                                        <td className="p-3 font-semibold">{formatCurrency(importTotal)}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function Capture() {
    const { t } = useTranslation();
    const [purchases, setPurchases] = useState([]);
    const [policies, setPolicies] = useState([]);
    const [providers, setProviders] = useState([]);
    const [providerFilter, setProviderFilter] = useState('0');
    const [partFilter, setPartFilter] = useState('');
    const [activeTab, setActiveTab] = useState('purchases');
    const [selectedInvoices, setSelectedInvoices] = useState([]);
    const [actionError, setActionError] = useState('');
    const [actionSuccess, setActionSuccess] = useState('');
    const [pendingDeleteCapture, setPendingDeleteCapture] = useState(null);
    const [isDeletingCapture, setIsDeletingCapture] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [captureEditData, setCaptureEditData] = useState(null);
    const [isLoadingCaptureEdit, setIsLoadingCaptureEdit] = useState(false);
    const [editCaptureError, setEditCaptureError] = useState(null);

    const today = useMemo(() => new Date().toISOString().split('T')[0], []);

    useEffect(() => {
        fetchInvoices();
        fetchProviders();
    }, []);

    const fetchInvoices = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(buildApiUrl('/getInvoicesCaptured'), {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' }
            });
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            if (Array.isArray(data)) {
                const [purchaseList, policyList] = data;
                setPurchases(Array.isArray(purchaseList) ? purchaseList : []);
                setPolicies(Array.isArray(policyList) ? policyList : []);
            } else {
                setPurchases([]);
                setPolicies([]);
            }
            setError(null);
        } catch (err) {
            console.error('Error fetching invoices:', err);
            setError(err.message);
            setPurchases([]);
            setPolicies([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchProviders = async () => {
        try {
            const response = await fetch(buildApiUrl('/getAllProviders'), {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' }
            });
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const payload = await response.json();
            setProviders(Array.isArray(payload) ? payload : []);
        } catch (err) {
            console.error('Error fetching providers:', err);
        }
    };

    const filteredPurchases = useMemo(() => {
        const byProvider = providerFilter;
        const term = partFilter.trim().toLowerCase();
        return purchases.filter((invoice) => {
            const providerId = getProviderId(invoice);
            const matchesProvider = byProvider === '0' || providerId === byProvider;
            const searchable = [
                invoice?.num_factura,
                invoice?.noFactura,
                invoice?.empresa,
                invoice?.proveedor,
                invoice?.refaccion,
                invoice?.num_parte
            ].filter(Boolean);
            const matchesTerm = !term || searchable.some((value) =>
                value?.toString().toLowerCase().includes(term)
            );
            return matchesProvider && matchesTerm;
        });
    }, [purchases, providerFilter, partFilter]);

    const filteredPolicies = useMemo(() => {
        const term = partFilter.trim().toLowerCase();
        return policies.filter((policy) => {
            const providerId = `${policy?.idProveedor ?? policy?.idproveedor ?? ''}`;
            const matchesProvider = providerFilter === '0' || providerId === providerFilter;
            const searchable = [policy?.idPoliza, policy?.empresa, policy?.proveedor];
            const matchesTerm = !term || searchable.some((value) =>
                value?.toString().toLowerCase().includes(term)
            );
            return matchesProvider && matchesTerm;
        });
    }, [policies, providerFilter, partFilter]);

    const groupedPurchases = useMemo(() => {
        const groups = new Map();
        filteredPurchases.forEach((invoice) => {
            const providerName = getProviderName(invoice);
            const providerId = getProviderId(invoice) || `sin-id-${providerName}`;
            if (!groups.has(providerId)) {
                groups.set(providerId, {
                    providerId,
                    providerName,
                    invoices: [],
                    total: 0
                });
            }
            const group = groups.get(providerId);
            group.invoices.push(invoice);
            group.total += getInvoiceAmount(invoice);
        });
        return Array.from(groups.values());
    }, [filteredPurchases]);

    const purchaseTotal = groupedPurchases.reduce((acc, group) => acc + group.total, 0);

    const toggleInvoiceSelection = (invoiceId) => {
        setActionError('');
        setActionSuccess('');
        setSelectedInvoices((prev) =>
            prev.includes(invoiceId)
                ? prev.filter((id) => id !== invoiceId)
                : [...prev, invoiceId]
        );
    };

    const toggleProviderSelection = (providerId) => {
        setActionError('');
        setActionSuccess('');
        const providerGroup = groupedPurchases.find((group) => group.providerId === providerId);
        if (!providerGroup) return;
        const invoiceIds = providerGroup.invoices
            .map((invoice) => getInvoiceId(invoice))
            .filter(Boolean);
        if (!invoiceIds.length) return;
        setSelectedInvoices((prev) => {
            const hasAll = invoiceIds.every((id) => prev.includes(id));
            if (hasAll) {
                return prev.filter((id) => !invoiceIds.includes(id));
            }
            const merged = new Set([...prev, ...invoiceIds]);
            return Array.from(merged);
        });
    };

    const handlePrintDocument = (type) => {
        setActionError('');
        setActionSuccess('');
        if (!selectedInvoices.length) {
            setActionError(t('panel.capture.pickProvider'));
            return;
        }
        const providersForPrint = groupedPurchases.filter((group) =>
            group.invoices.some((invoice) => selectedInvoices.includes(getInvoiceId(invoice)))
        );
        if (!providersForPrint.length) {
            setActionError(t('panel.capture.providersNotFound'));
            return;
        }
        if (typeof window === 'undefined') {
            setActionError(t('panel.capture.printBrowserOnly'));
            return;
        }
        const issueDate = new Date().toLocaleString('es-MX', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const baseLogo = process.env.NEXT_PUBLIC_S3 || '';
        const normalizedBase = baseLogo ? (baseLogo.endsWith('/') ? baseLogo : `${baseLogo}/`) : '';
        const logoSrc = normalizedBase ? `${normalizedBase}refautomex_bn.svg` : '/file.svg';
        const html = buildPrintableHtml(type, providersForPrint, issueDate, logoSrc, t);
        const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
        if (!printWindow) {
            setActionError(t('panel.capture.printPopupBlocked'));
            return;
        }
        printWindow.document.write(html);
        printWindow.document.close();
        const triggerPrint = () => {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        };
        if (printWindow.document.readyState === 'complete') {
            triggerPrint();
        } else {
            printWindow.onload = triggerPrint;
        }
    };

    const handleEdit = async (invoice) => {
        const invoiceId = getInvoiceId(invoice);
        if (!invoiceId) return;
        setIsEditing(true);
        setIsAdding(false);
        setActionError('');
        setActionSuccess('');
        setCaptureEditData(null);
        setEditCaptureError(null);
        setIsLoadingCaptureEdit(true);
        try {
            const response = await fetch(buildApiUrl(`/getCaptureWithDetails?id=${invoiceId}`), {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' }
            });
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.success === false || !data.header) {
                throw new Error(data.message || t('panel.capture.fetchError'));
            }
            setCaptureEditData(data);
        } catch (err) {
            console.error('Error loading capture detail:', err);
            setEditCaptureError(err.message);
        } finally {
            setIsLoadingCaptureEdit(false);
        }
    };

    const requestDeleteCapture = (invoice) => {
        setActionError('');
        setActionSuccess('');
        setPendingDeleteCapture(invoice);
    };

    const cancelDeleteCapture = () => {
        if (isDeletingCapture) return;
        setPendingDeleteCapture(null);
    };

    const confirmDeleteCapture = async () => {
        if (!pendingDeleteCapture) return;
        const invoiceId = getInvoiceId(pendingDeleteCapture);
        if (!invoiceId) return;
        try {
            setIsDeletingCapture(true);
            const response = await fetch(buildApiUrl('/deleteCapture'), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: invoiceId })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.message || t('panel.capture.deleteError'));
            }
            setActionSuccess(t('panel.capture.deleteOk'));
            setSelectedInvoices((prev) => prev.filter((id) => id !== invoiceId));
            setPendingDeleteCapture(null);
            await fetchInvoices();
        } catch (error) {
            console.error('Error deleting capture:', error);
            setActionError(error.message || t('panel.capture.deleteError'));
        } finally {
            setIsDeletingCapture(false);
        }
    };

    const handleNewCapture = () => {
        setIsAdding(true);
        setIsEditing(false);
        setActionError('');
        setActionSuccess('');
    };

    const onCancelEdit = () => {
        setIsEditing(false);
        setIsAdding(false);
        setCaptureEditData(null);
        setIsLoadingCaptureEdit(false);
        setEditCaptureError(null);
        setActionError('');
        setActionSuccess('');
        fetchInvoices();
    };

    const selectableProviders = useMemo(() => {
        return providers.filter((provider) => {
            const providerId = `${provider.idproveedor ?? provider.idProveedor ?? provider.id ?? ''}`;
            return providerId && providerId !== '0';
        });
    }, [providers]);

    const showMainView = !isEditing && !isAdding;

    return (
        <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] backdrop-blur-md pt-28">
            <Title
                title={t('panel.capture.title')}
                icon={HiClipboardDocumentList}
                back={t('panel.common.back')}
                path="/productivity"
            />

            {showMainView && (
                <div className="mx-auto max-w-7xl px-4 lg:px-8 mt-6 space-y-6">
                    <div className="bg-[rgb(var(--color-card))] rounded-2xl shadow shadow-[rgb(var(--color-galaxy))] p-4 sm:p-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs text-[rgb(var(--color-muted))] mb-1">
                                    {t('panel.capture.provider')}
                                </label>
                                <select
                                    className="w-full rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-2 text-sm"
                                    value={providerFilter}
                                    onChange={(event) => {
                                        setProviderFilter(event.target.value);
                                        setSelectedInvoices([]);
                                        setActionError('');
                                        setActionSuccess('');
                                    }}
                                >
                                    <option value="0">{t('panel.capture.allProviders')}</option>
                                    {selectableProviders.map((provider) => (
                                        <option key={provider.id || provider.idproveedor}
                                            value={provider.idproveedor ?? provider.idProveedor ?? provider.id}>
                                            {(provider.idproveedor ?? provider.idProveedor ?? provider.id) + ' | ' + provider.empresa}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-[rgb(var(--color-text))] mb-1">
                                    {t('panel.capture.invoice')}
                                </label>
                                <div className="relative">
                                    <FaSearch className="absolute left-2 top-1/2 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
                                    <input
                                        type="text"
                                        className="w-full rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] pl-8 pr-3 py-2 text-sm"
                                        value={partFilter}
                                        placeholder={t('panel.capture.searchPlaceholder')}
                                    onChange={(event) => {
                                        setPartFilter(event.target.value);
                                        setActionError('');
                                        setActionSuccess('');
                                    }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-[rgb(var(--color-muted))] mb-1">
                                    {t('panel.common.date')}
                                </label>
                                <div className="h-10 flex items-center rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 text-sm">
                                    {formatDate(today)}
                                </div>
                            </div>
                            <div className="flex items-end justify-end gap-2">
                                <button
                                    type="button"
                                    className="inline-flex items-center rounded-md shadow bg-[rgb(var(--color-gray))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-text))] shadow-[rgb(var(--color-galaxy))]"
                                    disabled={selectedInvoices.length === 0}
                                    onClick={() => handlePrintDocument('revision')}
                                >
                                    <MdRateReview className="mr-1" /> Revisión
                                </button>
                                <button
                                    type="button"
                                    className="inline-flex items-center rounded-md shadow bg-[rgb(var(--color-gray))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-text))] shadow-[rgb(var(--color-galaxy))]"
                                    disabled={selectedInvoices.length === 0}
                                    onClick={() => handlePrintDocument('policy')}
                                >
                                    <FaSignature className="mr-1" /> Póliza
                                </button>
                                <button
                                    type="button"
                                    className="inline-flex items-center rounded-md bg-[rgb(var(--color-amber))] px-3 py-2 text-xs font-semibold text-white shadow"
                                    onClick={handleNewCapture}
                                >
                                    <FaBox className="mr-1" /> Captura
                                </button>
                            </div>
                    </div>
                </div>

                    {(actionSuccess || actionError) && (
                        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${actionSuccess
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${actionSuccess ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                <span>{actionSuccess || actionError}</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-md border border-red-500 bg-red-100/30 text-red-800 px-4 py-2 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="bg-[rgb(var(--color-card))] rounded-2xl shadow shadow-[rgb(var(--color-galaxy))]">
                        <div className="flex border-b border-[rgb(var(--color-border))]">
                            <button
                                type="button"
                                className={`flex-1 px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${activeTab === 'purchases' ? 'bg-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text-base))]' : 'bg-transparent'}`}
                                onClick={() => setActiveTab('purchases')}
                            >
                                <FaBox /> Compras
                            </button>
                            <button
                                type="button"
                                className={`flex-1 px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${activeTab === 'policies' ? 'bg-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text-base))]' : 'bg-transparent'}`}
                                onClick={() => setActiveTab('policies')}
                            >
                                <FaSignature /> Pólizas
                            </button>
                        </div>

                        <div className="p-4">
                            {isLoading ? (
                                <div className="py-16 text-center text-sm text-[rgb(var(--color-muted))]">
                                    Cargando información...
                                </div>
                            ) : activeTab === 'purchases' ? (
                                <>
                                    <PurchasesTable
                                        groups={groupedPurchases}
                                        selectedInvoices={selectedInvoices}
                                        onToggleInvoice={toggleInvoiceSelection}
                                        onToggleProvider={toggleProviderSelection}
                                        onEdit={handleEdit}
                                        onDelete={requestDeleteCapture}
                                    />
                                    <div className="flex justify-end border-t border-[rgb(var(--color-border))] mt-4 pt-4 text-sm font-semibold">
                                        Total: {formatCurrency(purchaseTotal)}
                                    </div>
                                </>
                            ) : (
                                <PoliciesTable rows={filteredPolicies} />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isEditing && (
                <div className="max-w-7xl mx-auto px-4">
                    {isLoadingCaptureEdit ? (
                        <div className="bg-white/70 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                            {t('panel.capture.loadingDetail')}
                        </div>
                    ) : editCaptureError ? (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
                            <p className="font-semibold">{t('panel.capture.loadError')}</p>
                            <p className="text-sm">{editCaptureError}</p>
                            <button
                                type="button"
                                className="mt-3 inline-flex items-center rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-slate-700"
                                onClick={onCancelEdit}
                            >
                                {t('panel.common.goBack')}
                            </button>
                        </div>
                    ) : (
                        <CaptureDetailView
                            header={captureEditData?.header}
                            detail={captureEditData?.detail}
                            onBack={onCancelEdit}
                        />
                    )}
                </div>
            )}

            {isAdding && (
                <div className="max-w-7xl mx-auto">
                    <NewCapture onCancelEdit={onCancelEdit} />
                </div>
            )}

            {pendingDeleteCapture && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-[rgb(var(--color-card))] shadow-2xl border border-[rgb(var(--color-border))] p-6">
                        <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">
                            {t('panel.capture.deleteTitle')}
                        </h3>
                        <p className="text-sm text-[rgb(var(--color-muted))] mt-1">
                            {t('panel.capture.deleteHint')}
                        </p>
                        <div className="mt-4 rounded-xl bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))] p-4 text-sm">
                            <div className="flex justify-between mb-1">
                                <span className="text-[rgb(var(--color-muted))]">{t('panel.capture.invoice')}</span>
                                <span className="font-semibold">
                                    {pendingDeleteCapture?.num_factura ?? pendingDeleteCapture?.noFactura ?? '---'}
                                </span>
                            </div>
                            <div className="flex justify-between mb-1">
                                <span className="text-[rgb(var(--color-muted))]">{t('panel.capture.provider')}</span>
                                <span className="font-semibold">
                                    {pendingDeleteCapture?.empresa ?? pendingDeleteCapture?.proveedor ?? '---'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[rgb(var(--color-muted))]">{t('checkout.total')}</span>
                                <span className="font-semibold text-red-600">
                                    {formatCurrency(getInvoiceAmount(pendingDeleteCapture))}
                                </span>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={cancelDeleteCapture}
                                className="px-4 py-2 rounded-full bg-gray-200 text-gray-800 hover:bg-gray-300"
                                disabled={isDeletingCapture}
                            >
                                {t('panel.common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={confirmDeleteCapture}
                                className="px-4 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-70"
                                disabled={isDeletingCapture}
                            >
                                {isDeletingCapture ? t('panel.common.deleting') : t('panel.common.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
