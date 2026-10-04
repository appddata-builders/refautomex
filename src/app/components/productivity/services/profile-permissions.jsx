'use client';

import { Fragment, useState } from 'react';
import { FiShield } from 'react-icons/fi';
import { useTranslation } from '@/app/lib/text/text-provider';
import { MODULOS, PERFILES, esFijo } from '@/app/lib/permisos-menu';
import { guardarPermisos, usePermisosMenu } from '@/app/lib/use-permisos-menu';

const TEXTO_PERFIL = {
    admin: 'panel.permissions.admin',
    empleado: 'panel.permissions.employee',
};

// Los modulos sueltos del menu (Home, Configuracion, Permisos, Respaldos) no
// tienen seccion; se agrupan al final.
const GRUPOS = MODULOS.reduce((grupos, modulo) => {
    const seccion = modulo.seccion ?? null;
    const grupo = grupos.find((g) => g.seccion === seccion);
    if (grupo) grupo.modulos.push(modulo);
    else grupos.push({ seccion, modulos: [modulo] });
    return grupos;
}, []);

/**
 * Matriz modulo x perfil de Permisos. Solo guarda en el
 * estado las casillas que se tocaron; lo demas viene de lo guardado, asi que
 * si la respuesta del servidor llega despues de abrir la pestana no se pisa
 * nada de lo que el admin ya marco.
 */
export default function ProfilePermissions() {
    const { t } = useTranslation();
    const guardados = usePermisosMenu();
    const [cambios, setCambios] = useState({});
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState(null);

    const valor = (clave, perfil) => cambios[clave]?.[perfil] ?? guardados[clave][perfil];

    const cambiado = (clave, perfil) => valor(clave, perfil) !== guardados[clave][perfil];
    const pendientes = MODULOS.reduce(
        (total, { clave }) => total + PERFILES.filter((perfil) => cambiado(clave, perfil)).length,
        0
    );

    const cambiar = (clave, perfil, marcado) => {
        setAviso(null);
        setCambios((prev) => ({ ...prev, [clave]: { ...prev[clave], [perfil]: marcado } }));
    };

    const guardar = async () => {
        const permisos = Object.fromEntries(MODULOS.map(({ clave }) => [
            clave,
            Object.fromEntries(PERFILES.map((perfil) => [perfil, valor(clave, perfil)])),
        ]));
        setGuardando(true);
        setAviso(null);
        try {
            await guardarPermisos(permisos);
            setCambios({});
            setAviso({ tipo: 'ok', texto: t('panel.permissions.saved') });
        } catch (error) {
            setAviso({ tipo: 'error', texto: `${t('panel.permissions.saveError')}: ${error.message}` });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <section className="space-y-4 rounded-2xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-card))] p-4 shadow-sm sm:p-6">
            <div>
                <h2 className="flex items-center gap-2 text-2xl font-bold text-[rgb(var(--color-text))]">
                    <FiShield className="h-5 w-5" aria-hidden="true" />
                    {t('panel.permissions.title')}
                </h2>
                <p className="mt-2 text-sm text-[rgb(var(--color-text))]/80">{t('panel.permissions.help')}</p>
                <p className="mt-1 text-sm text-[rgb(var(--color-text))]/80">{t('panel.permissions.actionsNote')}</p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))]">
                <table className="w-full text-sm text-[rgb(var(--color-text))]">
                    <thead>
                        <tr className="border-b border-[rgb(var(--color-border))]/80 text-[rgb(var(--color-text))]/70">
                            <th scope="col" className="px-3 py-2 text-left font-normal">{t('panel.permissions.module')}</th>
                            {PERFILES.map((perfil) => (
                                <th key={perfil} scope="col" className="w-24 px-3 py-2 text-center font-normal">
                                    {t(TEXTO_PERFIL[perfil])}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {GRUPOS.map(({ seccion, modulos }) => (
                            <Fragment key={seccion ?? 'general'}>
                                <tr className="bg-[rgb(var(--color-card))]">
                                    <th
                                        scope="colgroup"
                                        colSpan={PERFILES.length + 1}
                                        className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-[rgb(var(--color-text))]/70"
                                    >
                                        {seccion ? t(`panel.nav.${seccion}`) : t('panel.permissions.general')}
                                    </th>
                                </tr>
                                {modulos.map((modulo) => {
                                    const nombre = t(`panel.nav.${modulo.texto ?? modulo.clave}`);
                                    return (
                                        <tr key={modulo.clave} className="border-t border-[rgb(var(--color-border))]/60">
                                            <th scope="row" className="px-3 py-2 text-left font-medium">{nombre}</th>
                                            {PERFILES.map((perfil) => {
                                                const fijo = esFijo(modulo, perfil);
                                                // Lo marcado y aun sin guardar se resalta hasta guardar.
                                                const sinGuardar = cambiado(modulo.clave, perfil);
                                                return (
                                                    <td
                                                        key={perfil}
                                                        className={`px-3 py-2 text-center ${sinGuardar ? 'bg-[rgb(var(--color-galaxy))]/20' : ''}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={valor(modulo.clave, perfil)}
                                                            disabled={fijo || guardando}
                                                            onChange={(e) => cambiar(modulo.clave, perfil, e.target.checked)}
                                                            title={fijo ? t('panel.permissions.locked') : undefined}
                                                            aria-label={`${nombre} — ${t(TEXTO_PERFIL[perfil])}`}
                                                            className="h-5 w-5 cursor-pointer accent-[rgb(var(--color-galaxy))] disabled:cursor-not-allowed disabled:opacity-50"
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {aviso && (
                <p className={`rounded-md px-3 py-2 text-sm ${aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                    {aviso.texto}
                </p>
            )}

            {pendientes > 0 && !guardando && (
                <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
                    {t('panel.permissions.pending', { n: pendientes })}
                </p>
            )}

            <button
                type="button"
                onClick={guardar}
                disabled={guardando || pendientes === 0}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-400 bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-[rgb(var(--color-border))]/60 disabled:bg-[rgb(var(--color-bg))] disabled:text-[rgb(var(--color-text))]/60"
            >
                {guardando ? t('panel.permissions.saving') : t('panel.permissions.save')}
            </button>
        </section>
    );
}
