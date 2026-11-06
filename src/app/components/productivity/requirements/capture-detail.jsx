import React from 'react';
import { FaChevronLeft, FaPenToSquare, FaTrashCan } from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';
import { formatCurrency, formatDate } from './print-docs';

const percent = (value) => `${(Number(value) * 100).toFixed(2).replace(/\.00$/, '')}%`;

/**
 * Una compra capturada: cabecera, totales y renglones. Mientras no este
 * pagada se puede editar o eliminar; eliminarla regresa la existencia y el
 * costo que tenian los productos.
 */
export default function CaptureDetail({ header, detail, onBack, onEdit, onDelete }) {
    const { t } = useTranslation();
    const pending = header.status === 'P' && !header.idpoliza;
    const totals = [
        [t('panel.capture.net'), header.neto_total],
        [t('panel.capture.discount'), header.descuento_total],
        [t('checkout.subtotal'), header.subtotal],
        [t('panel.capture.totalWithTax'), header.total],
    ];

    return (
        <div className="space-y-4 rounded-2xl bg-[rgb(var(--color-card))] p-4 shadow shadow-[rgb(var(--color-galaxy))] sm:p-6">
            <div className="flex flex-wrap items-start gap-3">
                <button type="button" onClick={onBack} className="inline-flex h-10 items-center gap-2 rounded-full bg-[rgb(var(--color-bg))] px-4 text-sm font-semibold shadow-sm hover:bg-amber-400/25">
                    <FaChevronLeft className="size-3" aria-hidden="true" />
                    {t('panel.common.goBack')}
                </button>
                <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold">{t('panel.capture.invoiceTitle', { invoice: header.num_factura })}</h2>
                    <p className="text-sm text-[rgb(var(--color-gray-base))]">
                        {header.empresa} · {header.sucursal || t('panel.capture.noBranch')} · {t('panel.capture.boughtOn', { date: formatDate(header.fecha_compra) })}
                    </p>
                    <p className="mt-1 text-sm">
                        {pending
                            ? t('panel.capture.pendingUntil', { date: formatDate(header.fecha_pago) })
                            : t('panel.capture.paidIn', { id: header.idpoliza })}
                    </p>
                </div>
                {pending && (
                    <div className="flex gap-2">
                        <button type="button" onClick={onEdit} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] px-3 text-sm font-semibold hover:border-amber-400">
                            <FaPenToSquare className="size-3.5" aria-hidden="true" />
                            {t('panel.capture.edit')}
                        </button>
                        <button type="button" onClick={onDelete} className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[rgb(var(--color-error))] hover:bg-[rgb(var(--color-error))]/10">
                            <FaTrashCan className="size-3.5" aria-hidden="true" />
                            {t('panel.common.delete')}
                        </button>
                    </div>
                )}
            </div>

            <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {totals.map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-[rgb(var(--color-bg))] p-3">
                        <dt className="text-xs text-[rgb(var(--color-gray-base))]">{label}</dt>
                        <dd className="text-lg font-bold tabular-nums">{formatCurrency(value)}</dd>
                    </div>
                ))}
            </dl>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-xs uppercase text-[rgb(var(--color-gray-base))]">
                        <tr>
                            <th className="p-2">{t('panel.capture.part')}</th>
                            <th className="p-2">{t('panel.capture.descriptionLabel')}</th>
                            <th className="p-2 text-right">{t('panel.capture.quantity')}</th>
                            <th className="p-2 text-right">{t('panel.capture.listCost')}</th>
                            <th className="p-2">{t('panel.capture.discounts')}</th>
                            <th className="p-2 text-right">{t('panel.capture.cost')}</th>
                            <th className="p-2 text-right">{t('panel.capture.amount')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {detail.map((line) => {
                            const qty = Number(line.cantidad_solicitada) || 0;
                            const discounts = [line.descuento_uno, line.descuento_dos, line.descuento_tres].filter((v) => Number(v) > 0);
                            return (
                                <tr key={line.idregistro} className="border-t border-[rgb(var(--color-border))]">
                                    <td className="p-2 font-semibold">{line.num_parte}</td>
                                    <td className="p-2">{line.descripcion}</td>
                                    <td className="p-2 text-right tabular-nums">{qty}</td>
                                    <td className="p-2 text-right tabular-nums">{formatCurrency(qty ? Number(line.neto) / qty : 0)}</td>
                                    <td className="p-2">{discounts.length ? discounts.map(percent).join(' + ') : '—'}</td>
                                    <td className="p-2 text-right tabular-nums">{formatCurrency(line.costo_actual)}</td>
                                    <td className="p-2 text-right font-semibold tabular-nums">{formatCurrency(line.importe)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
