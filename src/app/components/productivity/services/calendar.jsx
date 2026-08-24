'use client';

import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import esLocale from '@fullcalendar/core/locales/es';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiPlus, FiTag } from 'react-icons/fi';
import { LuSparkles } from 'react-icons/lu';
import { TbTargetArrow } from 'react-icons/tb';
import { PiMagicWandFill } from 'react-icons/pi';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { AuthContext } from '@/app/lib/auth-tracker';
import { useTranslation } from '@/app/lib/text/text-provider';

const palette = [
  {
    hex: '#22d3ee',
    cardClass: 'bg-cyan-50',
    badgeClass: 'bg-cyan-400 text-cyan-950',
    ringClass: 'ring-cyan-200',
    borderClass: 'border-cyan-200',
    summaryClass: 'bg-cyan-50',
  },
  {
    hex: '#a855f7',
    cardClass: 'bg-fuchsia-50',
    badgeClass: 'bg-fuchsia-400 text-fuchsia-950',
    ringClass: 'ring-fuchsia-200',
    borderClass: 'border-fuchsia-200',
    summaryClass: 'bg-fuchsia-50',
  },
  {
    hex: '#fb7185',
    cardClass: 'bg-rose-50',
    badgeClass: 'bg-rose-400 text-rose-950',
    ringClass: 'ring-rose-200',
    borderClass: 'border-rose-200',
    summaryClass: 'bg-rose-50',
  },
  {
    hex: '#f59e0b',
    cardClass: 'bg-amber-50',
    badgeClass: 'bg-amber-400 text-amber-950',
    ringClass: 'ring-amber-200',
    borderClass: 'border-amber-200',
    summaryClass: 'bg-amber-50',
  },
  {
    hex: '#4ade80',
    cardClass: 'bg-emerald-50',
    badgeClass: 'bg-emerald-400 text-emerald-950',
    ringClass: 'ring-emerald-200',
    borderClass: 'border-emerald-200',
    summaryClass: 'bg-emerald-50',
  },
];

const formatDate = (date) => new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
const formatMonth = (date) => new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date);
const formatYear = (date) => new Intl.DateTimeFormat('es-MX', { year: 'numeric' }).format(date);
const makeDate = (year, month, day) => new Date(year, month - 1, day).toISOString().split('T')[0];
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

const buildLabel = (id, title, description, icon, paletteIndex, isCustom = false) => {
  const tone = palette[paletteIndex % palette.length];
  return {
    id,
    title,
    description,
    icon,
    isCustom,
    color: tone.hex,
    cardClass: tone.cardClass,
    badgeClass: tone.badgeClass,
    ringClass: tone.ringClass,
    borderClass: tone.borderClass,
    summaryClass: tone.summaryClass,
  };
};

// Las etiquetas base se arman dentro del componente porque su titulo y su
// descripcion salen de la base.
const buildInitialLabels = (t) => [
  buildLabel('revision', t('panel.calendar.labelReview'), t('panel.calendar.labelReviewDesc'), LuSparkles, 0),
  buildLabel('preventivo', t('panel.calendar.labelPreventive'), t('panel.calendar.labelPreventiveDesc'), PiMagicWandFill, 1),
  buildLabel('critico', t('panel.calendar.labelUrgent'), t('panel.calendar.labelUrgentDesc'), TbTargetArrow, 2),
  buildLabel('cliente', t('panel.calendar.labelVip'), t('panel.calendar.labelVipDesc'), FiTag, 3),
];

