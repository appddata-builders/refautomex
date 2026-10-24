import Mailbox from "./mailbox";
import { getServerT, resolveLocale } from "@/app/lib/text/server-text";

export async function generateMetadata({ searchParams }) {
    const params = await searchParams;
    const t = await getServerT(resolveLocale(params && params.lang));
    return {
        title: t("meta.mailbox.title"),
        description: t("meta.mailbox.description"),
    };
}

export default function MailboxPage() {
    return <Mailbox />;
}
