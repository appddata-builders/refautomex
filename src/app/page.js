import VideoComponent from '@/app/components/principal/video-component';
import Improve from '@/app/components/principal/improve';
import Beginning from '@/app/components/principal/beginning';
import Intro from '@/app/components/principal/intro';
import Features from '@/app/components/principal/features';
import HomePromotions from '@/app/components/principal/promotions/home-promotions';
import TopSellers from '@/app/components/principal/top-sellers';
import { leerPromocionesVigentes } from '@/app/lib/promociones-db';
import { leerInicioTienda } from '@/app/lib/tienda-inicio-db';
import { getServerT, resolveLocale } from '@/app/lib/text/server-text';

// Las promociones vigentes se leen al armar el inicio: con ellas el orden
// (promociones o video primero) llega decidido y nada brinca al cargar. Si la
// base no responde, el inicio sale como siempre, con el video primero.
const promocionesDelInicio = async () => {
  try {
    return { ahora: new Date().toISOString(), promociones: await leerPromocionesVigentes() };
  } catch (error) {
    console.error('[inicio] No se pudieron leer las promociones:', error.message);
    return { ahora: new Date().toISOString(), promociones: [] };
  }
};

// El catalogo de la tienda para "Busca por tu auto" y "Lo mas vendido". Sin
// base, esas dos secciones no salen y el resto del inicio sigue igual.
const tiendaDelInicio = async () => {
  try {
    return await leerInicioTienda();
  } catch (error) {
    console.error('[inicio] No se pudo leer el catalogo:', error.message);
    return { modelos: [], masVendidos: [] };
  }
};

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const t = await getServerT(resolveLocale(params && params.lang));
  return {
    title: {
      default: t('meta.home.title'),
    },
    description: t('meta.home.description'),
    icons: {
      icon: "/favicon.ico",
    },
  };
}

export default async function Home() {
  const [promociones, tienda] = await Promise.all([promocionesDelInicio(), tiendaDelInicio()]);

  return (
      <section>
        {/* Con promociones vigentes van primero; sin ellas no pinta nada y el
            video queda arriba (Servicios > Promociones). */}
        <HomePromotions inicial={promociones} />
        <VideoComponent />
        <TopSellers productos={tienda.masVendidos} />
        <Improve tienda={tienda} />
        <Beginning />
        <Intro />
        <Features />
      </section>
  )
}
