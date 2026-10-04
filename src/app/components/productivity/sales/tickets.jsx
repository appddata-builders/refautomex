'use client';

import React, { useState, useRef, useEffect } from 'react';
import Title from '../title';
import { MdSell } from "react-icons/md";
import { IoBagAdd, IoTicket } from 'react-icons/io5';
import FindProducts from './find-products';
import { LiaListAlt } from "react-icons/lia";
import TableSales from './table-sales';
import { useReactToPrint } from 'react-to-print';
import ComponentToPrint, { prefetchBranchData } from './component-print';
import ClientOrderModal from './client-order-modal';
import PaymentTypeModal from './payment-type-modal';
import RowTypeModal from './row-type-modal';
import { getStorageValue } from "@/app/lib/storage-values";
import { HiOutlineViewGridAdd } from "react-icons/hi";
import { MdAutorenew } from "react-icons/md";
import ListToPrint from './list-print';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';

// `t` llega por parametro: la funcion vive fuera del componente y no puede
// usar el hook para leer el mensaje de error.
const fetchNewSale = async (sale_data, t) => {
    const endpoint = buildApiUrl('/newSale');
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(sale_data),
            cache: 'no-store'
        });

        if (!response.ok) {
            const message = `Error ${response.status}: ${response.statusText}`;
            throw new Error(message);
        }

        const data = await response.json();
        return data?.folio;
    } catch (error) {
        console.error('Error generating sale:', error);
        alert(t('panel.tickets.saleError'));
        return null;
    }
};

const formatDate = (date) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('es-MX', options);
};

// Operacion actual de tickets: el catalogo, la venta y la impresion usan
// TLALNEPANTLA aunque el empleado tenga otra sucursal asignada.
const TICKETS_BRANCH = { id: 2, label: 'TLALNEPANTLA' };

