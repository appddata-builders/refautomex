import React, { useEffect } from 'react';
import { FaXmark } from 'react-icons/fa6';
import PopPortal from '@/app/lib/pop-portal';
import { useTranslation } from '@/app/lib/text/text-provider';

/**
 * Hoja de acciones del almacen: en celular sube desde abajo, al alcance del
 * pulgar; desde `sm` es un dialogo centrado. Siempre esta montada para que se
 * vea la animacion de cierre: `isOpen` solo la muestra u oculta.
 *
 * Mientras esta abierta bloquea el scroll de la pagina y se cierra con Escape
 * o tocando el fondo, salvo con `locked` (por ejemplo, mientras guarda).
 *
 * Va en un portal a <body>: dentro de <main className="z-0"> (layout-client)
 * ningun z-index le gana a la navbar ni a los botones flotantes del sitio,
 * que quedaban encima de los botones de la hoja.
 */
export default function Sheet({ isOpen, onClose, locked = false, labelledBy, wide = false, children }) {
    // `position: fixed` y no solo `overflow: hidden`: Safari en iOS ignora lo
    // segundo y deja desplazar el fondo con el dedo (mismo truco que
    // payment-type-modal).
    useEffect(() => {
        if (!isOpen) return undefined;
        const { body } = document;
        const scrollY = window.scrollY;
        const previous = {
            position: body.style.position,
            top: body.style.top,
            width: body.style.width,
            overflow: body.style.overflow,
        };
        Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, width: '100%', overflow: 'hidden' });
        return () => {
            Object.assign(body.style, previous);
            window.scrollTo(0, scrollY);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !locked) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, locked, onClose]);

    const handleBackdrop = () => {
        if (!locked) onClose();
    };

    return (
        <PopPortal>
            <div
                className={`fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-200 sm:items-center sm:p-4 ${isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
                inert={!isOpen}
            >
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" onClick={handleBackdrop} />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={labelledBy}
                    className={`relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] shadow-2xl transition-transform duration-300 ease-out sm:rounded-2xl ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'} ${isOpen ? 'translate-y-0' : 'translate-y-full sm:translate-y-6'}`}
                >
                    <div className="flex justify-center pt-3 sm:hidden" aria-hidden="true">
                        <span className="h-1.5 w-10 rounded-full bg-[rgb(var(--color-text))]/20" />
                    </div>
                    <div className="space-y-4 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
                        {children}
                    </div>
                </div>
            </div>
        </PopPortal>
    );
}

export function SheetHeader({ icon: Icon, title, titleId, subtitle, onClose, closeDisabled = false }) {
    const { t } = useTranslation();

    return (
        <header className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-500 text-slate-900 shadow">
                <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
                <h3 id={titleId} className="text-lg font-semibold leading-tight">{title}</h3>
                {subtitle && (
                    <div className="mt-1 text-sm leading-snug text-[rgb(var(--color-gray-base))]">{subtitle}</div>
                )}
            </div>
            <button
                type="button"
                onClick={onClose}
                disabled={closeDisabled}
                aria-label={t('panel.common.close')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-[rgb(var(--color-gray-base))] transition hover:bg-[rgb(var(--color-text))]/10 disabled:opacity-40"
            >
                <FaXmark className="size-4" />
            </button>
        </header>
    );
}
