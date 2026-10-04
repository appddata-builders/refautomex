'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LuDatabaseBackup } from 'react-icons/lu';
import { useTranslation } from '@/app/lib/text/text-provider';
import {
  FaltaCarpeta, FaltaPermiso, respaldarAhora, tocaRespaldo,
} from '@/app/lib/respaldo-diario';

/**
 * Hace el respaldo diario de las 3 pm (ver respaldo-diario.js). Va montado en
 * todo el panel, no solo en la pantalla de Respaldos: el administrador puede
 * estar vendiendo a esa hora y el respaldo igual tiene que salir.
 *
 * Revisa cada minuto si ya dieron las 3 pm desde la revision anterior; al
 * montarse no hace nada, para no pedir el respaldo al iniciar sesion. Si a esa
 * hora el navegador pide volver a autorizar la carpeta, eso solo se puede
 * pedir con un clic: aparece un aviso con el boton.
 */
export default function BackupScheduler() {
  const { t } = useTranslation();
  const [pendiente, setPendiente] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    let vivo = true;
    let corriendo = false;
    let anterior = new Date();

    const revisar = async () => {
      const ahora = new Date();
      const toca = tocaRespaldo(anterior, ahora);
      anterior = ahora;
      if (corriendo || !toca) return;
      corriendo = true;
      try {
        await respaldarAhora();
        if (vivo) setPendiente(null);
      } catch (error) {
        if (!vivo) return;
        if (error instanceof FaltaCarpeta) setPendiente('carpeta');
        else if (error instanceof FaltaPermiso) setPendiente('permiso');
        else setPendiente('error');
      } finally {
        corriendo = false;
      }
    };

    const id = setInterval(revisar, 60_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  if (!pendiente) return null;

  const autorizar = async () => {
    setTrabajando(true);
    try {
      await respaldarAhora({ pedirPermiso: true });
      setPendiente(null);
    } catch (error) {
      setPendiente(error instanceof FaltaPermiso ? 'permiso' : 'error');
    } finally {
      setTrabajando(false);
    }
  };

  const mensaje = {
    carpeta: t('panel.backups.pendingFolder'),
    permiso: t('panel.backups.pendingPermission'),
    error: t('panel.backups.pendingError'),
  }[pendiente];

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-xl print:hidden">
      <div className="flex items-start gap-3">
        <LuDatabaseBackup className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--color-refautomex))]" aria-hidden="true" />
        <div className="text-sm text-[rgb(var(--color-text))]">
          <p>{mensaje}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendiente === 'carpeta' ? (
              <Link
                href="/productivity?load=backups"
                className="rounded-full bg-[rgb(var(--color-refautomex))] px-3 py-1.5 font-semibold text-white"
              >
                {t('panel.backups.goToBackups')}
              </Link>
            ) : (
              <button
                type="button"
                onClick={autorizar}
                disabled={trabajando}
                className="rounded-full bg-[rgb(var(--color-refautomex))] px-3 py-1.5 font-semibold text-white disabled:opacity-60"
              >
                {trabajando
                  ? t('panel.backups.working')
                  : pendiente === 'permiso' ? t('panel.backups.authorize') : t('panel.backups.retry')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPendiente(null)}
              className="rounded-full border border-[rgb(var(--color-border))] px-3 py-1.5"
            >
              {t('panel.backups.dismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
