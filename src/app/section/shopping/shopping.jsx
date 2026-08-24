import MetaHead from '@/app/components/meta-head';
import Checkout from '@/app/components/principal/products/checkout';
import { getServerT } from '@/app/lib/text/server-text';

export default async function Shopping() {
  const t = await getServerT();

  return (
    <section>
      <MetaHead title={t('navbar.shopping')} />
      <Checkout />
    </section>
  );
}
