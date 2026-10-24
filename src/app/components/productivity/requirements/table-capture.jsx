import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';
import Select from 'react-select';
import { MdDelete, MdDeleteSweep } from 'react-icons/md';
import { IoText } from 'react-icons/io5';
import { RiCoinsFill } from 'react-icons/ri';
import { FaUnlock, FaLock } from 'react-icons/fa';

const customStyles = {
    control: (provided) => ({
        ...provided,
        minHeight: '24px',
        height: '24px',
        fontSize: '12px',
        backgroundColor: 'white',
        borderColor: 'gray',
        boxShadow: 'none',
        '&:hover': {
            borderColor: 'blue'
        }
    }),
    valueContainer: (provided) => ({
        ...provided,
        height: '24px',
        padding: '0 6px'
    }),
    indicatorsContainer: (provided) => ({
        ...provided,
        height: '24px'
    }),
    dropdownIndicator: (provided) => ({
        ...provided,
        padding: '0px'
    }),
    singleValue: (provided) => ({
        ...provided,
        fontSize: '12px'
    }),
    menu: (provided) => ({
        ...provided,
        zIndex: 50
    })
};

const quantityOptions = Array.from({ length: 300 }, (_, i) => ({ value: i + 1, label: `${i + 1}` }));
const MAX_DISCOUNTS = 3;

