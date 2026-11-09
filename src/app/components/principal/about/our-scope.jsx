'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { GiCarWheel, GiSpring } from 'react-icons/gi';
import {
    PiBatteryChargingFill,
    PiCarProfileFill,
    PiDropFill,
    PiEngineFill,
    PiFunnelFill,
    PiHeadsetFill,
    PiLightningFill,
    PiShieldCheckFill,
    PiSteeringWheelFill,
    PiStorefrontFill,
    PiTruckFill,
    PiWrenchFill,
} from 'react-icons/pi';
import { useTranslation } from '@/app/lib/text/text-provider';

// Anillo de afuera: las refacciones. Anillo de adentro: los servicios.
const REFACCIONES = [
    { clave: 'engine', icono: PiEngineFill },
    { clave: 'brakes', icono: GiCarWheel },
    { clave: 'steering', icono: PiSteeringWheelFill },
    { clave: 'electrical', icono: PiLightningFill },
    { clave: 'battery', icono: PiBatteryChargingFill },
    { clave: 'oil', icono: PiDropFill },
    { clave: 'suspension', icono: GiSpring },
    { clave: 'filters', icono: PiFunnelFill },
];
const SERVICIOS = [
    { clave: 'store', icono: PiStorefrontFill },
    { clave: 'shipping', icono: PiTruckFill },
    { clave: 'warranty', icono: PiShieldCheckFill },
    { clave: 'advice', icono: PiHeadsetFill },
    { clave: 'maintenance', icono: PiWrenchFill },
];

// Segundos por vuelta: lento, para que se lea y no maree.
const VUELTA_AFUERA = 90;
const VUELTA_ADENTRO = 70;

const ETIQUETA = 'whitespace-nowrap rounded-full bg-[rgb(var(--color-bg))]/85 px-2 py-0.5 text-[0.6rem] font-semibold text-[rgb(var(--color-text))] shadow-sm backdrop-blur sm:text-xs';

// Donde va el elemento `i` de `n` en un anillo: empieza arriba y reparte la vuelta.
const posicion = (i, n) => {
    const grados = -90 + (360 / n) * i;
    const angulo = grados * (Math.PI / 180);
    return { left: `${50 + 50 * Math.cos(angulo)}%`, top: `${50 + 50 * Math.sin(angulo)}%`, grados };
};

const giro = (segundos, sentido, quieto) => (quieto
    ? {}
    : { animate: { rotate: 360 * sentido }, transition: { duration: segundos, ease: 'linear', repeat: Infinity } });

// Una refaccion del anillo de afuera: icono en tarjeta y su nombre.
function Refaccion({ elemento: { clave, icono: Icono } }) {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col items-center gap-1.5">
            <motion.span
                whileHover={{ scale: 1.18, y: -2 }}
                className="grid size-11 place-items-center rounded-2xl bg-[rgb(var(--color-card))] text-[rgb(var(--color-galaxy))] shadow-lg shadow-[rgb(var(--color-galaxy))]/40 ring-1 ring-[rgb(var(--color-galaxy))]/40 sm:size-16"
            >
                <Icono className="size-5 sm:size-8" aria-hidden="true" />
            </motion.span>
            <span className={ETIQUETA}>{t(`about.scope.part_${clave}`)}</span>
        </div>
    );
}

// Un servicio del anillo de adentro: el boton del sitio (de galaxy a card).
function Servicio({ elemento: { clave, icono: Icono } }) {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col items-center gap-1.5">
            <motion.span
                whileHover={{ scale: 1.18, y: -2 }}
                className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-[rgb(var(--color-galaxy))] to-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow-md shadow-[rgb(var(--color-galaxy))]/50 sm:size-14"
            >
                <Icono className="size-5 sm:size-7" aria-hidden="true" />
            </motion.span>
            <span className={ETIQUETA}>{t(`about.scope.service_${clave}`)}</span>
        </div>
    );
}

/**
 * Un anillo que gira con sus elementos. Cada elemento gira al reves a la misma
 * velocidad, asi su icono y su nombre se quedan derechos mientras orbita.
 * `tamano` son clases de Tailwind (ancho y alto), para cambiarlo por pantalla.
 */
