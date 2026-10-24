'use client';

import { useEffect, useState } from 'react';
import OrdersDashboard from './orders-dashboard';
import Title from '../title';
import Spinner from '@/app/components/principal/spinner';
import { GiAutoRepair } from 'react-icons/gi';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function Delivery() {
    const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const fetchOrders = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/orders?limit=40`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? t('panel.delivery.loadError'));
        }
        const paidOrders = (payload.orders ?? []).filter(
          (order) => order.status === 'paid'
        );
        setOrders(paidOrders);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : t('panel.common.unexpectedError'));
        setOrders([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
    return () => controller.abort();
  }, [refreshKey]);

  return (
    <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-gray))] backdrop-blur-md pt-28 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Title
          title={t('panel.delivery.title')}
          icon={GiAutoRepair}
          back={t('panel.common.back')}
          path="/productivity"
        />
        <div className="mt-10">
          {isLoading ? (
            <div className="py-20">
              <Spinner />
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 text-red-700 p-6 text-center space-y-3">
              <p>{error}</p>
              <button
                onClick={() => setRefreshKey((prev) => prev + 1)}
                className="rounded-full bg-red-600 text-white px-4 py-2 text-sm font-semibold"
              >
                {t('panel.common.retry')}
              </button>
            </div>
          ) : (
            <OrdersDashboard orders={orders} requirePin={false} />
          )}
        </div>
      </div>
    </div>
  );
}
