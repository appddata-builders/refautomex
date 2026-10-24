import About from "./about";
import { getServerT, resolveLocale } from "@/app/lib/text/server-text";

export async function generateMetadata({ searchParams }) {
    const params = await searchParams;
    const t = await getServerT(resolveLocale(params && params.lang));
    return {
        title: t("meta.about.title"),
        description: t("meta.about.description"),
    };
}

export default function AboutPage() {
    return <About />;
}