function Anillo({ elementos, tamano, segundos, sentido, quieto, conRayos, Nodo, retraso }) {
    return (
        <motion.div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${tamano}`}
            {...giro(segundos, sentido, quieto)}
        >
            <div className="absolute inset-0 rounded-full border border-dashed border-[rgb(var(--color-galaxy))]/40" aria-hidden="true" />
            {conRayos && elementos.map((elemento, i) => (
                // Rayos del centro a cada refaccion: la red del ecosistema.
                <span
                    key={`rayo-${elemento.clave}`}
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 h-px w-1/2 origin-left bg-gradient-to-r from-transparent via-[rgb(var(--color-galaxy))]/20 to-[rgb(var(--color-galaxy))]/55"
                    style={{ transform: `rotate(${posicion(i, elementos.length).grados}deg)` }}
                />
            ))}
            {elementos.map((elemento, i) => {
                const { left, top } = posicion(i, elementos.length);
                return (
                    <motion.div
                        key={elemento.clave}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{ left, top }}
                        initial={{ opacity: 0, scale: 0.4 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true, amount: 0.3 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: retraso + i * 0.08 }}
                    >
                        <motion.div {...giro(segundos, -sentido, quieto)}>
                            <Nodo elemento={elemento} />
                        </motion.div>
                    </motion.div>
                );
            })}
        </motion.div>
    );
}

/**
 * Nuestro ecosistema automotriz (Nosotros y el inicio del panel): Refautomex
 * al centro y, girando alrededor, lo que ofrece. Afuera las refacciones,
 * unidas al centro; adentro los servicios, girando al reves. Con "reducir
 * movimiento" en el sistema, todo se queda quieto.
 */
export default function OurScope() {
    const { t } = useTranslation();
    const quieto = useReducedMotion();

    return (
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-[rgb(var(--color-card))] via-[rgb(var(--color-gray))] to-[rgb(var(--color-card))] px-4 py-16 sm:py-24">
            {/* En el celular el titulo va arriba: al centro de la orbita no cabe. */}
            <div className="mx-auto mb-12 max-w-md text-center md:hidden">
                <h2 className="text-balance py-1 text-3xl font-extrabold leading-tight tracking-tight gradient-text-title">{t('about.scope.title')}</h2>
                <p className="mt-2 text-balance text-base text-[rgb(var(--color-text))]/75">{t('about.scope.leyend')}</p>
            </div>

            <motion.div
                className="relative mx-auto aspect-square w-[min(82vw,48rem)]"
                initial={{ opacity: 0, scale: 0.85 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
                {/* Resplandor del centro, que respira. */}
                <motion.div
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 size-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(var(--color-galaxy))]/30 blur-3xl"
                    animate={quieto ? undefined : { scale: [1, 1.18, 1], opacity: [0.55, 0.9, 0.55] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                />

                <Anillo elementos={REFACCIONES} tamano="size-full" segundos={VUELTA_AFUERA} sentido={1} quieto={quieto} conRayos Nodo={Refaccion} retraso={0.2} />
                <Anillo elementos={SERVICIOS} tamano="size-[54%] md:size-[58%]" segundos={VUELTA_ADENTRO} sentido={-1} quieto={quieto} Nodo={Servicio} retraso={0.6} />

                {/* El centro en escritorio: un circulo con un aro de luz que gira
                    despacio, el auto, el titulo y la leyenda. */}
                <div className="absolute left-1/2 top-1/2 hidden size-[17rem] -translate-x-1/2 -translate-y-1/2 md:block lg:size-[18rem]">
                    <motion.div
                        aria-hidden="true"
                        className="absolute -inset-[3px] rounded-full bg-[conic-gradient(from_0deg,rgb(var(--color-galaxy)),transparent_35%,rgb(var(--color-galaxy))_65%,transparent)] opacity-80"
                        {...giro(14, 1, quieto)}
                    />
                    <div className="relative flex size-full flex-col items-center justify-center rounded-full bg-[rgb(var(--color-bg))]/90 px-9 text-center shadow-2xl shadow-[rgb(var(--color-galaxy))]/30 backdrop-blur">
                        <PiCarProfileFill className="size-8 text-[rgb(var(--color-galaxy))]" aria-hidden="true" />
                        <h2 className="mt-2 text-balance text-2xl font-extrabold leading-[1.1] tracking-tight gradient-text-title lg:text-[1.7rem]">
                            {t('about.scope.title')}
                        </h2>
                        <span className="my-3 h-px w-12 bg-gradient-to-r from-transparent via-[rgb(var(--color-galaxy))] to-transparent" aria-hidden="true" />
                        <p className="text-balance text-sm leading-snug text-[rgb(var(--color-text))]/75 lg:text-base">{t('about.scope.leyend')}</p>
                    </div>
                </div>

                {/* El centro en el celular: solo el auto, que late. */}
                <motion.div
                    className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-galaxy))] shadow-xl shadow-[rgb(var(--color-galaxy))]/50 ring-2 ring-[rgb(var(--color-galaxy))]/50 md:hidden"
                    animate={quieto ? undefined : { scale: [1, 1.08, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                    <PiCarProfileFill className="size-7" aria-hidden="true" />
                </motion.div>
            </motion.div>

            <div className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-[rgb(var(--color-text))]/75">
                <span className="inline-flex items-center gap-2">
                    <span className="size-3 rounded-[0.3rem] bg-[rgb(var(--color-card))] ring-2 ring-[rgb(var(--color-galaxy))]/60" aria-hidden="true" />
                    {t('about.scope.legendParts')}
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="size-3 rounded-full bg-gradient-to-br from-[rgb(var(--color-galaxy))] to-[rgb(var(--color-card))]" aria-hidden="true" />
                    {t('about.scope.legendServices')}
                </span>
            </div>
        </section>
    );
}
