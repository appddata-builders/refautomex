import React, { useMemo, useState } from 'react';
import Select from 'react-select';
import { FaArrowRight, FaCircleCheck, FaCircleExclamation } from 'react-icons/fa6';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';

const DEFAULT_CATEGORY_ID = 1;
const FIRST_YEAR = 1990;

const EMPTY_FORM = {
    refaccion: '',
    descripcion: '',
    idgrupo: '',
    idcategoria: DEFAULT_CATEGORY_ID,
    idproveedor: '',
    mod_ini: '',
    mod_fin: '',
    idmarca: '',
};

export const INPUT_CLASS = 'h-11 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 text-base text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-gray-base))] focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60';

// react-select no lee las variables del tema: sin esto sale blanco en modo oscuro.
export const SELECT_STYLES = {
    control: (base, state) => ({
        ...base,
        minHeight: 44,
        borderRadius: 12,
        backgroundColor: 'rgb(var(--color-bg))',
        borderColor: state.isFocused ? 'rgb(251 191 36)' : 'rgb(var(--color-border))',
        boxShadow: state.isFocused ? '0 0 0 2px rgb(251 191 36)' : 'none',
        '&:hover': { borderColor: 'rgb(var(--color-border))' },
    }),
    menu: (base) => ({ ...base, zIndex: 30, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgb(var(--color-card))' }),
    option: (base, state) => ({
        ...base,
        color: 'rgb(var(--color-text))',
        backgroundColor: state.isSelected ? 'rgb(245 158 11 / 0.45)' : state.isFocused ? 'rgb(245 158 11 / 0.18)' : 'transparent',
    }),
    singleValue: (base) => ({ ...base, color: 'rgb(var(--color-text))' }),
    input: (base) => ({ ...base, color: 'rgb(var(--color-text))' }),
    placeholder: (base) => ({ ...base, color: 'rgb(var(--color-gray-base))' }),
};

export function Field({ label, error, hint, className = '', children }) {
    return (
        <label className={`block min-w-0 ${className}`}>
            <span className="mb-1 block text-sm font-medium text-[rgb(var(--color-text))]">{label}</span>
            {children}
            {error
                ? <span className="mt-1 block text-sm text-[rgb(var(--color-error))]">{error}</span>
                : hint && <span className="mt-1 block text-xs text-[rgb(var(--color-gray-base))]">{hint}</span>}
        </label>
    );
}

function FormSection({ step, title, children }) {
    return (
        <fieldset className="space-y-4">
            <legend className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">
                <span className="grid size-6 place-items-center rounded-full bg-amber-500 text-xs text-slate-900">{step}</span>
                {title}
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">{children}</div>
        </fieldset>
    );
}

/**
 * Alta de un producto en el catalogo. Queda con status 'E' (existente sin
 * detalle): todavia no esta en ninguna sucursal, y el aviso de guardado lleva
 * directo a asignarlo.
 */
export default function ProductForm({ catalogs, knownParts, onCreated, onAssign }) {
    const { t } = useTranslation();
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [created, setCreated] = useState(null);

    const options = useMemo(() => {
        const lastYear = new Date().getFullYear() + 1;
        return {
            groups: catalogs.groups.filter((option) => option.label && option.label.toLowerCase() !== 'not assigned'),
            categories: catalogs.categories.length
                ? catalogs.categories
                : [{ value: DEFAULT_CATEGORY_ID, label: t('panel.addRegister.category1') }],
            // Igual que Proveedores: los dos primeros renglones no se ofrecen.
            providers: catalogs.providers.slice(2),
            brands: catalogs.brands,
            years: Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => {
                const year = lastYear - i;
                return { value: year, label: String(year) };
            }),
        };
    }, [catalogs, t]);

    const update = (field, value) => {
        const normalized = (field === 'refaccion' || field === 'descripcion') && typeof value === 'string'
            ? value.toUpperCase()
            : value;
        setForm((prev) => ({ ...prev, [field]: normalized }));
        setErrors((prev) => ({ ...prev, [field]: '' }));
        setCreated(null);
        setSaveError('');
    };

    const validate = () => {
        const next = {};
        const part = form.refaccion.trim();
        if (!/^[A-Z0-9-]+$/.test(part)) next.refaccion = t('panel.inventories.partFormat');
        else if (knownParts.has(part)) next.refaccion = t('panel.inventories.partExists');
        if (!form.descripcion.trim()) next.descripcion = t('panel.inventories.descriptionRequired');
        if (!form.idgrupo) next.idgrupo = t('panel.addRegister.pickGroup');
        if (!form.idcategoria) next.idcategoria = t('panel.addRegister.pickCategory');
        if (!form.idproveedor) next.idproveedor = t('panel.addRegister.pickProvider');
        if (!form.idmarca) next.idmarca = t('panel.addRegister.pickBrand');
        if (!form.mod_ini) next.mod_ini = t('panel.inventories.yearRequired');
        if (!form.mod_fin) next.mod_fin = t('panel.inventories.yearRequired');
        else if (form.mod_ini && Number(form.mod_fin) < Number(form.mod_ini)) next.mod_fin = t('panel.inventories.yearOrder');
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (saving || !validate()) return;
        setSaving(true);
        setSaveError('');
        const product = {
            refaccion: form.refaccion.trim(),
            descripcion: form.descripcion.trim(),
            mod_ini: form.mod_ini,
            mod_fin: form.mod_fin,
            idgrupo: form.idgrupo,
            idcategoria: form.idcategoria || DEFAULT_CATEGORY_ID,
            idmarca: form.idmarca,
            idproveedor: form.idproveedor,
            status: 'E',
        };
        try {
            const response = await fetch(buildApiUrl('/newProduct'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                // 23505: el num_parte ya existe, aunque este dado de baja y no salga en las listas.
                throw new Error(/duplicate key|llave duplicada/i.test(data?.details || '')
                    ? t('panel.inventories.partExistsInactive')
                    : t('panel.addRegister.saveRetry'));
            }
            setForm(EMPTY_FORM);
            setErrors({});
            setCreated({ num_parte: product.refaccion, descripcion: product.descripcion });
            onCreated?.(product.refaccion);
        } catch (error) {
            setSaveError(error.message);
        } finally {
            setSaving(false);
        }
    };

    const selectFor = (field, list, placeholder) => (
        <Select
            options={list}
            value={list.find((option) => String(option.value) === String(form[field])) || null}
            onChange={(option) => update(field, option ? option.value : '')}
            placeholder={placeholder}
            styles={SELECT_STYLES}
            noOptionsMessage={() => t('panel.inventories.noOptions')}
        />
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
            {created && (
                <div role="status" className="flex flex-col gap-3 rounded-2xl bg-emerald-500/15 p-4 sm:flex-row sm:items-center">
                    <FaCircleCheck className="size-6 shrink-0 text-[rgb(var(--color-success))]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold">{t('panel.inventories.createdTitle', { part: created.num_parte })}</p>
                        <p className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.inventories.createdHint')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onAssign?.(created.num_parte)}
                        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 font-semibold text-slate-900 shadow hover:bg-amber-400"
                    >
                        {t('panel.inventories.assignNow')}
                        <FaArrowRight className="size-3.5" aria-hidden="true" />
                    </button>
                </div>
            )}

            <FormSection step="1" title={t('panel.inventories.sectionIdentity')}>
                <Field label={t('panel.capture.part')} error={errors.refaccion} hint={t('panel.inventories.partHint')} className="sm:col-span-2">
                    <input
                        type="text"
                        value={form.refaccion}
                        onChange={(e) => update('refaccion', e.target.value)}
                        autoComplete="off"
                        className={`${INPUT_CLASS} font-semibold uppercase tracking-wide`}
                    />
                </Field>
                <Field label={t('panel.capture.descriptionLabel')} error={errors.descripcion} className="sm:col-span-4">
                    <textarea
                        rows={2}
                        value={form.descripcion}
                        onChange={(e) => update('descripcion', e.target.value)}
                        className={`${INPUT_CLASS} h-auto min-h-11 py-2 uppercase`}
                    />
                </Field>
            </FormSection>

            <FormSection step="2" title={t('panel.inventories.sectionClassification')}>
                <Field label={t('products.group')} error={errors.idgrupo} className="sm:col-span-2">
                    {selectFor('idgrupo', options.groups, t('panel.addRegister.pickGroupPlaceholder'))}
                </Field>
                <Field label={t('panel.addRegister.category')} error={errors.idcategoria} className="sm:col-span-2">
                    {selectFor('idcategoria', options.categories, t('panel.addRegister.pickCategoryPlaceholder'))}
                </Field>
                <Field label={t('panel.capture.provider')} error={errors.idproveedor} className="sm:col-span-2">
                    {selectFor('idproveedor', options.providers, t('panel.newCapture.selectProvider'))}
                </Field>
            </FormSection>

            <FormSection step="3" title={t('panel.inventories.sectionFitment')}>
                <Field label={t('panel.addRegister.modelFrom')} error={errors.mod_ini} className="sm:col-span-2">
                    {selectFor('mod_ini', options.years, t('panel.addRegister.pickOne'))}
                </Field>
                <Field label={t('panel.addRegister.modelTo')} error={errors.mod_fin} className="sm:col-span-2">
                    {selectFor('mod_fin', options.years, t('panel.addRegister.pickOne'))}
                </Field>
                <Field label={t('panel.addRegister.carBrand')} error={errors.idmarca} className="sm:col-span-2">
                    {selectFor('idmarca', options.brands, t('panel.addRegister.pickOne'))}
                </Field>
            </FormSection>

            {saveError && (
                <p role="alert" className="flex items-center gap-2 rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2 text-sm text-[rgb(var(--color-error))]">
                    <FaCircleExclamation className="size-4 shrink-0" aria-hidden="true" />
                    {saveError}
                </p>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-[rgb(var(--color-border))] pt-5 sm:flex-row sm:items-center sm:justify-end">
                <button
                    type="button"
                    onClick={() => {
                        setForm(EMPTY_FORM);
                        setErrors({});
                        setSaveError('');
                    }}
                    className="h-11 rounded-xl px-5 font-semibold text-[rgb(var(--color-gray-base))] hover:bg-[rgb(var(--color-text))]/10"
                >
                    {t('panel.inventories.clear')}
                </button>
                <button
                    type="submit"
                    disabled={saving}
                    className="h-11 rounded-xl bg-amber-500 px-6 font-semibold text-slate-900 shadow hover:bg-amber-400 disabled:opacity-60"
                >
                    {saving ? t('panel.providers.saving') : t('panel.addRegister.saveProduct')}
                </button>
            </div>
        </form>
    );
}
