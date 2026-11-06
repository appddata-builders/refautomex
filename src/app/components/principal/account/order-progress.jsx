'use client';

import { FaBoxOpen, FaCheckToSlot, FaCreditCard, FaHourglassHalf, FaRotateLeft } from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';

/**
 * El avance de un pedido del sitio, con los pasos del panel (Pedidos > Web
 * (Stripe)): pago recibido -> confirmado -> completado. `etapa` y `paso` los
 * calcula el servidor (api/orders/pedidos.js, etapaDelPedido); una devolucion
 * o un pago pendiente se muestran aparte, sin pasos.
 */
const STEPS = [
    { key: 'paid', labelKey: 'account.orderStagePaid', icon: FaCreditCard },
    { key: 'confirmed', labelKey: 'account.orderStageConfirmed', icon: FaCheckToSlot },
    { key: 'done', labelKey: 'account.orderStageDone', icon: FaBoxOpen },
];

const SPECIAL = {
    returned: { labelKey: 'account.orderStageReturned', icon: FaRotateLeft, tone: 'bg-rose-500/15 text-rose-700' },
    unpaid: { labelKey: 'account.orderStageUnpaid', icon: FaHourglassHalf, tone: 'bg-amber-500/15 text-amber-700' },
};

const BADGE_TONE = {
    paid: 'bg-sky-500/15 text-sky-700',
    confirmed: 'bg-indigo-500/15 text-indigo-700',
    done: 'bg-emerald-500/15 text-emerald-700',
};

export function OrderStatusBadge({ etapa }) {
    const { t } = useTranslation();
    const step = SPECIAL[etapa] || STEPS.find((item) => item.key === etapa) || STEPS[0];
    const tone = SPECIAL[etapa]?.tone || BADGE_TONE[step.key];
    const Icon = step.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
            <Icon className="size-3.5" aria-hidden="true" />
            {t(step.labelKey)}
        </span>
    );
}

export default function OrderProgress({ etapa, paso = 0 }) {
    const { t } = useTranslation();

    if (SPECIAL[etapa]) {
        const { icon: Icon, labelKey, tone } = SPECIAL[etapa];
        return (
            <p className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${tone}`}>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {t(labelKey)}
            </p>
        );
    }

    return (
        <ol className="grid grid-cols-3" aria-label={t('account.orderProgress')}>
            {STEPS.map((step, index) => {
                const reached = index <= paso;
                const current = index === paso;
                const Icon = step.icon;
                return (
                    <li key={step.key} aria-current={current ? 'step' : undefined} className="flex min-w-0 flex-col items-center gap-2 text-center">
                        <span className="flex w-full items-center">
                            <span className={`h-1 flex-1 rounded-full ${index === 0 ? 'opacity-0' : reached ? 'bg-emerald-500' : 'bg-[rgb(var(--color-text))]/15'}`} />
                            <span className={`grid size-10 shrink-0 place-items-center rounded-full transition ${reached
                                ? 'bg-emerald-500 text-white shadow'
                                : 'bg-[rgb(var(--color-text))]/10 text-[rgb(var(--color-text))]/50'} ${current ? 'ring-4 ring-emerald-500/25' : ''}`}
                            >
                                <Icon className="size-4" aria-hidden="true" />
                            </span>
                            <span className={`h-1 flex-1 rounded-full ${index === STEPS.length - 1 ? 'opacity-0' : index < paso ? 'bg-emerald-500' : 'bg-[rgb(var(--color-text))]/15'}`} />
                        </span>
                        <span className={`px-1 text-xs font-semibold leading-tight sm:text-sm ${reached ? 'text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-text))]/50'}`}>
                            {t(step.labelKey)}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
