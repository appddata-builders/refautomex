'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useContext, useEffect, useMemo } from 'react';
import { AuthContext } from '@/app/lib/auth-tracker';

import Home from '@/app/components/productivity/home';
import Settings from '@/app/components/productivity/settings';
import Tickets from '@/app/components/productivity/sales/tickets';
import Devolution from '@/app/components/productivity/sales/devolution';
import History from '@/app/components/productivity/sales/history';
import Personal from '@/app/components/productivity/services/personal';
import Calendar from '@/app/components/productivity/services/calendar';
import Invoice from '@/app/components/productivity/services/invoice';
import Warehouse from '@/app/components/productivity/stock/warehouse';
import Inventories from '@/app/components/productivity/stock/inventories';
import Missing from '@/app/components/productivity/stock/missing';
import Capture from '@/app/components/productivity/requirements/capture';
import Providers from '@/app/components/productivity/requirements/providers';
import Site from '@/app/components/productivity/orders/site';
import Delivery from '@/app/components/productivity/orders/delivery';
import Backups from '@/app/components/productivity/backups';
import BackupScheduler from '@/app/components/productivity/backup-scheduler';

export default function Productivity() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, userData } = useContext(AuthContext);

  const load = searchParams.get('load') || 'home';
  const lang = searchParams.get('lang') || 'es';
  // Mismo criterio que navbar-panel.jsx. La API vuelve a revisarlo con el
  // token: esto solo decide que se pinta.
  const isAdmin = String(userData?.categoria || '').toUpperCase() === 'A';

  useEffect(() => {
    if (userData && userData.empleado === 0) {
      router.replace('/');
    }
  }, [userData, router]);

  useEffect(() => {
    if (isAuthenticated === false) {
      router.replace(`/calidad?load=log-in&lang=${lang}`);
    }
  }, [isAuthenticated, lang, router]);

  const component = useMemo(() => {
    switch (load) {
      case 'home': return <Home />;
      case 'user-settings': return <Settings />;
      case 'tickets': return <Tickets />;
      case 'devolution': return <Devolution />;
      case 'history': return <History />;
      case 'warehouse': return <Warehouse />;
      case 'inventories': return <Inventories />;
      case 'missing': return <Missing />;
      case 'capture': return <Capture />;
      case 'providers': return <Providers />;
      case 'personal': return <Personal />;
      case 'site': return <Site />;
      case 'calendar': return <Calendar />;
      case 'delivery': return <Delivery />;
      case 'invoice': return <Invoice />;
      case 'backups': return isAdmin ? <Backups /> : <Home />;
      default: return <Home />;
    }
  }, [load, isAdmin]);

  if (isAuthenticated === false) return null;
  if (userData && userData.empleado === 0) return null;

  // El respaldo de las 3 pm corre en todo el panel, no solo en Respaldos: a
  // esa hora el administrador puede estar en cualquier otra pantalla.
  return (
    <>
      {component}
      {isAdmin && <BackupScheduler />}
    </>
  );
}
