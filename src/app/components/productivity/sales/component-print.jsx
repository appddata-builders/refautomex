'use client';

import React, { useEffect, useState } from 'react';
import { MdPhone } from "react-icons/md";
import { BsWhatsapp } from "react-icons/bs";
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';

const formatPhone = (value) => {
    if (!value) return '';
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    const base = `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6, 10)}`;
    return digits.length > 10 ? `${base} ${digits.slice(10)}` : base;
};

const normalizeBranchesPayload = (payload) => {
    if (Array.isArray(payload?.[0])) return payload[0];
    if (Array.isArray(payload)) return payload;
    return [];
};

const extractBranchId = (branch) =>
    branch?.idsucursal ?? branch?.idSucursal ?? branch?.id ?? null;

const mapBranchData = (branch) => ({
    id: extractBranchId(branch),
    name: branch?.sucursal || '',
    address: branch?.direccion || '',
    phone1: branch?.telefono_uno || '',
    phone2: branch?.telefono_dos || '',
    whatsapp1: branch?.whats_uno || '',
    whatsapp2: branch?.whats_dos || '',
});

const branchCache = new Map();
const branchInFlight = new Map();

const fetchBranchData = async (branchId, signal) => {
    if (!branchId) return null;
    const response = await fetch(buildApiUrl('/getSucursal'), {
        cache: 'no-store',
        headers: { Accept: 'application/json, text/plain, */*' },
        signal,
    });
    if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    const payload = await response.json();
    const branches = normalizeBranchesPayload(payload);
    const matched = branches.find(
        (branch) => String(extractBranchId(branch)) === String(branchId)
    );
    return matched ? mapBranchData(matched) : null;
};

export const prefetchBranchData = async (branchId) => {
    if (!branchId) return null;
    const key = String(branchId);
    if (branchCache.has(key)) return branchCache.get(key);
    if (branchInFlight.has(key)) return branchInFlight.get(key);
    const promise = fetchBranchData(branchId)
        .then((data) => {
            branchCache.set(key, data);
            branchInFlight.delete(key);
            return data;
        })
        .catch((error) => {
            branchInFlight.delete(key);
            throw error;
        });
    branchInFlight.set(key, promise);
    return promise;
};

