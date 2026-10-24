import MetaHead from '@/app/components/meta-head';
import FormInvoice from '@/app/components/principal/invoices/form-invoice';
import { getServerT } from '@/app/lib/text/server-text';

export default async function Invoices() {
    const t = await getServerT();

    return (
        <section>
            <MetaHead title={t('navbar.invoices')}/>
            <FormInvoice />
        </section>

    )
}
