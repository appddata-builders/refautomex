'use client';

import TagManager from 'react-gtm-module';
import Script from 'next/script';
import { AnimatePresence } from 'framer-motion';
import Navbar from '@/app/components/principal/navbar';
import Footer from '@/app/components/principal/footer';
import { EntradaContext, PageLoader } from '@/app/components/principal/star-loader';
import { TimeZoneProvider } from '@/app/lib/time-zone-context';
import { AuthChecker } from '@/app/lib/auth-tracker';
import { ShoppingProvider } from '@/app/lib/shopping-context';
import { ThemeProvider } from '@/app/lib/theme-context';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

const TOPE_ENTRADA_MS = 10_000;

function usePaginaCargada() {
  const [cargada, setCargada] = useState(false);

  useEffect(() => {
    let vigente = true;
    let alCargar = null;

    const documento = new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
        return;
      }
      alCargar = resolve;
      window.addEventListener('load', alCargar, { once: true });
    });
    const fuentes = document.fonts?.ready ?? Promise.resolve();

    Promise.all([documento, fuentes]).then(() => {
      if (vigente) setCargada(true);
    });

    return () => {
      vigente = false;
      if (alCargar) window.removeEventListener('load', alCargar);
    };
  }, []);

  return cargada;
}

export default function RootLayoutClient({ children }) {
  const paginaCargada = usePaginaCargada();
  // globals.css agranda el sitio publico en pantallas grandes; el panel no.
  const zona = usePathname()?.startsWith('/productivity') ? 'panel' : 'sitio';
  const [sesionRevisada, setSesionRevisada] = useState(false);
  const alRevisarSesion = useCallback(() => setSesionRevisada(true), []);

  // La entrada: el documento, la sesion y cualquier Spinner de pantalla
  // completa que aparezca mientras tanto (star-loader.jsx, useRetenerEntrada).
  const [retenciones, setRetenciones] = useState(0);
  const retener = useCallback(() => {
    setRetenciones((n) => n + 1);
    return () => setRetenciones((n) => n - 1);
  }, []);
  const [entradaTerminada, setEntradaTerminada] = useState(false);
  const [vencida, setVencida] = useState(false);
  useEffect(() => {
    const tope = setTimeout(() => setVencida(true), TOPE_ENTRADA_MS);
    return () => clearTimeout(tope);
  }, []);
  const enEntrada = !entradaTerminada && !vencida
    && (!paginaCargada || !sesionRevisada || retenciones > 0);

  const tagManagerArgs = useMemo(
    () => ({
      gtmId: process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID,
    }),
    []
  );

  useEffect(() => {
    TagManager.initialize(tagManagerArgs);
  }, [tagManagerArgs]);

  return (
    <EntradaContext.Provider value={entradaTerminada ? null : retener}>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
        onLoad={() => {
          window.dispatchEvent(new Event('google-maps-loaded'));
        }}
      />
      <ThemeProvider>
        <TimeZoneProvider>
          <AuthChecker alRevisar={alRevisarSesion}>
            <ShoppingProvider>
              <div className="flex flex-col min-h-screen">
                <Navbar />
                <main className="flex-grow z-0" data-zona={zona}>{children}</main>
                <Footer />
              </div>
            </ShoppingProvider>
          </AuthChecker>
        </TimeZoneProvider>
      </ThemeProvider>
      <AnimatePresence onExitComplete={() => setEntradaTerminada(true)}>
        {enEntrada && <PageLoader key="entrada" />}
      </AnimatePresence>
    </EntradaContext.Provider>
  );
}
