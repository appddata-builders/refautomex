'use client';

import { useEffect, useState } from 'react';
import { tiempoRestante } from '@/app/lib/promociones';
import { useTranslation } from '@/app/lib/text/text-provider';

// Un solo reloj por conteo: cada segundo, con el desfase del servidor
// (useOfertas). Se detiene al llegar a cero. Empieza en null: lo que pinta el
// servidor (el inicio) no lleva segundos, o no coincidiria con el navegador.
const useAhora = (fin, desfase) => {
    const [ahora, setAhora] = useState(null);
    useEffect(() => {
        setAhora(Date.now() + desfase);
        const timer = setInterval(() => {
            const siguiente = Date.now() + desfase;
            setAhora(siguiente);
            if (siguiente >= Date.parse(fin)) clearInterval(timer);
        }, 1000);
        return () => clearInterval(timer);
    }, [fin, desfase]);
    return ahora;
};

const dos = (n) => (n === null ? '--' : String(n).padStart(2, '0'));

/**
 * Lo que falta para que termine una promocion.
 *   variant="grande": cajas de dias, horas, minutos y segundos (banner).
 *   variant="chica":  una linea "Termina en 2 d 04:12:09" (tarjetas).
 */
export default function Countdown({ fin, desfase = 0, variant = 'grande', className = '' }) {
    const { t } = useTranslation();
    const ahora = useAhora(fin, desfase);
    const listo = ahora !== null;
    const { total, dias, horas, minutos, segundos } = tiempoRestante(fin, listo ? ahora : 0);

    if (listo && !total) {
        return <p className={`text-sm font-semibold ${className}`}>{t('promotions.ended')}</p>;
    }

    if (variant === 'chica') {
        return (
            <p className={`text-xs font-semibold tabular-nums ${className}`} aria-live="off">
                {t('promotions.endsIn')} {listo && dias > 0 && `${t('promotions.daysShort', { count: dias })} `}
                {listo ? `${dos(horas)}:${dos(minutos)}:${dos(segundos)}` : '--:--:--'}
            </p>
        );
    }

    const partes = [
        { valor: listo ? dias : null, etiqueta: t(listo && dias === 1 ? 'promotions.dayOne' : 'promotions.days') },
        { valor: listo ? horas : null, etiqueta: t('promotions.hours') },
        { valor: listo ? minutos : null, etiqueta: t('promotions.minutes') },
        { valor: listo ? segundos : null, etiqueta: t('promotions.seconds') },
    ];
    return (
        <div className={className}>
            <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.25em] text-white/80 lg:text-left">{t('promotions.endsIn')}</p>
            {/* El lector de pantalla no necesita cada segundo: se lee una vez. */}
            <span className="sr-only">
                {/* Con la zona de la tienda: el servidor corre en UTC y el texto
                    tiene que salir igual alla y en el navegador. */}
                {t('promotions.endsAt', { date: new Date(fin).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' }) })}
            </span>
            <div className="flex justify-center gap-2 sm:gap-3 lg:justify-start" aria-hidden="true">
                {partes.map(({ valor, etiqueta }) => (
                    <div key={etiqueta} className="min-w-[3.75rem] rounded-2xl bg-slate-950/55 px-2 py-2 text-center ring-1 ring-white/15 backdrop-blur sm:min-w-[4.75rem] sm:px-3">
                        <span className="block text-2xl font-extrabold tabular-nums text-amber-400 sm:text-4xl">{dos(valor)}</span>
                        <span className="block text-[0.65rem] font-semibold uppercase tracking-wider text-white/75 sm:text-xs">{etiqueta}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
