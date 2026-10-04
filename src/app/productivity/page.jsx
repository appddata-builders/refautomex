'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useContext, useEffect, useMemo } from 'react';
import { AuthContext } from '@/app/lib/auth-tracker';
import { perfilDeCategoria, puedeVer } from '@/app/lib/permisos-menu';
import { refrescarPermisos, usePermisosMenu } from '@/app/lib/use-permisos-menu';

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
  // Mismo criterio que navbar-panel.jsx: un modulo que el perfil no tiene en
  // Permisos de perfil se cambia por Home aunque se escriba la URL a mano.
  // Respaldos lo vuelve a revisar la API con el token; esto solo decide que
  // se pinta.
  const permisos = usePermisosMenu();
  const perfil = perfilDeCategoria(userData?.categoria);
  const isAdmin = perfil === 'admin';
  const allowed = puedeVer(permisos, load, perfil);

  // Cada cambio de modulo vuelve a pedir los permisos: si un admin le quito
  // algo a este perfil, se aplica sin recargar.
  useEffect(() => {
    refrescarPermisos();
  }, [load]);

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
    if (!allowed) return <Home />;
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
      case 'backups': return <Backups />;
      default: return <Home />;
    }
  }, [load, allowed]);

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
