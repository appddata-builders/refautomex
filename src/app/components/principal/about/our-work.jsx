import { useTranslation } from '@/app/lib/text/text-provider';

  export default function OurWork() {
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const { t } = useTranslation();
    const posts = [
    {
      id: 1,
      title: `${t('about.work.title-1')}`,
      category: `${t('about.work.label-1')}`,
      author: {
          name: `${t('about.work.person-1')}`,
          role: `${t('about.work.subtitle-1')}`,
          imageUrl: `${multimediaSrc}team/margarita.png`,
      },
    },
    {
      id: 2,
      title: `${t('about.work.title-2')}`,
      category: `${t('about.work.label-2')}`,
      author: {
          name: `${t('about.work.person-2')}`,
          role: `${t('about.work.subtitle-2')}`,
          imageUrl: `${multimediaSrc}team/franciscoH.png`,
      },
    },
    {
      id: 3,
      title: `${t('about.work.title-3')}`,
      category: `${t('about.work.label-3')}`,
      author: {
          name: `${t('about.work.person-3')}`,
          role: `${t('about.work.subtitle-3')}`,
          imageUrl: `${multimediaSrc}team/franciscoG.png`,
      },
  },
  {
    id: 4,
    title: `${t('about.work.title-4')}`,
    category: `${t('about.work.label-4')}`,
    author: {
        name: `${t('about.work.person-4')}`,
        role: `${t('about.work.subtitle-4')}`,
        imageUrl: `${multimediaSrc}team/rosario.png`,
    },
  },
  {
    id: 5,
    title: `${t('about.work.title-5')}`,
    category: `${t('about.work.label-5')}`,
    author: {
        name: `${t('about.work.person-5')}`,
        role: `${t('about.work.subtitle-5')}`,
        imageUrl: `${multimediaSrc}team/fernando.png`,
    },
  },
]
    return (
      <div className="bg-[rgb(var(--color-card))] h-full min-h-screen py-12 flex justify-center items-center">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2 className="text-3xl font-bold tracking-tight text-[rgb(var(--color-gray-base))] sm:text-4xl mt-3">{t('about.work.title')}</h2>
            <p className="mt-2 text-lg leading-8 text-[rgb(var(--color-text))]">
              {t('about.work.subtitle')}
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 border-t border-gray-200 pt-10 sm:mt-16 sm:pt-16 lg:mx-0 lg:max-w-none sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article key={post.id} className="flex max-w-xl flex-col items-center justify-between">
                <div className="flex items-center gap-x-4 text-xs">
                  <div
                    className="cursor-pointer relative z-10 rounded-full bg-[rgb(var(--color-gray))] px-3 py-1.5 font-medium text-[rgb(var(--color-text))] hover:bg-stone-100 shadow"
                  >
                    {post.category}
                  </div>
                </div>
                <div className="group relative">
                  <h3 className="mt-3 text-lg font-semibold leading-6 text-[rgb(var(--color-text))] group-hover:text-gray-500 ">
                      <span className="absolute inset-0" />
                      {post.title}
                  </h3>
                </div>
                <div className="relative mt-5 flex items-center gap-x-4">
                  <img src={post.author.imageUrl} alt="" className="h-10 w-10 rounded-full bg-gray-50" />
                  <div className="text-sm leading-6">
                    <p className="font-semibold text-[rgb(var(--color-gray-base))]">
                        <span className="absolute inset-0" />
                        {post.author.name}
                    </p>
                    <p className="text[rgb(var(--color-text))]">{post.author.role}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    )
  }
  