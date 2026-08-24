import React, { useState, useEffect, useRef } from 'react';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import FindProducts from '../sales/find-products';
import TableCapture from './table-capture';
import { MdDiscount } from "react-icons/md";
import { CiInboxOut } from "react-icons/ci";
import { FaFileCircleCheck } from "react-icons/fa6";
import { IoMdCloseCircle } from "react-icons/io";
import { IoBagRemove } from "react-icons/io5";
import { GoAlertFill } from "react-icons/go";
import { useTranslation } from '@/app/lib/text/text-provider';

const createInitialForm = (today) => ({
        refaccion: '',
        idsucursal: '',
        localizacion: '',
        descripcion: '',
        existencia: '',
        costo: '',
        precio: '',
        utilidad: '1.3',
        mod_ini: '1990',
        mod_fin: '1990',
        idmarca: '',
        Factura: '',
        'Fecha compra': today,
});

const buildDetailItem = (record = {}) => {
    const qty = Number(record.cantidad_solicitada ?? record.cantidad ?? record.exis ?? 1);
    const currentCost = Number(record.costo_actual ?? record.costo ?? 0);
    const previousCost = Number(record.ultimo_costo ?? record.costo_anterior ?? currentCost);
    return {
        refaccion: record.num_parte,
        descripcion: record.descripcion || record.detalle || '',
        existencia: Number(record.existencia ?? record.actual ?? 0),
        cantidad: qty,
        costo: currentCost,
        costoBase: previousCost,
        precio: currentCost,
        precioInicial: currentCost,
        utilidad: Number(record.utilidad ?? 1),
        monto: Number((currentCost * qty).toFixed(2)),
        locked: true
    };
};

const buildDiscountMap = (detail = []) => {
    return detail.reduce((acc, record) => {
        const values = [record.descuento_uno, record.descuento_dos, record.descuento_tres]
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0 && value < 1);
        if (values.length) {
            acc[record.num_parte] = values;
        }
        return acc;
    }, {});
};

