'use client';
import React, { useState, useContext, useEffect, useRef } from "react";
import { getStorageValue } from "@/app/lib/storage-values";
import { AuthContext } from '@/app/lib/auth-tracker';
import { loadStripe } from '@stripe/stripe-js';
import { useTranslation } from '@/app/lib/text/text-provider';
import { FaShoppingBag } from "react-icons/fa";
import { IoMdCloseCircle } from "react-icons/io";
import Link from 'next/link';
import { useCart } from '@/app/lib/shopping-context';
import { FaBullseye } from "react-icons/fa6";
import { buildApiUrl } from '@/app/lib/refautomex-api';
import {
  parseProductRoutes,
  resolveMainProductImage,
  resolveProductImage,
} from '@/app/lib/product-images';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

export default function OrderGrid() {
    const cognitoUserSession = getStorageValue('CognitoUserSession');
    const username = cognitoUserSession?.idToken.payload["cognito:username"];
    const userData = getStorageValue(`user_${username}`);
    const { t } = useTranslation();
    const { isAuthenticated } = useContext(AuthContext);
    const { cart, removeFromCart, clearCart } = useCart();
    const [checkoutCompleted, setCheckoutCompleted] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('es');
    const [modalOpen, setModalOpen] = useState(false);
    const [folioWeb, setFolioWeb] = useState('');
    const [groupCards, setGroupCards] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);
    const [productsError, setProductsError] = useState(null);
    const saleAlreadyProcessed = useRef(false);

    const totalAmount = cart.reduce((total, item) => {
        const qty = item.quantity || 1;
        return total + (Number(item.precio) || 0) * qty;
    }, 0);

    const handleRemoveProduct = (product) => {
        removeFromCart(product);
    };

    const handleCheckoutAllProducts = async () => {
        const stripe = await stripePromise;

            const lineItems = cart.map((product) => ({
            num_parte: product.num_parte,
            descripcion: product.descripcion,
            precio: !isNaN(Number(product.precio)) ? Math.round(Number(product.precio) * 100) : 100,
            quantity: product.quantity || 1,
        })).filter(item => !isNaN(item.precio));

        console.log('Line items being sent to checkout:', lineItems);

        try {
            const response = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ lineItems, total: totalAmount }),
            });

            const session = await response.json();

            if (!session.sessionId) {
                console.error('Session ID is undefined. Backend response:', session);
                alert(t('checkout.startError'));
                return;
            }

            const result = await stripe.redirectToCheckout({
                sessionId: session.sessionId,
            });

            if (result.error) {
                console.error('Stripe checkout error:', result.error.message);
                alert(result.error.message);
            }
        } catch (error) {
            console.error('Checkout error:', error);
            alert(t('checkout.payError'));
        }
    };

    useEffect(() => {
        const fetchProducts = async () => {
            setProductsLoading(true);
            setProductsError(null);
            try {
                const response = await fetch(buildApiUrl('/getProducts'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });
                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }
                const payload = await response.json();
                // /getProducts responde [[filas]] - un CALL de MySQL devolvia
                // el result set anidado y el endpoint conserva esa forma.
                const rows = payload?.[0] ?? [];
                const groupsMap = {};
                rows.forEach((product) => {
                    const groupId = product.idgrupo || 'N/A';
                    const key = `${groupId}-${product.grupo || t('products.noGroup')}`;
                    const routes = parseProductRoutes(product.rutas);
                    const normalizedProduct = {
                        ...product,
                        rutas: routes,
                        mainImage: routes.length > 0 ? routes[0] : null,
                    };
                    if (!groupsMap[key]) {
                        groupsMap[key] = {
                            idgrupo: product.idgrupo,
                            nombre: product.grupo || t('products.noGroup'),
                            productos: [],
                        };
                    }
                    groupsMap[key].productos.push(normalizedProduct);
                });
                const groups = Object.values(groupsMap).map((group) => ({
                    ...group,
                    total: group.productos.length,
                    muestras: group.productos.slice(0, 3),
                }));
                setGroupCards(groups);
            } catch (error) {
                console.error('Error al obtener productos web:', error);
                setProductsError(t('products.groupsError'));
                setGroupCards([]);
            } finally {
                setProductsLoading(false);
            }
        };

        fetchProducts();
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const success = urlParams.get('success');
        const status = urlParams.get('status');

        if (
            (success === 'true' || status === 'success') &&
            !folioWeb &&
            !saleAlreadyProcessed.current
        ) {
            setCheckoutCompleted(true);
            setModalOpen(true);
            saleAlreadyProcessed.current = true;

            const paymentMethod = localStorage.getItem('paymentMethod') || 3;
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const deliveryDate = new Date(today);
            deliveryDate.setDate(today.getDate() + 3);
            const deliveryStr = deliveryDate.toISOString().split('T')[0];
            const itemsPayload = cart.map((item) => {
                const quantity = item.quantity || 1;
                const price = parseFloat(item.precio) || 0;
                return {
                    refaccion: item.num_parte,
                    descripcion: item.descripcion || '',
                    cantidad: quantity,
                    aIva: (price / 1.16).toFixed(2),
                    precio: price.toFixed(2),
                    monto: (price * quantity).toFixed(2),
                    existencia: item.existencia || 0,
                    isSeminew: 'N',
                    isEditable: false,
                    isPedido: true,
                };
            });

            const saleData = {
                fecha_venta: todayStr,
                total_venta: totalAmount.toFixed(2),
                idusuario: userData?.idusuario || 1,
                idsucursal: 1,
                status: 'A',
                idmetodo: paymentMethod,
                tipo: 'W',
                telefono: userData?.telefono || '',
                email: userData?.email || '',
                fecha_entrega: deliveryStr,
                fecha_pedido: todayStr,
                nombre_cliente: userData?.nombre || t('checkout.webClient'),
                isOrder: true,
                notas: t('checkout.stripeNote'),
                items: itemsPayload,
            };

            const saveSale = async () => {
                try {
                    const response = await fetch(buildApiUrl('/newSale'), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(saleData),
                    });

                    if (response.ok) {
                        const result = await response.json();
                        setFolioWeb(result.folio);
                clearCart();
            } else {
                console.error('Error al guardar la venta:', response.statusText);
            }
                } catch (error) {
                    console.error('Error en la solicitud:', error);
                }
            };

            saveSale();
        }
    }, [folioWeb, cart, totalAmount, userData]);

    const closeModal = () => {
        setModalOpen(false);
    };

    return (
        <div className='bg-[rgb(var(--color-gray))] min-h-screen'>
            {modalOpen && (
                <div className="fixed inset-0 flex items-center justify-center bg-[rgb(var(--color-card))]/50 z-50">
                    <div className="bg-white rounded-lg p-8 shadow-lg max-w-md text-center">
                        <h2 className="text-3xl font-bold text-[rgb(var(--color-amber))] mb-4">{t('index.improve.orderSuccess')}</h2>
                        <p className="text-gray-700 mb-6">{t('index.improve.addOrder')}</p>
                        <button
                            className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600"
                            onClick={closeModal}
                        >
                            {t('index.improve.btnComplete')}
                        </button>
                    </div>
                </div>
            )}
            <div className="container min-h-screen mx-auto bg-gradient-to-tl from-[rgb(var(--color-gray))] via-[rgb(var(--color-bg))] to-[rgb(var(--color-card))] px-6 md:px-28 py-24 sm:py-40">
                <div className="py-8">
                    <section className="mb-10">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                            <h2 className="text-2xl font-bold text-[rgb(var(--color-text))]">
                                {t('products.exploreGroups')}
                            </h2>
                            {groupCards.length > 0 && (
                                <p className="text-sm text-gray-500">
                                    {t('products.availableCount', { count: groupCards.reduce((sum, group) => sum + group.total, 0) })}
                                </p>
                            )}
                        </div>
                        {productsLoading ? (
                            <p className="text-sm text-gray-500">{t('products.loadingGroups')}</p>
                        ) : productsError ? (
                            <p className="text-sm text-red-500">{productsError}</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                {groupCards.map((group) => (
                                    <div
                                        key={group.idgrupo || group.nombre}
                                        className="bg-white rounded-xl shadow flex flex-col p-4 border border-slate-100"
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <p className="text-xs uppercase text-gray-500">{t('products.group')}</p>
                                                <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">
                                                    {group.nombre}
                                                </h3>
                                            </div>
                                            <span className="text-sm font-semibold text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">
                                                {t('products.pieces', { count: group.total })}
                                            </span>
                                        </div>
                                        <div className="flex -space-x-3 mb-4">
                                            {group.muestras.map((product, idx) => (
                                                <div
                                                    key={`${product.num_parte}-${idx}`}
                                                    className="w-16 h-16 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center"
                                                >
                                                    <img
                                                        src={resolveProductImage(product.mainImage)}
                                                        alt={product.descripcion}
                                                        className="object-cover w-full h-full"
                                                    />
                                                </div>
                                            ))}
                                            {group.muestras.length === 0 && (
                                                <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center text-xs text-gray-400">
                                                    Sin fotos
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            {t('products.samples')} {group.muestras.map((prod) => prod.descripcion).join(', ') || t('products.noDescription')}
                                        </p>
                                    </div>
                                ))}
                                {groupCards.length === 0 && (
                                    <p className="text-sm text-gray-500">{t('products.empty')}</p>
                                )}
                            </div>
                        )}
                    </section>
                    {cart.map((item, index) => {
                        if (!item) return null;
                        const quantity = item.quantity || 1;
                        const lineTotal = (Number(item.precio) || 0) * quantity;
                        return (
                            <div key={index} className="border-t pt-4 mt-4">
                                <div className="flex relative justify-between bg-white p-1 rounded-md shadow-md">
                                    {!checkoutCompleted && (
                                        <button
                                            onClick={() => handleRemoveProduct(item)}
                                            className="absolute -top-3 -right-4 bg-gray-100 rounded-full text-red-500 text-xl z-10 shadow"
                                        >
                                            <IoMdCloseCircle className='h-7 w-7 animate-out' />
                                        </button>
                                    )}
                                    <img
                                        className="h-full w-32 my-auto object-cover object-center group-hover:opacity-75"
                                        src={resolveMainProductImage(item)}
                                        alt={item.descripcion}
                                    />
                                    <div className="flex-1 px-4 ">
                                        <h4 className="font-semibold my-2">{item.descripcion}</h4>
                                        <p className="text-sm text-gray-600">{t('products.quantity')}</p>
                                        <div className="text-lg font-semibold text-[rgb(var(--color-text))]">
                                            {quantity}
                                        </div>
                                        <div className="flex flex-col justify-start items-start sm:flex-row sm:justify-between sm:items-center sm:mt-6">
                                            <p className="text-lg font-semibold text-cyan-600">{lineTotal.toFixed(2)} {t('promotions.currency')}</p>
                                            <p className="text-sm text-gray-500">{t('products.shipments')}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="flex flex-col justify-between bg-white px-6 py-4 rounded-xl shadow">
                    <div className={`grid grid-cols-1 ${folioWeb ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full">
                                <FaShoppingBag className="h-8 w-8" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-600">{t('account.order')}</p>
                                <p className="text-2xl font-semibold text-gray-900">${totalAmount.toFixed(2)} {t('promotions.currency')}</p>
                            </div>
                        </div>
                        {folioWeb && (
                            <div className="flex items-center space-x-4">
                                <div className="p-3 bg-violet-100 text-violet-600 rounded-full">
                                    <FaBullseye className="h-8 w-8" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-600">{t('products.webFolio')}</p>
                                    <p className="text-2xl font-semibold text-gray-900">{folioWeb}</p>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col items-center justify-center space-y-4">
                            <p className="text-sm text-gray-600 text-center">{t('account.payment')}</p>
                            <button
                                onClick={handleCheckoutAllProducts}
                                disabled={cart.length === 0 || checkoutCompleted}
                                className="px-6 py-3 rounded-xl bg-emerald-500 text-white font-semibold shadow hover:bg-emerald-600 disabled:bg-gray-300 disabled:text-gray-500 transition"
                            >
                                {checkoutCompleted ? t('index.improve.btnComplete') : t('index.improve.btnContinue')}
                            </button>
                        </div>
                    </div>
                    {!isAuthenticated && (
                        <p className="text-center text-sm text-gray-500 mt-4">
                            {t('account.needAccount')}{' '}
                            <Link href="/section/account?load=sign-up" className="text-emerald-600 font-semibold">
                                {t('account.signUp')}
                            </Link>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
