import VideoComponent from '@/app/components/principal/video-component';
import Improve from '@/app/components/principal/improve';
import Beginning from '@/app/components/principal/beginning';
import Slider from '@/app/components/principal/slider';
import Intro from '@/app/components/principal/intro';
import Features from '@/app/components/principal/features';
import { getServerT, resolveLocale } from '@/app/lib/text/server-text';

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

export default function Home() {
  const multimediaSrc = process.env.NEXT_PUBLIC_S3;
  const slides = [
    { url: `${multimediaSrc}slide1.jpg` },
    { url: `${multimediaSrc}slide2.jpg` },
    { url: `${multimediaSrc}slide3.jpg` },
  ];

  return (
      <section>
        <VideoComponent />
        <Improve />
        <Beginning />
        <Slider slides={slides} />
        <Intro />
        <Features />
      </section>
  )
}
