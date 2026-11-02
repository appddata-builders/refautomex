'use client';
import { createContext, useContext, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from '@/app/lib/text/text-provider';

/**
 * El loader de Refautomex: la estrella con tres estrellas en orbita, sobre un
 * cielo que titila. Lo usan la entrada al sitio (PageLoader, en
 * layout-client.jsx) y cualquier espera (Spinner, en spinner.jsx).
 *
 * Las orbitas y el giro de la estrella son CSS (globals.css, "Loader"): corren
 * desde el primer pintado, antes de que llegue el JavaScript, que es justo
 * cuando se ve el loader. framer-motion pone el cielo, la onda del texto y la
 * salida, que se cierra hacia la estrella.
 */

// La estrella de Refautomex: el FaStar de react-icons/fa6 (Font Awesome), tal
// cual, para que sea la misma del logo y del resto del sitio. Su caja es de
// 576 x 512 y su centro de giro no es el de la caja: esta en (288, 280).
export const ESTRELLA = 'M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z';
export const ESTRELLA_CAJA = { ancho: 576, alto: 512, centroX: 288, centroY: 280 };

const Estrella = ({ className, style }) => (
  <svg viewBox="0 0 576 512" className={className} style={style} aria-hidden="true">
    <path d={ESTRELLA} fill="currentColor" />
  </svg>
);

// Pseudoaleatorio con semilla (mulberry32): el servidor y el navegador pintan
// el mismo cielo y la hidratacion no encuentra diferencias.
const conSemilla = (semilla) => () => {
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const azar = conSemilla(2026);
const CIELO = Array.from({ length: 36 }, (_, i) => ({
  x: +(azar() * 100).toFixed(2),
  y: +(azar() * 100).toFixed(2),
  tam: +(5 + azar() * 6).toFixed(2),
  dur: +(2.4 + azar() * 3.6).toFixed(2),
  retraso: +(azar() * 4).toFixed(2),
  color: i % 3 === 0 ? '--color-galaxy' : '--color-refautomex',
}));

// Cada orbita es una elipse inclinada `giro` grados que se recorre en `dur`
// segundos; `sentido` -1 va al reves.
const ORBITAS = [
  { rx: 104, ry: 30, giro: -18, dur: 3.6, sentido: 1, color: '--color-amber', tam: 18 },
  { rx: 76, ry: 38, giro: 34, dur: 5.2, sentido: -1, color: '--color-galaxy', tam: 15 },
  { rx: 122, ry: 18, giro: 8, dur: 7.4, sentido: 1, color: '--color-refautomex', tam: 13 },
];

// La estrella y su estela: cada copia va 1/24 de vuelta (15 grados) mas atras,
// mas chica y mas tenue.
const ESTELA = [1, 0.55, 0.32, 0.16];
const PASO_ESTELA = 1 / 24;

// Un borde fino con el color del texto: el dorado se lee igual sobre el fondo
// claro que sobre el oscuro.
const CONTORNO = 'drop-shadow(0 0 0.5px rgb(var(--color-text) / 0.55))';

/**
 * La elipse como trayectoria de CSS (offset-path), en las coordenadas de la
 * caja. Empieza en la punta derecha y baja primero (sentido 1): la mitad de
 * abajo es la de enfrente, y ahi la animacion de profundidad la agranda.
 */
const trayectoria = ({ rx, ry, giro, sentido }, escala, caja) => {
  const a = rx * escala;
  const b = ry * escala;
  const centro = caja / 2;
  const radianes = (giro * Math.PI) / 180;
  const x = a * Math.cos(radianes);
  const y = a * Math.sin(radianes);
  const barrido = sentido > 0 ? 1 : 0;
  const punto = (px, py) => `${(centro + px).toFixed(2)} ${(centro + py).toFixed(2)}`;
  const arco = `A ${a.toFixed(2)} ${b.toFixed(2)} ${giro} 1 ${barrido}`;
  return `path('M ${punto(x, y)} ${arco} ${punto(-x, -y)} ${arco} ${punto(x, y)}')`;
};

/** Estrellas de fondo que titilan, repartidas por todo el contenedor. */
export function Cielo() {
  const quieto = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {CIELO.map((e, i) => (
        <motion.span
          key={i}
          className="absolute block"
          style={{ left: `${e.x}%`, top: `${e.y}%`, width: e.tam, height: e.tam }}
          initial={{ opacity: 0.35 }}
          animate={quieto ? { opacity: 0.5 } : { opacity: [0.15, 0.9, 0.15], transform: ['scale(0.6)', 'scale(1)', 'scale(0.6)'] }}
          transition={quieto ? undefined : { duration: e.dur, delay: e.retraso, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Estrella
            className="h-full w-full"
            style={{ color: `rgb(var(${e.color}))`, filter: `drop-shadow(0 0 3px rgb(var(${e.color}) / 0.8))` }}
          />
        </motion.span>
      ))}
    </div>
  );
}

/**
 * La estrella con sus orbitas y el texto debajo. `tam` grande para pantalla
 * completa, chico para dentro de un panel.
 */
export function StarOrbit({ tam = 'grande' }) {
  const { t } = useTranslation();
  const quieto = useReducedMotion();
  const escala = tam === 'grande' ? 1 : 0.55;
  const caja = Math.round(270 * escala);
  const centro = 64 * escala;
  const texto = t('navbar.spinner');

  return (
    <div role="status" aria-live="polite" className="relative z-10 flex flex-col items-center gap-5">
      <span className="sr-only">{texto}</span>

      <div className="relative" style={{ width: caja, height: caja }} aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`${-caja / 2} ${-caja / 2} ${caja} ${caja}`}>
          {ORBITAS.map((o, i) => (
            <ellipse
              key={i}
              rx={o.rx * escala}
              ry={o.ry * escala}
              transform={`rotate(${o.giro})`}
              fill="none"
              stroke="rgb(var(--color-text) / 0.2)"
              strokeWidth="1"
              strokeDasharray={i === 1 ? '2 5' : undefined}
            />
          ))}
        </svg>

        <div
          className="loader-pulso absolute left-1/2 top-1/2 rounded-full blur-2xl"
          style={{
            width: caja * 0.45,
            height: caja * 0.45,
            marginLeft: -caja * 0.225,
            marginTop: -caja * 0.225,
            backgroundColor: 'rgb(var(--color-amber) / 0.55)',
          }}
        />

        {/* El centro de giro del FaStar dentro de una caja cuadrada cae en
            50% / 54.2% (((576 - 512) / 2 + 280) / 576). */}
        <div
          className="loader-giro absolute left-1/2 top-1/2 origin-[50%_54.2%]"
          style={{ width: centro, height: centro, marginLeft: -centro / 2, marginTop: -centro / 2 }}
        >
          <Estrella
            className="h-full w-full text-[rgb(var(--color-refautomex))]"
            style={{ filter: `${CONTORNO} drop-shadow(0 0 12px rgb(var(--color-amber) / 0.9))` }}
          />
        </div>

        {ORBITAS.map((o, i) => {
          const camino = trayectoria(o, escala, caja);
          return ESTELA.map((intensidad, k) => {
            const lado = o.tam * escala * (1 - k * 0.2);
            // Retrasos negativos: todas arrancan ya en camino, la cabeza adelante.
            const retraso = -((ESTELA.length - 1 - k) * PASO_ESTELA * o.dur);
            return (
              <span
                key={`${i}-${k}`}
                className={`loader-orbita ${o.sentido < 0 ? 'loader-orbita-inversa' : ''} ${k > 0 ? 'loader-estela' : ''} absolute left-0 top-0 block`}
                style={{
                  width: lado,
                  height: lado,
                  offsetPath: camino,
                  animationDuration: `${o.dur}s`,
                  animationDelay: `${retraso.toFixed(3)}s`,
                }}
              >
                <Estrella
                  className="h-full w-full"
                  style={{
                    opacity: intensidad,
                    color: `rgb(var(${o.color}))`,
                    filter: k === 0 ? `${CONTORNO} drop-shadow(0 0 6px rgb(var(${o.color})))` : undefined,
                  }}
                />
              </span>
            );
          });
        })}
      </div>

      <p
        className={`select-none font-semibold italic tracking-wide text-[rgb(var(--color-text))] ${tam === 'grande' ? 'text-lg sm:text-xl' : 'text-sm'}`}
        aria-hidden="true"
      >
        {[...texto].map((letra, i) => (
          <motion.span
            key={i}
            className="inline-block"
            initial={{ opacity: 0.6 }}
            animate={quieto ? { opacity: 1 } : { opacity: [0.3, 1, 0.3] }}
            transition={quieto ? undefined : { duration: 1.8, delay: i * 0.06, repeat: Infinity, ease: 'easeInOut' }}
          >
            {letra === ' ' ? ' ' : letra}
          </motion.span>
        ))}
      </p>
    </div>
  );
}

/**
 * Una sola espera al entrar: mientras el loader de entrada sigue puesto, cada
 * Spinner de pantalla completa que se monte (la redireccion de /calidad,
 * app/loading.jsx al navegar, una pantalla esperando sus datos) lo retiene, y
 * se quita hasta que no queda ninguno. Sin esto la estrella se cerraba y
 * aparecia otra igual debajo. Despues de la entrada no hace nada.
 */
export const EntradaContext = createContext(null);

export function useRetenerEntrada() {
  const retener = useContext(EntradaContext);
  useEffect(() => retener?.(), [retener]);
}

// El resplandor detras de la estrella; lo comparten PageLoader y Spinner.
export const FONDO_LOADER = 'radial-gradient(circle at 50% 45%, rgb(var(--color-galaxy) / 0.35), transparent 62%)';

/**
 * La entrada al sitio: cubre la pagina mientras carga y, al terminar, se
 * cierra hacia la estrella del centro. Va dentro de <AnimatePresence>.
 */
export function PageLoader() {
  const quieto = useReducedMotion();
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgb(var(--color-bg))]"
      style={{ backgroundImage: FONDO_LOADER }}
      initial={false}
      animate={{ clipPath: 'circle(150% at 50% 50%)', opacity: 1 }}
      exit={quieto ? { opacity: 0 } : { clipPath: 'circle(0% at 50% 50%)' }}
      transition={{ duration: quieto ? 0.3 : 0.8, ease: [0.76, 0, 0.24, 1] }}
    >
      <Cielo />
      <motion.div
        initial={false}
        animate={{ transform: 'scale(1) rotate(0deg)', opacity: 1 }}
        exit={quieto ? { opacity: 0 } : { transform: 'scale(0.35) rotate(72deg)', opacity: 0 }}
        transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
      >
        <StarOrbit />
      </motion.div>
    </motion.div>
  );
}
