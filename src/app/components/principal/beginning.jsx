'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';
import { IoMdCloseCircle } from "react-icons/io";
import { FaRegLightbulb } from "react-icons/fa6";
import Portal from '@/app/lib/pop-portal';
import PopTwoSections from '@/app/components/principal/pop-two-sections';

export default function Beginning() {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const [showModal, setShowModal] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);

    const imagesData = [
        {   id: 1,
            src: `${multimediaSrc}services.jpg`,
            title: `${t('index.beginning.subtitle-1')}`,
            caption: `${t('index.beginning.btnCaption')}`,
            tracking: 'index.beginning.trackingOne',
            titlePop: 'index.beginning.titlePopOne',
            sectionOne: 'index.beginning.sectionAOne',
            sectionTwo: 'index.beginning.sectionATwo',

        },
        {   id: 2,
            src: `${multimediaSrc}attention.jpg`,
            title: `${t('index.beginning.subtitle-2')}`,
            caption: `${t('index.beginning.btnCaption')}`,
            tracking: 'index.beginning.trackingTwo',
            titlePop: 'index.beginning.titlePopTwo',
            sectionOne: 'index.beginning.sectionBOne',
            sectionTwo: 'index.beginning.sectionBTwo',
        },
    ];

    const handleOpenModal = (image) => {
        setSelectedImage(image);
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setSelectedImage(null);
    };

    useEffect(() => {
        if (showModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
    }, [showModal]);

    return (
        <section className='flex flex-col justify-center items-center bg-[rgb(var(--color-card))] w-full sm:pt-16 '>
            {imagesData.map((image) => (
                <div
                    key={image.id}
                    className="sm:px-16 sm:py-5 my-3 w-full xl:w-[1400px]"
                >
                <div className="relative w-full overflow-hidden h-[325px] mx-auto sm:rounded-tr-3xl sm:rounded-bl-3xl
                shadow shadow-[rgb(var(--color-text))]">
                    <img
                    src={image.src}
                    alt={image.title}
                    className="w-full h-[500px] object-cover z-0"
                    />
                    <div className="absolute top-0 left-0 w-full h-full py-5 md:py-10 z-10 flex items-end justify-start bg-stone-950/60 bg-cover">
                        <div className="absolute w-full px-10 md:px-16">
                        <div className="flex sm:flex-row flex-col justify-between items-center">
                            <h1 className="lg:text-5xl text-center sm:text-left text-4xl gradient-text-title font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                            {image.title}
                            </h1>
                            <button
                            className="bg-gradient-to-bl hover:bg-gradient-to-tr from-[rgb(var(--color-galaxy))] to-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))] px-2 py-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer font-bold"
                            onClick={() => handleOpenModal(image)}
                            >
                            <span className="flex px-1 justify-center items-center">
                                <FaRegLightbulb className="inline-block text-xl md:text-2xl mx-1.5 p-0.5 rounded-full bg-[rgb(var(--color-galaxy))]/10 shadow shadow-[rgb(var(--color-galaxy))]" />
                                {image.caption}
                            </span>
                            </button>
                        </div>
                        </div>
                    </div>
                </div>
                {showModal && selectedImage && (
                    <Portal>
                        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-stone-700/80 backdrop-blur-sm">
                            <div className="flex items-center justify-center min-h-screen">
                                <div className='relative max-w-7xl sm:px-10 lg:px-20 bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text-base))]
                                p-3 sm:rounded-xl shadow-xl py-12'>
                                    <div className='absolute -top-5 right-1/2 translate-x-1/2 shadow bg-[rgb(var(--color-bg))] shadow-[rgb(var(--color-galaxy))] rounded-full p-3 cursor-pointer animate-out'>
                                        <FaRegLightbulb className='h-9 w-9 text-[rgb(var(--color-galaxy))] hover:opacity-80'/>
                                    </div>
                                    <button onClick={handleCloseModal} className="absolute top-2 right-2 text-red-500 text-xl z-10">
                                        <IoMdCloseCircle className='h-7 w-7 animate-out' />
                                    </button>
                                    <div className="relative overflow-y-auto h-[75vh]">
                                        <PopTwoSections
                                            tracking={selectedImage.tracking}
                                            title={selectedImage.titlePop}
                                            sectionOne={selectedImage.sectionOne}
                                            sectionTwo={selectedImage.sectionTwo}
                                            imageSrc={selectedImage.src}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Portal>
                )}
            </div>
            ))}
        </section>
    );
}
