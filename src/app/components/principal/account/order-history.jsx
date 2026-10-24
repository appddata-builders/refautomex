'use client';
import React, { useState, useEffect } from "react";
import { getStorageValue } from "@/app/lib/storage-values";
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function OrderHistory(){
    const { t } = useTranslation();
    const cognitoUserSession = getStorageValue('CognitoUserSession');
    const username = cognitoUserSession?.idToken.payload["cognito:username"];
    const userData = getStorageValue(`user_${username}`);
    const userId = userData?.idusuario;
    const [sales, setSales] = useState([]);
    const [error, setError] = useState(null);

    const fetchData = async (id) => {
        if (!id) return;
        setError(null);
        try {
            const params = new URLSearchParams({ id });
            const endpoint = `${buildApiUrl('/getUserHistory')}?${params.toString()}`;
            const response = await fetch(endpoint, {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' },
            });
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            if (Array.isArray(data)) {
                setSales(data);
            } else {
                setSales([]);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
            setError(error.message);
            setSales([]);
        }
    };

    useEffect(() => {
        fetchData(userId);
    }, [userId]);

    return (
        <div className='bg-[rgb(var(--color-card))]'>
            <div className="container mx-auto bg-gradient-to-tl from-[rgb(var(--color-card))] via-[rgb(var(--color-bg))] to-[rgb(var(--color-galaxy))] px-6 md:px-28 py-24 sm:py-40">
                <h1 className="text-3xl pt-10 font-semibold mb-4 text-center sm:text-left text-[rgb(var(--color-text))]">{t('account.historyTitle')}</h1>
                <p className="mb-8 text-center sm:text-left text-[rgb(var(--color-text))]">{t('account.historySubtitle')}</p>
                {sales.map((order) => (
                    <div key={order.id} className="mb-6">
                    <div className="flex flex-col lg:flex-row justify-between items-center bg-[rgb(var(--color-bg))] p-4 lg:p-8 my-2 rounded-2xl border border-zinc-300">
                        <div className="flex-1 mb-4 lg:mb-0">
                        <div className="text-[rgb(var(--color-text))]">{t('account.historyOrderNumber')}</div>
                        <div className='text-[rgb(var(--color-gray))]'>{order.folio}</div>
                        </div>
                        <div className="flex-1 mb-4 lg:mb-0">
                            <div className="text-[rgb(var(--color-text))]">{t('account.historyDate')}</div>
                            <div className='text-[rgb(var(--color-gray))]'>{order.fecha_venta}</div>
                        </div>
                        <div className="flex-1 mb-4 lg:mb-0">
                            <div className="text-[rgb(var(--color-text))]">{t('account.historyTotal')}</div>
                            <div className='text-[rgb(var(--color-gray))]'>{order.total_venta}</div>
                        </div>
                        <div className="flex space-x-2">
                            <div className="gradient-text-title flex justify-center items-center mx-2">{order.status == 'A' ? t('account.historyPending') : t('account.historyDelivered')}</div>
                            <button className="bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer">{t('account.historyView')}</button>
                        </div>
                    </div>
                    {/*sales.products.map((product) => (
                        <div key={product.name} className="border-t border-b py-4 mt-6 flex flex-col sm:flex-row justify-between items-center">
                            <div className="overflow-hidden rounded-xl shadow-md animate-out bg-gray-50">
                                <img className="h-24 w-24 object-cover object-center group-hover:opacity-75" src={product.imageUrl} alt={product.name} />
                            </div>
                            <div className="flex-1 px-4">
                                <p className="text-lg font-semibold text-[rgb(var(--color-text))]">{product.name}</p>
                                <p className="text-[rgb(var(--color-text))] opacity-80">{product.description}</p>
                                <div className="flex mt-2">
                                    <button className="text-yellow-500 hover:underline">View Product</button>
                                    <button className="text-yellow-500 hover:underline ml-4">Buy Again</button>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-lg text-[rgb(var(--color-text))]">{product.price}</div>
                                <div className="text-sm shadow text-[rgb(var(--color-text))] p-1.5 bg-[rgb(var(--color-card))] rounded-full">{product.status}</div>
                            </div>
                        </div>
                    ))*/}
                    </div>
                ))}
            </div>
        </div>
    );
};
