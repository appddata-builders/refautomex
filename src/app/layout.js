import './globals.css';
import { Suspense } from 'react';
import Spinner from '@/app/components/principal/spinner';
import RootLayoutClient from './layout-client';
import Script from "next/script";
import { TextProvider } from '@/app/lib/text/text-provider';
import { getHydratedResources } from '@/app/lib/hydrate/texts';

/**
 * Sin esto Next prerenderiza la home y otras rutas en build, y los textos
 * quedarian congelados al momento del deploy. Con force-dynamic el layout
 * consulta la tabla `hydrate` en cada request, que es lo que permite que una
 * edicion desde IMIN se vea sin volver a compilar.
 *
 * El costo esta acotado por el cache de getHydratedResources (HYDRATE_CACHE_TTL_MS,
 * 10s por defecto): no es una consulta a Postgres por visita.
 */
export const dynamic = 'force-dynamic';

function LoadingShell() {
  return (
    <div className="flex flex-col h-screen w-full justify-center items-center bg-[rgb(var(--color-card))] transition-colors duration-500">
      <Spinner />
    </div>
  );
}

export default async function RootLayout({ children }) {
  const hydratedResources = await getHydratedResources();

  return (
    <html lang="es" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased transition-colors duration-500 ease-in-out">
        <Script src="/imin-editor-bridge.js" strategy="afterInteractive" />
        <TextProvider resources={hydratedResources}>
          <Suspense fallback={<LoadingShell />}>
            <RootLayoutClient>{children}</RootLayoutClient>
          </Suspense>
        </TextProvider>
      </body>
    </html>
  );
}
