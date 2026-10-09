import { useTranslation } from '@/app/lib/text/text-provider';


export default function OurTeam() {
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const { t } = useTranslation();

    const stats = [
        { name: `${t('about.team.description-1')}`, value: `${t('about.team.section-1')}` },
        { name: `${t('about.team.description-2')}`, value: `${t('about.team.section-2')}` },
    ]

    return (
        <div className="relative isolate overflow-hidden h-screen">
            <img
            src={`${multimediaSrc}volkspaco.jpg`}
            alt=""
            className="absolute inset-0 -z-10 h-full min-h-screen w-full object-cover object-right "
            />
            <div
            className="hidden sm:absolute sm:-top-10 sm:right-1/2 sm:-z-10 sm:mr-10 sm:block sm:transform-gpu sm:blur-3xl"
            aria-hidden="true"
            >
                <div
                    className="aspect-[1097/845] w-[68.5625rem] bg-gradient-to-tr from-[#ffb246] to-[#b1b1b1] opacity-40"
                    style={{
                    clipPath:
                        'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
                    }}
                />
            </div>
            <div
            className="absolute -top-52 left-1/2 -z-10 -translate-x-1/2 transform-gpu blur-3xl sm:top-[-28rem] sm:ml-16 sm:translate-x-0 sm:transform-gpu"
            aria-hidden="true"
            >
                <div
                    className="aspect-[1097/845] w-[68.5625rem] bg-gradient-to-tr from-[#ffb246] to-[#b1b1b1] opacity-40"
                    style={{
                    clipPath:
                        'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
                    }}
                />
                </div>
            <div className="bg-[rgb(var(--color-video))]/70 p-3 relative left-auto w-full px-2 h-full flex justify-center">
                <div className="mx-auto xl:max-w-7xl xl:mx-auto absolute bottom-72 sm:bottom-40 w-full px-2">
                    <h2 className="font-bold tracking-tight gradient-text-title text-3xl md:text-4xl">{t('about.team.title')}</h2>
                    <p className="mt-6 xl:pb-16 text-md sm:text-lg leading-8 text-gray-200 w-[90%] font-semibold">
                        {t('about.team.subtitle')}
                    </p>
                </div>
                <div className="mx-auto mt-10 xl:pb-16 xl:max-w-7xl xl:mx-auto absolute bottom-5 px-2 w-full">
                    <dl className="mt-16 grid grid-cols-1 gap-8 sm:mt-24 sm:grid-cols-2">
                    {stats.map((stat) => (
                        <div key={stat.name} className="flex flex-col-reverse">
                            <dt className="text-base leading-6 text-white italic">{stat.name}</dt>
                            <dd className="text-xl md:text-2xl font-bold leading-9 tracking-tight text-white">{stat.value}</dd>
                        </div>
                    ))}
                    </dl>
                </div>
            </div>
        </div>
    )
}