export default function NewCapture({ onCancelEdit, captureToEdit = null }) {
    const { t } = useTranslation();
    const today = new Date().toISOString().split('T')[0];
    const [addItem, setAddItem] = useState(() => createInitialForm(today));
    const tableRef = useRef();
    const [items, setItems] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [brandOptions, setBrandOptions] = useState([]);
    const [providerOptions, setProviderOptions] = useState([]);
    const [quantityOptions, setQuantityOptions] = useState([]);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [errorMessages, setErrorMessages] = useState({});
    const [sugestedDiscount, setSugestedDiscount] = useState(0.0);
    const [generalDiscount, setGeneralDiscount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [captureFinished, setCaptureFinished] = useState(false);
    const [captureId, setCaptureId] = useState(null);
    const [defaultDiscounts, setDefaultDiscounts] = useState({});
    const [pendingProviderId, setPendingProviderId] = useState(null);

    const isEditingMode = Boolean(captureId);
    const submitButtonLabel = isSubmitting
        ? t('panel.newCapture.saving')
        : isEditingMode
            ? t('panel.newCapture.update')
            : t('panel.newCapture.capture');
    const submitButtonTheme = isEditingMode
        ? 'bg-amber-500 hover:bg-amber-400 focus-visible:outline-amber-500'
        : 'bg-indigo-600 hover:bg-indigo-500 focus-visible:outline-indigo-600';
    const cancelButtonLabel = isEditingMode ? t('panel.newCapture.back') : t('panel.newCapture.cancel');

    const handleInputChange = (field, value) => {
        setAddItem((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleSelectChange = (field, selectedOption) => {
        setAddItem((prev) => ({
            ...prev,
            [field]: selectedOption ? selectedOption.value : '',
        }));
    };

    const handleProviderChange = (eventOrOption) => {
        let option = null;
        if (eventOrOption && eventOrOption.target) {
            const selectedValue = eventOrOption.target.value;
            option = providerOptions.find((provider) => `${provider.value}` === selectedValue) || null;
        } else {
            option = eventOrOption || null;
        }
        setSelectedProvider(option);
        handleSelectChange('Proveedor', option);
    };

    const applyDiscount = (discountValue, productRef = null) => {
        setErrorMessage('');
        setSuccessMessage('');
        if (!selectedProvider) {
            setErrorMessage(t('panel.newCapture.pickProvider'));
            return;
        }
        if (items.length === 0) {
            setErrorMessage(t('panel.newCapture.needPartsForDiscount'));
            return;
        }
        const numericDiscount = Number(discountValue);
        if (!Number.isFinite(numericDiscount) || numericDiscount <= 0 || numericDiscount >= 1) {
            setErrorMessage(t('panel.newCapture.discountRange'));
            return;
        }
        if (!tableRef.current) {
            setErrorMessage(t('panel.newCapture.tableNotReady'));
            return;
        }
        if (productRef) {
            tableRef.current.handleDiscountRow(productRef, numericDiscount, { autoConfirm: true });
        } else {
            tableRef.current.handleDiscountRow(null, numericDiscount, { isGeneral: true });
        }
    };

    const validateSubmit = () => true;

    const onSubmit = async (e) => {
        e.preventDefault();
        setErrorMessages({});
        setSuccessMessage('');
        setErrorMessage('');

        if (!validateSubmit()) {
            setErrorMessage(t('panel.newCapture.fixFields'));
            return;
        }

        if (!addItem['Factura'] || !selectedProvider || !addItem['Fecha compra']) {
            const newErrors = {};
            if (!addItem['Factura']) newErrors.factura = t('panel.newCapture.invoiceRequired');
            if (!selectedProvider) newErrors.provider = t('panel.newCapture.providerRequired');
            if (!addItem['Fecha compra']) newErrors.compra = t('panel.newCapture.dateRequired');
            setErrorMessages(newErrors);
            setErrorMessage(t('panel.newCapture.fillRequired'));
            return;
        }

        if (!items.length) {
            setErrorMessage(t('panel.newCapture.needParts'));
            return;
        }

        if (!tableRef.current) {
            setErrorMessage(t('panel.newCapture.tableUnavailable'));
            return;
        }

        const summary = tableRef.current.collectCapturePayload();
        if (!summary) {
            setErrorMessage(t('panel.newCapture.detailError'));
            return;
        }
        if (summary.errors.length) {
            setErrorMessage(summary.errors.join(' '));
            return;
        }

        const invoice = (addItem['Factura'] || '').trim().toUpperCase();
        const captureDate = addItem['Fecha compra'] || today;
        const payload = {
            idProveedor: Number(selectedProvider.value),
            numFactura: invoice,
            fechaCompra: captureDate,
            netoTotal: Number(summary.totals.neto.toFixed(2)),
            descuentoTotal: Number(summary.totals.descuento.toFixed(2)),
            subtotal: Number(summary.totals.subtotal.toFixed(2)),
            total: Number(summary.totals.total.toFixed(2)),
            detalle: summary.detail
        };
        if (isEditingMode) {
            payload.idCompra = captureId;
        }

        try {
            setIsSubmitting(true);
            const endpoint = isEditingMode
                ? buildApiUrl('/patchCapture')
                : buildApiUrl('/newCapture');
            const method = isEditingMode ? 'PATCH' : 'POST';
            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            let payloadResponse;
            const text = await response.text();
            try {
                payloadResponse = text ? JSON.parse(text) : {};
            } catch (err) {
                payloadResponse = { message: text };
            }
            if (!response.ok || (payloadResponse && payloadResponse.success === false)) {
                throw new Error(payloadResponse?.message || t('panel.newCapture.saveError'));
            }
            if (isEditingMode) {
                setSuccessMessage(t('panel.newCapture.updateOk'));
                onCancelEdit?.();
            } else {
                setSuccessMessage(t('panel.newCapture.createOk'));
                setItems([]);
                setSelectedProvider(null);
                setGeneralDiscount('');
                setSugestedDiscount(0.0);
                setAddItem(createInitialForm(today));
                setCaptureFinished(true);
            }
        } catch (error) {
            setErrorMessage(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResetCapture = () => {
        setItems([]);
        setSelectedProvider(null);
        setGeneralDiscount('');
        setSugestedDiscount(0.0);
        setErrorMessages({});
        setErrorMessage('');
        setSuccessMessage('');
        setAddItem(createInitialForm(today));
        setCaptureFinished(false);
        setCaptureId(null);
        setDefaultDiscounts({});
    };

    useEffect(() => {
        const fetchBrandOptions = async () => {
            try {
                const response = await fetch(buildApiUrl('/getBrands'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const options = payload.map((brand) => ({
                    value: brand.idmarca,
                    label: brand.marca,
                }));
                setBrandOptions(options);
            } catch (error) {
                console.error('Error al obtener marcas:', error);
            }
        };

        const fetchQuantityOptions = async () => {
            try {
                const response = await fetch(buildApiUrl('/getQuantity'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const options = payload.map((quantity) => ({
                    value: quantity.idCantidad,
                    label: quantity.cantidad,
                }));
                setQuantityOptions(options);
            } catch (error) {
                console.error('Error al obtener cantidades:', error);
            }
        };

        const fetchProviderOptions = async () => {
            try {
                const response = await fetch(buildApiUrl('/getProviders'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const options = payload
                    .filter(provider => provider.idproveedor > 1)
                    .map(provider => ({
                        value: provider.idproveedor,
                        label: `${provider.idproveedor} | ${provider.empresa}`,
                        sugestion: provider.descuento || 0.0,
                    }));
                setProviderOptions(options);
            } catch (error) {
                console.error('Error al obtener proveedores:', error);
            }
        };

        fetchBrandOptions();
        fetchQuantityOptions();
        fetchProviderOptions();
    }, []);

    useEffect(() => {
        if (selectedProvider) {
            // Buscar el proveedor en las opciones disponibles
            const provider = providerOptions.find(
                p => p.value === selectedProvider.value
            );
            // Actualizar el descuento sugerido (0.0 si es null/undefined)
            setSugestedDiscount(provider?.sugestion || 0.0);
        } else {
            setSugestedDiscount(0.0);
        }
    }, [selectedProvider, providerOptions]);

    useEffect(() => {
        if (showModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
    }, [showModal]);

    useEffect(() => {
        if (!captureToEdit || !captureToEdit.header) {
            setCaptureId(null);
            setDefaultDiscounts({});
            return;
        }
        const header = captureToEdit.header;
        const providerId = header.idProveedor ?? header.idproveedor ?? header.id_proveedor ?? null;
        setCaptureId(header.idcompra ?? header.idCompra ?? header.id);
        setPendingProviderId(providerId);
        setAddItem((prev) => ({
            ...prev,
            Factura: header.num_factura ?? header.no_factura ?? header.factura ?? '',
            'Fecha compra': (header.fecha_compra ?? header.fecha ?? today).slice(0, 10),
        }));
        const detailItems = (captureToEdit.detail || []).map(buildDetailItem);
        setItems(detailItems);
        setDefaultDiscounts(buildDiscountMap(captureToEdit.detail || []));
        setSuccessMessage('');
        setErrorMessage('');
        setCaptureFinished(false);
    }, [captureToEdit, today]);

    useEffect(() => {
        if (!pendingProviderId || !providerOptions.length) return;
        const match = providerOptions.find((option) => Number(option.value) === Number(pendingProviderId));
        if (match) {
            handleProviderChange(match);
        }
        setPendingProviderId(null);
    }, [pendingProviderId, providerOptions]);


    const inputClass = (field) => {
        const base = "block w-full rounded-md border-0 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 uppercase";
        return errorMessages[field]
            ? `${base} border border-red-400 bg-red-50 text-red-900 placeholder:text-red-400 focus:ring-red-500`
            : base;
    };

    const handleAddProduct = (product) => {
        setItems(prevItems => {
            const exists = prevItems.some(item => item.refaccion === product.refaccion);
            if (exists) {
                return prevItems.filter(item => item.refaccion !== product.refaccion);
            }
            const baseCost = Number(product.costo ?? product.precio ?? 0);
            return [
                ...prevItems,
                {
                    ...product,
                    cantidad: 1,
                    costo: baseCost,
                    costoBase: baseCost,
                    costoInicial: baseCost,
                    precioVenta: Number(product.precio ?? 0),
                    monto: Number(baseCost.toFixed(2)),
                    locked: false
                }
            ];
        });
    };

    const handleRemoveProduct = (refaccion) => {
        setItems(prevItems => prevItems.filter(item => item.refaccion !== refaccion));
    };

    const confirmCancel = () => {
        setShowModal(true);
    }

    const handleCancel = () => {
        setShowModal(false);
    }

    const canApplyDiscount = Boolean(selectedProvider);

    return (
        <form onSubmit={onSubmit} method="POST">
            <div className="2xl:px-20 py-10 px-3">
                <div className="mb-6 flex justify-end gap-4" />
                {successMessage && (
                    <div className="mb-4 rounded-md border border-green-400 bg-green-100/60 text-green-700 px-4 py-2 text-sm">
                        {successMessage}
                    </div>
                )}
                {errorMessage && (
                    <div className="mb-4 rounded-md border border-red-400 bg-red-100/60 text-red-700 px-4 py-2 text-sm">
                        {errorMessage}
                    </div>
                )}
                <div className="flex flex-col lg:flex-row lg:items-start lg:space-x-6">
                    <div className="order-2 lg:order-1 w-full">
                        {canApplyDiscount ? (
                            <div className="bg-white/90 shadow rounded-xl border border-slate-200 p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <h2 className="text-lg font-semibold text-slate-800">{t('panel.newCapture.applyDiscounts')}</h2>
                                    <span className="text-xs text-slate-500">{t('panel.capture.provider')}: {selectedProvider?.label}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex items-center justify-between gap-2 border rounded-lg p-3 bg-slate-50">
                                        <div className="flex flex-col text-sm">
                                            <span className="text-slate-500">{t('panel.newCapture.suggestedDiscount')}</span>
                                            <span className="text-lg font-bold text-slate-900">{sugestedDiscount || '0.0'}</span>
                                        </div>
                                        {sugestedDiscount > 0 && (
                                            <button
                                                type="button"
                                                className="inline-flex items-center rounded-md bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-700 ring-1 ring-amber-400 hover:bg-amber-500/20"
                                                onClick={() => applyDiscount(sugestedDiscount)}
                                            >
                                                <CiInboxOut className="mr-1" />
                                                {t('panel.newCapture.apply')}
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 border rounded-lg p-3 bg-slate-50">
                                        <MdDiscount className="text-indigo-500" size={22} />
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="1"
                                            placeholder={t('panel.newCapture.generalDiscount')}
                                            value={generalDiscount}
                                            onChange={(e) => {
                                                const value = parseFloat(e.target.value);
                                                setGeneralDiscount(Number.isNaN(value) ? '' : Math.min(0.9999, Math.max(0, value)));
                                            }}
                                            className="flex-1 rounded-md border border-slate-200 py-1.5 px-3 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                        />
                                        <button
                                            type="button"
                                            className="inline-flex items-center rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-indigo-600"
                                            onClick={() => applyDiscount(generalDiscount)}
                                        >
                                            <CiInboxOut className="mr-1" /> {t('panel.newCapture.apply')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center text-slate-500 bg-slate-50">
                                <p className="font-medium">{t('panel.newCapture.pickProvider')}</p>
                                <p className="text-sm">{t('panel.newCapture.discountsHint')}</p>
                            </div>
                        )}
                    </div>
                    <div className="mb-5 md:mt-5 flex lg:mt-0 lg:ml-4 order-1 lg:order-2">
                        <span className="ml-3 block mx-1">
                            <button
                                onClick={confirmCancel}
                                type="button"
                                className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50"
                            >
                                <IoBagRemove aria-hidden="true" className="mr-1.5 -ml-0.5 size-5 text-gray-400" />
                                {cancelButtonLabel}
                            </button>
                        </span>
                        <span className="sm:ml-3 mx-1">
                            {captureFinished && !isEditingMode ? (
                                <button
                                    type="button"
                                    onClick={handleResetCapture}
                                    className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                                >
                                    <FaFileCircleCheck aria-hidden="true" className="mr-1.5 -ml-0.5 size-5" />
                                    NUEVA CAPTURA
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${submitButtonTheme}`}
                                >
                                    <FaFileCircleCheck aria-hidden="true" className="mr-1.5 -ml-0.5 size-5" />
                                    {submitButtonLabel}
                                </button>
                            )}
                        </span>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-3 my-3">
                    <div className="">
                        <label className="block text-sm 2xl:text-lg font-medium text-[rgb(var(--color-text))]">
                            {t('panel.newCapture.invoiceNumber')}
                        </label>
                        <input
                            type="text"
                            placeholder={t('panel.newCapture.invoiceId')}
                            value={addItem['Factura'] || ''}
                            onChange={(e) => handleInputChange('Factura', e.target.value)}
                            className={inputClass('factura')}
                        />
                        {errorMessages.provider && (
                            <span className="text-red-600 text-sm">{errorMessages.provider}</span>
                        )}
                    </div>

                    <div className="">
                        <label className="block text-sm 2xl:text-lg font-medium text-[rgb(var(--color-text))]">
                            {t('panel.capture.provider')}
                        </label>
                        <select
                            value={selectedProvider?.value || ''}
                            onChange={handleProviderChange}
                            className={`block w-full rounded-md border ${
                                errorMessages.provider ? 'border-red-400 bg-red-50' : 'border-slate-200'
                            } py-2 px-3 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500`}
                        >
                            <option value="">{t('panel.newCapture.selectProvider')}</option>
                            {providerOptions.map((provider) => (
                                <option key={provider.value} value={provider.value}>
                                    {provider.label}
                                </option>
                            ))}
                        </select>
                        {errorMessages.provider && (
                            <span className="text-red-600 text-sm">{errorMessages.provider}</span>
                        )}
                    </div>

                    <div className="">
                        <label className="block text-sm 2xl:text-lg font-medium text-[rgb(var(--color-text))]">
                            {t('panel.capture.purchaseDate')}
                            {/* LA FECHA PAGO ES EL RESULTADO SE SUMAR LOS DIAS DE LA BASE DE DATOS A LA FECHA DE LA COMPRA,
                            SI LA FECHA DE LA COMPRA NO TIENE DIAS DE PLAZO ENTONCES FECHA_CAPTURA = FECHA_PAGO */}
                        </label>
                        <input
                            type="date"
                            value={addItem['Fecha compra'] || today}
                            onChange={(e) => handleInputChange('Fecha compra', e.target.value)}
                            className={inputClass('compra')}
                        />
                        {errorMessages.compra && (
                            <span className="text-red-600 text-sm">{errorMessages.compra}</span>
                        )}
                    </div>
                </div>
                <div className="mx-auto max-w-[1700px] lg:px-5 mt-5 overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-3 mx-auto gap-x-3 gap-y-6 lg:mx-0 px-5 xl:px-0">
                        <div className= 'lg:rounded-2xl my-5 pt-2 shadow w-auto overflow-hidden rounded-xl md:-mx-3 lg:-mx-9 xl:-mx-2'>
                            <FindProducts
                                onAddProduct={handleAddProduct}
                                onRemoveProduct={handleRemoveProduct}
                                addedItems={items}
                                isCapture={true}
                                includePendingProducts={false}
                                includeWebBranch={false}
                                allowedSearchTypes={['Descripcion', 'Parte', 'Localizacion']}
                            />
                        </div>
                        <div className='grid-cols-1 lg:col-span-2 w-auto'>
                            <TableCapture
                                ref={tableRef}
                                items={items}
                                onRemoveProduct={handleRemoveProduct}
                                defaultDiscounts={defaultDiscounts}
                            />
                        </div>
                    </div>
                    {showModal && (
                    <div className="fixed z-40 inset-0 overflow-y-auto bg-stone-700/80">
                        <div className="flex items-center justify-center min-h-screen">
                            <div className='relative max-w-7xl sm:px-10 lg:px-20 bg-gradient-to-bl from-[rgb(var(--color-card))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] p-3 sm:rounded-xl shadow-xl py-12'>
                                <div className='absolute -top-5 right-1/2 translate-x-1/2 shadow bg-[rgb(var(--color-card))] rounded-full p-3 cursor-pointer animate-out'>
                                    <GoAlertFill className='h-9 w-9 text-amber-500 hover:opacity-80'/>
                                </div>
                                <button onClick={handleCancel} className="absolute top-2 right-2 text-red-500 text-xl z-10">
                                    <IoMdCloseCircle className='h-7 w-7 animate-out' />
                                </button>
                                <div className="relative overflow-y-auto h-[140px]">
                                    <div className="flex flex-col items-center justify-center">
                                        <h2 className="text-2xl/7 p-2 font-bold text-[rgb(var(--color-text))] sm:truncate sm:text-3xl sm:tracking-tight mb-1 border-b-2 border-slate-300 w-full">
                                            {t('panel.newCapture.confirmCancel')}
                                        </h2>
                                        <p className="text-[rgb(var(--color-text))] opacity-80">{t('panel.newCapture.confirmCancelHint')}</p>
                                    </div>
                                    <div className="flex justify-center px-6 lg:px-8 mt-0.5 sm:mt-3">
                                        <a href='/productivity?load=capture'
                                            type="button"
                                            className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50"
                                        >
                                            <IoBagRemove aria-hidden="true" className="mr-1.5 -ml-0.5 size-5 text-gray-400" />
                                            {t('panel.newCapture.cancel')}
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            </div>
        </form>
    );

}
