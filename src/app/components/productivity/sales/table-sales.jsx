import React, { useState, useEffect, useRef } from 'react';
import { MdDelete } from "react-icons/md";
import { IoText } from 'react-icons/io5';
import Select from 'react-select';
import { useTranslation } from '@/app/lib/text/text-provider';

const customStyles = {
    control: (base, state) => ({
    ...base,
    backgroundColor: 'rgb(var(--color-card))',
    borderRadius: '9999px',
    boxShadow: state.isFocused
        ? '0 0 0 1px rgb(var(--color-galaxy))'
        : '0 1px 2px rgb(var(--color-galaxy))',
    borderColor: state.isFocused
        ? 'rgb(var(--color-card))'
        : 'rgb(var(--color-card))',
    color: 'rgb(var(--color-text-base))',
    transition: 'all 0.2s ease',
    '&:hover': {
        boxShadow: '0 0 0 2px rgb(var(--color-galaxy))',
    },
    }),
    singleValue: (base) => ({
    ...base,
    color: 'rgb(var(--color-text))',
    fontSize: '0.75rem',
    fontWeight: '500',
    }),
    menu: (base) => ({
    ...base,
    backgroundColor: 'rgb(var(--color-card))',
    borderRadius: '0.75rem',
    boxShadow: 'rgb(var(--color-galaxy))',
    zIndex: 50,
    }),
    option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
        ? 'rgb(var(--color-galaxy))'
        : state.isFocused
        ? 'rgb(var(--color-galaxy))'
        : 'transparent',
    color: 'rgb(var(--color-text))',
    cursor: 'pointer',
    fontSize: '0.75rem',
    }),
    placeholder: (base) => ({
    ...base,
    color: 'rgba(156, 163, 175, 0.8)',
    }),
    dropdownIndicator: (base, state) => ({
    ...base,
    color: 'rgb(var(--color-galaxy))',
    '&:hover': { color: 'rgb(var(--color-galaxy))' },
    }),
};

const MAX_QUANTITY_OPTIONS = 300;
const getMaxAllowedQuantity = (item) => {
    const stock = Number(item.existencia);
    if (Number.isFinite(stock) && stock > 0) {
        return Math.max(1, Math.min(MAX_QUANTITY_OPTIONS, Math.floor(stock)));
    }
    return MAX_QUANTITY_OPTIONS;
};

const buildQuantityOptions = (item) => {
    const max = getMaxAllowedQuantity(item);
    return Array.from({ length: max }, (_, i) => ({
        value: i + 1,
        label: (i + 1).toString(),
    }));
};

