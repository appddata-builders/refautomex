import VideoComponent from '@/app/components/principal/video-component';
import Improve from '@/app/components/principal/improve';
import Beginning from '@/app/components/principal/beginning';
import Slider from '@/app/components/principal/slider';
import Intro from '@/app/components/principal/intro';
import Features from '@/app/components/principal/features';
import HomePromotions from '@/app/components/principal/promotions/home-promotions';
import { leerPromocionesVigentes } from '@/app/lib/promociones-db';
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
  const multimediaSrc = process.env.NEXT_PUBLIC_S3;
  const promociones = await promocionesDelInicio();
  const slides = [
    { url: `${multimediaSrc}slide1.jpg` },
    { url: `${multimediaSrc}slide2.jpg` },
    { url: `${multimediaSrc}slide3.jpg` },
  ];

  return (
      <section>
        {/* Con promociones vigentes van primero; sin ellas no pinta nada y el
            video queda arriba (Servicios > Promociones). */}
        <HomePromotions inicial={promociones} />
        <VideoComponent />
        <Improve />
        <Beginning />
        <Slider slides={slides} />
        <Intro />
        <Features />
      </section>
  )
}
