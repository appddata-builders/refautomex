import Promotion from "./promotion";
import { getServerT, resolveLocale } from "@/app/lib/text/server-text";

export async function generateMetadata({ searchParams }) {
    const params = await searchParams;
    const t = await getServerT(resolveLocale(params && params.lang));
    return {
        title: t("meta.promotion.title"),
        description: t("meta.promotion.description"),
    };
}

export default function PromotionPage() {
    return <Promotion />;
}