export default function CalendarPlanner() {
  const { t } = useTranslation();
  const initialLabels = useMemo(() => buildInitialLabels(t), [t]);
  const calendarRef = useRef(null);
  const dragZoneRef = useRef(null);

  const [labels, setLabels] = useState(initialLabels);
  const [events, setEvents] = useState([]);
  const [calendarView, setCalendarView] = useState('dayGridMonth');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [activeLabelId, setActiveLabelId] = useState(initialLabels[0]?.id);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [branchInitialized, setBranchInitialized] = useState(false);
  const isYearView = calendarView === 'multiMonthQuarter';
  const { userData } = useContext(AuthContext);
  const userBranchId = normalizeBranchId(userData?.idsucursal);

  useEffect(() => {
    if (!dragZoneRef.current) return undefined;

    const draggable = new Draggable(dragZoneRef.current, {
      itemSelector: '.draggable-label',
      eventData: (el) => {
        const labelId = el.getAttribute('data-id');
        const label = labels.find((item) => item.id === labelId);
        return {
          title: label?.title || t('panel.calendar.label'),
          create: true,
          backgroundColor: label?.color,
          borderColor: label?.color,
          classNames: ['from-drag'],
          extendedProps: { labelId },
        };
      },
    });

    return () => draggable.destroy();
  }, [labels]);

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
      }
    };

    fetchBranches();
  }, []);

  useEffect(() => {
    if (branchInitialized || branches.length === 0) return;
    const normalizedUserBranch = userBranchId && !isWebBranch(userBranchId) ? userBranchId : null;
    const hasUserBranch = normalizedUserBranch
      ? branches.some((branch) => branch.id === normalizedUserBranch)
      : false;
    if (hasUserBranch) {
      setSelectedBranch(normalizedUserBranch);
    } else if (branches[0]?.id) {
      setSelectedBranch(branches[0].id);
    }
    setBranchInitialized(true);
  }, [branchInitialized, branches, userBranchId]);

  const labelMap = useMemo(() => labels.reduce((acc, label) => {
    acc[label.id] = label;
    return acc;
  }, {}), [labels]);

  const buildEventForLabel = (label, dayKey, overrides = {}) => ({
    id: createId(),
    title: label.title,
    start: dayKey,
    allDay: true,
    labelId: label.id,
    note: label.description,
    backgroundColor: label.color,
    borderColor: label.color,
    ...overrides,
  });

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
      const next = {
        ...base,
        start: range.startKey,
        end: range.endKey === singleDayEnd ? undefined : range.endKey,
        allDay: true,
        labelId: label.id,
        backgroundColor: label.color,
        borderColor: label.color,
        title: base.title || label.title,
        note: base.note || label.description,
      };
      return next;
    });
  };

  const toggleLabelDay = (prevEvents, label, dayKey) => {
    const labelEvents = prevEvents.filter((event) => event.labelId === label.id);
    const otherEvents = prevEvents.filter((event) => event.labelId !== label.id);

    const existingIndex = labelEvents.findIndex((event) => isDayInEvent(event, dayKey));
    let nextLabelEvents = [...labelEvents];

    if (existingIndex >= 0) {
      const target = labelEvents[existingIndex];
      const { startKey, endKey } = getEventRange(target);
      const lastDay = addDaysKey(endKey, -1);

      if (startKey === dayKey && endKey === addDaysKey(startKey, 1)) {
        nextLabelEvents.splice(existingIndex, 1);
      } else if (startKey === dayKey) {
        nextLabelEvents[existingIndex] = { ...target, start: addDaysKey(startKey, 1) };
      } else if (lastDay === dayKey) {
        nextLabelEvents[existingIndex] = { ...target, end: dayKey };
      } else {
        const left = { ...target, end: dayKey };
        const right = { ...target, id: createId(), start: addDaysKey(dayKey, 1) };
        nextLabelEvents.splice(existingIndex, 1, left, right);
      }
    } else {
      const beforeIndex = labelEvents.findIndex((event) => getEventRange(event).endKey === dayKey);
      const afterIndex = labelEvents.findIndex((event) => getEventRange(event).startKey === addDaysKey(dayKey, 1));

      if (beforeIndex >= 0 && afterIndex >= 0 && beforeIndex !== afterIndex) {
        const before = labelEvents[beforeIndex];
        const after = labelEvents[afterIndex];
        const merged = {
          ...before,
          start: getEventRange(before).startKey,
          end: getEventRange(after).endKey,
          title: before.title || label.title,
          note: before.note || label.description,
        };
        nextLabelEvents = labelEvents.filter((_, index) => index !== beforeIndex && index !== afterIndex);
        nextLabelEvents.push(merged);
      } else if (beforeIndex >= 0) {
        const before = labelEvents[beforeIndex];
        nextLabelEvents[beforeIndex] = {
          ...before,
          end: addDaysKey(dayKey, 1),
          title: before.title || label.title,
          note: before.note || label.description,
        };
      } else if (afterIndex >= 0) {
        const after = labelEvents[afterIndex];
        nextLabelEvents[afterIndex] = {
          ...after,
          start: dayKey,
          title: after.title || label.title,
          note: after.note || label.description,
        };
      } else {
        nextLabelEvents.push(buildEventForLabel(label, dayKey));
      }
    }

    return [...otherEvents, ...normalizeLabelEvents(nextLabelEvents, label)];
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

  const upcoming = useMemo(
    () => [...events]
      .filter((ev) => new Date(ev.start) >= new Date())
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 4),
    [events],
  );

  const counters = useMemo(() => {
    const res = {};
    events.forEach((ev) => {
      res[ev.labelId] = (res[ev.labelId] || 0) + 1;
    });
    return res;
  }, [events]);

  const handleDatesSet = (info) => {
    setCurrentDate(info.start);
  };

  const handleEventReceive = (info) => {
    const labelId = info.draggedEl.getAttribute('data-id');
    const label = labelMap[labelId] || labels[0];
    if (!label) return;
    const dayKey = toDateKey(info.event.start);
    if (!dayKey) return;
    setEvents((prev) => toggleLabelDay(prev, label, dayKey));
    info.event.remove();
  };

  const handleEventDrop = (info) => {
    const labelId = info.event.extendedProps?.labelId;
    const label = labelMap[labelId];
    if (!label) return;
    setEvents((prev) => {
      const existing = prev.find((event) => event.id === info.event.id);
      const remaining = prev.filter((event) => event.id !== info.event.id);
      const moved = {
        ...(existing || {}),
        id: info.event.id,
        start: toDateKey(info.event.start),
        end: info.event.end ? toDateKey(info.event.end) : undefined,
        allDay: true,
        labelId,
        backgroundColor: label.color,
        borderColor: label.color,
        title: existing?.title || label.title,
        note: existing?.note || label.description,
      };
      const labelEvents = remaining.filter((event) => event.labelId === labelId);
      const otherEvents = remaining.filter((event) => event.labelId !== labelId);
      return [...otherEvents, ...normalizeLabelEvents([...labelEvents, moved], label)];
    });
  };

  const handleSelect = (selectionInfo) => {
    const label = labelMap[activeLabelId] || labels[0];
    if (!label) return;
    const startKey = toDateKey(selectionInfo.startStr);
    const endKey = toDateKey(selectionInfo.endStr);
    if (!startKey || !endKey) return;
    setEvents((prev) => addLabelRange(prev, label, startKey, endKey));
  };

  const handleEventClick = (clickInfo) => {
    const label = labelMap[clickInfo.event.extendedProps.labelId];
    const dayKey = getDayKeyFromClick(clickInfo);

    if (selectedEvent?.id === clickInfo.event.id && selectedEvent?.dayKey === dayKey) {
      if (label && dayKey) {
        setEvents((prev) => toggleLabelDay(prev, label, dayKey));
      }
      setSelectedEvent(null);
      return;
    }

    setSelectedEvent({
      id: clickInfo.event.id,
      title: clickInfo.event.title,
      start: dayKey ? toDateFromKey(dayKey) : clickInfo.event.start,
      dayKey,
      note: clickInfo.event.extendedProps.note,
      color: label?.color || clickInfo.event.backgroundColor,
      label: label?.title,
    });
  };

  const renderEventContent = (eventInfo) => {
    const label = labelMap[eventInfo.event.extendedProps.labelId];
    return (
      <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-900">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: label?.color || eventInfo.backgroundColor }}
        />
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

  const addLabel = () => {
    if (!newLabel.trim()) return;
    const customCount = labels.filter((label) => label.isCustom).length;
    const tone = palette[customCount % palette.length];
    const fresh = {
      id: `${newLabel}-${Date.now()}`,
      title: newLabel.trim(),
      description: t('panel.calendar.customLabel'),
      icon: FiTag,
      isCustom: true,
      color: tone.hex,
      cardClass: tone.cardClass,
      badgeClass: tone.badgeClass,
      ringClass: tone.ringClass,
      borderClass: tone.borderClass,
      summaryClass: tone.summaryClass,
    };
    setLabels((prev) => [...prev, fresh]);
    setNewLabel('');
    setActiveLabelId(fresh.id);
  };

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
              <p className="text-sm text-[rgb(var(--color-text))]">{t('panel.calendar.subtitle')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-full bg-[rgb(var(--color-bg))]/80 px-3 py-1 text-sm text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))]/30 border border-[rgb(var(--color-border))]/80">
              <LuSparkles className="text-[rgb(var(--color-accent))]" />
              {t('panel.calendar.view')} {calendarView === 'dayGridMonth' ? t('panel.calendar.monthly') : t('panel.calendar.yearly')}
            </div>
            {!isYearView && (
              <div className="flex items-center gap-2 rounded-full bg-[rgb(var(--color-bg))]/80 px-3 py-1 text-sm text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))]/30 border border-[rgb(var(--color-border))]/80">
                <FiTag className="text-[rgb(var(--color-galaxy))]" />
                {t('panel.calendar.label')}: <span className="font-semibold">{labelMap[activeLabelId]?.title}</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-full bg-[rgb(var(--color-bg))]/80 px-3 py-1 text-sm text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-galaxy))]/30 border border-[rgb(var(--color-border))]/80">
              <FiTag className="text-[rgb(var(--color-galaxy))]" />
              <span className="text-xs uppercase tracking-[0.2em]">{t('panel.common.branch')}</span>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
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
            </div>
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-6 ${isYearView ? '' : 'xl:grid-cols-4'}`}>
          {!isYearView && (
            <div className="space-y-5 xl:col-span-1">
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
                      <span className={`h-9 w-9 rounded-xl flex items-center justify-center shadow ${label.badgeClass}`}>
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
              <div className="mt-4 flex items-center gap-2">
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={t('panel.calendar.addLabel')}
                  className="flex-1 rounded-xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-inner outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/70"
                />
                <button
                  type="button"
                  onClick={addLabel}
                  className="flex items-center gap-1 rounded-xl bg-[rgb(var(--color-text))] p-2 text-sm font-semibold text-[rgb(var(--color-card))] shadow-lg shadow-[rgb(var(--color-galaxy))]/30 transition hover:translate-y-[-1px]"
                >
                  <FiPlus />
                  {t('panel.calendar.new')}
                </button>
              </div>
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
              {selectedEvent && (
                <div className="rounded-xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))] p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[rgb(var(--color-gray))] mb-1">{t('panel.calendar.detail')}</p>
                  <h4 className="text-md font-semibold text-[rgb(var(--color-text))]">{selectedEvent.title}</h4>
                  <p className="text-sm text-[rgb(var(--color-gray))]">{formatDate(selectedEvent.start)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedEvent.color }} />
                    <p className="text-sm text-[rgb(var(--color-text))]">{selectedEvent.label}</p>
                  </div>
                  {selectedEvent.note && <p className="mt-2 text-sm text-[rgb(var(--color-text))]/90">{selectedEvent.note}</p>}
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
                  events={events.map((ev) => {
                    const label = labelMap[ev.labelId];
                    return {
                      ...ev,
                      backgroundColor: ev.backgroundColor || label?.color,
                      borderColor: ev.borderColor || label?.color,
                      textColor: '#0b1120',
                    };
                  })}
                  height="auto"
                  dayMaxEvents
                  weekends
                  droppable
                  editable
                  selectable
                  selectMirror
                  multiMonthMaxColumns={3}
                  eventContent={renderEventContent}
                  eventClassNames="rounded-lg shadow border-0 px-2 py-1"
                  eventReceive={handleEventReceive}
                  eventDrop={handleEventDrop}
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
