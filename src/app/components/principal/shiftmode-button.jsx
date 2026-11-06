'use client';
import { useTheme } from '@/app/lib/theme-context';
import { MdLightMode } from 'react-icons/md';
import { FaStar } from 'react-icons/fa';

// `compact` lo deja del tamano de los botones redondos del navbar (40px).
export default function ShiftModeButton({ compact = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const boton = compact ? 'size-10' : 'md:w-14 md:h-14 h-8 w-8';
  const icono = compact ? 'size-[22px]' : 'md:w-8 md:h-8 w-6 h-6';

  return (
    <button
      onClick={toggleTheme}
      className={`
        ${isDark
          ? 'from-indigo-800 via-gray-900 to-slate-800'
          : 'from-stone-100 via-gray-100 to-stone-300'}
        bg-gradient-to-tl hover:bg-gradient-to-br hover:scale-105 cursor-pointer
        opacity-90 font-semibold rounded-full shadow-2xl border-slate-600 border-b
        animate-out transition-all duration-500 ease-in-out
        ${boton} flex items-center justify-center
      `}
    >
      {isDark
        ? <FaStar className={`text-amber-400 -rotate-45 ${icono}`} />
        : <MdLightMode className={`text-yellow-500 -rotate-12 ${icono}`} />
      }
    </button>
  );
}
