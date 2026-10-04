'use client';

import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import esLocale from '@fullcalendar/core/locales/es';
import {
  FiBarChart2, FiCalendar, FiChevronLeft, FiChevronRight, FiLock, FiPackage, FiSun, FiTag, FiTrendingUp, FiUsers,
} from 'react-icons/fi';
import { LuSparkles } from 'react-icons/lu';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { AuthContext } from '@/app/lib/auth-tracker';
import { useTranslation } from '@/app/lib/text/text-provider';
import { obtenerIdToken } from '@/app/lib/respaldo-diario';
import { perfilDeCategoria } from '@/app/lib/permisos-menu';
import { ETIQUETAS_CALENDARIO } from '@/app/lib/calendario';

// Azul, morada, roja y amarilla. `hex` es el color fuerte (punto y borde) y
// `fondo` el tono claro del evento, para que el texto oscuro se lea.
const ESTILO_ETIQUETA = {
  convivencia: {
    texto: 'labelConvivencia',
    icon: FiUsers,
    hex: '#3b82f6',
    fondo: '#93c5fd',
    cardClass: 'bg-blue-50',
    badgeClass: 'bg-blue-400 text-blue-950',
    ringClass: 'ring-blue-200',
    borderClass: 'border-blue-200',
    summaryClass: 'bg-blue-50',
  },
  mejoras: {
    texto: 'labelMejoras',
    icon: FiTrendingUp,
    hex: '#a855f7',
    fondo: '#d8b4fe',
    cardClass: 'bg-purple-50',
    badgeClass: 'bg-purple-400 text-purple-950',
    ringClass: 'ring-purple-200',
    borderClass: 'border-purple-200',
    summaryClass: 'bg-purple-50',
  },
  analisis: {
    texto: 'labelAnalisis',
    icon: FiBarChart2,
    hex: '#ef4444',
    fondo: '#fca5a5',
    cardClass: 'bg-red-50',
    badgeClass: 'bg-red-400 text-red-950',
    ringClass: 'ring-red-200',
    borderClass: 'border-red-200',
    summaryClass: 'bg-red-50',
  },
  seguimiento: {
    texto: 'labelSeguimiento',
    icon: FiPackage,
    hex: '#eab308',
    fondo: '#fde047',
    cardClass: 'bg-yellow-50',
    badgeClass: 'bg-yellow-400 text-yellow-950',
    ringClass: 'ring-yellow-200',
    borderClass: 'border-yellow-200',
    summaryClass: 'bg-yellow-50',
  },
};

const GUARDAR_TRAS_MS = 400;

// Vacaciones en verde, aparte de las cuatro etiquetas. Las de otros (lo que ve
// el admin) en un tono mas claro.
const VACACION = { hex: '#10b981', fondo: '#6ee7b7', fondoOtros: '#d1fae5' };

const formatDate = (date) => new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
const formatMonth = (date) => new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date);
const formatYear = (date) => new Intl.DateTimeFormat('es-MX', { year: 'numeric' }).format(date);
const toDateKey = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const date = new Date(value);
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
};
const toDateFromKey = (key) => new Date(`${key}T00:00:00`);
const getDayKeyFromClick = (clickInfo) => {
  if (!clickInfo) return null;
  const target = clickInfo.jsEvent?.target;
  const direct = target?.closest?.('[data-date]')?.getAttribute('data-date');
  if (direct) return direct;
  if (typeof document !== 'undefined' && clickInfo.jsEvent?.clientX != null) {
    const elements = document.elementsFromPoint(clickInfo.jsEvent.clientX, clickInfo.jsEvent.clientY);
    const dayEl = elements.find((el) => el instanceof HTMLElement && el.hasAttribute('data-date'));
    if (dayEl) return dayEl.getAttribute('data-date');
  }
  return toDateKey(clickInfo.event?.start);
};
const addDaysKey = (key, days) => {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};
const getEventRange = (event) => {
  const startKey = toDateKey(event.start);
  const endKey = event.end ? toDateKey(event.end) : addDaysKey(startKey, 1);
  return { startKey, endKey };
};
const isDayInEvent = (event, dayKey) => {
  const { startKey, endKey } = getEventRange(event);
  return dayKey >= startKey && dayKey < endKey;
};
const formatRange = (event) => {
  const { startKey, endKey } = getEventRange(event);
  const lastKey = addDaysKey(endKey, -1);
  const first = formatDate(toDateFromKey(startKey));
  return lastKey === startKey ? first : `${first} – ${formatDate(toDateFromKey(lastKey))}`;
};
const createId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const normalizeBranchId = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};
const isWebBranch = (value) => {
  const normalized = normalizeBranchId(value);
  if (!normalized) return false;
  const upper = normalized.toUpperCase();
  return upper === '1' || upper === 'WEB';
};

// Las etiquetas son fijas; su titulo y su descripcion salen de la base.
const buildLabels = (t) => ETIQUETAS_CALENDARIO.map((id) => {
  const estilo = ESTILO_ETIQUETA[id];
  return {
    ...estilo,
    id,
    title: t(`panel.calendar.${estilo.texto}`),
    description: t(`panel.calendar.${estilo.texto}Desc`),
    color: estilo.hex,
  };
});

