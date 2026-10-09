'use client';
import { useEffect } from 'react';
import {
  FaltaCarpeta, FaltaPermiso, marcarRespaldoPendiente, respaldarAhora, tocaRespaldo,
} from '@/app/lib/respaldo-diario';

/**
 * Hace el respaldo diario de las 3 pm (ver respaldo-diario.js). Va montado en
 * todo el panel, no solo en la pantalla de Respaldos: el administrador puede
 * estar vendiendo a esa hora y el respaldo igual tiene que salir.
 *
 * Revisa cada minuto si ya dieron las 3 pm desde la revision anterior; al
 * montarse no hace nada, para no pedir el respaldo al iniciar sesion. No pinta
 * nada: si falla, lo deja pendiente y la campana de avisos lo muestra con el
 * boton para resolverlo (autorizar la carpeta solo se puede con un clic).
 */
export default function BackupScheduler() {
  useEffect(() => {
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
      } catch (error) {
        if (error instanceof FaltaCarpeta) marcarRespaldoPendiente('carpeta');
        else if (error instanceof FaltaPermiso) marcarRespaldoPendiente('permiso');
        else marcarRespaldoPendiente('error');
      } finally {
        corriendo = false;
      }
    };

    const id = setInterval(revisar, 60_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
