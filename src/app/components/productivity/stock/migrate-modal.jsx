import React, { useEffect, useState } from 'react';
import { FaExchangeAlt } from 'react-icons/fa';
import {
    FaArrowDown,
    FaCircleCheck,
    FaCircleExclamation,
    FaParachuteBox,
    FaTriangleExclamation,
    FaTruckRampBox,
} from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';
import Sheet, { SheetHeader } from './sheet';
import MatrixPicker from './matrix-picker';
import { matrixCode } from './locations';

const createInitialMatrixSelection = () => ({
    origin: { anaquel: '', nivel: '', seccion: '' },
    destination: { anaquel: '', nivel: '', seccion: '' },
});

// Los textos de hydrate traen dos puntos ("ORIGEN:"); como titulo de tarjeta sobran.
const stripColon = (text) => text.replace(/:\s*$/, '');

export default function MigrateModal({ isOpen, toggleModal, onSubmit }) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState(createInitialMatrixSelection());
    const [submissionStatus, setSubmissionStatus] = useState({ type: '', message: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const source = matrixCode(formData.origin);
    const target = matrixCode(formData.destination);
    const isIncomplete = !source || !target;
    const isSameMatrix = !isIncomplete && source === target;
    const isSuccess = submissionStatus.type === 'success';
    // Tras un exito la hoja se cierra sola en 700 ms; un segundo toque en ese
    // lapso volveria a mandar la migracion contra una matriz que ya esta ocupada.
    const canSubmit = !isIncomplete && !isSameMatrix && !isSubmitting && !isSuccess;

    useEffect(() => {
        if (!isOpen) {
            setFormData(createInitialMatrixSelection());
            setSubmissionStatus({ type: '', message: '' });
            setIsSubmitting(false);
        }
    }, [isOpen]);

    const handleSelectChange = (group, field, value) => {
        setFormData(prev => ({
            ...prev,
            [group]: {
                ...prev[group],
                [field]: value,
            },
        }));
        setSubmissionStatus({ type: '', message: '' });
    };

    const handleFormSubmit = async () => {
        if (!canSubmit || !onSubmit) return;

        setIsSubmitting(true);
        setSubmissionStatus({ type: '', message: '' });

        try {
            const response = await onSubmit({ source, target });
            if (response?.message) {
                setSubmissionStatus({
                    type: response.ok ? 'success' : 'error',
                    message: response.message,
                });
            }

            if (response?.ok) {
                setTimeout(() => {
                    toggleModal();
                    setFormData(createInitialMatrixSelection());
                }, 700);
            }
        } catch (error) {
            setSubmissionStatus({
                type: 'error',
                message: t('panel.migrate.error'),
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    let helper = t('panel.migrate.summary', { source, target });
    if (isIncomplete) helper = t('panel.migrate.incomplete');
    else if (isSameMatrix) helper = t('panel.migrate.sameMatrix');

    const StatusIcon = isSuccess ? FaCircleCheck : FaCircleExclamation;

    return (
        <Sheet isOpen={isOpen} onClose={toggleModal} locked={isSubmitting} labelledBy="migrate-modal-title">
            <SheetHeader
                icon={FaExchangeAlt}
                title={t('panel.migrate.title')}
                titleId="migrate-modal-title"
                onClose={toggleModal}
                closeDisabled={isSubmitting}
                subtitle={(
                    <>
                        {t('panel.migrate.hint')}{' '}
                        <span className="font-semibold text-amber-600">
                            {t('panel.migrate.wholeTarget').toLowerCase()}
                        </span>.
                    </>
                )}
            />

            <div role="note" className="flex items-start gap-2.5 rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2.5 text-[rgb(var(--color-error))]">
                <FaTriangleExclamation className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p className="text-xs font-semibold leading-snug tracking-wide">{t('panel.migrate.warning')}</p>
            </div>

            <div className="flex flex-col">
                <MatrixPicker
                    label={stripColon(t('panel.migrate.source'))}
                    icon={FaTruckRampBox}
                    iconClassName="text-blue-600"
                    value={formData.origin}
                    onChange={(field, value) => handleSelectChange('origin', field, value)}
                />
                <span
                    className="relative z-10 -my-2.5 grid size-9 place-items-center self-center rounded-full bg-amber-500 text-slate-900 shadow ring-4 ring-[rgb(var(--color-bg))]"
                    aria-hidden="true"
                >
                    <FaArrowDown className="size-4" />
                </span>
                <MatrixPicker
                    label={stripColon(t('panel.migrate.target'))}
                    icon={FaParachuteBox}
                    iconClassName="text-amber-600"
                    value={formData.destination}
                    onChange={(field, value) => handleSelectChange('destination', field, value)}
                />
            </div>

            <p
                aria-live="polite"
                className={`min-h-10 text-center text-sm leading-snug ${isSameMatrix ? 'font-medium text-amber-600' : 'text-[rgb(var(--color-gray-base))]'}`}
            >
                {helper}
            </p>

            {submissionStatus.message && (
                <div
                    role="status"
                    className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium ${isSuccess
                        ? 'bg-[rgb(var(--color-success))]/10 text-[rgb(var(--color-success))]'
                        : 'bg-[rgb(var(--color-error))]/10 text-[rgb(var(--color-error))]'}`}
                >
                    <StatusIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{submissionStatus.message}</span>
                </div>
            )}

            {/* En celular el boton principal queda arriba y a todo lo ancho, al alcance del pulgar. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                    type="button"
                    onClick={toggleModal}
                    disabled={isSubmitting}
                    className="h-12 rounded-xl border border-[rgb(var(--color-border))] px-5 font-medium transition hover:bg-[rgb(var(--color-text))]/5 disabled:opacity-50 sm:h-11"
                >
                    {t('panel.common.cancel')}
                </button>
                <button
                    type="button"
                    onClick={handleFormSubmit}
                    disabled={!canSubmit}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 font-semibold text-slate-900 shadow transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40 sm:h-11"
                >
                    {isSubmitting && (
                        <span
                            className="size-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900"
                            aria-hidden="true"
                        />
                    )}
                    {isSubmitting ? t('panel.migrate.running') : t('panel.migrate.action')}
                </button>
            </div>
        </Sheet>
    );
}