// En la base `fin` es el ultimo dia (inclusivo); FullCalendar usa el dia
// siguiente (exclusivo) y nada si es de un solo dia.
const desdeServidor = (e) => ({
  id: e.id,
  labelId: e.etiqueta,
  title: e.titulo,
  note: e.nota || '',
  start: e.inicio,
  end: e.fin > e.inicio ? addDaysKey(e.fin, 1) : undefined,
  allDay: true,
});

const llamarCalendario = async (metodo, { idsucursal, eventos } = {}) => {
  const token = await obtenerIdToken();
  const lectura = metodo === 'GET';
  const respuesta = await fetch(
    lectura ? `/api/calendario?idsucursal=${encodeURIComponent(idsucursal ?? '')}` : '/api/calendario',
    {
      method: metodo,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(lectura ? {} : { 'Content-Type': 'application/json' }),
      },
      body: lectura ? undefined : JSON.stringify({ idsucursal, eventos }),
    }
  );
  if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
  return respuesta.json();
};

// El cuerpo del error viaja en `datos`: ahi viene cuantos dias le quedan.
const llamarVacaciones = async (metodo, { query = '', body } = {}) => {
  const token = await obtenerIdToken();
  const respuesta = await fetch(`/api/vacaciones${query}`, {
    method: metodo,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw Object.assign(new Error(datos.error || `Error ${respuesta.status}`), { datos });
  return datos;
};

/**
 * Calendario de cada sucursal: las juntas de avance y demas fechas del ano.
 * Lo arma un admin (arrastrar etiquetas, seleccionar dias, editar titulo y
 * notas) y cada cambio se guarda solo en `calendario_evento`. El empleado lo
 * ve en solo lectura y solo el de su sucursal; /api/calendario lo exige.
 *
 * Aparte, cada quien marca sus dias de vacaciones (modo "Marcar vacaciones")
 * contra los dias que le asigno un admin en Permisos; ver /api/vacaciones.
 */
export default function CalendarPlanner() {
  const { t } = useTranslation();
  const labels = useMemo(() => buildLabels(t), [t]);
  const calendarRef = useRef(null);
  const dragZoneRef = useRef(null);

  const [events, setEvents] = useState([]);
  const [calendarView, setCalendarView] = useState('dayGridMonth');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [seleccion, setSeleccion] = useState(null);
  const [borrador, setBorrador] = useState({ title: '', note: '' });
  const [activeLabelId, setActiveLabelId] = useState(ETIQUETAS_CALENDARIO[0]);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesReady, setBranchesReady] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [branchInitialized, setBranchInitialized] = useState(false);
  const [carga, setCarga] = useState('cargando');
  const [intentoCarga, setIntentoCarga] = useState(0);
  const [guardado, setGuardado] = useState('idle');
  const [vacaciones, setVacaciones] = useState({ hoy: null, anios: {}, dias: [], sucursal: [] });
  const [modoVacaciones, setModoVacaciones] = useState(false);
  const [vacGuardando, setVacGuardando] = useState(false);
  const [vacAviso, setVacAviso] = useState(null);
  const isYearView = calendarView === 'multiMonthQuarter';
  const { userData } = useContext(AuthContext);
  const userBranchId = normalizeBranchId(userData?.idsucursal);
  const canEdit = perfilDeCategoria(userData?.categoria) === 'admin';

  // Lo que se esta mostrando y a que sucursal pertenece, para los callbacks
  // que corren despues de un render (temporizador, FullCalendar).
  const eventsRef = useRef(events);
  const sucursalRef = useRef(selectedBranch);
  const pendienteRef = useRef(null);
  const temporizadorRef = useRef(null);
  const enVueloRef = useRef(false);

  const labelMap = useMemo(() => Object.fromEntries(labels.map((label) => [label.id, label])), [labels]);

  // ---------------------------------------------------------------- guardar

  // Manda la ultima version pendiente. Si llegan cambios mientras se guarda,
  // salen al terminar; si falla, se conserva para "Reintentar" o el siguiente
  // cambio. Solo usa refs, asi que sirve igual desde un render viejo.
  const guardarPendiente = async () => {
    clearTimeout(temporizadorRef.current);
    if (enVueloRef.current || !pendienteRef.current) return;
    const envio = pendienteRef.current;
    pendienteRef.current = null;
    enVueloRef.current = true;
    setGuardado('guardando');
    let ok = false;
    try {
      await llamarCalendario('PUT', envio);
      ok = true;
    } catch (error) {
      console.error('Error al guardar el calendario:', error);
      pendienteRef.current ??= envio;
      setGuardado('error');
    } finally {
      enVueloRef.current = false;
    }
    if (ok) {
      if (pendienteRef.current) guardarPendiente();
      else setGuardado('guardado');
    }
  };

  const haciaServidor = (ev) => {
    const { startKey, endKey } = getEventRange(ev);
    return {
      id: ev.id,
      etiqueta: ev.labelId,
      titulo: (ev.title || '').trim().slice(0, 120) || labelMap[ev.labelId]?.title || '—',
      nota: ev.note?.trim() ? ev.note.trim().slice(0, 500) : null,
      inicio: startKey,
      fin: addDaysKey(endKey, -1),
    };
  };

  const cambiarEventos = (cambio) => {
    if (!canEdit || !sucursalRef.current) return;
    const siguientes = cambio(eventsRef.current);
    eventsRef.current = siguientes;
    setEvents(siguientes);
    pendienteRef.current = { idsucursal: sucursalRef.current, eventos: siguientes.map(haciaServidor) };
    setGuardado('guardando');
    clearTimeout(temporizadorRef.current);
    temporizadorRef.current = setTimeout(guardarPendiente, GUARDAR_TRAS_MS);
  };

  // Lo pendiente sale aunque se cambie de pantalla; si se cierra la pestana
  // antes de guardar, el navegador pregunta.
  useEffect(() => {
    const avisar = (e) => {
      if (!pendienteRef.current && !enVueloRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => {
      window.removeEventListener('beforeunload', avisar);
      guardarPendiente();
    };
    // guardarPendiente solo usa refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------- sucursales

  useEffect(() => {
    const fetchBranches = async () => {
      setBranchesLoading(true);
      try {
        const response = await fetch(buildApiUrl('/getSucursal'), {
          cache: 'no-store',
          headers: { Accept: 'application/json, text/plain, */*' },
        });

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const payload = await response.json();
        const rows = Array.isArray(payload?.[0]) ? payload[0] : Array.isArray(payload) ? payload : [];
        const normalized = rows
          .map((branch) => ({
            id: normalizeBranchId(branch.idsucursal ?? branch.idSucursal ?? branch.id),
            name: branch.sucursal || branch.nombre || branch.branch,
          }))
          .filter((branch) => {
            if (!branch.id || !branch.name) return false;
            if (isWebBranch(branch.id)) return false;
            return !String(branch.name).toLowerCase().includes('web');
          });

        setBranches(normalized);
      } catch (error) {
        console.error('Error fetching branches:', error);
        setBranches([]);
      } finally {
        setBranchesLoading(false);
        setBranchesReady(true);
      }
    };

    fetchBranches();
  }, []);

  // El admin empieza en su sucursal y puede cambiar; el empleado solo tiene
  // la suya (aunque la lista de sucursales no cargue).
  useEffect(() => {
    if (branchInitialized || !userData) return;
    const propia = userBranchId && !isWebBranch(userBranchId) ? userBranchId : null;
    if (!canEdit) {
      sucursalRef.current = propia || '';
      setSelectedBranch(propia || '');
      setBranchInitialized(true);
      return;
    }
    if (!branchesReady) return;
    const inicial = propia && (branches.length === 0 || branches.some((branch) => branch.id === propia))
      ? propia
      : branches[0]?.id || '';
    sucursalRef.current = inicial;
    setSelectedBranch(inicial);
    setBranchInitialized(true);
  }, [branchInitialized, branches, branchesReady, userBranchId, userData, canEdit]);

  const cambiarSucursal = (id) => {
    guardarPendiente();
    sucursalRef.current = id;
    setSelectedBranch(id);
  };

  useEffect(() => {
    if (!branchInitialized) return undefined;
    setSeleccion(null);
    if (!selectedBranch) {
      eventsRef.current = [];
      setEvents([]);
      setCarga('sinSucursal');
      return undefined;
    }
    let vigente = true;
    setCarga('cargando');
    llamarCalendario('GET', { idsucursal: selectedBranch })
      .then((datos) => {
        if (!vigente) return;
        const lista = (datos.eventos || [])
          .filter((e) => ETIQUETAS_CALENDARIO.includes(e.etiqueta))
          .map(desdeServidor);
        eventsRef.current = lista;
        setEvents(lista);
        setCarga('listo');
      })
      .catch((error) => {
        if (!vigente) return;
        console.error('Error al leer el calendario:', error);
        setCarga('error');
      });
    return () => {
      vigente = false;
    };
  }, [branchInitialized, selectedBranch, intentoCarga]);

  // ------------------------------------------------------------ vacaciones

  // Las propias las marca cada quien (admin incluido); el admin ademas ve las
  // de la sucursal elegida, para no citar a una junta a quien no va a estar.
  useEffect(() => {
    if (!userData) return undefined;
    let vigente = true;
    const query = canEdit && selectedBranch ? `?idsucursal=${encodeURIComponent(selectedBranch)}` : '';
    llamarVacaciones('GET', { query })
      .then((datos) => {
        if (!vigente) return;
        setVacaciones({
          hoy: datos.hoy,
          anios: datos.anios || {},
          dias: datos.dias || [],
          sucursal: datos.sucursal || [],
        });
      })
      .catch((error) => console.error('Error al leer vacaciones:', error));
    return () => {
      vigente = false;
    };
  }, [userData, canEdit, selectedBranch]);

  const diasPropios = useMemo(() => new Set(vacaciones.dias), [vacaciones.dias]);
  const hoyTienda = vacaciones.hoy || toDateKey(new Date());

  // Cada dia agregado descuenta uno; el servidor revisa que alcance el saldo
  // y que no sean dias pasados.
  const moverVacaciones = async ({ agregar = [], quitar = [] }) => {
    if (vacGuardando) return;
    const conPasados = [...agregar, ...quitar].some((dia) => dia < hoyTienda);
    const nuevos = agregar.filter((dia) => dia >= hoyTienda && !diasPropios.has(dia));
    const fuera = quitar.filter((dia) => dia >= hoyTienda && diasPropios.has(dia));
    setVacAviso(conPasados ? t('panel.vacation.pastDays') : null);
    if (!nuevos.length && !fuera.length) return;

    setVacGuardando(true);
    try {
      const datos = await llamarVacaciones('POST', { body: { agregar: nuevos, quitar: fuera } });
      setVacaciones((prev) => ({ ...prev, hoy: datos.hoy, anios: datos.anios || {}, dias: datos.dias || [] }));
    } catch (error) {
      setVacAviso(error.datos?.codigo === 'saldo'
        ? t('panel.vacation.noBalance', { n: error.datos.restan })
        : t('panel.vacation.calendarSaveError'));
    } finally {
      setVacGuardando(false);
    }
  };

  const anioVista = String(currentDate.getFullYear());
  const anioVacaciones = vacaciones.anios[anioVista] ? anioVista : hoyTienda.slice(0, 4);
  const saldoVista = vacaciones.anios[anioVacaciones] || { asignados: 0, usados: 0 };
  const sinDiasAsignados = Object.values(vacaciones.anios).every((saldo) => !saldo.asignados);
  // En modo vacaciones el calendario solo sirve para marcar dias propios de
  // hoy en adelante: las etiquetas de la sucursal no se mueven.

  // --------------------------------------------------------------- arrastre

  useEffect(() => {
    if (!canEdit || !dragZoneRef.current) return undefined;

    const draggable = new Draggable(dragZoneRef.current, {
      itemSelector: '.draggable-label',
      eventData: (el) => {
        const label = labelMap[el.getAttribute('data-id')];
        return {
          title: label?.title || t('panel.calendar.label'),
          create: true,
          backgroundColor: label?.fondo,
          borderColor: label?.color,
          classNames: ['from-drag'],
          extendedProps: { labelId: label?.id },
        };
      },
    });

    return () => draggable.destroy();
  }, [labelMap, canEdit, t]);

  // ---------------------------------------------------------- rangos de dias

  const buildEventForLabel = (label, dayKey) => ({
    id: createId(),
    title: label.title,
    start: dayKey,
    allDay: true,
    labelId: label.id,
    note: '',
  });

  // Une los dias seguidos de una misma etiqueta en un solo evento; el titulo
  // y las notas que quedan son las del primero.
  const normalizeLabelEvents = (labelEvents, label) => {
    const ranges = labelEvents
      .map((event) => {
        const { startKey, endKey } = getEventRange(event);
        return { startKey, endKey, event };
      })
      .sort((a, b) => a.startKey.localeCompare(b.startKey));

    const merged = [];
    ranges.forEach((range) => {
      if (!merged.length) {
        merged.push({ ...range });
        return;
      }
      const current = merged[merged.length - 1];
      if (range.startKey <= current.endKey) {
        current.endKey = current.endKey >= range.endKey ? current.endKey : range.endKey;
      } else {
        merged.push({ ...range });
      }
    });

    return merged.map((range) => {
      const base = range.event;
      const singleDayEnd = addDaysKey(range.startKey, 1);
      return {
        ...base,
        start: range.startKey,
        end: range.endKey === singleDayEnd ? undefined : range.endKey,
        allDay: true,
        labelId: label.id,
        title: base.title || label.title,
        note: base.note || '',
      };
    });
  };

  // Quita un dia de un evento: lo acorta o lo parte en dos.
  const removeLabelDay = (prevEvents, label, dayKey) => {
    const labelEvents = prevEvents.filter((event) => event.labelId === label.id);
    const otherEvents = prevEvents.filter((event) => event.labelId !== label.id);
    const index = labelEvents.findIndex((event) => isDayInEvent(event, dayKey));
    if (index < 0) return prevEvents;

    const target = labelEvents[index];
    const { startKey, endKey } = getEventRange(target);
    const lastDay = addDaysKey(endKey, -1);
    const next = [...labelEvents];

    if (startKey === dayKey && lastDay === dayKey) {
      next.splice(index, 1);
    } else if (startKey === dayKey) {
      next[index] = { ...target, start: addDaysKey(startKey, 1) };
    } else if (lastDay === dayKey) {
      next[index] = { ...target, end: dayKey };
    } else {
      next.splice(index, 1, { ...target, end: dayKey }, { ...target, id: createId(), start: addDaysKey(dayKey, 1) });
    }

    return [...otherEvents, ...normalizeLabelEvents(next, label)];
  };

  const addLabelRange = (prevEvents, label, startKey, endKey) => {
    const labelEvents = prevEvents.filter((event) => event.labelId === label.id);
    const otherEvents = prevEvents.filter((event) => event.labelId !== label.id);
    const additions = [];

    for (let dayKey = startKey; dayKey < endKey; dayKey = addDaysKey(dayKey, 1)) {
      const exists = labelEvents.some((event) => isDayInEvent(event, dayKey));
      if (!exists) {
        additions.push(buildEventForLabel(label, dayKey));
      }
    }

    return [...otherEvents, ...normalizeLabelEvents([...labelEvents, ...additions], label)];
  };

  // ------------------------------------------------------------- resumenes

  const todayKey = toDateKey(new Date());
  const upcoming = useMemo(
    () => events
      .filter((ev) => getEventRange(ev).endKey > todayKey)
      .sort((a, b) => getEventRange(a).startKey.localeCompare(getEventRange(b).startKey))
      .slice(0, 4),
    [events, todayKey],
  );

  const counters = useMemo(() => {
    const res = {};
    events.forEach((ev) => {
      res[ev.labelId] = (res[ev.labelId] || 0) + 1;
    });
    return res;
  }, [events]);

  const selectedEvent = seleccion ? events.find((ev) => ev.id === seleccion.id) : null;
  const selectedLabel = selectedEvent ? labelMap[selectedEvent.labelId] : null;

  // ---------------------------------------------------------- interacciones

  const handleDatesSet = (info) => {
    setCurrentDate(info.view.currentStart);
  };

  // Soltar una etiqueta en un dia la agrega; quitar se hace desde el detalle.
  const handleEventReceive = (info) => {
    info.event.remove();
    const label = labelMap[info.draggedEl.getAttribute('data-id')];
    const dayKey = toDateKey(info.event.start);
    if (!label || !dayKey) return;
    cambiarEventos((prev) => addLabelRange(prev, label, dayKey, addDaysKey(dayKey, 1)));
  };

  // Mover o estirar un evento.
  const handleEventChange = (info) => {
    const labelId = info.event.extendedProps?.labelId;
    const label = labelMap[labelId];
    if (!label) return;
    cambiarEventos((prev) => {
      const existing = prev.find((event) => event.id === info.event.id);
      const remaining = prev.filter((event) => event.id !== info.event.id);
      const moved = {
        ...(existing || {}),
        id: info.event.id,
        start: toDateKey(info.event.start),
        end: info.event.end ? toDateKey(info.event.end) : undefined,
        allDay: true,
        labelId,
        title: existing?.title || label.title,
        note: existing?.note || '',
      };
      const labelEvents = remaining.filter((event) => event.labelId === labelId);
      const otherEvents = remaining.filter((event) => event.labelId !== labelId);
      return [...otherEvents, ...normalizeLabelEvents([...labelEvents, moved], label)];
    });
  };

  const handleSelect = (selectionInfo) => {
    const startKey = toDateKey(selectionInfo.startStr);
    const endKey = toDateKey(selectionInfo.endStr);
    calendarRef.current?.getApi().unselect();
    if (!startKey || !endKey) return;

    if (modoVacaciones) {
      const dias = [];
      for (let dia = startKey; dia < endKey; dia = addDaysKey(dia, 1)) dias.push(dia);
      // Un solo dia que ya es de vacaciones se quita; lo demas se agrega.
      if (dias.length === 1 && diasPropios.has(dias[0])) moverVacaciones({ quitar: dias });
      else moverVacaciones({ agregar: dias });
      return;
    }

    const label = labelMap[activeLabelId];
    if (!label) return;
    cambiarEventos((prev) => addLabelRange(prev, label, startKey, endKey));
  };

  const seleccionarEvento = (event, dayKey = null) => {
    setSeleccion({ id: event.id, dayKey });
    setBorrador({ title: event.title || '', note: event.note || '' });
  };

  const handleEventClick = (clickInfo) => {
    const { tipo, propia } = clickInfo.event.extendedProps || {};
    if (tipo === 'vacacion') {
      if (modoVacaciones && propia) moverVacaciones({ quitar: [toDateKey(clickInfo.event.start)] });
      return;
    }
    const event = events.find((ev) => ev.id === clickInfo.event.id);
    if (event) seleccionarEvento(event, getDayKeyFromClick(clickInfo));
  };

  const irAEvento = (event) => {
    calendarRef.current?.getApi().gotoDate(getEventRange(event).startKey);
    seleccionarEvento(event);
  };

  const guardarDetalle = () => {
    const title = borrador.title.trim();
    if (!selectedEvent || !title) return;
    cambiarEventos((prev) => prev.map((ev) => (
      ev.id === selectedEvent.id ? { ...ev, title, note: borrador.note.trim() } : ev
    )));
  };

  const quitarDia = () => {
    if (!selectedEvent || !selectedLabel || !seleccion?.dayKey) return;
    cambiarEventos((prev) => removeLabelDay(prev, selectedLabel, seleccion.dayKey));
    setSeleccion(null);
  };

  const eliminarEvento = () => {
    if (!selectedEvent) return;
    if (typeof window !== 'undefined' && !window.confirm(t('panel.calendar.confirmDelete'))) return;
    cambiarEventos((prev) => prev.filter((ev) => ev.id !== selectedEvent.id));
    setSeleccion(null);
  };

  const renderEventContent = (eventInfo) => {
    const { tipo, labelId } = eventInfo.event.extendedProps;
    const color = tipo === 'vacacion' ? VACACION.hex : labelMap[labelId]?.color;
    return (
      <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-900">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{eventInfo.event.title}</span>
      </div>
    );
  };

  const switchView = (view) => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(view);
    setCalendarView(view);
  };

  const goTo = (action) => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api[action]();
    setCurrentDate(api.getDate());
  };

  const branchName = branches.find((branch) => branch.id === selectedBranch)?.name;
  const borradorSinCambios = selectedEvent
    && borrador.title.trim() === (selectedEvent.title || '')
    && borrador.note.trim() === (selectedEvent.note || '');
  const chip = 'flex items-center gap-2 rounded-full bg-[rgb(var(--color-bg))]/80 px-3 py-1 text-sm text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))]/30 border border-[rgb(var(--color-border))]/80';
  const campo = 'w-full rounded-lg border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-inner outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/70';

  return (
    <div className="min-h-screen w-full bg-[rgb(var(--color-bg))] px-4 pt-24 pb-12">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-[rgb(var(--color-galaxy))]/25 via-[rgb(var(--color-accent))]/20 to-[rgb(var(--color-card))]/20 border border-[rgb(var(--color-border))]/70 p-6 shadow-2xl shadow-[rgb(var(--color-galaxy))]/30 flex flex-col gap-3 mt-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--color-card))] shadow-lg shadow-[rgb(var(--color-galaxy))]/40 border border-[rgb(var(--color-border))]/60">
              <FiCalendar className="h-6 w-6 text-[rgb(var(--color-text))]" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-[rgb(var(--color-text))]">{t('panel.calendar.title')}</h1>
              <p className="text-sm text-[rgb(var(--color-text))]">
                {canEdit ? t('panel.calendar.subtitle') : t('panel.calendar.readOnly')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className={chip}>
              <LuSparkles className="text-[rgb(var(--color-accent))]" />
              {t('panel.calendar.view')} {calendarView === 'dayGridMonth' ? t('panel.calendar.monthly') : t('panel.calendar.yearly')}
            </div>
            {canEdit && !isYearView && (
              <div className={chip}>
                <FiTag className="text-[rgb(var(--color-galaxy))]" />
                {t('panel.calendar.label')}: <span className="font-semibold">{labelMap[activeLabelId]?.title}</span>
              </div>
            )}
            <div className={chip}>
              <FiTag className="text-[rgb(var(--color-galaxy))]" />
              <span className="text-xs uppercase tracking-[0.2em]">{t('panel.common.branch')}</span>
              {canEdit ? (
                <select
                  value={selectedBranch}
                  onChange={(e) => cambiarSucursal(e.target.value)}
                  className="min-w-[160px] rounded-full border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] px-3 py-1 text-sm text-[rgb(var(--color-text))] shadow-inner outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/70"
                >
                  <option value="" disabled>
                    {branchesLoading ? t('common.loading') : t('panel.common.pickBranch')}
                  </option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-semibold">{branchName || '—'}</span>
              )}
            </div>
            {canEdit && guardado !== 'idle' && (
              <div className={chip} role="status">
                {guardado === 'guardando' && t('panel.calendar.saving')}
                {guardado === 'guardado' && t('panel.calendar.saved')}
                {guardado === 'error' && (
                  <>
                    <span className="text-red-600">{t('panel.calendar.saveError')}</span>
                    <button type="button" onClick={guardarPendiente} className="font-semibold underline">
                      {t('panel.calendar.retry')}
                    </button>
                  </>
                )}
              </div>
            )}
            {!canEdit && (
              <div className={chip}>
                <FiLock className="text-[rgb(var(--color-galaxy))]" />
                {t('panel.calendar.readOnlyChip')}
              </div>
            )}
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-6 ${isYearView ? '' : 'xl:grid-cols-4'}`}>
          {!isYearView && (
            <div className="space-y-5 xl:col-span-1">
            {canEdit && (
              <div className="rounded-2xl bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))]/80 shadow-xl shadow-[rgb(var(--color-galaxy))]/25 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--color-text))]">{t('panel.calendar.labels')}</p>
                    <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">{t('panel.calendar.dragHint')}</h3>
                  </div>
                  <LuSparkles className="text-[rgb(var(--color-accent))]" />
                </div>
                <div ref={dragZoneRef} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
                  {labels.map((label) => {
                    const Icon = label.icon || FiTag;
                    const active = activeLabelId === label.id;
                    return (
                      <div
                        key={label.id}
                        data-id={label.id}
                        className={`draggable-label group relative flex items-center gap-3 rounded-xl border px-3 py-2 shadow-md cursor-grab transition hover:-translate-y-0.5 hover:shadow-lg ${label.cardClass} ${label.borderClass} ${active ? `${label.ringClass} ring-2 ring-offset-2 ring-offset-[rgb(var(--color-card))]` : ''}`}
                        onClick={() => setActiveLabelId(label.id)}
                      >
                        <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center shadow ${label.badgeClass}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-black">{label.title}</p>
                          <p className="text-xs text-black">{label.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-[rgb(var(--color-text))]/80">{t('panel.calendar.selectHint')}</p>
              </div>
            )}

            <div className="rounded-2xl bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))]/80 shadow-xl shadow-[rgb(var(--color-galaxy))]/25 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">
                  {t('panel.vacation.mineTitle', { anio: anioVacaciones })}
                </h3>
                <FiSun className="text-[rgb(var(--color-text))]" />
              </div>
              <p className="text-sm text-[rgb(var(--color-text))]">
                {saldoVista.asignados > 0
                  ? t('panel.vacation.left', {
                    restan: Math.max(0, saldoVista.asignados - saldoVista.usados),
                    asignados: saldoVista.asignados,
                  })
                  : t('panel.vacation.noneAssigned')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setModoVacaciones((activo) => !activo);
                  setVacAviso(null);
                }}
                disabled={!modoVacaciones && sinDiasAsignados && vacaciones.dias.length === 0}
                className={`w-full rounded-xl px-3 py-2 text-sm font-semibold shadow transition disabled:opacity-50 ${modoVacaciones ? 'bg-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))]' : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]'}`}
              >
                {vacGuardando
                  ? t('panel.vacation.saving')
                  : modoVacaciones ? t('panel.vacation.done') : t('panel.vacation.mark')}
              </button>
              {modoVacaciones && (
                <p className="text-xs text-[rgb(var(--color-text))]/80">{t('panel.vacation.markHint')}</p>
              )}
              {vacAviso && (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">{vacAviso}</p>
              )}
            </div>

            <div className="rounded-2xl bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))]/80 shadow-xl shadow-[rgb(var(--color-galaxy))]/25 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">{t('panel.calendar.categories')}</h3>
                <FiCalendar className="text-[rgb(var(--color-text))]" />
              </div>
              <div className="space-y-2">
                {labels.map((label) => (
                  <div key={label.id} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${label.summaryClass} ${label.borderClass}`}>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                      <p className="text-sm text-black">{label.title}</p>
                    </div>
                    <p className="text-sm font-semibold text-black">{counters[label.id] || 0}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--color-text))] mb-2">{t('panel.calendar.upcoming')}</p>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-[rgb(var(--color-text))]/80">{t('panel.calendar.noUpcoming')}</p>
                ) : (
                  <ul className="space-y-1">
                    {upcoming.map((ev) => (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => irAEvento(ev)}
                          className="flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left hover:bg-[rgb(var(--color-bg))]"
                        >
                          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: labelMap[ev.labelId]?.color }} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-[rgb(var(--color-text))]">{ev.title}</span>
                            <span className="block text-xs text-[rgb(var(--color-text))]/80">{formatRange(ev)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selectedEvent && (
                <div className="rounded-xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))] p-3 space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--color-text))]/80">{t('panel.calendar.detail')}</p>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedLabel?.color }} />
                    <p className="text-sm text-[rgb(var(--color-text))]">{selectedLabel?.title}</p>
                  </div>
                  <p className="text-sm text-[rgb(var(--color-text))]/80">{formatRange(selectedEvent)}</p>
                  {canEdit ? (
                    <>
                      <label className="block text-xs font-semibold text-[rgb(var(--color-text))]">
                        {t('panel.calendar.eventTitle')}
                        <input
                          value={borrador.title}
                          maxLength={120}
                          onChange={(e) => setBorrador((prev) => ({ ...prev, title: e.target.value }))}
                          className={`mt-1 ${campo}`}
                        />
                      </label>
                      <label className="block text-xs font-semibold text-[rgb(var(--color-text))]">
                        {t('panel.calendar.eventNote')}
                        <textarea
                          value={borrador.note}
                          maxLength={500}
                          rows={3}
                          placeholder={t('panel.calendar.notePlaceholder')}
                          onChange={(e) => setBorrador((prev) => ({ ...prev, note: e.target.value }))}
                          className={`mt-1 ${campo}`}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={guardarDetalle}
                          disabled={!borrador.title.trim() || borradorSinCambios}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {t('panel.calendar.saveEvent')}
                        </button>
                        {seleccion?.dayKey && (
                          <button
                            type="button"
                            onClick={quitarDia}
                            className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-text))]"
                          >
                            {t('panel.calendar.removeDay')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={eliminarEvento}
                          className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                        >
                          {t('panel.calendar.deleteEvent')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h4 className="text-md font-semibold text-[rgb(var(--color-text))]">{selectedEvent.title}</h4>
                      {selectedEvent.note && (
                        <p className="whitespace-pre-wrap text-sm text-[rgb(var(--color-text))]/90">{selectedEvent.note}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          )}

          <div className={isYearView ? 'xl:col-span-4' : 'xl:col-span-3'}>
            <div className="rounded-2xl bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))]/80 shadow-2xl shadow-[rgb(var(--color-galaxy))]/25 p-4">
              <div className="flex flex-wrap items-center gap-3 justify-between pb-4 border-b border-[rgb(var(--color-border))]/50">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => goTo('prev')} className="rounded-lg border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))] p-2 text-[rgb(var(--color-text))] shadow hover:-translate-y-0.5 transition">
                    <FiChevronLeft />
                  </button>
                  <div className="px-3 py-2 rounded-xl bg-[rgb(var(--color-bg))] border border-[rgb(var(--color-border))]/60 shadow text-[rgb(var(--color-text))] font-semibold capitalize">
                    {isYearView ? formatYear(currentDate) : formatMonth(currentDate)}
                  </div>
                  <button type="button" onClick={() => goTo('next')} className="rounded-lg border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))] p-2 text-[rgb(var(--color-text))] shadow hover:-translate-y-0.5 transition">
                    <FiChevronRight />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => switchView('dayGridMonth')}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold shadow ${calendarView === 'dayGridMonth' ? 'bg-[rgb(var(--color-accent))] text-[rgb(var(--color-card))] hidden' : 'bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))]/70'}`}
                  >
                    Mensual
                  </button>
                  <button
                    type="button"
                    onClick={() => switchView('multiMonthQuarter')}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold shadow ${calendarView === 'multiMonthQuarter' ? 'bg-[rgb(var(--color-accent))] text-[rgb(var(--color-card))] hidden' : 'bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))]/70'}`}
                  >
                    Anual
                  </button>
                </div>
              </div>

              {carga !== 'listo' && (
                <div className="mt-4 rounded-xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] px-4 py-3 text-sm text-[rgb(var(--color-text))]">
                  {carga === 'cargando' && t('panel.calendar.loading')}
                  {carga === 'sinSucursal' && t('panel.calendar.noBranch')}
                  {carga === 'error' && (
                    <span className="flex flex-wrap items-center gap-2">
                      {t('panel.calendar.loadError')}
                      <button type="button" onClick={() => setIntentoCarga((n) => n + 1)} className="font-semibold underline">
                        {t('panel.calendar.retry')}
                      </button>
                    </span>
                  )}
                </div>
              )}

              <div className="mt-4 rounded-xl border border-[rgb(var(--color-border))]/80 bg-gradient-to-br from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-bg))] p-1 shadow-inner">
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, multiMonthPlugin, interactionPlugin]}
                  initialView={calendarView}
                  headerToolbar={false}
                  locale={esLocale}
                  views={{
                    multiMonthQuarter: {
                      type: 'multiMonth',
                      duration: { months: 12 },
                      multiMonthMaxColumns: 3,
                      multiMonthMinWidth: 220,
                    },
                  }}
                  events={[
                    ...events.map((ev) => {
                      const label = labelMap[ev.labelId];
                      return {
                        id: ev.id,
                        title: ev.title,
                        start: ev.start,
                        end: ev.end,
                        allDay: true,
                        extendedProps: { labelId: ev.labelId },
                        backgroundColor: label?.fondo,
                        borderColor: label?.color,
                        textColor: '#0b1120',
                      };
                    }),
                    ...vacaciones.dias.map((dia) => ({
                      id: `vac-${dia}`,
                      title: t('panel.vacation.mine'),
                      start: dia,
                      allDay: true,
                      editable: false,
                      extendedProps: { tipo: 'vacacion', propia: true },
                      backgroundColor: VACACION.fondo,
                      borderColor: VACACION.hex,
                      textColor: '#0b1120',
                    })),
                    ...(canEdit ? vacaciones.sucursal : [])
                      .filter((v) => String(v.idusuario) !== String(userData?.idusuario))
                      .map((v) => ({
                        id: `vac-${v.idusuario}-${v.fecha}`,
                        title: t('panel.vacation.of', { nombre: v.nombre }),
                        start: v.fecha,
                        allDay: true,
                        editable: false,
                        extendedProps: { tipo: 'vacacion', propia: false },
                        backgroundColor: VACACION.fondoOtros,
                        borderColor: VACACION.hex,
                        textColor: '#0b1120',
                      })),
                  ]}
                  height="auto"
                  dayMaxEvents
                  weekends
                  droppable={canEdit && !modoVacaciones}
                  editable={canEdit && !modoVacaciones}
                  selectable={canEdit || modoVacaciones}
                  selectMirror={canEdit || modoVacaciones}
                  selectAllow={(info) => !modoVacaciones || toDateKey(info.start) >= hoyTienda}
                  multiMonthMaxColumns={3}
                  eventContent={renderEventContent}
                  eventClassNames="rounded-lg shadow border-0 px-2 py-1"
                  eventReceive={handleEventReceive}
                  eventDrop={handleEventChange}
                  eventResize={handleEventChange}
                  eventClick={handleEventClick}
                  datesSet={handleDatesSet}
                  select={handleSelect}
                  expandRows
                  nowIndicator
                  displayEventTime={false}
                  multiMonthMinWidth={220}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
