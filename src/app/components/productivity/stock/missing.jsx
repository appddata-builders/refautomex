import Title from '../title';
import React, { useMemo, useState } from 'react';
import { FaBoxesPacking } from 'react-icons/fa6';
import { IoAlertCircleOutline } from 'react-icons/io5';
import { FaChartLine } from 'react-icons/fa';
import FindProducts from '@/app/components/productivity/sales/find-products';
import { useTranslation } from '@/app/lib/text/text-provider';

const DEFAULT_REPLENISH = 5;

export default function Missing(){
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [planning, setPlanning] = useState({});

    const handleAddProduct = (product) => {
        setItems(prevItems => {
            const exists = prevItems.some(item => item.refaccion === product.refaccion);
            if (exists) {
                const updated = prevItems.filter(item => item.refaccion !== product.refaccion);
                const { [product.refaccion]: _discard, ...rest } = planning;
                setPlanning(rest);
                return updated;
            }
            const defaultQty = Math.max(
                1,
                planning[product.refaccion] ??
                    (product.existencia <= 0 ? DEFAULT_REPLENISH : Math.max(1, DEFAULT_REPLENISH - product.existencia))
            );
            setPlanning(prev => ({ ...prev, [product.refaccion]: defaultQty }));
            return [...prevItems, { ...product }];
        });
    };

    const handleRemoveProduct = (refaccion) => {
        setItems(prevItems => prevItems.filter(item => item.refaccion !== refaccion));
        setPlanning(prev => {
            const { [refaccion]: _discard, ...rest } = prev;
            return rest;
        });
    };

    const handlePlanningChange = (refaccion, value) => {
        const qty = Math.max(1, Number(value) || 1);
        setPlanning(prev => ({ ...prev, [refaccion]: qty }));
    };

    const enrichedItems = useMemo(() => {
        return items.map(item => {
            const suggested = planning[item.refaccion] ?? DEFAULT_REPLENISH;
            const existencia = Number(item.existencia) || 0;
            const riskScore = Math.max(0, suggested * 2 - existencia);
            const urgency =
                riskScore >= 8 ? t('panel.missing.high') : riskScore >= 4 ? t('panel.missing.medium') : t('panel.missing.low');
            const leadTime = item.leadTime || ((existencia % 4) + 2);
            const vendor = item.proveedor || item.marca || t('panel.missing.genericProvider');
            return {
                ...item,
                suggested,
                riskScore,
                urgency,
                leadTime,
                vendor,
            };
        });
    }, [items, planning]);

    const totals = useMemo(() => {
        const totalProducts = enrichedItems.length;
        const totalUnits = enrichedItems.reduce((sum, item) => sum + item.suggested, 0);
        const highRisk = enrichedItems.filter(item => item.urgency === t('panel.missing.high')).length;
        const providers = enrichedItems.reduce((acc, item) => {
            acc[item.vendor] = (acc[item.vendor] || 0) + item.suggested;
            return acc;
        }, {});
        const providerList = Object.entries(providers).map(([vendor, qty]) => ({
            vendor,
            qty,
        }));
        return { totalProducts, totalUnits, highRisk, providerList };
    }, [enrichedItems]);

    const criticalItems = useMemo(() => {
        return [...enrichedItems]
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 4);
    }, [enrichedItems]);

    const summaryCards = [
        {
            label: t('panel.missing.cardProducts'),
            value: totals.totalProducts,
            hint: t('panel.missing.cardProductsHint', { count: totals.highRisk }),
        },
        {
            label: t('panel.missing.cardUnits'),
            value: totals.totalUnits,
            hint: t('panel.missing.cardUnitsHint'),
        },
        {
            label: t('panel.missing.cardProviders'),
            value: totals.providerList.length,
            hint: totals.providerList.slice(0, 2).map(p => p.vendor).join(', ') || 'N/D',
        },
        {
            label: t('panel.missing.cardAlerts'),
            value: totals.highRisk,
            hint: t('panel.missing.cardAlertsHint'),
        },
    ];

    return(
        <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] backdrop-blur-md pt-28">
            <Title 
                title={t('panel.missing.title')}
                icon={FaBoxesPacking}
                back={t('panel.common.back')}
                path='/productivity'
            />
            <div className="pb-12 px-6 lg:px-10 max-w-7xl mx-auto space-y-8">
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {summaryCards.map((card, index) => (
                        <div
                            key={card.label}
                            className="rounded-2xl bg-[rgb(var(--color-card-white))] text-[rgb(var(--color-text))] shadow p-5 flex flex-col gap-2"
                        >
                            <p className="text-sm uppercase tracking-wide text-[rgb(var(--color-gray-base))]">
                                {card.label}
                            </p>
                            <p className="text-3xl font-semibold">{card.value}</p>
                            <p className="text-sm text-[rgb(var(--color-gray-base))]">{card.hint}</p>
                        </div>
                    ))}
                </section>

                <section className="grid gap-6 lg:grid-cols-3">
                    <div className="bg-[rgb(var(--color-card-white))] rounded-3xl shadow p-5 lg:col-span-2">
                        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-[rgb(var(--color-gray-base))]">
                                    {t('panel.missing.catalog')}
                                </p>
                                <h2 className="text-xl font-semibold text-[rgb(var(--color-text))]">
                                    {t('panel.missing.explore')}
                                </h2>
                            </div>
                            <span className="text-sm px-3 py-1 rounded-full bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]">
                                {t('panel.missing.selected')} {items.length}
                            </span>
                        </div>
                        <div className="rounded-2xl border border-[rgb(var(--color-border))] overflow-hidden">
                            <FindProducts 
                                onAddProduct={handleAddProduct} 
                                onRemoveProduct={handleRemoveProduct}
                                addedItems={items}
                                isMissing={true}
                            />
                        </div>
                    </div>

                    <div className="bg-[rgb(var(--color-card-white))] rounded-3xl shadow p-5 space-y-4">
                        <div className="flex items-center gap-2">
                            <IoAlertCircleOutline className="text-amber-500 text-2xl" />
                            <div>
                                <p className="text-xs uppercase tracking-wide text-[rgb(var(--color-gray-base))]">
                                    {t('panel.missing.priority')}
                                </p>
                                <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">
                                    {t('panel.missing.cardAlerts')}
                                </h3>
                            </div>
                        </div>
                        <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                            {criticalItems.length === 0 && (
                                <p className="text-sm text-[rgb(var(--color-gray-base))]">
                                    {t('panel.missing.pickProducts')}
                                </p>
                            )}
                            {criticalItems.map(item => (
                                <div
                                    key={`${item.refaccion}-critical`}
                                    className="border border-[rgb(var(--color-border))] rounded-2xl p-3 flex flex-col gap-1"
                                >
                                    <div className="flex items-center justify-between text-sm font-semibold">
                                        <span>{item.refaccion}</span>
                                        <span
                                            className={`px-2 py-0.5 rounded-full text-xs ${
                                                item.urgency === t('panel.missing.high')
                                                    ? 'bg-red-500/10 text-red-600'
                                                    : item.urgency === t('panel.missing.medium')
                                                    ? 'bg-amber-400/10 text-amber-600'
                                                    : 'bg-emerald-400/10 text-emerald-600'
                                            }`}
                                        >
                                            {item.urgency}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[rgb(var(--color-gray-base))]">
                                        {item.descripcion}
                                    </p>
                                    <div className="flex items-center justify-between text-xs text-[rgb(var(--color-gray-base))]">
                                        <span>Proveedor: {item.vendor}</span>
                                        <span>Lead time: {item.leadTime} días</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-3">
                    <div className="bg-[rgb(var(--color-card-white))] rounded-3xl shadow p-5 lg:col-span-2 overflow-x-auto">
                        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-[rgb(var(--color-gray-base))]">
                                    {t('panel.missing.planning')}
                                </p>
                                <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">
                                    {t('panel.missing.draft')}
                                </h3>
                            </div>
                            <span className="text-xs text-[rgb(var(--color-gray-base))]">
                                {t('panel.missing.sortedByUrgency')}
                            </span>
                        </div>

                        <table className="min-w-full text-sm text-left text-[rgb(var(--color-text))]">
                            <thead className="text-xs uppercase bg-[rgb(var(--color-card))]">
                                <tr>
                                    <th className="px-3 py-2">{t('panel.missing.colProduct')}</th>
                                    <th className="px-3 py-2">{t('panel.capture.provider')}</th>
                                    <th className="px-3 py-2">{t('panel.missing.colUrgency')}</th>
                                    <th className="px-3 py-2">{t('panel.missing.colLeadTime')}</th>
                                    <th className="px-3 py-2 w-32">{t('panel.missing.colSuggested')}</th>
                                    <th className="px-3 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {enrichedItems.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-4 text-center text-[rgb(var(--color-gray-base))]">
                                            Todavía no has seleccionado productos faltantes.
                                        </td>
                                    </tr>
                                )}
                                {[...enrichedItems]
                                    .sort((a, b) => b.riskScore - a.riskScore)
                                    .map(item => (
                                        <tr key={`row-${item.refaccion}`} className="border-b border-[rgb(var(--color-border))]">
                                            <td className="px-3 py-3">
                                                <p className="font-semibold">{item.refaccion}</p>
                                                <p className="text-xs text-[rgb(var(--color-gray-base))] line-clamp-2">
                                                    {item.descripcion}
                                                </p>
                                            </td>
                                            <td className="px-3 py-3">{item.vendor}</td>
                                            <td className="px-3 py-3">
                                                <span
                                                    className={`px-2 py-0.5 rounded-full text-xs ${
                                                        item.urgency === t('panel.missing.high')
                                                            ? 'bg-red-500/10 text-red-600'
                                                            : item.urgency === t('panel.missing.medium')
                                                            ? 'bg-amber-400/10 text-amber-600'
                                                            : 'bg-emerald-400/10 text-emerald-600'
                                                    }`}
                                                >
                                                    {item.urgency}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3">{item.leadTime} {t('panel.invoice.days')}</td>
                                            <td className="px-3 py-3">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={item.suggested}
                                                    onChange={(e) => handlePlanningChange(item.refaccion, e.target.value)}
                                                    className="w-full rounded-full border border-[rgb(var(--color-border))] px-3 py-1 text-center bg-[rgb(var(--color-card))]"
                                                />
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <button
                                                    onClick={() => handleRemoveProduct(item.refaccion)}
                                                    className="text-xs text-[rgb(var(--color-error))] hover:underline"
                                                >
                                                    Quitar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-[rgb(var(--color-card-white))] rounded-3xl shadow p-5 flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                            <FaChartLine className="text-sky-500 text-xl" />
                            <div>
                                <p className="text-xs uppercase tracking-wide text-[rgb(var(--color-gray-base))]">
                                    {t('panel.missing.orderSuggestion')}
                                </p>
                                <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">
                                    {t('panel.missing.preview')}
                                </h3>
                            </div>
                        </div>
                        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                            {totals.providerList.length === 0 && (
                                <p className="text-sm text-[rgb(var(--color-gray-base))]">
                                    {t('panel.missing.emptyList')}
                                </p>
                            )}
                            {totals.providerList.map((provider) => (
                                <div
                                    key={provider.vendor}
                                    className="border border-[rgb(var(--color-border))] rounded-2xl p-3 flex items-center justify-between text-sm"
                                >
                                    <div>
                                        <p className="font-semibold">{provider.vendor}</p>
                                        <p className="text-xs text-[rgb(var(--color-gray-base))]">
                                            {provider.qty} {t('panel.missing.suggestedUnits')}
                                        </p>
                                    </div>
                                    <span className="text-xs px-3 py-1 rounded-full bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]">
                                        {Math.ceil(provider.qty / DEFAULT_REPLENISH)} {t('panel.missing.folios')}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="space-y-2 text-sm text-[rgb(var(--color-gray-base))]">
                            <p>{t('panel.missing.plannedUnits')} <strong>{totals.totalUnits}</strong></p>
                            <p>{t('panel.missing.proposalProducts')} <strong>{totals.totalProducts}</strong></p>
                        </div>
                        <button
                            className={`w-full rounded-full py-3 text-sm font-semibold text-white transition ${
                                enrichedItems.length === 0
                                    ? 'bg-[rgb(var(--color-gray-base))] cursor-not-allowed'
                                    : 'bg-emerald-500 hover:bg-emerald-600'
                            }`}
                            disabled={enrichedItems.length === 0}
                        >
                            {t('panel.missing.generateProposal')}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    )
}