export default function Tickets() {
    const { t } = useTranslation();
    const [currentDate, setCurrentDate] = useState(formatDate(new Date()));
    const [visibleTooltip, setVisibleTooltip] = useState({});
    const [items, setItems] = useState([]);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showRowModal, setShowRowModal] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [paymentType, setPaymentType] = useState(null);
    const [globalIdCounter, setGlobalIdCounter] = useState(1);
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [notes, setNotes] = useState('');
    const [dateOrder, setDateOrder] = useState('');
    const [clientName, setClientName] = useState('');
    const [employee, setEmployee] = useState('');
    const branchId = TICKETS_BRANCH.id;
    const [folio, setFolio] = useState('');
    const [subtotal, setSubtotal] = useState(0);
    const [discount, setDiscount] = useState(0);
    const [total, setTotal] = useState(0);
    const [branchSnapshot, setBranchSnapshot] = useState(null);
    const [pendingPrint, setPendingPrint] = useState(false);
    const cognitoUserSession = getStorageValue('CognitoUserSession');
    const componentRef = useRef();
    const listRef = useRef();

    useEffect(() => {
        const username = cognitoUserSession.idToken.payload["cognito:username"];
        const userData = getStorageValue(`user_${username}`);
        setEmployee(userData?.nombre || '');
    }, [cognitoUserSession]);

    useEffect(() => {
        if (paymentType) {
            handleGenerateFolioAndPrint();
        }
        if(folio) {
            setShowPaymentModal(false);
            queueTicketPrint();
        }
    }, [paymentType, folio]);

    const handlePrint = useReactToPrint({
        contentRef: componentRef,
    });

    const handlelistPrint = useReactToPrint({
        contentRef: listRef,
    });

    useEffect(() => {
        if (!pendingPrint) return;
        handlePrint();
        setPendingPrint(false);
    }, [pendingPrint, handlePrint]);

    const handleGenerateFolioAndPrint = async () => {
        const username = cognitoUserSession.idToken.payload["cognito:username"];
        const userData = getStorageValue(`user_${username}`);

        const sale_data = {
            fecha_venta: new Date().toISOString().split('T')[0],
            total_venta: total.toFixed(2),
            idusuario: userData?.idusuario || 1,
            idsucursal: branchId,
            status: 'A',
            idmetodo: paymentType,
            telefono: phone,
            email: email,
            fecha_entrega: dateOrder,
            fecha_pedido: new Date().toISOString().split('T')[0],
            nombre_cliente: clientName,
            isOrder: items.some(item => item.isPedido),
            tipo: 'T',
            notas: notes,
            items: items.map(item => ({
                refaccion: item.refaccion,
                descripcion: item.descripcion,
                cantidad: item.cantidad,
                aIva: parseFloat(item.aIva).toFixed(2),
                precio: parseFloat(item.precio).toFixed(2),
                monto: parseFloat(item.monto).toFixed(2),
                existencia: item.existencia,
                isSeminew: item.isSeminew ? 'S' : 'N',
                isEditable: item.isEditable ? true : false,
                isPedido: item.isPedido,
            }))
        };

        try {
            if (!folio) {
                const generatedFolio = await fetchNewSale(sale_data, t);
                if (generatedFolio) {
                    setFolio(generatedFolio);
                }
            }
        } catch (error) {
            console.error('Error generating folio:', error);
            alert(t('panel.tickets.folioError'));
        }
    };

    const handlePaymentTypeSubmit = (paymentId) => {
        setPaymentType(paymentId);
        togglePaymentModal();
    };

    const handleRowTypeSubmit = ({ type }) => {
        const isSeminew = type === 'seminuevo';
        const newRow = {
            refaccion: `${isSeminew ? 'SEMI' : 'NEW'}-${globalIdCounter}`,
            descripcion: '',
            aIva: 0,
            precio: 0,
            cantidad: 1,
            monto: 0,
            localizacion: '',
            isSeminew,
            isEditable: true,
        };
        setGlobalIdCounter(prev => prev + 1);
        setItems(prevItems => [...prevItems, newRow]);
        toggleRowModal();
    };

    const handleOnlyPrint = () => {
        if (folio) {
            setShowPaymentModal(false);
            queueTicketPrint();
        } else {
            setShowPaymentModal(true);
        }
    };

    const handleClientData = () => {
        setShowModal(true);
    };

    const handleRowData = () => {
        setShowRowModal(true);
    };

    const handleModalSubmit = (formData, hasAccount) => {
        setPhone(formData.telefono);
        setEmail(formData.email);
        setDateOrder(formData.fechaEntrega);
        setClientName(formData.nombreCompleto);
        toggleModal();
        setShowPaymentModal(true);
    };

    const toggleModal = () => {
        setShowModal(!showModal);
    };

    const togglePaymentModal = () => {
        setShowPaymentModal(!showPaymentModal);
    };

    const toggleRowModal = () => {
        setShowRowModal(!showRowModal);
    };

    const handleAddProduct = (product) => {
        setItems(prevItems => {
            const exists = prevItems.some(item => item.refaccion === product.refaccion);
            const updatedItems = exists
                ? prevItems.filter(item => item.refaccion !== product.refaccion)
                : [...prevItems, { ...product, monto: Math.ceil(product.precio * product.cantidad) }];
            updateTotals(updatedItems, discount);
            return updatedItems;
        });
    };

    const handleAddNote = (note) => {
        setNotes(note);
    }

    const queueTicketPrint = async () => {
        if (branchId) {
            try {
                const snapshot = await prefetchBranchData(branchId);
                setBranchSnapshot(snapshot || null);
            } catch (error) {
                console.error('Error al cargar la sucursal para el ticket:', error);
                setBranchSnapshot(null);
            }
        } else {
            setBranchSnapshot(null);
        }
        setPendingPrint(true);
    };

    const handleRemoveProduct = (refaccion) => {
        setItems(prevItems => {
            const updatedItems = prevItems.filter(item => item.refaccion !== refaccion);
            updateTotals(updatedItems, discount);
            return updatedItems;
        });
    };

    const handleUpdateProduct = (updatedItems) => {
        setItems(prevItems => {
            if (JSON.stringify(prevItems) !== JSON.stringify(updatedItems)) {
                updateTotals(updatedItems, discount);
                return updatedItems;
            }
            return prevItems;
        });
    };

    const handleDiscountChange = (selectedOption) => {
        setDiscount(selectedOption.value);
        updateTotals(items, selectedOption.value);
    };

    const updateTotals = (items, discount) => {
        const newSubtotal = items.reduce((acc, item) => acc + item.monto, 0);
        setSubtotal(newSubtotal);
        const discountAmount = newSubtotal * discount / 100;
        const newTotal = newSubtotal - discountAmount;
        setTotal(newTotal);
    };

    const handleMouseEnter = (id) => {
        setVisibleTooltip(prev => ({ ...prev, [id]: true }));
    };

    const handleMouseLeave = (id) => {
        setVisibleTooltip(prev => ({ ...prev, [id]: false }));
    };

    const handleTogglePedido = (refaccion) => {
        setItems(prevItems => {
            const updatedItems = prevItems.map(item =>
                item.refaccion === refaccion ? { ...item, isPedido: !item.isPedido } : item
            );
            updateTotals(updatedItems, discount);
            return updatedItems;
        });
    };

    const hasPedido = items.some(item => item.isPedido);
    const ceroExistencia = items.some(item => item.existencia === 0);
    const stockExceeded = items.some(item => {
        const stock = Number(item.existencia);
        if (!Number.isFinite(stock) || stock < 0) return false;
        const quantity = Number(item.cantidad ?? 1);
        return quantity > stock;
    });
    const ceroMonto = items.some(item => item.monto === 0);
    const ceroTotal = total <= 0;
    const ceroItems = items.length === 0;
    const manualRowsIncomplete = items.some(
        item => item.isEditable && (item.descripcion.trim() === '' || Number(item.precio) <= 0)
    );
    const canCompleteSale = !(hasPedido || ceroExistencia || stockExceeded || ceroMonto || ceroTotal || ceroItems || manualRowsIncomplete);
    const validaTextArea = hasPedido ? 'block' : 'hidden';
    const validaHiddenLista = ceroItems ? 'hidden' : 'block';

    const baseButtonConfigs = [
        {
            icon: HiOutlineViewGridAdd,
            btnconf: `relative blue-circle-button tooltip-button`,
            label: t('panel.tickets.addRow'),
            id: 'addrow',
            path: '',
            event: handleRowData
        },
        {
            icon: LiaListAlt,
            btnconf: `relative blue-circle-button tooltip-button ${validaHiddenLista}`,
            label: t('panel.tickets.list'),
            id: 'list',
            path: '',
            event: handlelistPrint
        },
    ];

    if (canCompleteSale) {
        baseButtonConfigs.push({
            icon: IoTicket,
            btnconf: `relative p-3 m-1 rounded-full shadow hover:shadow-xl bg-amber-500 color-cultured cursor-pointer inline-block tooltip-button`,
            label: t('panel.tickets.ticket'),
            id: 'print',
            path: '',
            event: handleOnlyPrint
        });
    }

    const pedidoButton = {
        icon: IoBagAdd,
        btnconf: `relative p-3 m-1 rounded-full shadow hover:shadow-xl bg-amber-500 color-cultured cursor-pointer inline-block tooltip-button`,
        label: t('panel.site.statusOrder'),
        id: 'add',
        path: '',
        event: handleClientData
    };

    const buttonConfigs = hasPedido ? [...baseButtonConfigs, pedidoButton] : baseButtonConfigs;

    const completeConfigs = [
        {
            icon: IoTicket,
            btnconf: `relative gray-circle-button tooltip-button`,
            label: t('panel.tickets.reprint'),
            id: 'print',
            event: queueTicketPrint
        },
        {
            icon: MdAutorenew,
            btnconf: `relative green-circle-button tooltip-button`,
            label: t('panel.tickets.newSale'),
            id: 'new',
            event: () => window.location.reload()
        }
    ];

    return (
        <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-card))] via-text-[rgb(var(--color-bg))] to-[rgb(var(--color-galaxy))] backdrop-blur-md pt-28 overflow-x-hidden">
            <Title
                title={t('panel.tickets.title')}
                icon={MdSell}
                back={t('panel.common.back')}
                path='/productivity'
            />
            <div>
                <div className="mx-auto max-w-[1700px] xl:px-8 mt-5 overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-3 mx-auto gap-x-7 gap-y-6 lg:mx-0 px-2">
                        <div className= {`lg:rounded-2xl my-5 pt-2 shadow shadow-[rgb(var(--color-gray-base))] w-full max-w-[520px] mx-auto overflow-hidden rounded-xl ${folio ? 'bg-stone-500' : 'bg-[rgb(var(--color-gray))]' }`}>
                            <FindProducts
                                branch={TICKETS_BRANCH}
                                onAddProduct={handleAddProduct}
                                onRemoveProduct={handleRemoveProduct}
                                addedItems={items}
                                folio={folio}
                                includePendingProducts={false}
                                includeWebBranch={false}
                                allowedSearchTypes={['Descripcion', 'Parte', 'Localizacion']}
                            />
                        </div>
                        <div className='grid-cols-1 lg:col-span-2 w-auto 2xl:flex'>
                            <TableSales
                                items={items}
                                buttonConfigs={buttonConfigs}
                                completeConfigs={completeConfigs}
                                onRemoveProduct={handleRemoveProduct}
                                onUpdateProduct={handleUpdateProduct}
                                handleMouseEnter={handleMouseEnter}
                                handleMouseLeave={handleMouseLeave}
                                onShowTextArea={validaTextArea}
                                visibleTooltip={visibleTooltip}
                                discount={discount}
                                folio={folio}
                                handlePrint={handlePrint}
                                onDiscountChange={handleDiscountChange}
                                onTogglePedido={handleTogglePedido}
                                setItems={setItems}
                                handleAddNote={handleAddNote}
                            />
                        </div>
                    </div>
                </div>
                <div className='hidden'>
                    <ComponentToPrint
                        ref={componentRef}
                        items={items}
                        subtotal={subtotal}
                        discount={discount}
                        total={total}
                        currentDate={currentDate}
                        employee={employee}
                        folio={folio}
                        notes={notes}
                        branchName={branchSnapshot?.name || ''}
                        phones={branchSnapshot ? [branchSnapshot.phone1, branchSnapshot.phone2].filter(Boolean) : undefined}
                        whatsapps={branchSnapshot ? [branchSnapshot.whatsapp1, branchSnapshot.whatsapp2].filter(Boolean) : undefined}
                        address={branchSnapshot?.address || ''}
                        branchId={branchId}
                        useDefaults={false}
                    />
                    <ListToPrint
                        ref={listRef}
                        items={items}
                    />
                </div>
                {/* Modales */}
                <ClientOrderModal
                    isOpen={showModal}
                    toggleModal={toggleModal}
                    onSubmit={handleModalSubmit}
                />
                <PaymentTypeModal
                    isOpen={showPaymentModal}
                    toggleModal={togglePaymentModal}
                    onConfirm={handlePaymentTypeSubmit}
                />
                <RowTypeModal
                    isOpen={showRowModal}
                    toggleModal={toggleRowModal}
                    onConfirm={handleRowTypeSubmit}
                />
            </div>
        </div>
    );
}
