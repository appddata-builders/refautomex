'use client';
import React, { useState, useRef, useEffect } from 'react';
import { FaPlayCircle, FaRegStopCircle } from "react-icons/fa";
import { useTranslation } from '@/app/lib/text/text-provider';
import { motion } from "framer-motion";

export default function VideoComponent() {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const [videoPosition, setVideoPosition] = useState('fixed'); // Estado para controlar la posición del video
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const { t } = useTranslation();

    useEffect(() => {
        const video = videoRef.current;
        if (video) {
            video.onloadeddata = () => {
                try {
                    video.play().then(() => setIsPlaying(true)).catch(() => setVideoError(true));
                } catch (e) {
                    setVideoError(true);
                }
            };
        }

        const handleScroll = () => {
            const position = window.scrollY;
            setVideoPosition(position > 5000 ? 'absolute' : 'fixed'); // Cambia la posición basado en el scroll
        };

        // Agregar listener de scroll
        window.addEventListener('scroll', handleScroll);

        // Limpiar el listener al desmontar el componente
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handlePlayVideo = () => {
        const video = videoRef.current;
        if (video && video.paused) {
            video.play().then(() => setIsPlaying(true)).catch(() => setVideoError(true));
        } else if (video) {
            video.pause();
            setIsPlaying(false);
        }
    };

    const fadeIn = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { duration: 0.3 }
        }
    };

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeIn}
            className="w-full h-screen overflow-hidden relative group"
        >
            <video
                ref={videoRef}
                id="my-video"
                poster={`${multimediaSrc}poster.jpg`}
                loop
                muted
                playsInline
                className={`w-full h-full object-cover -z-10 ${videoPosition}`} // Aplica la clase basada en el estado
                onError={() => setVideoError(true)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            >
                <source src={`${multimediaSrc}refautomex.mp4`} type="video/mp4" />
                <p className='my-8 font-bold'>{t('index.video.unsupported')}</p>
            </video>
            <button
                type="button"
                className="absolute z-10 top-[50%] left-[42%] sm:left-[46%] lg:left-[48%] flex items-center justify-center text-white bg-black/60 hover:bg-black/80 p-3 rounded-full text-xs transition-opacity duration-200 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:pointer-events-none sm:group-hover:pointer-events-auto"
                onClick={handlePlayVideo}
            >
                {isPlaying ? <FaRegStopCircle size={40}/> : <FaPlayCircle size={40}/>}
            </button>
            <div className='relative w-full h-full'>
                <div className="absolute top-0 left-0 w-full h-full bg-[rgb(var(--color-video))]/60 p-5 z-0 flex items-end justify-start bg-cover">
                </div>
                <div className="absolute bottom-14 sm:bottom-5 xl:max-w-[1650px] xl:mx-auto px-20 sm:pl-56 sm:px-auto">
                    <h1 className="text-4xl md:text-5xl xl:text-6xl 3xl:text-6xl font-bold mt-5 py-1 gradient-text-title">
                        {t('index.video.title')}
                    </h1>
                    <p className="text-xl lg:text-3xl text-slate-100 pt-5 italic">
                        {t('index.video.leyend')}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
