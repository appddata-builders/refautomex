import Invoices from "./invoices";
import { getServerT, resolveLocale } from "@/app/lib/text/server-text";

export async function generateMetadata({ searchParams }) {
    const params = await searchParams;
    const t = await getServerT(resolveLocale(params && params.lang));
    return {
        title: t("meta.invoices.title"),
        description: t("meta.invoices.description"),
    };
}

export default function InvoicesPage() {
    return <Invoices />;
}
