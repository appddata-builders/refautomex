'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CloseButton, Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { BellIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/app/lib/text/text-provider';
import {
  FaltaPermiso, alCambiarPendiente, obtenerIdToken, respaldarAhora, respaldoPendiente,
} from '@/app/lib/respaldo-diario';

// Sin ventanas emergentes ni sonido: solo el numero en la campana. Se revisa
// al cargar, cada 5 minutos con la pestana visible y al abrirla.
const CADA_MS = 5 * 60_000;

const PUNTO = {
  alta: 'bg-rose-500',
  media: 'bg-amber-500',
  info: 'bg-sky-500',
};

const llamarAvisos = async (opciones = {}) => {
  const token = await obtenerIdToken();
  const respuesta = await fetch('/api/avisos', {
    ...opciones,
    cache: 'no-store',
    headers: { ...(opciones.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
  return respuesta.json();
};

const textoNombres = ({ nombres = [], extra = 0 }) =>
  `${nombres.join(', ')}${extra > 0 ? ` +${extra}` : ''}`;

// Monta solo con el panel abierto: abrir la campana cuenta como ver los avisos.
function AlAbrir({ alAbrir }) {
  useEffect(() => {
    alAbrir();
  }, [alAbrir]);
  return null;
}

export default function NotificationBell({ lang }) {
  const { t } = useTranslation();
  const [avisos, setAvisos] = useState([]);
  const [perfil, setPerfil] = useState(null);
  const [cargado, setCargado] = useState(false);
  const [fallo, setFallo] = useState(false);
  // Firmas que se marcaron como vistas en esta sesion: apagan el numero al
  // momento, sin esperar a la siguiente consulta.
  const [vistos, setVistos] = useState(() => new Set());
  const [respaldo, setRespaldo] = useState(null);
  const [respaldando, setRespaldando] = useState(false);
  const pidiendo = useRef(null);

  const cargar = useCallback(() => {
    pidiendo.current ??= llamarAvisos()
      .then((datos) => {
        setAvisos(datos.avisos || []);
        setPerfil(datos.perfil || null);
        setFallo(false);
        return datos.avisos || [];
      })
      .catch((error) => {
        console.error('Error al leer avisos:', error);
        setFallo(true);
        return null;
      })
      .finally(() => {
        setCargado(true);
        pidiendo.current = null;
      });
    return pidiendo.current;
  }, []);

  useEffect(() => {
    cargar();
    setRespaldo(respaldoPendiente());
    const quitar = alCambiarPendiente(setRespaldo);
    const id = setInterval(() => {
      if (!document.hidden) cargar();
    }, CADA_MS);
    return () => {
      clearInterval(id);
      quitar();
    };
  }, [cargar]);

  const alAbrir = useCallback(async () => {
    const actuales = await cargar();
    const nuevos = (actuales || []).filter((a) => a.nuevo);
    if (!nuevos.length) return;
    setVistos((prev) => new Set([...prev, ...nuevos.map((a) => `${a.clave}:${a.firma}`)]));
    try {
      await llamarAvisos({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vistos: nuevos.map(({ clave, firma }) => ({ clave, firma })) }),
      });
    } catch (error) {
      console.error('Error al marcar avisos:', error);
    }
  }, [cargar]);

  const resolverRespaldo = async () => {
    setRespaldando(true);
    try {
      await respaldarAhora({ pedirPermiso: true });
    } catch (error) {
      setRespaldo(error instanceof FaltaPermiso ? 'permiso' : 'error');
    } finally {
      setRespaldando(false);
    }
  };

  const conRespaldo = perfil === 'admin' && Boolean(respaldo);
  const sinVer = avisos.filter((a) => a.nuevo && !vistos.has(`${a.clave}:${a.firma}`)).length
    + (conRespaldo ? 1 : 0);

  const textos = (aviso) => {
    const datos = { ...aviso.datos, nombres: textoNombres(aviso.datos || {}) };
    return {
      titulo: t(`panel.notices.${aviso.clave}.title`, datos),
      detalle: t(`panel.notices.${aviso.clave}.detail`, datos),
    };
  };

  const filaClase = 'flex w-full gap-3 px-4 py-3 text-left';

  return (
    <Popover className="relative">
      <PopoverButton
        className="relative my-auto mr-3 rounded-full p-1.5 text-[rgb(var(--color-gray-base))] bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))] outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-text))]/60"
        aria-label={sinVer ? t('panel.notices.openWithCount', { n: sinVer }) : t('panel.notices.open')}
      >
        <BellIcon className="h-6 w-6 2xl:h-8 2xl:w-8" aria-hidden="true" />
        {sinVer > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {sinVer > 9 ? '9+' : sinVer}
          </span>
        )}
      </PopoverButton>

      <PopoverPanel
        anchor={{ to: 'bottom end', gap: 10, padding: 16 }}
        className="z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow-xl"
      >
        <AlAbrir alAbrir={alAbrir} />
        <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
          <p className="text-sm font-semibold">{t('panel.notices.title')}</p>
        </div>

        <ul className="max-h-[70vh] divide-y divide-[rgb(var(--color-border))] overflow-y-auto">
          {conRespaldo && (
            <li className={filaClase}>
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO.alta}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t('panel.notices.backup.title')}</p>
                <p className="text-xs opacity-75">
                  {t({ carpeta: 'panel.backups.pendingFolder', permiso: 'panel.backups.pendingPermission' }[respaldo] ?? 'panel.backups.pendingError')}
                </p>
                <div className="mt-2">
                  {respaldo === 'carpeta' ? (
                    <CloseButton
                      as={Link}
                      href={`/productivity?load=backups&lang=${lang}`}
                      className="inline-flex rounded-full bg-[rgb(var(--color-refautomex))] px-3 py-1 text-xs font-semibold text-black"
                    >
                      {t('panel.backups.goToBackups')}
                    </CloseButton>
                  ) : (
                    <button
                      type="button"
                      onClick={resolverRespaldo}
                      disabled={respaldando}
                      className="inline-flex rounded-full bg-[rgb(var(--color-refautomex))] px-3 py-1 text-xs font-semibold text-black disabled:opacity-60"
                    >
                      {respaldando
                        ? t('panel.backups.working')
                        : respaldo === 'permiso' ? t('panel.backups.authorize') : t('panel.backups.retry')}
                    </button>
                  )}
                </div>
              </div>
            </li>
          )}

          {avisos.map((aviso) => {
            const { titulo, detalle } = textos(aviso);
            const contenido = (
              <>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO[aviso.nivel] || PUNTO.info}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {titulo}
                    {aviso.nuevo && (
                      <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-700">
                        {t('panel.notices.new')}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs opacity-75">{detalle}</span>
                </span>
              </>
            );
            return (
              <li key={aviso.clave}>
                {aviso.modulo ? (
                  <CloseButton
                    as={Link}
                    href={`/productivity?load=${aviso.modulo}&lang=${lang}`}
                    className={`${filaClase} transition hover:bg-[rgb(var(--color-bg))]`}
                  >
                    {contenido}
                  </CloseButton>
                ) : (
                  <div className={filaClase}>{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>

        {!conRespaldo && avisos.length === 0 && (
          <p className="px-4 py-6 text-sm opacity-70">
            {!cargado ? t('panel.notices.loading') : fallo ? t('panel.notices.loadError') : t('panel.notices.empty')}
          </p>
        )}
      </PopoverPanel>
    </Popover>
  );
}
