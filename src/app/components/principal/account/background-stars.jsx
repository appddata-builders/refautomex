'use client';
import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { ESTRELLA, ESTRELLA_CAJA } from '@/app/components/principal/star-loader';

/**
 * Fondo de /calidad y de Cuenta: una constelacion viva.
 *
 *  - Un cielo en canvas con estrellas a tres profundidades que titilan y se
 *    desplazan con el puntero; las lejanas se mueven menos (paralaje).
 *  - Alrededor del puntero las estrellas se unen con lineas, como una carta
 *    celeste, y las mas cercanas crecen como estrellas de cinco puntas. Sin
 *    puntero (telefono, o el mouse quieto) esa "linterna" recorre el cielo sola.
 *  - Cada pocos segundos cruza una estrella fugaz.
 *  - Detras, una aurora con los colores del tema (framer-motion).
 *
 * Los colores salen de las variables del tema y se vuelven a leer al cambiar
 * entre claro y oscuro. Con "reducir movimiento" el cielo queda quieto.
 */

const RADIO_LINTERNA = 170; // px alrededor de la linterna donde se arma la constelacion
const UNION = 105; // distancia maxima entre dos estrellas unidas
const VECINAS = 3; // cada estrella se une con sus tres mas cercanas, no con todas
const PARALAJE = 36; // px que se desplaza la estrella mas cercana
const QUIETO_MS = 2500; // sin mover el puntero, la linterna vuelve a pasear

// Las variables del tema son "r g b"; el canvas las quiere "r,g,b".
const rgb = (variable) =>
  getComputedStyle(document.documentElement).getPropertyValue(variable).trim().split(/\s+/).join(',');