export default function TableSales({ items, buttonConfigs, completeConfigs, onRemoveProduct, onUpdateProduct, handleMouseEnter, handleMouseLeave, onShowTextArea, visibleTooltip, discount, folio, onDiscountChange, onTogglePedido, setItems, handleAddNote, notes }) {
    const { t } = useTranslation();
    const [quantities, setQuantities] = useState(() =>
        items.reduce((acc, item) => ({ ...acc, [item.refaccion]: item.cantidad ?? 1 }), {})
    );
    const [prices, setPrices] = useState(() =>
        items.reduce((acc, item) => ({ ...acc, [item.refaccion]: item.precio }), {})
    );
    const [aIvas, setAIvas] = useState(() =>
        items.reduce((acc, item) => ({
            ...acc,
            [item.refaccion]: (item.precio / 1.16).toFixed(2)
        }), {})
    );

    const [warnings, setWarnings] = useState({});

    const prevItemsRef = useRef(items);
    const prevQuantitiesRef = useRef(quantities);
    const prevPricesRef = useRef(prices);

    useEffect(() => {
        const clampedWarnings = {};
        setQuantities((prev) => {
            const next = {};
            let changed = false;

            items.forEach((item) => {
                const limit = getMaxAllowedQuantity(item);
                const prevQtyRaw = prev[item.refaccion] ?? item.cantidad ?? 1;
                const prevQtyNumber = Number(prevQtyRaw);
                const normalizedQty = Number.isFinite(prevQtyNumber) && prevQtyNumber > 0 ? prevQtyNumber : 1;
                const safeQty = Math.min(normalizedQty, limit);
                next[item.refaccion] = safeQty;
                if (safeQty !== normalizedQty) {
                    changed = true;
                    clampedWarnings[item.refaccion] = t('panel.tableSales.stockWarning', { count: limit });
                }
            });

            if (Object.keys(prev).length !== Object.keys(next).length) {
                changed = true;
            } else if (!changed) {
                const keys = Object.keys(next);
                for (let i = 0; i < keys.length; i += 1) {
                    const key = keys[i];
                    if (prev[key] !== next[key]) {
                        changed = true;
                        break;
                    }
                }
            }

            return changed ? next : prev;
        });

        if (Object.keys(clampedWarnings).length > 0) {
            setWarnings((prev) => ({ ...prev, ...clampedWarnings }));
        }
    }, [items]);

    useEffect(() => {
        setWarnings((prev) => {
            const activeRefs = new Set(items.map((item) => item.refaccion));
            const next = {};
            Object.keys(prev).forEach((ref) => {
                if (activeRefs.has(ref)) {
                    next[ref] = prev[ref];
                }
            });
            return next;
        });
    }, [items]);

    useEffect(() => {
        const hasItemsChanged = JSON.stringify(prevItemsRef.current) !== JSON.stringify(items);
        const hasQuantitiesChanged = JSON.stringify(prevQuantitiesRef.current) !== JSON.stringify(quantities);
        const hasPricesChanged = JSON.stringify(prevPricesRef.current) !== JSON.stringify(prices);

        if (hasItemsChanged || hasQuantitiesChanged || hasPricesChanged) {
            const newItems = items.map((item) => {
                const priceFromState = parseFloat(prices[item.refaccion]);
                const resolvedPrice = Number.isFinite(priceFromState) ? priceFromState : parseFloat(item.precio);
                const price = Number.isFinite(resolvedPrice) ? resolvedPrice : 0;
                const calculatedAIva = (price / 1.16).toFixed(2);
                const qtyRaw = quantities[item.refaccion] ?? item.cantidad ?? 1;
                const qtyNumber = Number(qtyRaw);
                const qty = Number.isFinite(qtyNumber) && qtyNumber > 0 ? qtyNumber : 1;
                const monto = qty * price;

                return {
                    ...item,
                    cantidad: qty,
                    monto: monto,
                    aIva: aIvas[item.refaccion] !== undefined ? aIvas[item.refaccion] : calculatedAIva
                };
            });

            onUpdateProduct(newItems);
            prevItemsRef.current = items;
            prevQuantitiesRef.current = quantities;
            prevPricesRef.current = prices;
        }
    }, [items, quantities, prices, aIvas, onUpdateProduct]);

    const handleQuantityChange = (product, selectedOption) => {
        const newQuantity = selectedOption.value;
        const maxAllowed = getMaxAllowedQuantity(product);
        const adjustedQuantity = Math.min(newQuantity, maxAllowed);

        setQuantities(prevQuantities => ({ ...prevQuantities, [product.refaccion]: adjustedQuantity }));
        setItems(prevItems =>
            prevItems.map(item =>
                item.refaccion === product.refaccion ? { ...item, cantidad: adjustedQuantity } : item
            )
        );

        setWarnings((prev) => {
            const next = { ...prev };
            if (newQuantity > maxAllowed) {
                next[product.refaccion] = t('panel.tableSales.stockWarning', { count: maxAllowed });
            } else if (next[product.refaccion] && next[product.refaccion].includes(t('panel.tableSales.stockWarningMatch'))) {
                delete next[product.refaccion];
            }
            return next;
        });
    };

    const handlePriceChange = (product, event) => {
        const newPrice = parseFloat(event.target.value);

        if (isNaN(newPrice) || newPrice <= 0) {
            setPrices(prevPrices => ({ ...prevPrices, [product.refaccion]: "" }));
            setWarnings(prevWarnings => ({
                ...prevWarnings,
                [product.refaccion]: t('panel.tableSales.priceZero')
            }));
        } else {
            setPrices(prevPrices => ({ ...prevPrices, [product.refaccion]: newPrice }));
            const calculatedAIva = (newPrice / 1.16).toFixed(2);

            setAIvas(prevAIvas => ({ ...prevAIvas, [product.refaccion]: calculatedAIva }));
            const qtyRaw = quantities[product.refaccion] ?? product.cantidad ?? 1;
            const qtyNumber = Number(qtyRaw);
            const currentQty = Number.isFinite(qtyNumber) && qtyNumber > 0 ? qtyNumber : 1;
            const newMonto = currentQty * newPrice;

            setItems(prevItems =>
                prevItems.map(item =>
                    item.refaccion === product.refaccion
                        ? { ...item, precio: newPrice, monto: newMonto }
                        : item
                )
            );

            setWarnings(prevWarnings => ({
                ...prevWarnings,
                [product.refaccion]: newPrice < product.precio
                    ? t('panel.tableSales.priceTooLow')
                    : (newMonto <= 0 ? t('panel.tableSales.amountZero') : "")
            }));
        }
    };


    const handlePriceBlur = (product) => {
        if (prices[product.refaccion] === "" || prices[product.refaccion] < product.precio) {
            setPrices(prevPrices => ({ ...prevPrices, [product.refaccion]: product.precio }));
            setAIvas(prevAIvas => ({ ...prevAIvas, [product.refaccion]: (product.precio / 1.16).toFixed(2) }));
            setWarnings(prevWarnings => ({
                ...prevWarnings,
                [product.refaccion]: ""
            }));
        }
    };

    const handlePriceFocus = (product) => {
        setPrices(prevPrices => ({ ...prevPrices, [product.refaccion]: "" }));
    };

    const handleAivaChange = (product, event) => {
        const newAiva = parseFloat(event.target.value);
        if (!isNaN(newAiva) && newAiva > 0) {
            setAIvas(prevAIvas => ({ ...prevAIvas, [product.refaccion]: newAiva }));
            const newPrice = (newAiva * 1.16).toFixed(2);
            setPrices(prevPrices => ({ ...prevPrices, [product.refaccion]: newPrice }));
            const qtyRaw = quantities[product.refaccion] ?? product.cantidad ?? 1;
            const qtyNumber = Number(qtyRaw);
            const currentQty = Number.isFinite(qtyNumber) && qtyNumber > 0 ? qtyNumber : 1;
            const newMonto = currentQty * newPrice;
            setItems(prevItems =>
                prevItems.map(item =>
                    item.refaccion === product.refaccion ? { ...item, monto: newMonto } : item
                )
            );
            setWarnings(prevWarnings => ({
                ...prevWarnings,
                [product.refaccion]: newMonto <= 0 ? t('panel.tableSales.amountCantBeZero') : ""
            }));
        } else {
            setWarnings(prevWarnings => ({
                ...prevWarnings,
                [product.refaccion]: t('panel.tableSales.aivaZero')
            }));
        }
    };

    const handleAivaBlur = (product) => {
        const currentAiva = parseFloat(aIvas[product.refaccion]);
        if (isNaN(currentAiva) || currentAiva === "") {
            const defaultAIva = (product.precio / 1.16).toFixed(2);
            setAIvas(prevAIvas => ({ ...prevAIvas, [product.refaccion]: defaultAIva }));
        } else {
            const newPrice = (currentAiva * 1.16).toFixed(2);
            setPrices(prevPrices => ({ ...prevPrices, [product.refaccion]: newPrice }));
        }
    };
    const handleAivaFocus = (product) => {
        setAIvas(prevAIvas => ({ ...prevAIvas, [product.refaccion]: "" }));
    };

    const handleDescriptionChange = (product, index, newDescription) => {
        setItems(prevItems =>
            prevItems.map((itm, i) => i === index ? { ...itm, descripcion: newDescription } : itm)
        );

        setWarnings(prevWarnings => ({
            ...prevWarnings,
            [product.refaccion]: newDescription.trim() === "" ? "La descripción no puede estar vacía" : ""
        }));
    };

    const handleDescriptionFocus = (product) => {
        setWarnings(prevWarnings => ({
            ...prevWarnings,
            [product.refaccion]: ""
        }));
    };

    const handleRemoveClick = (product) => {
        onRemoveProduct(product.refaccion);
        setQuantities(prevQuantities => {
            const newQuantities = { ...prevQuantities };
            delete newQuantities[product.refaccion];
            return newQuantities;
        });
        setPrices(prevPrices => {
            const newPrices = { ...prevPrices };
            delete newPrices[product.refaccion];
            return newPrices;
        });
        setAIvas(prevAIvas => {
            const newAIvas = { ...prevAIvas };
            delete newAIvas[product.refaccion];
            return newAIvas;
        });
        setWarnings(prevWarnings => {
            const newWarnings = { ...prevWarnings };
            delete newWarnings[product.refaccion];
            return newWarnings;
        });
    };

    const discountOptions = [
        { value: 0, label: '0%' },
        { value: 5, label: '5%' },
        { value: 8, label: '8%' },
        { value: 10, label: '10%' }
    ];

    const subtotal = items.reduce((acc, item) => {
        const qtyRaw = quantities[item.refaccion] ?? item.cantidad ?? 1;
        const qtyNumber = Number(qtyRaw);
        const qty = Number.isFinite(qtyNumber) && qtyNumber > 0 ? qtyNumber : 1;
        const priceFromState = parseFloat(prices[item.refaccion]);
        const priceCandidate = Number.isFinite(priceFromState) ? priceFromState : parseFloat(item.precio);
        const safePrice = Number.isFinite(priceCandidate) ? priceCandidate : 0;
        return acc + qty * safePrice;
    }, 0);
    const discountAmount = subtotal * discount / 100;
    const totalWithDiscount = subtotal - discountAmount;

    return (
        <div className="h-[683px] bg-[rgb(var(--color-bg))] rounded-2xl my-5 flex shadow shadow-[rgb(var(--color-gray-base))] relative">
            <div className='flex flex-col px-1 bg-[rgb(var(--color-gray))] rounded-l-2xl pt-5 relative'>
                {!folio ? (
                    buttonConfigs.map(({ icon: Icon, label, id, event, btnconf }) => (
                        <div
                            key={id}
                            className={btnconf}
                            onMouseEnter={() => handleMouseEnter(id)}
                            onMouseLeave={() => handleMouseLeave(id)}
                            onClick={event}
                        >
                            <Icon />
                            {visibleTooltip[id] && (
                                <div className="tooltip-content absolute left-full ml-3 top-1/2 transform -translate-y-1/2 bg-[rgb(var(--color-gray))] shadow text-[rgb(var(--color-text))] text-xs rounded px-2 py-1 z-10"
                                    style={{ width: 'max-content', maxWidth: '16rem' }}>
                                    {label}
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    completeConfigs.map(({ icon: Icon, label, id, event, btnconf }) => (
                        <div
                            key={id}
                            className={btnconf}
                            onMouseEnter={() => handleMouseEnter(id)}
                            onMouseLeave={() => handleMouseLeave(id)}
                            onClick={event}
                        >
                            <Icon />
                            {visibleTooltip[id] && (
                                <div className="tooltip-content absolute left-full ml-3 top-1/2 transform -translate-y-1/2 bg-[rgb(var(--color-card))] shadow text-[rgb(var(--color-text))] text-xs rounded px-2 py-1 z-10"
                                    style={{ width: 'max-content', maxWidth: '16rem' }}>
                                    {label}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
            <div className="flex flex-col overflow-x-scroll pt-5 lg:mx-1">
                <table className="w-[845px] xl:w-[900px] text-sm text-left shadow-sm">
                    <thead className="text-xs uppercase bg-[rgb(var(--color-gray))] text-[rgb(var(--color-text))]">
                        <tr>
                            <th className="p-3">{t('panel.table.part')}</th>
                            <th className="p-3">{t('panel.table.quantity')}</th>
                            <th className="p-3">{t('panel.table.description')}</th>
                            <th className="p-3">{t('panel.table.aiva')}</th>
                            <th className="p-3">{t('panel.table.price')}</th>
                            <th className="p-3">{t('panel.table.amountShort')}</th>
                            <th className="p-3">{t('panel.table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            const priceFromState = parseFloat(prices[item.refaccion]);
                            const rawPrice = Number.isFinite(priceFromState) ? priceFromState : parseFloat(item.precio);
                            const price = Number.isFinite(rawPrice) ? rawPrice : 0;
                            const aivaFromState = parseFloat(aIvas[item.refaccion]);
                            const aiva = Number.isFinite(aivaFromState) ? aivaFromState : (price / 1.16).toFixed(2);
                            const selectedQuantityRaw = quantities[item.refaccion] ?? item.cantidad ?? 1;
                            const selectedQuantityNumber = Number(selectedQuantityRaw);
                            const selectedQuantity = Number.isFinite(selectedQuantityNumber) && selectedQuantityNumber > 0 ? selectedQuantityNumber : 1;
                            const quantityOptions = buildQuantityOptions(item);
                            const selectedQuantityOption =
                                quantityOptions.find(option => option.value === selectedQuantity) ||
                                quantityOptions[quantityOptions.length - 1];
                            const monto = selectedQuantity * price;
                            return (
                                <tr
                                    className={`${item.isPedido ? 'bg-[rgb(var(--color-blue))] text-white' : item.existencia === 0 ? 'bg-[rgb(var(--color-error-base))]' : 'bg-[rgb(var(--color-card))]'} border-b border-[rgb(var(--color-gray))] relative text-[rgb(var(--color-text))]`}
                                    key={index}
                                >
                                    <td className="p-4">
                                        <div className='italic text-xs flex flex-col justify-center items-center'>
                                            <div className='text-base'>
                                            {item.refaccion}
                                            </div>
                                            <div>
                                            <input
                                                type="checkbox"
                                                className='h-3 w-3 rounded border-gray-300 text-amber-600 focus:ring-amber-600 mr-2 -ml-3'
                                                checked={item.isPedido || false}
                                                onChange={() => onTogglePedido(item.refaccion)}
                                                disabled={!!folio}
                                            />
                                            pedir
                                            </div>
                                        </div>
                                        {warnings[item.refaccion] && (
                                            <div className="absolute left-54 bottom-2 z-10 text-xs text-[rgb(var(--color-error))] bg-[rgb(var(--color-card))]/70 shadow-md shadow-[rgb(var(--color-galaxy))] p-1 rounded-md font-bold animate-up">
                                                {warnings[item.refaccion]}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-4">
                                        <Select
                                            value={selectedQuantityOption}
                                            onChange={(selectedOption) => handleQuantityChange(item, selectedOption)}
                                            options={quantityOptions}
                                            styles={customStyles}
                                            isDisabled={!!folio}
                                        />
                                    </td>
                                    <td className="p-4">
                                        {item.isEditable ? (
                                            <input
                                            type="text"
                                            value={item.descripcion}
                                            onChange={(e) => handleDescriptionChange(item, index, e.target.value)}
                                            onFocus={() => handleDescriptionFocus(item)}
                                            disabled={!!folio}
                                            placeholder={t('panel.capture.descriptionLabel')}
                                            className={`w-full p-2 rounded-full text-xs uppercase
                                                ${item.descripcion.trim() === "" ? "bg-red-100 placeholder-gray-800" : "border-gray-300"}
                                                bg-[rgb(var(--color-bg))] placeholder-[rgb(var(--color-text))] text-[rgb(var(--color-text))] shadow-md shadow-[rgb(var(--color-galaxy))]`}
                                            />
                                        ) : (
                                            <span>{item.descripcion}</span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        {item.isSeminew ? (
                                            <input
                                                type="number"
                                                value={aIvas[item.refaccion] !== undefined ? aIvas[item.refaccion] : item.aIva}
                                                onChange={(event) => handleAivaChange(item, event)}
                                                onBlur={() => handleAivaBlur(item)}
                                                onFocus={() => handleAivaFocus(item)}
                                                disabled={!!folio}
                                                className="w-full p-2 rounded-full text-xs bg-[rgb(var(--color-bg))] border-gray-300 text-[rgb(var(--color-text))] shadow-md shadow-[rgb(var(--color-galaxy))]"
                                            />
                                        ) : (
                                            <span>{aiva}</span>
                                        )}
                                    </td>
                                    <td className="p-4 relative">
                                        {item.isSeminew ? (
                                            <span>{price}</span>
                                        ) : (
                                            <input
                                                type="number"
                                                value={prices[item.refaccion] !== undefined ? prices[item.refaccion] : item.precio}
                                                onChange={(event) => handlePriceChange(item, event)}
                                                onBlur={() => handlePriceBlur(item)}
                                                onFocus={() => handlePriceFocus(item)}
                                                className={`block w-full p-2 text-[rgb(var(--color-text))] shadow-md shadow-[rgb(var(--color-galaxy))] rounded-full text-xs ${prices[item.refaccion] === "" ? "bg-red-200" : "bg-[rgb(var(--color-bg))]"}`}
                                                disabled={!!folio}
                                            />
                                        )}
                                    </td>
                                    <td className="p-4">{monto.toFixed(2)}</td>
                                    <td className="p-4">
                                        <button
                                            onClick={() => handleRemoveClick(item)}
                                            className="bg-red-500 text-white rounded-full p-2 hover:bg-red-700"
                                            disabled={!!folio}
                                        >
                                            <MdDelete />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {onShowTextArea === 'block' && (
                            <tr className="bg-[rgb(var(--color-card))] border-b border-[rgb(var(--color-galaxy))] relative">
                                <td className='gray-circle-button bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-text))]/50 absolute translate-x-1/2 translate-y-1/2 left-4 -top-2 animate-pulse'>
                                    <IoText className="text-2xl text-[rgb(var(--color-galaxy))]" />
                                    <span></span>
                                </td>
                                <td colSpan="6" className="p-4">
                                <textarea
                                    id="nota"
                                    name="nota"
                                    value={notes}
                                    onChange={(e) => handleAddNote(e.target.value)}
                                    className="w-full p-1 border border-gray-300 rounded text-xs text-[rgb(var(--color-text))] focus:ring-blue-500 focus:border-blue-500 bg-[rgb(var(--color-bg))] uppercase"
                                    placeholder={t('panel.table.notePlaceholder')}
                                    rows="3"
                                    maxLength="80"
                                    disabled={!!folio}
                                />
                                </td>
                            </tr>
                        )}
                        <tr className="border-b bg-[rgb(var(--color-card))] border-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))]">
                            <td className="py-4 px-3 font-bold">{t('panel.table.discountRow')}</td>
                            <td className="py-4 px-1 font-bold text-md" colSpan="5">
                                {discountAmount.toFixed(2)} {t('promotions.currency')}
                            </td>
                            <td className="py-4 px-1">
                                <Select
                                    value={discountOptions.find(option => option.value === discount)}
                                    onChange={onDiscountChange}
                                    options={discountOptions}
                                    styles={customStyles}
                                    isDisabled={true}
                                />
                            </td>
                        </tr>
                        <tr className="border-b bg-[rgb(var(--color-card))] border-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))]">
                            <td className="py-4 px-3 font-bold">{t('panel.table.subtotal')}</td>
                            <td className="py-4 px-1 font-bold text-md" colSpan="6">
                                {subtotal.toFixed(2)} {t('promotions.currency')}
                            </td>
                        </tr>

                        <tr className="border-b bg-[rgb(var(--color-card))] border-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))]">
                            <td className="py-4 px-3 font-bold">{t('panel.table.total2')}</td>
                            <td className="py-4 px-1 font-bold text-xl text-[rgb(var(--color-success))]" colSpan="6">
                                $ {totalWithDiscount.toFixed(2)} {t('promotions.currency')}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
