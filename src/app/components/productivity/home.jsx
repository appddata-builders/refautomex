import OurValues from "@/app/components/principal/about/our-values";
import OurScope from "@/app/components/principal/about/our-scope";
import { useTranslation } from '@/app/lib/text/text-provider';


export default function Home() {

    const { t } = useTranslation();
    return (
        <div className="bg-gradient-to-tl min-h-screen from-[rgb(var(--color-gray))] via-[rgb(var(--color-card))] to-[rgb(var(--color-galaxy))] backdrop-blur-md pt-24 lg:pt-28 p-3">
            <div className="rounded-full md:rounded-r-full bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-gray-base))]/50 py-1 my-5 px-2">
                <p className="my-4 text-2xl md:text-4xl 2xl:text-6xl text-center font-semibold gradient-text-title">{t('panel.home.welcome')}</p>
            </div>
            <div className="relative rounded-3xl overflow-hidden my-3">
                <OurValues/>
            </div>
            <div className="rounded-3xl overflow-hidden my-3">
                <OurScope/>
            </div>
        </div>
    );
}