const TableCapture = forwardRef(({
    items,
    onRemoveProduct,
    onShowTextArea = 'none',
    folio = null,
    defaultDiscounts = {}
}, ref) => {
    const { t } = useTranslation();
    const [quantities, setQuantities] = useState({});
    const [costs, setCosts] = useState({});
    const [baseCosts, setBaseCosts] = useState({});
    const [discountRows, setDiscountRows] = useState({});
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        setQuantities((prev) => {
            const next = {};
            items.forEach((item) => {
                next[item.refaccion] = prev[item.refaccion] ?? item.cantidad ?? 1;
            });
            return next;
        });
        setBaseCosts((prev) => {
            const next = {};
            items.forEach((item) => {
                const key = item.refaccion;
                const base = Number(item.costoBase ?? item.costo ?? item.precio ?? 0);
                next[key] = prev[key] ?? base;
            });
            return next;
        });
        setCosts((prev) => {
            const next = {};
            items.forEach((item) => {
                const key = item.refaccion;
                const base = Number(item.costo ?? item.costoBase ?? item.precio ?? 0);
                next[key] = prev[key] ?? base;
            });
            return next;
        });
        setDiscountRows((prev) => {
            const next = {};
            items.forEach((item) => {
                if (prev[item.refaccion]) {
                    next[item.refaccion] = prev[item.refaccion];
                }
            });
            return next;
        });
    }, [items]);


    const handleQuantityChange = (product, selectedOption) => {
        setQuantities((prev) => ({ ...prev, [product.refaccion]: selectedOption.value }));
    };

    const handleRemoveClick = (product) => {
        if (product.locked) return;
        onRemoveProduct(product.refaccion);
        setQuantities((prev) => {
            const next = { ...prev };
            delete next[product.refaccion];
            return next;
        });
        setCosts((prev) => {
            const next = { ...prev };
            delete next[product.refaccion];
            return next;
        });
        setBaseCosts((prev) => {
            const next = { ...prev };
            delete next[product.refaccion];
            return next;
        });
        setDiscountRows((prev) => {
            const next = { ...prev };
            delete next[product.refaccion];
            return next;
        });
    };

    const appendDiscountRow = (productRef, numericDiscount, options = {}) => {
        const { autoConfirm = false, isGeneralRow = false } = options;
        let applied = false;
        setDiscountRows((prev) => {
            const current = prev[productRef] || [];
            if (current.length >= MAX_DISCOUNTS) {
                if (!isGeneralRow) {
                    setError(t('panel.tableCapture.maxDiscounts'));
                }
                return prev;
            }
            if (current.some((row) => !row.confirmed)) {
                setError(t('panel.tableCapture.pendingDiscount'));
                return prev;
            }
            if (Number.isFinite(numericDiscount) && (numericDiscount < 0 || numericDiscount >= 1)) {
                setError(t('panel.tableCapture.decimalRange'));
                return prev;
            }
            const hasNumericValue = Number.isFinite(numericDiscount) && numericDiscount > 0;
            const entry = {
                id: `${productRef}-${Date.now()}-${Math.random()}`,
                value: hasNumericValue ? numericDiscount : 0,
                confirmed: hasNumericValue || autoConfirm,
                isGeneral: isGeneralRow
            };
            const updated = [...current, entry];
            if (entry.confirmed) {
                recalculateDiscounts(productRef, updated);
            }
            applied = true;
            setError('');
            return {
                ...prev,
                [productRef]: updated
            };
        });
        return applied;
    };

    const handleDiscountRow = (productRef, discountValue = 0, options = {}) => {
        const { isGeneral = false, autoConfirm = false } = options;
        if (isGeneral) {
            const numericDiscount = Number(discountValue);
            if (!items.length) {
                setError(t('panel.newCapture.needPartsForDiscount'));
                return;
            }
            if (!Number.isFinite(numericDiscount) || numericDiscount <= 0 || numericDiscount >= 1) {
                setError(t('panel.tableCapture.discountRange'));
                return;
            }
            let applied = false;
            items.forEach((item) => {
                const success = appendDiscountRow(item.refaccion, numericDiscount, {
                    autoConfirm: true,
                    isGeneralRow: true
                });
                if (success) {
                    applied = true;
                }
            });
            if (!applied) {
                setError(t('panel.tableCapture.generalDiscountError'));
            }
            return;
        }

        if (!productRef) {
            setError(t('panel.tableCapture.pickPart'));
            return;
        }

        appendDiscountRow(productRef, Number(discountValue), { autoConfirm });
    };

    const recalculateDiscounts = (productRef, rows) => {
        const base = Number(baseCosts[productRef] ?? 0);
        let price = base;
        rows.filter((row) => row.confirmed).forEach((row) => {
            const discountedAmount = Number((price * row.value).toFixed(2));
            price = Number((price - discountedAmount).toFixed(2));
        });
        setCosts((prev) => ({
            ...prev,
            [productRef]: price
        }));
    };

    useEffect(() => {
        if (!items.length || !defaultDiscounts) return;
        setDiscountRows((prev) => {
            const next = { ...prev };
            let changed = false;
            items.forEach((item) => {
                const ref = item.refaccion;
                const defaults = defaultDiscounts[ref];
                if (!defaults || !defaults.length || (next[ref] && next[ref].length)) {
                    return;
                }
                const rows = defaults
                    .map((value, index) => Number(value))
                    .filter((value) => Number.isFinite(value) && value > 0 && value < 1)
                    .map((value, index) => ({
                        id: `${ref}-default-${index}`,
                        value,
                        confirmed: true,
                        isGeneral: false
                    }));
                if (rows.length) {
                    next[ref] = rows;
                    recalculateDiscounts(ref, rows);
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [items, defaultDiscounts]);

    const confirmDiscount = (productRef, discountId) => {
        setDiscountRows((prev) => {
            const rows = prev[productRef] || [];
            const target = rows.find((row) => row.id === discountId);
            if (!target || target.value <= 0) {
                setError(t('panel.tableCapture.invalidDecimal'));
                return prev;
            }
            const updated = rows.map((row) =>
                row.id === discountId ? { ...row, confirmed: true } : row
            );
            recalculateDiscounts(productRef, updated);
            setError('');
            return {
                ...prev,
                [productRef]: updated
            };
        });
    };

    const handleDiscountChange = (productRef, discountId, value) => {
        const numericValue = value === '' ? '' : Number(value);
        if (value !== '' && (Number.isNaN(numericValue) || numericValue < 0 || numericValue >= 1)) {
            setError(t('panel.tableCapture.decimalRange'));
            return;
        }
        setDiscountRows((prev) => {
            const rows = prev[productRef] || [];
            return {
                ...prev,
                [productRef]: rows.map((row) =>
                    row.id === discountId
                        ? { ...row, value: value === '' ? 0 : numericValue, confirmed: false }
                        : row
                )
            };
        });
    };

    const handleRemoveLastDiscountRow = (productRef) => {
        setDiscountRows((prev) => {
            const rows = prev[productRef] || [];
            if (!rows.length) return prev;
            const updated = rows.slice(0, -1);
            recalculateDiscounts(productRef, updated);
            return {
                ...prev,
                [productRef]: updated
            };
        });
    };

    const neto = useMemo(() => {
        return items.reduce((acc, item) => {
            const ref = item.refaccion;
            const qty = quantities[ref] ?? item.cantidad ?? 1;
            const base = Number(baseCosts[ref] ?? item.costoBase ?? item.costo ?? item.precio ?? 0);
            return acc + base * qty;
        }, 0);
    }, [items, quantities, baseCosts]);

    const subtotal = useMemo(() => {
        return items.reduce((acc, item) => {
            const ref = item.refaccion;
            const qty = quantities[ref] ?? item.cantidad ?? 1;
            const current = Number(costs[ref] ?? item.costo ?? item.costoBase ?? item.precio ?? 0);
            return acc + current * qty;
        }, 0);
    }, [items, quantities, costs]);

    const totalDiscount = useMemo(() => neto - subtotal, [neto, subtotal]);
    const totalWithTax = subtotal * 1.16;

    const collectCapturePayload = () => {
        const errors = [];
        const detail = [];

        items.forEach((item) => {
            const ref = item.refaccion;
            const qty = quantities[ref] ?? item.cantidad ?? 1;
            const baseCost = Number(baseCosts[ref] ?? item.costoBase ?? item.costo ?? item.precio ?? 0);
            const currentCost = Number(costs[ref] ?? item.costo ?? item.costoBase ?? baseCost);
            if (!currentCost || Number.isNaN(currentCost)) {
                errors.push(`Ingresa un costo válido para la refacción ${ref}.`);
                return;
            }
            if (qty <= 0) {
                errors.push(`La cantidad para la refacción ${ref} debe ser mayor que 0.`);
                return;
            }
            const pendingDiscount = (discountRows[ref] || []).some((row) => !row.confirmed);
            if (pendingDiscount) {
                errors.push(`Confirma o elimina los descuentos pendientes en ${ref}.`);
                return;
            }
            const actualStock = Number(item.existencia ?? 0);
            const totalStock = actualStock + qty;
            const confirmed = (discountRows[ref] || []).filter((row) => row.confirmed);
            detail.push({
                ref,
                costo: Number(currentCost.toFixed(2)),
                costo_a: Number(baseCost.toFixed(2)),
                actual: actualStock,
                exis: qty,
                cant: totalStock,
                neto: Number((baseCost * qty).toFixed(2)),
                importe: Number((currentCost * qty).toFixed(2)),
                ut: Number(item.utilidad ?? 0),
                d1: Number(confirmed[0]?.value ?? 0),
                d2: Number(confirmed[1]?.value ?? 0),
                d3: Number(confirmed[2]?.value ?? 0)
            });
        });

        return {
            errors,
            detail,
            totals: {
                neto: Number(neto.toFixed(2)),
                descuento: Number(totalDiscount.toFixed(2)),
                subtotal: Number(subtotal.toFixed(2)),
                total: Number(totalWithTax.toFixed(2))
            }
        };
    };

    useImperativeHandle(ref, () => ({
        handleDiscountRow,
        collectCapturePayload
    }));

    const handleAddNote = (value) => {
        setNotes(value.slice(0, 80));
    };

    const renderDiscountRows = (item, ref) => {
        const rows = discountRows[ref] || [];
        if (!rows.length) return null;
        let runningCost = Number(baseCosts[ref] ?? item.costoBase ?? item.costo ?? 0);
        return rows.map((discountRow, index) => {
            const previous = runningCost;
            const discountedAmount = discountRow.confirmed
                ? Number((previous * discountRow.value).toFixed(2))
                : 0;
            if (discountRow.confirmed) {
                runningCost = Number((previous - discountedAmount).toFixed(2));
            }
            const isLastRow = index === rows.length - 1;
            return (
                <tr key={discountRow.id} className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))]">
                    <td colSpan="2" className="p-3 text-right text-xs font-semibold">
                        Descuento decimal (0.0-1.0)
                    </td>
                    <td colSpan="2" className="p-3">
                        <input
                            type="number"
                            step="0.0001"
                            min="0"
                            max="0.9999"
                            value={discountRow.value}
                            disabled={discountRow.confirmed || discountRow.isGeneral}
                            className={`block w-full p-1 border border-[rgb(var(--color-border))] rounded-md text-xs bg-[rgb(var(--color-card))] ${discountRow.isGeneral ? 'cursor-not-allowed opacity-60' : ''}`}
                            onChange={(event) => handleDiscountChange(ref, discountRow.id, event.target.value)}
                        />
                        {!discountRow.isGeneral && (
                            <div className="flex justify-center mt-1">
                                {discountRow.confirmed ? (
                                    <div className="rounded-full bg-[rgb(var(--color-card))] p-1 text-xs">
                                        <FaLock />
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => confirmDiscount(ref, discountRow.id)}
                                        className="rounded-full bg-[rgb(var(--color-amber))] text-white p-1 text-xs"
                                    >
                                        <FaUnlock />
                                    </button>
                                )}
                            </div>
                        )}
                    </td>
                    <td colSpan="2" className="p-3 text-xs">
                        <div>Porcentaje: {(discountRow.value * 100).toFixed(2)}%</div>
                        <div>Anterior: {previous.toFixed(2)} MXN</div>
                        <div className="text-[rgb(var(--color-amber))]">
                            Descontado: {discountedAmount.toFixed(2)} MXN
                        </div>
                    </td>
                    {isLastRow && (
                        <td className="p-3 text-right">
                            <button
                                type="button"
                                onClick={() => handleRemoveLastDiscountRow(ref)}
                                className="bg-red-500 text-white rounded-full p-2 hover:bg-red-700"
                                disabled={!!folio}
                            >
                                <MdDeleteSweep />
                            </button>
                        </td>
                    )}
                </tr>
            );
        });
    };

    return (
        <div className="h-[690px] bg-[rgb(var(--color-card))] rounded-2xl my-5 flex shadow relative justify-center">
            <div className="flex flex-col overflow-x-auto pt-5 lg:mx-1">
                {error && (
                    <div className="mx-6 mb-3 rounded-md border border-red-400 bg-red-100/40 text-red-600 text-xs px-3 py-2">
                        {error}
                    </div>
                )}
                <table className="w-[845px] text-sm text-left text-[rgb(var(--color-text))] shadow-sm">
                    <thead className="text-xs text-[rgb(var(--color-text))] uppercase bg-[rgb(var(--color-card))]">
                        <tr>
                            <th className="p-3">{t('panel.table.part')}</th>
                            <th className="p-3">{t('panel.table.description')}</th>
                            <th className="p-3">{t('panel.table.stock')}</th>
                            <th className="p-3">{t('panel.table.newQuantity')}</th>
                            <th className="p-3">{t('panel.table.cost')}</th>
                            <th className="p-3">{t('panel.table.salePrice')}</th>
                            <th className="p-3">{t('panel.table.discount')}</th>
                            <th className="p-3">{t('panel.table.amount')}</th>
                            <th className="p-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => {
                            const ref = item.refaccion;
                            const qty = quantities[ref] ?? item.cantidad ?? 1;
                            const cost = Number(costs[ref] ?? item.costo ?? item.costoBase ?? item.precio ?? 0);
                            const salePrice = (cost / 1.16).toFixed(2);
                            const amount = (cost * qty).toFixed(2);
                            const hasDiscounts = (discountRows[ref] || []).length > 0;
                            return (
                                <React.Fragment key={ref}>
                                    <tr className='bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))] relative'>
                                        <td className="p-4">
                                            <div className='italic text-xs flex flex-col justify-center items-center'>
                                                <div className='text-base'>{ref}</div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span>{item.descripcion}</span>
                                        </td>
                                        <td className="py-4 flex justify-center">
                                            <Select
                                                value={{ value: item.existencia, label: item.existencia.toString() }}
                                                isDisabled={true}
                                                styles={customStyles}
                                                className="pointer-events-none"
                                            />
                                        </td>
                                        <td className="py-4">
                                            <Select
                                                value={quantityOptions.find(option => option.value === qty)}
                                                onChange={(selectedOption) => handleQuantityChange(item, selectedOption)}
                                                options={quantityOptions}
                                                styles={customStyles}
                                                isDisabled={!!folio || hasDiscounts}
                                            />
                                        </td>
                                        <td className="p-1">
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={cost}
                                                onChange={(e) => {
                                                    const newPrice = Number(e.target.value);
                                                    if (!Number.isNaN(newPrice)) {
                                                        setCosts(prev => ({ ...prev, [ref]: newPrice }));
                                                        setBaseCosts(prev => ({ ...prev, [ref]: newPrice }));
                                                    }
                                                }}
                                                className="block w-full p-1 text-[rgb(var(--color-text))] border border-[rgb(var(--color-border))] rounded-md bg-[rgb(var(--color-card))] text-xs"
                                                disabled={!!folio || hasDiscounts}
                                            />
                                        </td>
                                        <td className="p-2">
                                            <span>{salePrice}</span>
                                        </td>
                                        <td className='p-2'>
                                            <div
                                                className='flex flex-col justify-center items-center cursor-pointer'
                                                onClick={() => handleDiscountRow(ref)}
                                            >
                                                <div className='bg-yellow-500 rounded-full shadow h-5 w-5 flex items-center justify-center'>
                                                    <RiCoinsFill />
                                                </div>
                                                <span className='bg-[rgb(var(--color-card))] rounded-md mt-2 p-1'>{t('panel.capture.discount')}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">{amount}</td>
                                        <td className="p-4">
                                            <button
                                                onClick={() => handleRemoveClick(item)}
                                                className={`rounded-full p-2 ${item.locked ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-red-500 text-white hover:bg-red-700'}`}
                                                disabled={!!folio || item.locked}
                                                title={item.locked ? t('panel.tableCapture.lockedRow') : t('panel.tableCapture.removePart')}
                                            >
                                                <MdDelete />
                                            </button>
                                        </td>
                                    </tr>
                                    {renderDiscountRows(item, ref)}
                                </React.Fragment>
                            );
                        })}
                        {onShowTextArea === 'block' && (
                            <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))] relative">
                                <td className='gray-circle-button absolute translate-x-1/2 translate-y-1/2 left-4 -top-2'>
                                    <IoText className="text-2xl text-blue-200" />
                                    <span></span>
                                </td>
                                <td colSpan="6" className="p-4">
                                    <textarea
                                        id="nota"
                                        name="nota"
                                        value={notes}
                                        onChange={(e) => handleAddNote(e.target.value)}
                                        className="w-full px-2 py-1 border border-[rgb(var(--color-border))] rounded text-xs text-blue-500 focus:ring-blue-500 focus:border-blue-500 bg-[rgb(var(--color-card))] uppercase text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-text))] placeholder:opacity-60"
                                        placeholder={t('panel.table.notePlaceholder')}
                                        rows="3"
                                        maxLength="80"
                                        disabled={!!folio}
                                    />
                                </td>
                            </tr>
                        )}
                        <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))]">
                            <td className="py-4 px-3 font-bold">{t('panel.table.net')}</td>
                            <td className="py-4 px-1 font-bold text-md text-[rgb(var(--color-text))]" colSpan="8">
                                {neto.toFixed(2)} {t('promotions.currency')}
                            </td>
                        </tr>
                        <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))]">
                            <td className="py-4 px-3 font-bold">{t('panel.table.totalDiscount')}</td>
                            <td className="py-4 px-1 font-bold text-md text-[rgb(var(--color-text))]" colSpan="8">
                                {totalDiscount.toFixed(2)} {t('promotions.currency')}
                            </td>
                        </tr>
                        <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))]">
                            <td className="py-4 px-3 font-bold">{t('panel.table.subtotal')}</td>
                            <td className="py-4 px-1 font-bold text-md text-[rgb(var(--color-text))]" colSpan="8">
                                {subtotal.toFixed(2)} {t('promotions.currency')}
                            </td>
                        </tr>
                        <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-border))]">
                            <td className="py-4 px-3 font-bold">{t('panel.table.total2')}</td>
                            <td className="py-4 px-1 font-bold text-xl text-green-600" colSpan="8">
                                {totalWithTax.toFixed(2)} {t('promotions.currency')}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
});

export default TableCapture;
