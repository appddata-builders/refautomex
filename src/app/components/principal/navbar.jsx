'use client';

import { useState, useEffect, useContext } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  PiUsersThree, PiUsersThreeFill,
  PiEnvelopeSimple, PiEnvelopeSimpleFill,
  PiSealPercent, PiSealPercentFill,
  PiStorefront, PiStorefrontFill,
  PiUserCircle, PiShoppingCartSimple,
} from 'react-icons/pi';
import { AuthContext } from '@/app/lib/auth-tracker';
import { useCart } from '@/app/lib/shopping-context';
import { useTranslation } from '@/app/lib/text/text-provider';

import RefautomexLogo from '@/app/components/refautomex-logo';
import ShiftModeButton from '@/app/components/principal/shiftmode-button';
import LangModeButton from '@/app/components/principal/langmode-button';
import WhatsAppButton from '@/app/components/principal/whatsapp-button';
import Link from 'next/link';
import MenuSlide, { AuroraPill, BOTON_REDONDO, CartBadge } from './menu-slide';
import NavbarPanel from '@/app/components/productivity/navbar-panel';

/**
 * Las secciones. El icono crece con el texto (1.25em) para que siempre vaya a
 * proporcion. El texto no cambia de tono: la seccion activa lleva el icono
 * relleno y, detras, una aurora que se desliza de una a otra.
 */
const MenuItems = ({ items, selectedLanguage, pathPage }) => (
  <ul className="col-start-2 row-start-1 hidden items-center gap-1 lg:flex">
    {items.map((item) => {
      const isActive = pathPage === item.link;
      const Icon = isActive ? item.activeIcon : item.icon;
      return (
        <li key={item.key}>
          <Link
            href={`${item.link}?lang=${selectedLanguage}`}
            aria-current={isActive ? 'page' : undefined}
            className="group relative flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold text-[rgb(var(--color-text))] transition-colors duration-300 hover:bg-[rgb(var(--color-card))] xl:text-base"
          >
            {isActive && <AuroraPill layoutId="navbar-activo" />}
            <Icon
              aria-hidden="true"
              className="relative size-[1.25em] shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:-rotate-6"
            />
            <span className="relative">{item.name}</span>
          </Link>
        </li>
      );
    })}
  </ul>
);

export default function Navbar() {
  const multimediaSrc = process.env.NEXT_PUBLIC_S3;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation();
  const { isAuthenticated, userData } = useContext(AuthContext);
  const { cartItemCount } = useCart();
  const [isScrolled, setIsScrolled] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('es');
  const id = userData?.idusuario;
  const menuItems = [
    { key: 1, name: t('navbar.about'), link: '/section/about', icon: PiUsersThree, activeIcon: PiUsersThreeFill },
    { key: 2, name: t('navbar.contact'), link: '/section/contact', icon: PiEnvelopeSimple, activeIcon: PiEnvelopeSimpleFill },
    { key: 3, name: t('navbar.promotions'), link: '/section/promotion', icon: PiSealPercent, activeIcon: PiSealPercentFill },
    { key: 4, name: t('navbar.products'), link: '/section/products', icon: PiStorefront, activeIcon: PiStorefrontFill },
  ];
  const accountHref = isAuthenticated ? '/section/refautomex' : '/section/account';
  const callsToAction = [
    { key: 5, kind: 'account', name: t('navbar.account'), href: accountHref, icon: PiUserCircle },
    { key: 6, kind: 'cart', name: t('navbar.shopping'), href: '/section/shopping', icon: PiShoppingCartSimple },
  ];
  const showAvatar = Boolean(id) && Boolean(profileImageUrl) && !imgError;

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
    const handleScroll = () => setIsScrolled(window.scrollY > 25);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  if (pathname === '/calidad' && !isAuthenticated) return null;
  if (pathname === '/productivity' && isAuthenticated) return <NavbarPanel />;

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 px-2 pt-3 sm:px-4">
      {/* Los botones flotantes van fuera del <nav>: su backdrop-blur haria que
          `fixed` se midiera contra la barra y no contra la pantalla. */}
      <div className="pointer-events-auto fixed bottom-3 left-3 z-50 flex flex-col items-center gap-2">
        <LangModeButton />
        <WhatsAppButton />
      </div>
      <div className="pointer-events-auto fixed bottom-35 left-3 z-50 hidden md:block">
        <ShiftModeButton />
      </div>

      {/* Tres columnas: en el celular el logo queda al centro; desde lg va a la
          izquierda y las secciones toman el centro. */}
      <nav
        aria-label={t('navbar.ariaGlobal')}
        className={`pointer-events-auto mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border px-2.5 py-2.5 text-[rgb(var(--color-text))] backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-500 ease-out sm:px-4 lg:rounded-full lg:px-5
          ${isScrolled
            ? 'border-[rgb(var(--color-galaxy))]/40 bg-[rgb(var(--color-bg))]/90 shadow-lg shadow-[rgb(var(--color-galaxy))]/25'
            : 'border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))]/75 shadow-md shadow-black/10'}`}
      >
        <div className="col-start-1 row-start-1 justify-self-start md:hidden">
          <ShiftModeButton compact />
        </div>

        <Link
          href={`/?lang=${selectedLanguage}`}
          className="col-start-2 row-start-1 justify-self-center lg:col-start-1 lg:justify-self-start"
        >
          <RefautomexLogo classAttr="h-12 w-auto lg:h-14" />
        </Link>

        <MenuItems items={menuItems} selectedLanguage={selectedLanguage} pathPage={pathname} />

        <div className="col-start-3 row-start-1 flex items-center gap-2 justify-self-end">
          {callsToAction.map((action) => {
            const isActive = pathname === action.href;
            const isAccount = action.kind === 'account';
            return (
              // La cuenta va dentro del menu en pantallas chicas; el carrito siempre a la vista.
              <div key={action.key} className={isAccount ? 'hidden lg:block' : undefined}>
                <Link
                  href={`${action.href}?lang=${selectedLanguage}`}
                  aria-label={action.name}
                  title={action.name}
                  aria-current={isActive ? 'page' : undefined}
                  className={`${BOTON_REDONDO} ${isActive ? 'ring-2 ring-[rgb(var(--color-galaxy))]' : ''}`}
                >
                  {isAccount && showAvatar ? (
                    <img
                      src={profileImageUrl}
                      onError={() => setImgError(true)}
                      className="size-full rounded-full object-cover"
                      alt={t('account.photo')}
                    />
                  ) : (
                    <action.icon className="size-[22px]" aria-hidden="true" />
                  )}
                  {action.kind === 'cart' && <CartBadge count={cartItemCount} />}
                </Link>
              </div>
            );
          })}

          <div className="lg:hidden">
            <MenuSlide
              menuItems={menuItems}
              selectedLanguage={selectedLanguage}
              pathPage={pathname}
              callsToAction={callsToAction}
              cartItemCount={cartItemCount}
            />
          </div>
        </div>
      </nav>
    </header>
  );
}
