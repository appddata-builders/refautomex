'use client';

import { useState, useEffect, useContext, useRef } from 'react';
import { Popover } from '@headlessui/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { FaUserCircle } from "react-icons/fa";
import { AuthContext } from '@/app/lib/auth-tracker';
import { useCart } from '@/app/lib/shopping-context';
import { CiShop, CiStar, CiMail } from "react-icons/ci";
import { MdShoppingCart } from 'react-icons/md';
import { PiBooksThin } from "react-icons/pi";
import { useTranslation } from '@/app/lib/text/text-provider';
import { TbChristmasTreeFilled } from "react-icons/tb";

import RefautomexLogo from '@/app/components/refautomex-logo';
import ShiftModeButton from '@/app/components/principal/shiftmode-button';
import LangModeButton from '@/app/components/principal/langmode-button';
import WhatsAppButton from '@/app/components/principal/whatsapp-button';
import Link from 'next/link';
import MenuSlide from './menu-slide';
import NavbarPanel from '@/app/components/productivity/navbar-panel';

const MenuItems = ({ items, selectedLanguage, pathPage }) => (
  <>
    {items.map((item) => (
      <Link
        key={item.key}
        href={`${item.link}?lang=${selectedLanguage}`}
        className={`
          text-sm leading-6 xl:pr-1 flex rounded-3xl justify-center items-center
          bg-[rgb(var(--color-card))]/70 relative
          ${pathPage === item.link
            ? 'gradient-text-title'
            : 'text-[rgb(var(--color-text))] shadow shadow-[rgb(var(--color-text))]/30'}
        `}
      >
        <div className="text-sm font-bold leading-6 p-1.5 shadow shadow-[rgb(var(--color-galaxy))] bg-[rgb(var(--color-bg))] rounded-full">
          <item.icon
            className={`
              leading-6 size-5 md:size-7 2xl:size-10
              ${pathPage === item.link
                ? 'text-[rgb(var(--color-galaxy))]'
                : 'text-[rgb(var(--color-text))]'}
            `}
          />
        </div>
        <div className="ml-1 mr-3 text-md xl:text-lg 2xl:text-xl">{item.name}</div>
      </Link>
    ))}
  </>
);

export default function Navbar() {
  const multimediaSrc = process.env.NEXT_PUBLIC_S3;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dropdownRef = useRef(null);
  const { t, i18n } = useTranslation();
  const { isAuthenticated, userData } = useContext(AuthContext);
  const { cartItemCount } = useCart();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('es');
  const id = userData?.idusuario;
  const menuItems = [
    { key: 1, name: t('navbar.about'), link: "/section/about", icon: PiBooksThin },
    { key: 2, name: t('navbar.contact'), link: "/section/contact", icon: CiMail },
    { key: 3, name: t('navbar.promotions'), link: "/section/promotion", icon: CiStar },
    { key: 4, name: t('navbar.products'), link: "/section/products", icon: CiShop },
  ];
  const accountHref = isAuthenticated ? "/section/refautomex" : "/section/account";
  const callsToAction = [
    { key: 5, name: t('navbar.account'), href: accountHref, icon: FaUserCircle },
    { key: 6, name: t('navbar.shopping'), href: '/section/shopping', icon: MdShoppingCart },
  ];

  useEffect(() => {
    if (!id || !multimediaSrc) {
      setProfileImageUrl(null);
      return;
    }

    const imageUrl = `${multimediaSrc}usr/${id}.jpg`;
    setProfileImageUrl(imageUrl);
    const image = new Image();
    image.src = imageUrl;
    image.onload = () => setImgError(false);
    image.onerror = () => setImgError(true);
  }, [id, multimediaSrc]);

  useEffect(() => {
    const lang = searchParams.get('lang');
    if (lang) {
      setSelectedLanguage(lang);
      i18n.changeLanguage(lang);
    }
  }, [searchParams, i18n]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 25);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  if (pathname === '/calidad' && !isAuthenticated) return null;
  if (pathname === '/productivity' && isAuthenticated) return <NavbarPanel />;

  return (
    <header
    className={`fixed flex justify-center w-full z-20 my-3 shadow-md
    bg-[rgb(var(--color-bg))]/95
    text-[rgb(var(--color-text))]
    transition-colors duration-500`}
    >
      <nav
        className="flex w-full min-h-[75px] sm:min-h-[80px] xl:max-w-7xl items-center justify-center lg:justify-between px-0.5 sm:px-5 transition duration-100 ease-in-out"
        aria-label={t('navbar.ariaGlobal')}
      >
        <div className="flex flex-1 justify-center items-center md:justify-between">
          <div className="fixed left-3 bottom-3 flex flex-col items-center gap-2 z-50">
              <LangModeButton />
              <WhatsAppButton />
          </div>
          <div className="absolute left-3 md:fixed md:bottom-35">
                <ShiftModeButton />
          </div>
          <Link href={`/?lang=${selectedLanguage}`}>
            <RefautomexLogo classAttr="max-h-20 md:max-h-24 2xl:max-h-28 w-auto p-2 md:p-4 -my-1 ml-1" />
          </Link>
          <div className="lg:hidden absolute right-1">
            <MenuSlide
              menuItems={menuItems}
              selectedLanguage={selectedLanguage}
              pathPage={pathname}
              callsToAction={callsToAction}
              cartItemCount={cartItemCount}
            />
          </div>
        </div>

        <Popover.Group className="hidden lg:flex lg:gap-x-3 lg:justify-end items-center">
          <MenuItems items={menuItems} selectedLanguage={selectedLanguage} pathPage={pathname} />

          <div className="hidden lg:flex lg:flex-1 lg:border-l-2 lg:pl-4 lg:border-slate-400">
            {callsToAction.map((action) => (
              <Link
                key={action.key}
                href={`${action.href}?lang=${selectedLanguage}`}
                className={`relative text-sm font-bold leading-6 m-1 ${
                  userData?.idusuario && action.icon === FaUserCircle && !imgError ? '' : 'p-2.5'
                } shadow bg-[rgb(var(--color-gray))] rounded-full`}
              >
                {userData?.idusuario && action.icon === FaUserCircle && !imgError ? (
                  <div className="flex h-10 w-10 items-center justify-center bg-[rgb(var(--color-gray))] border border-slate-300 transition-all duration-500 ease-in-out shadow-lg rounded-full overflow-hidden">
                    {profileImageUrl && (
                      <img
                        src={profileImageUrl}
                        onError={() => setImgError(true)}
                        className="w-full h-full object-cover bg-gray-50"
                        alt={t('account.photo')}
                      />
                    )}
                  </div>
                ) : (
                  <action.icon size={20} className="text-[rgb(var(--color-text))]" />
                )}
                {action.icon === MdShoppingCart && cartItemCount > 0 && (
                  <span className="absolute -top-3 -right-3 bg-red-500 text-white text-xs font-semibold rounded-full h-6 w-6 flex items-center justify-center shadow shadow-[rgb(var(--color-galaxy))] transition-all duration-500 ease-in-out">
                    {cartItemCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </Popover.Group>
      </nav>
    </header>
  );
}
