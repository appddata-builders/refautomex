import Shopping from "./shopping";
import { getServerT, resolveLocale } from "@/app/lib/text/server-text";

export async function generateMetadata({ searchParams }) {
    const params = await searchParams;
    const t = await getServerT(resolveLocale(params && params.lang));
    return {
        title: t("meta.shopping.title"),
        description: t("meta.shopping.description"),
    };
}

export default function ShoppingPage() {
    return <Shopping />;
}
