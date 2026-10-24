import Privacy from './privacy';
import { getServerT, resolveLocale } from '@/app/lib/text/server-text';

export async function generateMetadata({ searchParams }) {
    const params = await searchParams;
    const t = await getServerT(resolveLocale(params && params.lang));
    return {
        title: t('meta.privacy.title'),
        description: t('meta.privacy.description'),
        robots: 'index,follow',
    };
}

export default function PrivacyPage() {
    return <Privacy />;
}
