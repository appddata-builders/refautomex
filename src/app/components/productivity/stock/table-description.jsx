import React, { useEffect, useState, useRef} from 'react';
import { useReactToPrint } from 'react-to-print';
import { MdDelete, MdEditSquare } from "react-icons/md";
import Select from 'react-select';
import { LuListRestart } from "react-icons/lu";
import { CiBoxList } from "react-icons/ci";
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';

const parseRoutes = (raw) => {
    if (!raw) return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
        return [];
    }
};

const resolveProductImage = (ruta, multimediaSrc = '') => {
    if (!ruta) return `${multimediaSrc}productos/no-img.png`;
    return ruta.startsWith('http') ? ruta : `${multimediaSrc}${ruta}`;
};

export default function TableDescription({
    items,
    buttonConfigs,
    onRemoveProduct,
    onUpdateProduct,
    handleMouseEnter,
    handleMouseLeave,
    visibleTooltip,
    onEditClick,
    isSaving = false,
    isAdmin = false,
}) {
    const { t } = useTranslation();
    const [QuantityOptions, setQuantityOptions] = useState([]);
    const listRef = useRef();
    const printRef = useRef(null);
    const IVA_FACTOR = 1.16;
    const DEFAULT_UTILITY = 1.3;
    const multimediaSrc = process.env.NEXT_PUBLIC_S3 || '';

    const getProductImage = (product) => {
        if (product?.imageSrc) return product.imageSrc;
        const routes = parseRoutes(product?.rutas);
        const fallback = routes.length > 0 ? routes[0] : '';
        return resolveProductImage(fallback, multimediaSrc);
    };

    const handleQuantityChange = (product, selectedOption) => {
        const newQuantity = selectedOption?.value;
        if (newQuantity === undefined) return;
        onUpdateProduct(product.refaccion, { existencia: newQuantity });
    };

    const handleListPrint = useReactToPrint({
        content: () => printRef.current,
        contentRef: printRef,
        onAfterPrint: () => {
            // Opcional: alguna acción después de imprimir
            console.log('Etiquetas impresas');
        }
    });

    const handleLocationChange = (product, event) => {
        const newLocation = event.target.value;
        onUpdateProduct(product.refaccion, { localizacion: newLocation });
    };

    const handleLocationBlur = (product, event) => {
        const normalizedLocation = event.target.value.toUpperCase();
        if (normalizedLocation !== product.localizacion) {
            onUpdateProduct(product.refaccion, { localizacion: normalizedLocation });
        }
    };

    const handleDescriptionChange = (product, event) => {
        const newDescription = event.target.value;
        onUpdateProduct(product.refaccion, { descripcion: newDescription });
    };

    const handleDescriptionBlur = (product, event) => {
        const normalizedDescription = event.target.value.toUpperCase();
        if (normalizedDescription !== product.descripcion) {
            onUpdateProduct(product.refaccion, { descripcion: normalizedDescription });
        }
    };

    const handlePriceChange = (product, event) => {
        const rawPrice = event.target.value;
        if (rawPrice === '') {
            onUpdateProduct(product.refaccion, { precio: '', costo: '', aIva: '' });
            return;
        }

        const parsedPrice = parseFloat(rawPrice);
        if (Number.isNaN(parsedPrice)) {
            // Mantener el valor introducido para que el usuario pueda corregirlo
            onUpdateProduct(product.refaccion, { precio: rawPrice });
            return;
        }

        const utilidad = parseFloat(product.utilidad) || DEFAULT_UTILITY;
        const calculatedAIva = parsedPrice / IVA_FACTOR;
        const calculatedCost = calculatedAIva / utilidad;

        onUpdateProduct(product.refaccion, {
            precio: rawPrice,
            aIva: calculatedAIva.toFixed(2),
            costo: calculatedCost.toFixed(2)
        });
    };

    const handleRemoveClick = (product) => {
        onRemoveProduct(product.refaccion);
    };

    const handleClearTable = () => {
        items.forEach(item => onRemoveProduct(item.refaccion));
    };

    useEffect(() => {
        const fetchQuantity = async () => {
            try {
                const response = await fetch(buildApiUrl('/getQuantity'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const formattedQuantityOptions = payload.map(cantidad => ({
                    value: cantidad.idCantidad,
                    label: cantidad.cantidad
                }));
                setQuantityOptions(formattedQuantityOptions);
            } catch (error) {
                console.error('Error fetching Quantity:', error);
            }
        };

        fetchQuantity();
    }, []);

    return (
        <div className="h-[87vh] bg-[rgb(var(--color-card))] rounded-2xl my-5 flex shadow shadow-[rgb(var(--color-galaxy))] relative">
            <div className='flex flex-col px-1 bg-[rgb(var(--color-bg))] rounded-l-2xl pt-10 relative'>
                {buttonConfigs.map(({ icon: Icon, label, id, event, btnconf, disabled }) => (
                    <button
                        type="button"
                        key={id}
                        className={`${btnconf} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                        onMouseEnter={() => handleMouseEnter(id)}
                        onMouseLeave={() => handleMouseLeave(id)}
                        onClick={!disabled ? event : undefined}
                        disabled={disabled}
                    >
                        <Icon />
                        {visibleTooltip[id] && (
                            <div className="tooltip-content absolute left-full ml-3 top-1/2 transform -translate-y-1/2 opacity-90 bg-[rgb(var(--color-card))] shadow text-[rgb(var(--color-text))] text-xs rounded px-2 py-1 z-10"
                                style={{ width: 'max-content', maxWidth: '16rem' }}>
                                {label}
                            </div>
                        )}
                    </button>
                ))}
            </div>
            <div className="flex flex-col overflow-x-scroll w-full">
                <table ref={listRef} className="w-full text-sm text-left text-[rgb(var(--color-text))] shadow-sm">
                    <thead className="text-xs text-[rgb(var(--color-text))] uppercase bg-[rgb(var(--color-gray))] sticky top-0 z-10">
                        <tr>
                            <th className='p-1'>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={handleListPrint}
                                        title={t('panel.tableDesc.printList')}
                                        className={`bg-gray-700 text-white rounded-full p-1.5 self-center flex items-center mx-0.5 ${isSaving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                        disabled={isSaving}
                                    >
                                        <CiBoxList className="text-lg" />
                                    </button>
                                    <button
                                        onClick={handleClearTable}
                                        title={t('panel.tableDesc.clear')}
                                        className={`bg-red-700 text-white rounded-full p-1.5 self-center flex items-center mx-0.5 ${isSaving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                        disabled={isSaving}
                                    >
                                        <LuListRestart className="text-lg" />
                                    </button>
                                    <span className="font-semibold">{t('panel.capture.part')}</span>
                                </div>
                            </th>
                            <th className="p-1">{t('panel.tableDesc.img')}</th>
                            <th className="p-1">{t('panel.table.description')}</th>
                            <th className="p-1">{t('panel.tableDesc.location')}</th>
                            <th className="p-1">{t('panel.table.stock')}</th>
                            <th className="p-1">{t('panel.table.cost')}</th>
                            <th className="p-1">{t('panel.table.price')}</th>
                            <th className="p-1">{t('panel.table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            return (
                                <tr
                                    className={`${item.isPedido ? 'bg-blue-200' : item.existencia === 0 ? 'bg-[rgb(var(--color-error-base))]' : 'bg-[rgb(var(--color-card))]'} border-b border-[rgb(var(--color-border))] relative`}
                                    key={index}
                                >
                                    <td className="p-2">
                                        <div className='italic text-xs flex flex-col justify-center items-start'>
                                            <div className='text-base w-32'>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => onEditClick(item)}
                                                    className={`bg-amber-400 mr-1 text-white rounded-full p-1 hover:bg-yellow-600 ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                    disabled={isSaving}
                                                >
                                                    <MdEditSquare />
                                                </button>
                                            )}
                                            {item.refaccion}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-2 w-16">
                                        <div className="h-12 w-12 rounded-md overflow-hidden border border-[rgb(var(--color-border))] bg-white flex items-center justify-center">
                                            <img
                                                src={getProductImage(item)}
                                                alt={item.descripcion || item.refaccion}
                                                className="object-contain h-full w-full"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = resolveProductImage('', multimediaSrc);
                                                }}
                                            />
                                        </div>
                                    </td>
                                    <td className="p-2">
                                        {isAdmin ? (
                                            <input
                                                type="text"
                                                value={item.descripcion}
                                                onChange={(event) => handleDescriptionChange(item, event)}
                                                onBlur={(event) => handleDescriptionBlur(item, event)}
                                                disabled={isSaving}
                                                className={`block w-96 md:w-96 p-1 text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))] rounded-lg bg-[rgb(var(--color-card))] text-xs focus:ring-blue-500 focus:border-blue-500 placeholder:text-[rgb(var(--color-text))] placeholder:opacity-60 uppercase ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                                            />
                                        ) : (
                                            <span className="text-xs text-[rgb(var(--color-text))]">{item.descripcion || '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-2">
                                        {isAdmin ? (
                                            <input
                                                type="text"
                                                value={item.localizacion}
                                                onChange={(event) => handleLocationChange(item, event)}
                                                onBlur={(event) => handleLocationBlur(item, event)}
                                                disabled={isSaving}
                                                className={`block p-1 text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))] rounded-lg bg-[rgb(var(--color-card))] text-xs focus:ring-blue-500 focus:border-blue-500 placeholder:text-[rgb(var(--color-text))] placeholder:opacity-60 uppercase ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                                            />
                                        ) : (
                                            <span className="text-xs text-[rgb(var(--color-text))]">{item.localizacion || '-'}</span>
                                        )}
                                    </td>
                                    <td className="py-2">
                                        {isAdmin ? (
                                            <Select
                                                id="existencia"
                                                name="existencia"
                                                value={QuantityOptions.find(option => option.value === item.existencia)}
                                                onChange={(selectedOption) => handleQuantityChange(item, selectedOption)}
                                                options={QuantityOptions}
                                                classNamePrefix="react-select"
                                                className='m-0 p-0 w-20'
                                                isDisabled={isSaving}
                                            />
                                        ) : (
                                            <span className="text-xs text-[rgb(var(--color-text))]">{item.existencia ?? '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-2">
                                        {isAdmin ? (
                                            <input
                                                id={`costo-${item.refaccion}`}
                                                type="number"
                                                step="0.01"
                                                value={item.costo ?? ''}
                                                readOnly
                                                disabled
                                                className="block w-24 p-1 text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))] rounded-lg bg-gray-100 text-xs focus:ring-blue-500 focus:border-blue-500 placeholder:text-[rgb(var(--color-text))] placeholder:opacity-60 cursor-not-allowed"
                                            />
                                        ) : (
                                            <span className="text-xs text-[rgb(var(--color-text))]">{item.costo ?? '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-2">
                                        {isAdmin ? (
                                            <input
                                                id={`precio-${item.refaccion}`}
                                                type="number"
                                                step="0.01"
                                                value={item.precio ?? ''}
                                                onChange={(event) => handlePriceChange(item, event)}
                                                disabled={isSaving}
                                                className={`block w-24 p-1 text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))] rounded-lg bg-[rgb(var(--color-card))] text-xs focus:ring-blue-500 focus:border-blue-500 placeholder:text-[rgb(var(--color-text))] placeholder:opacity-60 ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                                            />
                                        ) : (
                                            <span className="text-xs text-[rgb(var(--color-text))]">{item.precio ?? '-'}</span>
                                        )}
                                    </td>
                                    <td className="p-2">
                                        {isAdmin ? (
                                            <button
                                                onClick={() => handleRemoveClick(item)}
                                                className={`bg-red-500 mx-2 text-white rounded-full p-2 hover:bg-red-700 ${isSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                disabled={isSaving}
                                            >
                                                <MdDelete />
                                            </button>
                                        ) : (
                                            <span className="text-xs text-[rgb(var(--color-text))]/70">-</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))]">
                            <td className="py-2 font-bold text-xl text-amber-500" colSpan="8">
                                <div className='flex justify-center items-center'>
                                    <span className='px-2 text-[rgb(var(--color-text))] italic'>
                                        PRODUCTOS
                                    </span>
                                    <span className="px-2 bg-amber-500 text-white font-semibold rounded-full h-10 w-10 text-md flex items-center justify-center shadow-lg">
                                        {items.length}
                                    </span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div className="absolute left-[-9999px] top-0" aria-hidden="true">
                    <table
                        ref={printRef}
                        className="w-[900px] text-sm text-black border border-gray-400 border-collapse"
                    >
                        <thead>
                            <tr className="bg-gray-200 text-left">
                                <th className="border border-gray-400 px-3 py-2 uppercase tracking-wide text-xs">{t('panel.capture.part')}</th>
                                <th className="border border-gray-400 px-3 py-2 uppercase tracking-wide text-xs">{t('panel.capture.descriptionLabel')}</th>
                                <th className="border border-gray-400 px-3 py-2 uppercase tracking-wide text-xs">{t('panel.tableDesc.locationTitle')}</th>
                                <th className="border border-gray-400 px-3 py-2 uppercase tracking-wide text-xs">{t('panel.tableDesc.stockTitle')}</th>
                                <th className="border border-gray-400 px-3 py-2 uppercase tracking-wide text-xs">{t('panel.capture.cost')}</th>
                                <th className="border border-gray-400 px-3 py-2 uppercase tracking-wide text-xs">{t('panel.invoice.price')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((product, index) => (
                                <tr
                                    key={`print-${product.refaccion}`}
                                    className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                                >
                                    <td className="border border-gray-300 px-3 py-1 uppercase text-xs font-semibold">
                                        {product.refaccion}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1 text-xs">
                                        {product.descripcion}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1 text-xs">
                                        {product.localizacion || '-'}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1 text-xs text-center">
                                        {product.existencia}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1 text-xs">
                                        {product.costo ?? '-'}
                                    </td>
                                    <td className="border border-gray-300 px-3 py-1 text-xs">
                                        {product.precio ?? '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
