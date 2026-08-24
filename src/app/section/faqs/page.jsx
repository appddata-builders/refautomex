import Faqs from "./faqs";
import { getServerT, resolveLocale } from "@/app/lib/text/server-text";

export async function generateMetadata({ searchParams }) {
    const params = await searchParams;
    const t = await getServerT(resolveLocale(params && params.lang));
    return {
        title: t("meta.faqs.title"),
        description: t("meta.faqs.description"),
    };
}

export default function FaqsPage() {
    return <Faqs />;
}
