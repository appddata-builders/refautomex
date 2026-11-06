import React, { useEffect, useState } from 'react';
import { FaChevronLeft } from 'react-icons/fa6';
import ComponentToPrint from '@/app/components/productivity/sales/component-print';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';
import { Field, INPUT_CLASS } from './product-form';

const formatPhoneInput = (value) => {
    const digits = String(value ?? '').replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
};

const PHONE_FIELDS = [
    ['telefono_uno', 'panel.addRegister.phone1'],
    ['telefono_dos', 'panel.addRegister.phone2'],
    ['whats_uno', 'panel.addRegister.whatsapp1'],
    ['whats_dos', 'panel.addRegister.whatsapp2'],
];

const contactOf = (branch) => ({
    telefono_uno: formatPhoneInput(branch?.telefono_uno),
    telefono_dos: formatPhoneInput(branch?.telefono_dos),
    whats_uno: formatPhoneInput(branch?.whats_uno),
    whats_dos: formatPhoneInput(branch?.whats_dos),
    direccion: branch?.direccion || '',
});

/**
 * Datos del ticket de una sucursal (telefonos, WhatsApp y direccion) con la
 * vista previa del ticket impreso. Se guarda con /patchSucursal.
 */
export default function BranchTicket({ branches, branchId, onBranchChange, onBack, onSaved }) {
    const { t } = useTranslation();
    const branch = branches.find((item) => String(item.idsucursal) === String(branchId)) || null;
    const [contact, setContact] = useState(() => contactOf(branch));
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ ok: '', error: '' });
    const [previewKey, setPreviewKey] = useState(0);

    useEffect(() => {
        setContact(contactOf(branch));
        setMessage({ ok: '', error: '' });
        // Solo al cambiar de sucursal: despues de guardar `branch` cambia y no hay que pisar lo escrito.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branchId]);

    const update = (field, value) => {
        setContact((prev) => ({ ...prev, [field]: field === 'direccion' ? value : formatPhoneInput(value) }));
        setMessage({ ok: '', error: '' });
    };

    const handleSave = async () => {
        if (!branch || saving) return;
        setSaving(true);
        setMessage({ ok: '', error: '' });
        try {
            const response = await fetch(buildApiUrl('/patchSucursal'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
                body: JSON.stringify({ idsucursal: branch.idsucursal, ...contact }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.details || data.message || t('panel.addRegister.branchUpdateError'));
            }
            onSaved?.(branch.idsucursal, contact);
            setPreviewKey((n) => n + 1);
            setMessage({ ok: t('panel.addRegister.branchUpdateOk'), error: '' });
        } catch (error) {
            setMessage({ ok: '', error: error.message || t('panel.addRegister.branchUpdateError') });
        } finally {
            setSaving(false);
        }
    };

    const previewItems = [
        { cantidad: 2, refaccion: '0111', descripcion: t('panel.addRegister.sampleItemOne'), aIva: 120, monto: 240 },
        { cantidad: 1, refaccion: '0112', descripcion: t('panel.addRegister.sampleItemTwo'), aIva: 80, monto: 80 },
    ];
    const previewDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-[rgb(var(--color-bg))] px-4 text-sm font-semibold shadow-sm hover:bg-amber-400/25"
                >
                    <FaChevronLeft className="size-3" aria-hidden="true" />
                    {t('panel.inventories.backToBranches')}
                </button>
                <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold">{t('panel.addRegister.ticketsTitle')}</h3>
                    <p className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.addRegister.ticketsSubtitle')}</p>
                </div>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 space-y-4 rounded-2xl bg-[rgb(var(--color-bg))] p-4 shadow-sm lg:flex-[1.2]">
                    <Field label={t('panel.common.branch')}>
                        <select value={branchId ?? ''} onChange={(e) => onBranchChange(e.target.value)} className={INPUT_CLASS}>
                            {branches.map((item) => (
                                <option key={item.idsucursal} value={item.idsucursal}>{item.sucursal}</option>
                            ))}
                        </select>
                    </Field>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {PHONE_FIELDS.map(([field, label]) => (
                            <Field key={field} label={t(label)}>
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    value={contact[field]}
                                    onChange={(e) => update(field, e.target.value)}
                                    placeholder="55 0000 0000"
                                    className={`${INPUT_CLASS} tabular-nums`}
                                />
                            </Field>
                        ))}
                    </div>
                    <Field label={t('panel.providers.address')}>
                        <textarea
                            rows={3}
                            value={contact.direccion}
                            onChange={(e) => update('direccion', e.target.value)}
                            placeholder={t('panel.addRegister.addressPlaceholder')}
                            className={`${INPUT_CLASS} h-auto py-2`}
                        />
                    </Field>
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving || !branch}
                            className="h-11 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow hover:bg-amber-400 disabled:opacity-60"
                        >
                            {saving ? t('panel.providers.saving') : t('panel.providers.save')}
                        </button>
                        {message.ok && <span role="status" className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold">{message.ok}</span>}
                        {message.error && <span role="alert" className="rounded-full bg-[rgb(var(--color-error))]/10 px-3 py-1 text-sm font-semibold text-[rgb(var(--color-error))]">{message.error}</span>}
                    </div>
                </div>

                <div className="flex justify-center lg:flex-1">
                    <div className="rounded-2xl bg-white p-3 shadow-lg">
                        <ComponentToPrint
                            items={previewItems}
                            subtotal={320}
                            discount={0}
                            total={320}
                            currentDate={previewDate}
                            employee={t('panel.addRegister.previewEmployee')}
                            folio={t('panel.addRegister.previewFolio')}
                            notes={t('panel.addRegister.sampleNote')}
                            useDefaults={false}
                            branchId={branchId}
                            refreshKey={previewKey}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
