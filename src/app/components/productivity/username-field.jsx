'use client';
import { useState } from 'react';
import { FiAtSign } from 'react-icons/fi';
import { MdSave } from 'react-icons/md';
import { useTranslation } from '@/app/lib/text/text-provider';
import { obtenerIdToken } from '@/app/lib/cognito-manager';
import { USUARIO_MAX, esUsuario, normalizarUsuario } from '@/app/lib/usuario-acceso';

/**
 * Configuracion: el usuario con el que la cuenta entra en lugar del correo
 * (lib/usuario-acceso.js). Cada quien pone el suyo, lo cambia o lo quita
 * dejandolo vacio, sin pasar por "Habilitar edicion": se guarda solo, como la
 * foto.
 *
 * Vive dentro del <form> de Configuracion, que no admite otro: Enter guarda el
 * usuario en vez de enviar los datos personales.
 */
export default function UsernameField({ initial, onSaved }) {
    const { t } = useTranslation();
    const [base, setBase] = useState(initial || '');
    const [saved, setSaved] = useState(initial || '');
    const [value, setValue] = useState(initial || '');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [saving, setSaving] = useState(false);
    const normalized = normalizarUsuario(value);
    const dirty = normalized !== saved;

    // La sesion termino de leer la base despues de montar: se toma su valor,
    // salvo que ya se este escribiendo otro.
    if ((initial || '') !== base) {
        setBase(initial || '');
        setSaved(initial || '');
        if (!dirty) setValue(initial || '');
    }

    const save = async () => {
        if (!dirty || saving) return;
        setError('');
        setInfo('');
        if (normalized && !esUsuario(normalized)) {
            setError(t('account.usernameInvalid'));
            return;
        }

        setSaving(true);
        try {
            const token = await obtenerIdToken();
            const response = await fetch('/api/acceso', {
                method: 'PUT',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ username: normalized }),
            });
            const data = await response.json().catch(() => ({}));
            if (response.status === 409) {
                setError(t('account.usernameTaken'));
                return;
            }
            if (!response.ok) throw new Error(data.error || t('account.updateError'));

            const next = data.username || '';
            setSaved(next);
            setValue(next);
            setInfo(t(next ? 'account.usernameSaved' : 'account.usernameRemoved'));
            onSaved?.(next || null);
        } catch (err) {
            setError(err.message || t('account.updateError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-2xl sm:rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/70 p-4 sm:p-6 shadow-md mb-5">
            <label htmlFor="username" className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] shadow-sm">
                    <FiAtSign className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                    <span className="block text-lg font-semibold text-[rgb(var(--color-text))]">{t('account.username')}</span>
                    <span className="block text-sm text-[rgb(var(--color-text))]/80">{t('account.usernameHint')}</span>
                </span>
            </label>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                    id="username"
                    type="text"
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value.toLowerCase());
                        setError('');
                        setInfo('');
                    }}
                    onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        save();
                    }}
                    placeholder={t('account.usernamePlaceholder')}
                    maxLength={USUARIO_MAX}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={saving}
                    aria-invalid={Boolean(error)}
                    aria-describedby="username-help"
                    className={`block w-full sm:flex-1 rounded-md border-0 py-2.5 px-3 font-mono text-gray-900 bg-white shadow-sm ring-1 ring-inset placeholder:font-sans placeholder:text-gray-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6 ${
                        error ? 'ring-red-400 focus:ring-red-500' : 'ring-gray-300 focus:ring-indigo-600'
                    }`}
                />
                <button
                    type="button"
                    onClick={save}
                    disabled={!dirty || saving}
                    className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow transition ${
                        !dirty || saving
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-amber-400 text-white hover:bg-amber-500'
                    }`}
                >
                    <MdSave size={18} />
                    {saving ? t('account.photoSaving') : t('account.usernameSave')}
                </button>
            </div>
            <p
                id="username-help"
                role={error ? 'alert' : undefined}
                aria-live="polite"
                className={`mt-2 text-xs ${error ? 'font-medium text-red-600' : info ? 'text-green-700' : 'text-[rgb(var(--color-text))]/70'}`}
            >
                {error || info || t('account.usernameRules')}
            </p>
        </section>
    );
}
