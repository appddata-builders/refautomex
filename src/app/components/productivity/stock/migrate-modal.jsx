import React, { useEffect, useMemo, useState } from 'react';
import { FaTruckRampBox, FaParachuteBox } from "react-icons/fa6";
import { CgDanger } from "react-icons/cg";
import { useTranslation } from '@/app/lib/text/text-provider';

const createInitialMatrixSelection = () => ({
    origin: { anaquel: '', nivel: '', seccion: '' },
    destination: { anaquel: '', nivel: '', seccion: '' },
});

export default function MigrateModal({ isOpen, toggleModal, onSubmit }) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState(createInitialMatrixSelection());
    const [missingFieldsWarning, setMissingFieldsWarning] = useState(false);
    const [submissionStatus, setSubmissionStatus] = useState({ type: '', message: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const generateRange = (start, end, prefix = '') =>
        Array.from({ length: end - start + 1 }, (_, i) => prefix + (start + i).toString().padStart(2, '0'));

    const niveles = useMemo(() => Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)), []);
    const secciones = useMemo(() => generateRange(0, 99), []);
    const anaqueles = useMemo(() => generateRange(0, 99), []);

    useEffect(() => {
        if (!isOpen) {
            setFormData(createInitialMatrixSelection());
            setMissingFieldsWarning(false);
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
        setMissingFieldsWarning(false);
        setSubmissionStatus({ type: '', message: '' });
    };

    const getLocationCode = (group) => {
        const { anaquel, nivel, seccion } = formData[group];
        return `${anaquel}${nivel}${seccion}`;
    };

    const handleFormSubmit = async () => {
        const hasEmptyFields = Object.values(formData.origin).some(value => !value) ||
            Object.values(formData.destination).some(value => !value);

        if (hasEmptyFields) {
            setMissingFieldsWarning(true);
            return;
        }

        if (!onSubmit) return;

        const payload = {
            source: getLocationCode('origin'),
            target: getLocationCode('destination')
        };

        setIsSubmitting(true);
        setSubmissionStatus({ type: '', message: '' });

        try {
            const response = await onSubmit(payload);
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

    return (
        <div className={`fixed inset-0 z-50 transition-opacity duration-200 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" aria-hidden="true" onClick={toggleModal}></div>
            <div className="relative flex items-center justify-center min-h-screen px-4">
                <div className="bg-white rounded-lg overflow-hidden shadow-xl transform transition-all sm:max-w-lg sm:w-full z-50">
                    <div className="px-4 py-5 sm:px-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">{t('panel.migrate.title')}</h3>
                    </div>
                    <div className='flex flex-col px-2 text-stone-800 border-l-4 border-l-amber-600 m-2 shadow rounded'>
                        <div className="bg-red-200 p-2 mx-2 my-1 rounded-md">
                            <div className="flex items-center justify-center">
                                {t('panel.migrate.warning')}
                            </div>
                        </div>
                        {t('panel.migrate.hint')}
                        <br />
                        <span className='text-amber-700'>{t('panel.migrate.wholeTarget')}</span>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:p-6">
                        <div className="space-y-4">
                            {/* ORIGEN */}
                            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
                                <label className="flex items-center text-sm font-semibold text-gray-700">
                                    <FaTruckRampBox className="w-5 h-5 mr-2 text-blue-800" />
                                    {t('panel.migrate.source')}
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full" data-testid="migration-origin">
                                    <select
                                        name="origen_anq"
                                        value={formData.origin.anaquel}
                                        onChange={(event) => handleSelectChange('origin', 'anaquel', event.target.value)}
                                        className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                                    >
                                        <option value="">{t('panel.migrate.shelf')}</option>
                                        {anaqueles.map(value => (
                                            <option key={value} value={value}>{value}</option>
                                        ))}
                                    </select>
                                    <select
                                        name="origen_nivel"
                                        value={formData.origin.nivel}
                                        onChange={(event) => handleSelectChange('origin', 'nivel', event.target.value)}
                                        className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                                    >
                                        <option value="">{t('panel.migrate.level')}</option>
                                        {niveles.map(value => (
                                            <option key={value} value={value}>{value}</option>
                                        ))}
                                    </select>
                                    <select
                                        name="origen_sec"
                                        value={formData.origin.seccion}
                                        onChange={(event) => handleSelectChange('origin', 'seccion', event.target.value)}
                                        className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                                    >
                                        <option value="">{t('panel.migrate.section')}</option>
                                        {secciones.map(value => (
                                            <option key={value} value={value}>{value}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {/* DESTINO */}
                            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                                <label className="flex items-center text-sm font-semibold text-gray-700">
                                    <FaParachuteBox className="w-5 h-5 mr-2 text-amber-700" />
                                    {t('panel.migrate.target')}
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                                    <select
                                        name="destino_anq"
                                        value={formData.destination.anaquel}
                                        onChange={(event) => handleSelectChange('destination', 'anaquel', event.target.value)}
                                        className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                                    >
                                        <option value="">{t('panel.migrate.shelf')}</option>
                                        {anaqueles.map(value => (
                                            <option key={value} value={value}>{value}</option>
                                        ))}
                                    </select>
                                    <select
                                        name="destino_nivel"
                                        value={formData.destination.nivel}
                                        onChange={(event) => handleSelectChange('destination', 'nivel', event.target.value)}
                                        className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                                    >
                                        <option value="">{t('panel.migrate.level')}</option>
                                        {niveles.map(value => (
                                            <option key={value} value={value}>{value}</option>
                                        ))}
                                    </select>
                                    <select
                                        name="destino_sec"
                                        value={formData.destination.seccion}
                                        onChange={(event) => handleSelectChange('destination', 'seccion', event.target.value)}
                                        className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                                    >
                                        <option value="">{t('panel.migrate.section')}</option>
                                        {secciones.map(value => (
                                            <option key={value} value={value}>{value}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        {/* Mensajes de advertencia */}
                        <div className='h-8 top-1 left-2 relative'>
                            {missingFieldsWarning && (
                                <div className="absolute flex bg-red-100 text-red-800 p-3 rounded mb-4 text-sm animate-out">
                                    <CgDanger className='text-red-800 w-5 h-5 mr-1' />
                                    <span>
                                        Para migrar la matriz completa selecciona cada campo de origen y destino.
                                    </span>
                                </div>
                            )}
                            {submissionStatus.message && (
                                <div
                                    className={`absolute flex ${submissionStatus.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} p-3 rounded mb-4 text-sm`}
                                >
                                    <CgDanger className={`${submissionStatus.type === 'success' ? 'text-green-800' : 'text-red-800'} w-5 h-5 mr-1`} />
                                    <span>
                                        {submissionStatus.message}
                                    </span>
                                </div>
                            )}
                        </div>
                        {/* Botones */}
                        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                            <button
                                onClick={handleFormSubmit}
                                disabled={isSubmitting}
                                className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm ${isSubmitting ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-700 focus:ring-blue-500'}`}
                            >
                                {isSubmitting ? t('panel.migrate.running') : t('panel.migrate.action')}
                            </button>
                            <button
                                onClick={toggleModal}
                                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                            >
                                {t('panel.common.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