const ComponentToPrint = React.forwardRef(({
    items,
    subtotal,
    discount,
    total,
    currentDate,
    employee,
    folio,
    notes,
    branchName,
    phones,
    whatsapps,
    address,
    websiteUrl,
    socialMessage,
    branchId,
    refreshKey = 0,
    useDefaults = true,
}, ref) => {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const logoUrl = `${multimediaSrc}refautomex_n.svg`;
    const [branchData, setBranchData] = useState(() => {
        if (!branchId) return null;
        return branchCache.get(String(branchId)) || null;
    });
    const safeItems = Array.isArray(items) ? items : [];
    const fallbackPhones = useDefaults ? DEFAULT_PHONES : [];
    const fallbackWhatsapps = useDefaults ? DEFAULT_WHATSAPPS : [];
    const resolvedPhones = Array.isArray(phones) && phones.some(Boolean)
        ? phones
        : [branchData?.phone1, branchData?.phone2].filter(Boolean);
    const resolvedWhatsapps = Array.isArray(whatsapps) && whatsapps.some(Boolean)
        ? whatsapps
        : [branchData?.whatsapp1, branchData?.whatsapp2].filter(Boolean);
    const safePhones = (resolvedPhones.length ? resolvedPhones : fallbackPhones)
        .filter(Boolean)
        .slice(0, 2)
        .map(formatPhone)
        .filter(Boolean);
    const safeWhatsapps = (resolvedWhatsapps.length ? resolvedWhatsapps : fallbackWhatsapps)
        .filter(Boolean)
        .slice(0, 2)
        .map(formatPhone)
        .filter(Boolean);
    const safeAddress = address || branchData?.address || (useDefaults ? DEFAULT_ADDRESS : '');
    const safeWebsite = websiteUrl || (useDefaults ? DEFAULT_WEBSITE : '');
    const safeSocial = socialMessage || (useDefaults ? DEFAULT_SOCIAL : '');
    const safeBranchName = branchName || branchData?.name || '';

    useEffect(() => {
        if (!branchId) {
            setBranchData(null);
            return;
        }

        const key = String(branchId);
        const cached = branchCache.get(key);
        const forceRefresh = refreshKey > 0;
        if (cached && !forceRefresh) {
            setBranchData(cached);
            return;
        }

        const controller = new AbortController();
        fetchBranchData(branchId, controller.signal)
            .then((data) => {
                branchCache.set(key, data);
                setBranchData(data);
            })
            .catch((error) => {
                if (error.name === 'AbortError') return;
                setBranchData(null);
            });

        return () => controller.abort();
    }, [branchId, refreshKey]);

    return (
        <div ref={ref} className="bg-white p-4 pb-32 max-w-[220px] mx-auto text-sm text-gray-700 print:w-[55mm] print:max-w-[55mm] print:text-black">
            <style>
                {`
                @page {
                    size: 55mm auto;
                    margin: 0;
                }
                @media print {
                    * {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        font-smooth: always;
                    }
                    body {
                        margin: 0;
                    }
                    img {
                        max-width: 100%;
                        max-height: auto;
                    }
                    .print-hidden {
                        display: none !important;
                    }
                    .bg-white {
                        background-color: white !important;
                    }
                }
                `}
            </style>
            <div className="flex justify-center items-center m-4">
                <img src={logoUrl} alt={t('alt.logo')} className="h-12" />
            </div>

            <div className="mb-2 text-center text-sm">
                <p className='font-bold'>{t('panel.print.folio')} {folio}</p>
                {safeBranchName && (
                    <p className="text-xs uppercase font-semibold tracking-wide">{safeBranchName}</p>
                )}
                {safeSocial && <p>{safeSocial}</p>}
            </div>
            {safePhones.length > 0 && (
                <div className="mb-1 grid grid-cols-2 gap-x-2">
                    {safePhones.map((phone, index) => (
                        <p key={`phone-${index}`} className="px-0.5 flex flex-row text-[10px]">
                            <MdPhone className="mx-1 mt-1 text-[10px]" /> {phone}
                        </p>
                    ))}
                </div>
            )}
            {safeWhatsapps.length > 0 && (
                <div className="mb-4 grid grid-cols-2 gap-x-2">
                    {safeWhatsapps.map((phone, index) => (
                        <p key={`whatsapp-${index}`} className="px-0.5 flex flex-row text-[10px]">
                            <BsWhatsapp className="mx-1 mt-1 text-[10px]" /> {phone}
                        </p>
                    ))}
                </div>
            )}

            <div className="mb-2">
                <p className="uppercase font-semibold">{currentDate}</p>
                <p className=''>{t('panel.print.agent')} {employee}</p>
            </div>

            <p className="font-semibold">{t('panel.print.products')}</p>
            {notes && (
                <p className="font-extrabold border-2 p-1 shadow text-xs uppercase">{notes}</p>
            )}
            <div className="my-2 border-t border-b border-slate-300">
                <table className="table-fixed w-full text-xs text-left px-0.5">
                    <thead>
                        <tr>
                            <th className="w-1/6 p-0.5 border-b text-left text-[9px]">{t('panel.print.qty')}</th>
                            <th className="w-2/6 p-0.5 border-b text-[9px]">{t('panel.print.part')}</th>
                            <th className="w-3/6 p-0.5 border-b text-right text-[9px]">{t('panel.print.amount')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {safeItems.map((item, index) => {
                            const hasAiva = item.aIva !== undefined && item.aIva !== null && item.aIva !== '';
                            const description = String(item.descripcion || '');
                            return (
                                <React.Fragment key={index}>
                                    {/* Descripcion a todo el ancho */}
                                    <tr>
                                        <td colSpan={3} className="p-0.5 text-[9px] font-semibold uppercase truncate overflow-hidden whitespace-nowrap">
                                            {description.toUpperCase()}
                                        </td>
                                    </tr>
                                    {/* Fila compacta: cantidad, parte e importe */}
                                    <tr>
                                        <td className="p-0.5 text-[9px] text-left font-bold">
                                            {item.cantidad}
                                        </td>
                                        <td className="p-0.5 text-[9px] uppercase">
                                            {item.refaccion}
                                        </td>
                                        <td className="p-0.5 text-[9px] text-right">
                                            {hasAiva && (
                                                <span className="font-semibold">AIVA: $ {item.aIva}</span>
                                            )}
                                            {hasAiva && <span className="mx-1 text-[8px] text-gray-500">•</span>}
                                            <span className="font-bold">MON: $ {Number(item.monto || 0).toFixed(2)}</span>
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="pt-2">
                {discount < 0 && (
                    <>
                        <p className="text-right text-xs font-semibold">({discount}%) {t('panel.capture.discount')}: {(subtotal * discount / 100).toFixed(2)} {t('promotions.currency')}</p>
                        <p className="text-right text-xs font-semibold">{t('checkout.subtotal')}: {subtotal.toFixed(2)} {t('promotions.currency')}</p>
                    </>
                )}
                <span className="text-left font-bold">{t('checkout.total')}: <span className='text-xl'>{total.toFixed(2)} {t('promotions.currency')}</span></span>
            </div>

            {safeAddress && (
                <div className='my-2 text-xs text-justify'>
                    {t('panel.print.legalAddress', { branch: safeBranchName })}
                    <span className="text-xs text-justify mx-1">
                        {safeAddress}
                    </span>
                    <br /><br />
                    {t('panel.print.followUs')}
                    <br /><br />
                    {t('panel.print.invoiceHint')}
                    <br />
                    <span className="text-xs text-justify font-bold">
                    {t('panel.print.site')}
                    </span>
                </div>
            )}

            {safeWebsite && (
                <>
                    <p className="text-xs text-justify">{t('panel.print.invoiceVisit')}</p>
                    <a href={safeWebsite} className="text-stone-800 font-bold text-xs text-justify mb-2">
                        {safeWebsite}
                    </a>
                </>
            )}
            <p className="text-xs text-justify mt-2">
                {t('panel.print.invoiceDeadline')}
            </p>
            <p className="font-bold mt-4 text-center text-sm">{t('panel.print.thanks')}</p>
        </div>
    );
});

export default ComponentToPrint;
