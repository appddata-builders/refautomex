'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LuDatabaseBackup } from 'react-icons/lu';
import { TbDatabaseExport, TbDatabaseImport } from 'react-icons/tb';
import Title from './title';
import { useTranslation } from '@/app/lib/text/text-provider';
import {
  ARCHIVO_RESPALDO, HORA_RESPALDO, alCambiarRespaldo, carpetaGuardada,
  elegirCarpeta, llamarRespaldos, respaldarAhora, soportaCarpeta, ultimoRespaldo,
} from '@/app/lib/respaldo-diario';

const tarjeta = 'rounded-2xl sm:rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/70 p-4 sm:p-6 shadow-md';
const botonPrincipal = 'inline-flex items-center justify-center gap-2 rounded-full bg-[rgb(var(--color-refautomex))] px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-60';
const botonSecundario = 'inline-flex items-center justify-center gap-2 rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-text))] disabled:opacity-60';
const celda = 'px-3 py-2 text-left';

const tamano = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

export default function Backups() {
  const { t } = useTranslation();
  const lang = useSearchParams().get('lang') || 'es';

  // -------------------------------------------------------- respaldo diario
  const [carpeta, setCarpeta] = useState(null);
  const [ultimo, setUltimo] = useState(null);
  const [respaldando, setRespaldando] = useState(false);
  const [avisoDiario, setAvisoDiario] = useState(null);
  const conCarpeta = soportaCarpeta();

  useEffect(() => {
    setUltimo(ultimoRespaldo());
    carpetaGuardada().then(setCarpeta).catch(() => setCarpeta(null));
    return alCambiarRespaldo(setUltimo);
  }, []);

  // A las 3 pm se sobrescribe aunque en la manana se haya respaldado a mano.
  const proximo = new Date().getHours() >= HORA_RESPALDO
    ? t('panel.backups.tomorrow3pm')
    : t('panel.backups.today3pm');

  const escoger = async () => {
    try {
      setCarpeta(await elegirCarpeta());
      setAvisoDiario(null);
    } catch (error) {
      if (error?.name !== 'AbortError') setAvisoDiario({ tipo: 'error', texto: error.message });
    }
  };

  const respaldar = async () => {
    setRespaldando(true);
    setAvisoDiario(null);
    try {
      const info = await respaldarAhora({ pedirPermiso: true });
      setAvisoDiario({ tipo: 'ok', texto: `${t('panel.backups.saved')} ${info.destino} (${tamano(info.bytes)})` });
    } catch (error) {
      setAvisoDiario({ tipo: 'error', texto: error.message });
    } finally {
      setRespaldando(false);
    }
  };

  // ------------------------------------------------------------- cargar CSV
  const [archivo, setArchivo] = useState(null);
  const [revision, setRevision] = useState(null);
  const [procesando, setProcesando] = useState(null);
  const [avisoCarga, setAvisoCarga] = useState(null);

  const enviar = async (modo) => {
    const texto = await archivo.text();
    const respuesta = await llamarRespaldos(
      { method: 'POST', headers: { 'Content-Type': 'text/csv; charset=utf-8' }, body: texto },
      modo
    );
    return respuesta.json();
  };

  const revisar = async () => {
    setProcesando('revisar');
    setRevision(null);
    setAvisoCarga(null);
    try {
      setRevision(await enviar('revisar'));
    } catch (error) {
      setAvisoCarga({ tipo: 'error', texto: error.message });
    } finally {
      setProcesando(null);
    }
  };

  const totales = (revision?.tablas || []).reduce(
    (s, x) => ({ nuevos: s.nuevos + (x.nuevos || 0), cambiados: s.cambiados + (x.cambiados || 0) }),
    { nuevos: 0, cambiados: 0 }
  );
  const hayQueAplicar = revision && !revision.totalErrores && totales.nuevos + totales.cambiados > 0;

  const aplicar = async () => {
    const confirmado = window.confirm(
      `${t('panel.backups.confirmApply')}\n\n${t('panel.backups.new')}: ${totales.nuevos}\n${t('panel.backups.changed')}: ${totales.cambiados}`
    );
    if (!confirmado) return;
    setProcesando('aplicar');
    setAvisoCarga(null);
    try {
      await enviar('aplicar');
      setAvisoCarga({ tipo: 'ok', texto: `${t('panel.backups.applied')}: ${totales.nuevos} ${t('panel.backups.new').toLowerCase()}, ${totales.cambiados} ${t('panel.backups.changed').toLowerCase()}.` });
      setRevision(null);
      setArchivo(null);
    } catch (error) {
      setAvisoCarga({ tipo: 'error', texto: error.message });
    } finally {
      setProcesando(null);
    }
  };

  const Aviso = ({ aviso }) => aviso && (
    <p className={`mt-4 rounded-md px-3 py-2 text-sm ${aviso.tipo === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
      {aviso.texto}
    </p>
  );

  return (
    <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-galaxy))] pt-28 pb-16">
      <Title title={t('panel.backups.title')} back={t('panel.backups.back')} path={`/productivity?load=home&lang=${lang}`} icon={LuDatabaseBackup} />

      <div className="mx-auto mt-6 max-w-5xl space-y-6 px-4 sm:px-6 text-[rgb(var(--color-text))]">
        {/* ------------------------------------------------ respaldo diario */}
        <section className={tarjeta}>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <TbDatabaseExport className="h-5 w-5" aria-hidden="true" /> {t('panel.backups.dailyTitle')}
          </h2>
          <p className="mt-2 text-sm opacity-80">{t('panel.backups.scheduleHelp')}</p>
          {conCarpeta && <p className="mt-2 text-sm opacity-80">{t('panel.backups.persistTip')}</p>}
          {!conCarpeta && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('panel.backups.noFolderSupport')}</p>
          )}

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-semibold">{t('panel.backups.folder')}</dt>
              <dd className="opacity-80">{conCarpeta ? (carpeta?.name || t('panel.backups.noFolder')) : t('panel.backups.downloads')}</dd>
              <dd className="text-xs opacity-60">{ARCHIVO_RESPALDO}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t('panel.backups.last')}</dt>
              <dd className="opacity-80">
                {ultimo
                  ? `${new Date(ultimo.momento).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })} · ${tamano(ultimo.bytes)}`
                  : t('panel.backups.never')}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">{t('panel.backups.next')}</dt>
              <dd className="opacity-80">{proximo}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap gap-3">
            {conCarpeta && (
              <button type="button" onClick={escoger} className={botonSecundario}>
                {carpeta ? t('panel.backups.changeFolder') : t('panel.backups.pickFolder')}
              </button>
            )}
            <button
              type="button"
              onClick={respaldar}
              disabled={respaldando || (conCarpeta && !carpeta)}
              className={botonPrincipal}
            >
              {respaldando ? t('panel.backups.working') : t('panel.backups.backupNow')}
            </button>
          </div>
          <Aviso aviso={avisoDiario} />
        </section>

        {/* ------------------------------------------------------ cargar CSV */}
        <section className={tarjeta}>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <TbDatabaseImport className="h-5 w-5" aria-hidden="true" /> {t('panel.backups.restoreTitle')}
          </h2>
          <p className="mt-2 text-sm opacity-80">{t('panel.backups.restoreHelp')}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className={`${botonSecundario} cursor-pointer`}>
              {t('panel.backups.pickFile')}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  setArchivo(e.target.files?.[0] || null);
                  setRevision(null);
                  setAvisoCarga(null);
                }}
              />
            </label>
            {archivo && <span className="text-sm opacity-80">{archivo.name} · {tamano(archivo.size)}</span>}
            <button type="button" onClick={revisar} disabled={!archivo || procesando} className={botonPrincipal}>
              {procesando === 'revisar' ? t('panel.backups.reviewing') : t('panel.backups.review')}
            </button>
          </div>
          <Aviso aviso={avisoCarga} />

          {revision && (
            <div className="mt-6 space-y-6">
              {revision.avisos?.map((a) => (
                <p key={a} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{a}</p>
              ))}

              {revision.totalErrores > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <p className="font-semibold">{t('panel.backups.errorsTitle')} ({revision.totalErrores})</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {revision.errores.map((e, i) => (
                      <li key={i}>
                        <strong>{e.tabla}</strong>
                        {e.llave ? ` · ${t('panel.backups.record')} ${e.llave}` : ''}
                        {e.columna ? ` · ${e.columna}` : ''}
                        {e.valor !== undefined ? ` · "${e.valor}"` : ''} — {e.mensaje}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[rgb(var(--color-bg))]">
                    <tr>
                      <th className={celda}>{t('panel.backups.table')}</th>
                      <th className={celda}>{t('panel.backups.rows')}</th>
                      <th className={celda}>{t('panel.backups.new')}</th>
                      <th className={celda}>{t('panel.backups.changed')}</th>
                      <th className={celda}>{t('panel.backups.unchanged')}</th>
                      <th className={celda} title={t('panel.backups.onlyDbHelp')}>{t('panel.backups.onlyDb')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revision.tablas.map((x) => (
                      <tr key={x.tabla} className="border-t border-[rgb(var(--color-border))]">
                        <td className={`${celda} font-semibold`}>{x.tabla}</td>
                        <td className={celda}>{x.filas}</td>
                        <td className={`${celda} ${x.nuevos ? 'font-bold text-green-700' : ''}`}>{x.conErrores ? '—' : x.nuevos}</td>
                        <td className={`${celda} ${x.cambiados ? 'font-bold text-amber-700' : ''}`}>{x.conErrores ? '—' : x.cambiados}</td>
                        <td className={celda}>{x.conErrores ? '—' : x.sinCambio}</td>
                        <td className={celda}>{x.conErrores ? '—' : x.soloEnBase}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs opacity-60">{t('panel.backups.onlyDbHelp')}</p>

              {revision.cambios.length > 0 && (
                <div>
                  <h3 className="font-semibold">{t('panel.backups.changes')} ({revision.totalCambios})</h3>
                  <div className="mt-2 max-h-96 overflow-auto rounded-xl border border-[rgb(var(--color-border))]">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-[rgb(var(--color-bg))]">
                        <tr>
                          <th className={celda}>{t('panel.backups.table')}</th>
                          <th className={celda}>{t('panel.backups.record')}</th>
                          <th className={celda}>{t('panel.backups.field')}</th>
                          <th className={celda}>{t('panel.backups.before')}</th>
                          <th className={celda}>{t('panel.backups.after')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revision.cambios.map((c, i) => (
                          <tr key={i} className="border-t border-[rgb(var(--color-border))]">
                            <td className={celda}>{c.tabla}</td>
                            <td className={celda}>{c.llave}</td>
                            <td className={celda}>{c.columna}</td>
                            <td className={`${celda} text-red-700 line-through`}>{c.antes ?? t('panel.backups.empty')}</td>
                            <td className={`${celda} text-green-700`}>{c.despues ?? t('panel.backups.empty')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {revision.totalCambios > revision.cambios.length && (
                    <p className="mt-2 text-xs opacity-60">
                      {revision.totalCambios - revision.cambios.length} {t('panel.backups.moreChanges')}
                    </p>
                  )}
                </div>
              )}

              {!revision.totalErrores && !hayQueAplicar && (
                <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{t('panel.backups.noChanges')}</p>
              )}

              {hayQueAplicar && (
                <button type="button" onClick={aplicar} disabled={!!procesando} className={botonPrincipal}>
                  {procesando === 'aplicar' ? t('panel.backups.applying') : t('panel.backups.apply')}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