function useCieloVivo(lienzoRef, quieto) {
  useEffect(() => {
    const canvas = lienzoRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return undefined;

    const forma = new Path2D(ESTRELLA);
    const puntero = { x: 0, y: 0, visto: -Infinity };
    const linterna = { x: null, y: null };
    const mirada = { x: 0.5, y: 0.5 };
    let ancho = 0;
    let alto = 0;
    let estrellas = [];
    let fugaces = [];
    let colores = {};
    let cuadro = 0;
    let previo = 0;
    let proximaFugaz = 1800;

    const leerColores = () => {
      colores = {
        estrella: rgb('--color-refautomex'),
        galaxia: rgb('--color-galaxy'),
        brillo: rgb('--color-amber'),
        tinta: rgb('--color-text'),
      };
    };

    const sembrar = () => {
      const caja = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = caja.width;
      alto = caja.height;
      canvas.width = Math.round(ancho * dpr);
      canvas.height = Math.round(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cuantas = Math.min(240, Math.round((ancho * alto) / 6500));
      estrellas = Array.from({ length: cuantas }, () => {
        const z = Math.random();
        return {
          x: Math.random() * ancho,
          y: Math.random() * alto,
          z,
          r: 0.5 + z * 1.6,
          fase: Math.random() * Math.PI * 2,
          ritmo: 0.5 + Math.random() * 1.5,
          tono: Math.random() < 0.3 ? 'galaxia' : 'estrella',
        };
      });
    };

    const pintarEstrella = (x, y, tam, color, alfa, giro = 0) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(giro);
      // `tam` es el ancho de la estrella; se dibuja alrededor de su centro de giro.
      ctx.scale(tam / ESTRELLA_CAJA.ancho, tam / ESTRELLA_CAJA.ancho);
      ctx.translate(-ESTRELLA_CAJA.centroX, -ESTRELLA_CAJA.centroY);
      ctx.fillStyle = `rgba(${color},${alfa})`;
      ctx.fill(forma);
      ctx.restore();
    };

    const dibujar = (t) => {
      const dt = Math.min(t - previo, 50);
      previo = t;
      ctx.clearRect(0, 0, ancho, alto);

      // La linterna sigue al puntero; si lleva rato quieto, pasea sola.
      const libre = t - puntero.visto > QUIETO_MS;
      const metaX = libre ? ancho * (0.5 + 0.38 * Math.sin(t / 6100)) : puntero.x;
      const metaY = libre ? alto * (0.45 + 0.3 * Math.sin(t / 4700 + 1.3)) : puntero.y;
      linterna.x = linterna.x === null ? metaX : linterna.x + (metaX - linterna.x) * 0.12;
      linterna.y = linterna.y === null ? metaY : linterna.y + (metaY - linterna.y) * 0.12;
      mirada.x += (linterna.x / ancho - mirada.x) * 0.05;
      mirada.y += (linterna.y / alto - mirada.y) * 0.05;
      const dx = (mirada.x - 0.5) * PARALAJE;
      const dy = (mirada.y - 0.5) * PARALAJE;

      const visibles = estrellas.map((e) => {
        const x = e.x - dx * e.z;
        const y = e.y - dy * e.z;
        const d = Math.hypot(x - linterna.x, y - linterna.y);
        return { e, x, y, luz: d < RADIO_LINTERNA ? 1 - d / RADIO_LINTERNA : 0 };
      });

      // Primero las lineas, para que las estrellas queden encima.
      const cerca = visibles.filter((v) => v.luz > 0 && v.e.z > 0.35);
      const unidas = new Set();
      ctx.lineWidth = 0.9;
      cerca.forEach((a, i) => {
        cerca
          .map((b, j) => ({ b, j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
          .filter(({ j, d }) => j !== i && d < UNION)
          .sort((p, q) => p.d - q.d)
          .slice(0, VECINAS)
          .forEach(({ b, j, d }) => {
            const clave = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (unidas.has(clave)) return;
            unidas.add(clave);
            ctx.strokeStyle = `rgba(${colores.tinta},${(1 - d / UNION) * Math.min(a.luz, b.luz) * 0.45})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          });
      });

      visibles.forEach(({ e, x, y, luz }) => {
        const titilar = quieto ? 0.8 : 0.55 + 0.45 * Math.sin((t / 1000) * e.ritmo + e.fase);
        const alfa = Math.min(1, (0.2 + 0.6 * e.z) * titilar + luz * 0.6);
        if (e.r > 1.6 || luz > 0.35) {
          pintarEstrella(x, y, e.r * 4 + luz * 9, colores[e.tono], alfa);
        } else {
          ctx.fillStyle = `rgba(${colores[e.tono]},${alfa})`;
          ctx.beginPath();
          ctx.arc(x, y, e.r, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      if (quieto) return;

      proximaFugaz -= dt;
      if (proximaFugaz <= 0) {
        fugaces.push({
          x: ancho * (0.3 + Math.random() * 0.7),
          y: alto * Math.random() * 0.35,
          vx: -(0.55 + Math.random() * 0.35),
          vy: 0.22 + Math.random() * 0.16,
          vida: 1,
          giro: 0,
        });
        proximaFugaz = 3500 + Math.random() * 5500;
      }
      fugaces = fugaces.filter((f) => {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.giro += dt / 120;
        f.vida -= dt / 1400;
        if (f.vida <= 0) return false;
        const rapidez = Math.hypot(f.vx, f.vy);
        const colaX = f.x - (f.vx / rapidez) * 150;
        const colaY = f.y - (f.vy / rapidez) * 150;
        const cola = ctx.createLinearGradient(f.x, f.y, colaX, colaY);
        cola.addColorStop(0, `rgba(${colores.brillo},${0.9 * f.vida})`);
        cola.addColorStop(1, `rgba(${colores.brillo},0)`);
        ctx.strokeStyle = cola;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(colaX, colaY);
        ctx.stroke();
        pintarEstrella(f.x, f.y, 11, colores.estrella, f.vida, f.giro);
        return true;
      });
    };

    const animar = (t) => {
      dibujar(t);
      cuadro = requestAnimationFrame(animar);
    };

    const alMover = (evento) => {
      const caja = canvas.getBoundingClientRect();
      puntero.x = evento.clientX - caja.left;
      puntero.y = evento.clientY - caja.top;
      puntero.visto = performance.now();
    };

    leerColores();
    sembrar();
    if (quieto) {
      dibujar(0);
    } else {
      window.addEventListener('pointermove', alMover, { passive: true });
      cuadro = requestAnimationFrame((t) => {
        previo = t;
        animar(t);
      });
    }

    // Al cambiar de tamano se vuelve a sembrar; al cambiar de tema, solo los colores.
    const tamano = new ResizeObserver(() => {
      sembrar();
      if (quieto) dibujar(0);
    });
    tamano.observe(canvas);
    const tema = new MutationObserver(() => {
      leerColores();
      if (quieto) dibujar(0);
    });
    tema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener('pointermove', alMover);
      tamano.disconnect();
      tema.disconnect();
    };
  }, [lienzoRef, quieto]);
}

const MANCHAS = [
  {
    lugar: { left: '-12%', top: '-18%', width: '58vw', height: '46vw' },
    color: '--color-galaxy',
    alfa: 0.45,
    dur: 22,
    recorrido: ['translate(0vw, 0vh) scale(1)', 'translate(12vw, 8vh) scale(1.15)', 'translate(4vw, 18vh) scale(0.95)'],
  },
  {
    lugar: { right: '-14%', top: '8%', width: '46vw', height: '40vw' },
    color: '--color-amber',
    alfa: 0.35,
    dur: 26,
    recorrido: ['translate(0vw, 0vh) scale(1)', 'translate(-10vw, 12vh) scale(0.9)', 'translate(-4vw, -6vh) scale(1.1)'],
  },
  {
    lugar: { left: '18%', bottom: '-22%', width: '62vw', height: '36vw' },
    color: '--color-blue',
    alfa: 0.22,
    dur: 30,
    recorrido: ['translate(0vw, 0vh) scale(1)', 'translate(8vw, -10vh) scale(1.2)', 'translate(-6vw, -4vh) scale(1)'],
  },
];

// La aurora: manchas difusas que se desplazan despacio y, todas juntas, se
// inclinan un poco hacia el lado contrario del puntero.
function Aurora({ quieto }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const suaveX = useSpring(x, { stiffness: 40, damping: 20 });
  const suaveY = useSpring(y, { stiffness: 40, damping: 20 });

  useEffect(() => {
    if (quieto) return undefined;
    const mover = (evento) => {
      x.set((evento.clientX / window.innerWidth - 0.5) * -40);
      y.set((evento.clientY / window.innerHeight - 0.5) * -30);
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => window.removeEventListener('pointermove', mover);
  }, [quieto, x, y]);

  return (
    <motion.div className="pointer-events-none absolute inset-0" style={{ x: suaveX, y: suaveY }} aria-hidden="true">
      {MANCHAS.map((m) => (
        <motion.div
          key={m.color}
          className="absolute rounded-full blur-3xl"
          style={{ ...m.lugar, backgroundColor: `rgb(var(${m.color}) / ${m.alfa})` }}
          animate={quieto ? undefined : { transform: m.recorrido }}
          transition={{ duration: m.dur, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        />
      ))}
    </motion.div>
  );
}

export default function BackgroundStars({ children }) {
  const quieto = useReducedMotion();
  const lienzo = useRef(null);
  useCieloVivo(lienzo, quieto);

  return (
    <div className="relative isolate min-h-screen w-full overflow-hidden bg-gradient-to-b from-[rgb(var(--color-galaxy))]/40 via-[rgb(var(--color-card))] to-[rgb(var(--color-bg))] pt-28 pb-5">
      <Aurora quieto={quieto} />
      <canvas ref={lienzo} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
      <motion.div
        className="relative z-10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}
