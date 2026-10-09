import Account from "./account";
import { getServerT, resolveLocale } from "@/app/lib/text/server-text";

export async function generateMetadata({ searchParams }) {
    const params = await searchParams;
    const t = await getServerT(resolveLocale(params && params.lang));
    return {
        title: t("meta.account.title"),
        description: t("meta.account.description"),
    };
}

export default function AccountPage() {
    return <Account />;
}
