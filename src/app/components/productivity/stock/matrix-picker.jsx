import React from 'react';
import { FaChevronDown } from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';
import { LEVELS, SPECIAL_LEVELS, TWO_DIGITS, isSpecialLevel, matrixCode } from './locations';

/**
 * Tarjeta con los tres selectores de una matriz y su codigo, que se va armando
 * mientras se elige: 01·05 dice que falta el nivel.
 *
 * Con `allowSpecial`, el nivel tambien ofrece ENC, EXT, OBS e INT. Esos niveles
 * solo llevan indice (ENC-1): al elegir uno, anaquel y seccion no aplican y se
 * desactivan, pero conservan lo elegido por si se vuelve a un nivel normal.
 */
export default function MatrixPicker({ label, icon: Icon, iconClassName = '', value, onChange, allowSpecial = false }) {
    const { t } = useTranslation();
    const code = matrixCode(value);
    const special = isSpecialLevel(value.nivel);
    const preview = special
        ? value.nivel
        : `${value.anaquel || '··'}${value.nivel || '·'}${value.seccion || '··'}`;
    const fields = [
        { field: 'anaquel', label: t('panel.migrate.shelf'), options: TWO_DIGITS, disabled: special },
        { field: 'nivel', label: t('panel.migrate.level'), options: LEVELS, extra: allowSpecial ? SPECIAL_LEVELS : null },
        { field: 'seccion', label: t('panel.migrate.section'), options: TWO_DIGITS, disabled: special },
    ];

    return (
        <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3.5">
            <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">
                    <Icon className={`size-4 ${iconClassName}`} />
                    {label}
                </span>
                <span
                    className={`rounded-lg px-2.5 py-1 font-mono text-base font-bold tracking-widest transition-colors ${code
                        ? 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-bg))]'
                        : 'bg-[rgb(var(--color-gray))] text-[rgb(var(--color-gray-base))]'}`}
                >
                    {preview}
                </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {fields.map(({ field, label: fieldLabel, options, extra, disabled }) => (
                    <label key={field} className={`flex min-w-0 flex-col gap-1 ${disabled ? 'opacity-40' : ''}`}>
                        <span className="text-center text-[11px] font-medium text-[rgb(var(--color-gray-base))]">
                            {fieldLabel}
                        </span>
                        <span className="relative">
                            {/* text-lg: con menos de 16px Safari en iOS hace zoom al tocar el campo. */}
                            <select
                                value={disabled ? '' : value[field]}
                                onChange={(event) => onChange(field, event.target.value)}
                                disabled={disabled}
                                className="h-12 w-full appearance-none rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] pr-5 text-center text-lg font-semibold text-[rgb(var(--color-text))] [text-align-last:center] focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed"
                            >
                                <option value="">—</option>
                                {extra && (
                                    <optgroup label={t('panel.assignment.specialLevels')}>
                                        {extra.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {extra ? (
                                    <optgroup label={t('panel.migrate.level')}>
                                        {options.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                        ))}
                                    </optgroup>
                                ) : options.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                            <FaChevronDown
                                className="pointer-events-none absolute right-2 top-1/2 size-2.5 -translate-y-1/2 opacity-50"
                                aria-hidden="true"
                            />
                        </span>
                    </label>
                ))}
            </div>
        </section>
    );
}
