import { useTranslation } from '@/app/lib/text/text-provider';
import { MdGetApp } from "react-icons/md";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";

export default function TierPromotion() {
  const { t } = useTranslation();
  const includedFeatures = [
    t('promotions.tierOne'),
    t('promotions.tierTwo'),
    t('promotions.tierThree'),
  ]
  return (
    <div className="bg-gradient-to-tl from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-galaxy))] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 pt-10">
        <div className="mx-auto max-w-2xl sm:text-center">
          <h2 className="text-4xl font-bold tracking-tight gradient-text-title sm:text-5xl">{t('promotions.title')}</h2>
          <p className="hidden mt-6 text-lg leading-8 text-[rgb(var(--color-text))] opacity-80">
            {t('promotions.account')}
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl rounded-3xl ring-1 ring-gray-800 sm:mt-20 lg:mx-0 lg:max-w-none hidden">{/*lg:flex*/}
          <div className="p-8 sm:p-10 lg:flex-auto">
            <h3 className="text-2xl font-bold tracking-tight text-[rgb(var(--color-text))]">{t('promotions.garanty')}</h3>
            <p className="mt-6 text-base leading-7 text-[rgb(var(--color-text))] opacity-80">
              {t('promotions.conditions')}
            </p>
            <div className="mt-10 flex items-center gap-x-4">
              <h4 className="flex-none text-sm font-semibold leading-6 text-amber-500">{t('promotions.what')}</h4>
              <div className="h-px flex-auto bg-gray-600" />
            </div>
            <ul
              role="list"
              className="mt-8 grid grid-cols-1 gap-4 text-sm leading-6 text-gray-600 sm:grid-cols-2 sm:gap-6"
            >
              {includedFeatures.map((feature) => (
                <li key={feature} className="flex gap-x-3 text-[rgb(var(--color-text))]">
                  <IoMdCheckmarkCircleOutline className="h-6 w-5 flex-none text-amber-600" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <div className="-mt-2 p-2 lg:mt-0 lg:w-full lg:max-w-md lg:flex-shrink-0">
            <div className="rounded-2xl bg-[rgb(var(--color-card))] py-10 text-center shadow-md ring-1 ring-inset ring-gray-200 lg:h-full lg:flex lg:flex-col lg:justify-center lg:py-16">
              <div className="mx-auto max-w-xs px-8">
                <p className="text-base font-semibold text-[rgb(var(--color-text))] opacity-80">{t('promotions.label')}</p>
                <p className="mt-6 flex items-baseline justify-center gap-x-2">
                  <span className="text-5xl font-bold tracking-tight text-[rgb(var(--color-text))]">{t('promotions.price')}</span>
                  <span className="text-sm font-semibold leading-6 tracking-wide text-[rgb(var(--color-text))] opacity-80">{t('promotions.currency')}</span>
                </p>
                <button className='bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer font-bold'>
                    <span className='flex px-1 justify-center items-center'>
                        <MdGetApp className="inline-block text-xl md:text-2xl mx-1.5 p-0.5 rounded-md bg-slate-50 opacity-50 shadow" />
                        {t('promotions.btnGet')}
                    </span>
                  </button>
                <p className="mt-6 text-xs leading-5 text-[rgb(var(--color-text))] opacity-80">
                  {t('promotions.recipts')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
