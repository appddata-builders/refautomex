'use client'
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';

export default function MetaHead({ title, description }) {
    const [faviconLoaded, setFaviconLoaded] = useState(false);
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const { t } = useTranslation();
    const brand = t('meta.brand');

    if (title === undefined) title = brand;
    else title = `${brand} | ${title}`;
    if (description === undefined) description = t('meta.tagline');

    useEffect(() => {
        const favicon = new Image();
        favicon.src = `${multimediaSrc}favicon.ico`;

        favicon.onload = () => setFaviconLoaded(true);
        favicon.onerror = () => {
            setFaviconLoaded(false);
            // Aquí podrías intentar cargar un favicon de respaldo o registrar el error
        };

        return () => {
            favicon.onload = null;
            favicon.onerror = null;
        };
    }, [multimediaSrc]);

    return (
        <Head>
            <title>{title}</title>
            {faviconLoaded && <link rel="icon" href={`${multimediaSrc}favicon.ico`}/>}
        </Head>
    );
}
