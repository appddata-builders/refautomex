import React, { useState, useEffect } from 'react';
import Atropos from 'atropos/react';
import 'atropos/css';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/autoplay';
import { Autoplay, Navigation } from 'swiper/modules';

export default function CardPromotion({elements}) {
  const [slidesPerView, setSlidesPerView] = useState(2);

  useEffect(() => {
    const handleResize = () => {
      setSlidesPerView(window.innerWidth >= 1300 ? 3 : 2);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <section className='bg-[rgb(var(--color-gray))]'>
      {/* En la misma columna que el resto del sitio: a todo lo ancho, en una
          pantalla grande cada promocion media 800px. */}
      <div className='mx-auto max-w-7xl px-2 sm:px-4 lg:px-6'>
      <Swiper
        slidesPerView={slidesPerView}
        spaceBetween={20}
        autoplay={{
          delay: 3000,
          disableOnInteraction: false,
        }}
        navigation={true}
        modules={[Autoplay, Navigation]}
      >
        {elements.map((element, index) => (
        <SwiperSlide key={index} className="flex justify-center items-center">
            <div className="w-full h-full py-12 px-4">
              <Atropos className="aspect-w-1 aspect-h-1 min-h-[160px] w-full" activeOffset={10} shadowScale={0.8}>
                <img
                  src={element.url}
                  alt={element.title}
                  className="h-full w-full object-cover object-center rounded-xl"
                />
              </Atropos>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
      </div>
    </section>
  );
}
