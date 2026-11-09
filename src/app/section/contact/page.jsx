import Contact from "./contact";
import { getServerT, resolveLocale } from "@/app/lib/text/server-text";

export async function generateMetadata({ searchParams }) {
    const params = await searchParams;
    const t = await getServerT(resolveLocale(params && params.lang));
    return {
        title: t("meta.contact.title"),
        description: t("meta.contact.description"),
    };
}

export default function ContactPage() {
    return <Contact />;
}
