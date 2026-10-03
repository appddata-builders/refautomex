import {FaCogs, FaLightbulb, FaCloudsmith, FaDolly, FaHammer, FaRegObjectGroup, FaScrewdriver, FaShoppingBag, FaSplotch} from 'react-icons/fa'
import { useTranslation } from '@/app/lib/text/text-provider';

export default function OurScope() {
    const { t } = useTranslation();
    const bubblesData = [
        { top: '2%', left: '8%', color: 'bg-slate-600', icon:FaCogs },
        { top: '50%', left: '80%', color: 'bg-gray-700', icon:FaLightbulb },
        { top: '60%', left: '10%', color: 'bg-yellow-400', icon:FaCloudsmith },
        { top: '3%', left: '33%', color: 'bg-zinc-600', icon:FaDolly },
        { top: '20%', left: '80%', color: 'bg-yellow-400', icon:FaHammer },
        { top: '23%', left: '40%', color: 'bg-yellow-400', icon:FaRegObjectGroup },
        { top: '80%', left: '60%', color: 'bg-gray-400', icon:FaScrewdriver },
        { top: '77%', left: '7%', color: 'bg-zinc-400', icon:FaShoppingBag },
        { top: '42%', left: '20%', color: 'bg-slate-400', icon:FaSplotch }
    ];

    return (
    <div className="relative bg-gradient-to-b from-[rgb(var(--color-card))] via-[rgb(var(--color-gray))] to-[rgb(var(--color-gray-base))] 
    z-0 h-full min-h-screen w-full text-gray-50 overflow-hidden">
        {bubblesData.map((bubble, index) => (
        <div
            key={index}
            className={`absolute z-0 scale-75 lg:scale-100 ${bubble.color} rounded-full p-4 w-28 h-28 lg:w-30 lg:h-30 flex items-center justify-center lg:animate-out hover:opacity-80`}
            style={{ top: bubble.top, left: bubble.left }}
        >
            <bubble.icon size={46}/>
        </div>
        ))}
        <div className='absolute z-10 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'>
            <div className='flex flex-col text-center m-auto max-w-2xl
            bg-gradient-to-tr from-[rgb(var(--color-gray))]/70 via-[rgb(var(--color-card))] to-[rgb(var(--color-bg))] p-5 rounded-2xl shadow-2xl animate-up'>
                <p className='text-3xl lg:text-5xl py-2 gradient-text-title'>{t('about.scope.title')}</p>
                <span className='text-xl lg:text-2xl text-[rgb(var(--color-text))]'>{t('about.scope.leyend')}</span>
            </div>
        </div>
    </div>
    )
}