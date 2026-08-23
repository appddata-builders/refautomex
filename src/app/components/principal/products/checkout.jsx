'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { MdShoppingCart } from 'react-icons/md';
import {
  FaTrashCan,
  FaCreditCard,
  FaClock,
  FaCheckToSlot,
  FaTruckFast,
} from 'react-icons/fa6';
import { useCart } from '@/app/lib/shopping-context';
import { getStorageValue } from '@/app/lib/storage-values';
import { resolveMainProductImage } from '@/app/lib/product-images';

let stripePromise;
const getStripe = () => {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) return null;
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
};

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

const fulfillmentLabels = {
  en_proceso: { label: 'En proceso', icon: FaClock },
  pedido_confirmado: { label: 'Pedido confirmado', icon: FaCheckToSlot },
  en_camino: { label: 'En camino', icon: FaTruckFast },
};

const normalizeCartItem = (item) => {
  const price = Number(item.precio ?? item.price ?? 0) || 0;
  const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;
  // Un carrito guardado en localStorage antes del arreglo de `rutas` trae
  // rutasParsed vacio y el rutas bueno: resolveMainProductImage mira ambos.
  const image = resolveMainProductImage(item);
  return {
    ...item,
    normalizedPrice: price,
    normalizedQuantity: quantity,
    normalizedImage: image,
    normalizedName: item.descripcion || item.name || 'Producto',
    normalizedDescription: item.descripcion || item.description || '',
  };
};

export default function Checkout() {
  const searchParams = useSearchParams();
  const { items: cart, removeItem, totalUnits, clearCart } = useCart();
  const statusParam = searchParams.get('status');
  const successParam = searchParams.get('success');
  const redirectStatus = searchParams.get('redirect_status');
  const isSuccessStatus =
    statusParam === 'success' || successParam === 'true' || redirectStatus === 'succeeded';
  const sessionId = searchParams.get('session_id');

  const [friendlyFolio, setFriendlyFolio] = useState(null);
  const [folioMessage, setFolioMessage] = useState(null);
  const [lookupFolio, setLookupFolio] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const cognitoUserSession = getStorageValue('CognitoUserSession');
  const username = cognitoUserSession?.idToken?.payload?.['cognito:username'];
  const userData = username ? getStorageValue(`user_${username}`) : null;

  const normalizedCart = useMemo(() => cart.map(normalizeCartItem), [cart]);

  const saleItems = useMemo(() =>
    normalizedCart.map((product) => {
      const quantity = product.normalizedQuantity || 1;
      const unitPrice = product.normalizedPrice || 0;
      const subtotal = unitPrice * quantity;
      const aIva = unitPrice / 1.16;
      return {
        refaccion: product.num_parte || product.id || product.normalizedName,
        descripcion: product.normalizedName,
        cantidad: quantity,
        aIva: aIva,
        precio: unitPrice,
        monto: subtotal,
        existencia: product.existencia || 0,
        isSeminew: product.isSeminew ? 'S' : 'N',
        isEditable: false,
        isPedido: true,
      };
    }),
    [normalizedCart]
  );

  useEffect(() => {
    if (!isSuccessStatus) return;
    clearCart();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('cart');
    }
  }, [isSuccessStatus, clearCart]);

  useEffect(() => {
    if (!isSuccessStatus || !sessionId) return;
    const controller = new AbortController();
    setFriendlyFolio(null);
    setFolioMessage(null);
    fetch(`/api/orders/folio?session_id=${sessionId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? 'Sin detalles del folio.');
        }
        return response.json();
      })
      .then((payload) => {
        setFriendlyFolio(payload.friendlyFolio ?? null);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setFolioMessage(
          err instanceof Error
            ? err.message
            : 'No pudimos recuperar tu folio amigable. Usa el folio largo.'
        );
      });
    return () => controller.abort();
  }, [sessionId, isSuccessStatus]);

  // Los precios ya incluyen IVA; solo lo desglosamos sin recargarlo.
  const subtotal = normalizedCart.reduce(
    (acc, product) => acc + product.normalizedPrice * product.normalizedQuantity,
    0
  );
  const subtotalSinIva = subtotal > 0 ? subtotal / 1.16 : 0;
  const ivaIncluido = subtotal - subtotalSinIva;
  const total = subtotal;

  const handleLookup = async (event) => {
    event.preventDefault();
    const trimmed = lookupFolio.trim();
    if (!trimmed) {
      setLookupError('Ingresa un folio válido.');
      return;
    }
    setIsLookupLoading(true);
    setLookupResult(null);
    setLookupError(null);
    try {
      const response = await fetch(
        `/api/orders/friendly?folio=${encodeURIComponent(trimmed.toUpperCase())}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'No encontramos ese folio.');
      }
      setLookupResult(payload);
    } catch (err) {
      setLookupResult(null);
      setLookupError(
        err instanceof Error ? err.message : 'Hubo un problema al buscar tu folio.'
      );
    } finally {
      setIsLookupLoading(false);
    }
  };

  const startCheckout = async () => {
    if (!normalizedCart.length || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const lineItems = saleItems
        .map((item) => ({
          descripcion: item.descripcion,
          precio: Math.round(item.precio * 100),
          quantity: item.cantidad,
          metadata: {
            refaccion: String(item.refaccion || ''),
            descripcion: String(item.descripcion || ''),
            cantidad: String(item.cantidad || ''),
            aIva: item.aIva?.toFixed ? item.aIva.toFixed(2) : String(item.aIva || ''),
            precio: item.precio?.toFixed ? item.precio.toFixed(2) : String(item.precio || ''),
            monto: item.monto?.toFixed ? item.monto.toFixed(2) : String(item.monto || ''),
            existencia: String(item.existencia || 0),
            isSeminew: item.isSeminew || 'N',
            isEditable: item.isEditable ? 'true' : 'false',
            isPedido: item.isPedido ? 'true' : 'false',
          },
        }))
        .filter((item) => item.precio > 0 && item.quantity > 0);

      if (!lineItems.length) {
        throw new Error('No hay productos válidos para procesar.');
      }

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineItems,
          contact: {
            name: userData?.nombre || '',
            email: userData?.email || '',
            address: userData?.domicilio || '',
          },
          orderContext: {
            userId: userData?.idusuario || '',
            clientName: userData?.nombre || 'Cliente web',
            clientEmail: userData?.email || '',
            paymentMethodId: 3,
            orderType: 'W',
            notes: '',
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message ?? 'No se pudo iniciar el pago.');
      }

      if (payload.url) {
        window.location.href = payload.url;
        return;
      }

      if (!payload.sessionId) {
        throw new Error('No se pudo crear la sesión de pago.');
      }

      const stripe = await getStripe();
      if (!stripe) {
        throw new Error('Stripe no está configurado en este dispositivo.');
      }

      const result = await stripe.redirectToCheckout({
        sessionId: payload.sessionId,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el pago.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="relative isolate py-24 sm:py-32 bg-[rgb(var(--color-card))]">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-bold tracking-tight linear-text-title">
            <MdShoppingCart className="inline-block w-10 h-10 mr-2 text-[rgb(var(--color-galaxy))]" />
            Proceder al pago
          </h2>
          <p className="mt-4 text-lg text-[rgb(var(--color-text))]/70">
            Revisa tus productos antes de finalizar tu compra.
          </p>
        </div>

        {(statusParam === 'success' || statusParam === 'cancelled') && (
          <div
            className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
              statusParam === 'success'
                ? 'border-emerald-400/40 bg-emerald-50 text-emerald-800'
                : 'border-amber-400/40 bg-amber-50 text-amber-800'
            }`}
          >
            {statusParam === 'success' ? (
              <>
                ¡Pago confirmado! Folio:&nbsp;
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-800">
                  {friendlyFolio ?? sessionId ?? 'pendiente'}
                </span>
                &nbsp;Guárdalo para cualquier aclaración.
              </>
            ) : (
              'Tu pago se canceló. Puedes intentarlo nuevamente cuando estés listo.'
            )}
            {statusParam === 'success' && folioMessage && (
              <p className="mt-2 text-xs text-amber-700">{folioMessage}</p>
            )}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-400/60 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-10 will-change-transform transform-gpu"
        >
          <div className="lg:col-span-2 space-y-6">
            {normalizedCart.map((product) => (
              <motion.div
                key={product.num_parte || product.id}
                whileHover={{ scale: 1.01 }}
                className="flex flex-col sm:flex-row items-center sm:items-start bg-[rgb(var(--color-bg))] shadow shadow-[rgb(var(--color-galaxy))] rounded-2xl p-4 sm:p-6 transition-all duration-500 hover:shadow-[0_0_20px_rgba(20,184,166,0.25)] will-change-transform transform-gpu"
              >
                <motion.img
                  src={product.normalizedImage}
                  alt={product.normalizedName}
                  className="w-32 h-32 sm:w-40 sm:h-40 rounded-xl object-contain mb-4 sm:mb-0 sm:mr-6"
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.3 }}
                />
                <div className="flex flex-col flex-1 text-left">
                  <h3 className="text-xl font-semibold text-[rgb(var(--color-text))] text-center sm:text-left">
                    {product.normalizedName}
                  </h3>
                  <p className="mt-1 text-sm text-[rgb(var(--color-text))]/70 line-clamp-2 text-center sm:text-left">
                    {product.normalizedDescription}
                  </p>
                  <div className="mt-4 flex justify-between items-center">
                    <span className="text-base text-[rgb(var(--color-success))] font-semibold">
                      {currencyFormatter.format(product.normalizedPrice)}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-[rgb(var(--color-text))]/70">Cantidad:</span>
                      <div className="w-16 text-center rounded-md shadow shadow-[rgb(var(--color-med))]/30 bg-transparent text-[rgb(var(--color-text))]">
                        {product.normalizedQuantity}
                      </div>
                      <button
                        onClick={() => removeItem(product)}
                        className="text-red-400 hover:text-red-500 transition"
                        aria-label="Eliminar producto"
                      >
                        <FaTrashCan className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {normalizedCart.length === 0 && (
              <p className="text-[rgb(var(--color-text))]/60 text-center py-10">
                Tu carrito está vacío.&nbsp;
                <Link href="/section/products" className="text-[rgb(var(--color-refautomex))] font-semibold">
                  Ver Productos
                </Link>
              </p>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }}
            className="bg-[rgb(var(--color-bg))] shadow shadow-[rgb(var(--color-galaxy))] rounded-2xl p-8 will-change-transform transform-gpu"
          >
            <h3 className="text-2xl font-semibold text-[rgb(var(--color-text))] mb-6 text-center">
              Resumen de compra
            </h3>
            <div className="space-y-3 text-[rgb(var(--color-text))]/80">
              <div className="flex justify-between">
                <span>IVA (16%)</span>
                <span>{currencyFormatter.format(ivaIncluido)}</span>
              </div>
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{currencyFormatter.format(subtotalSinIva)}</span>
              </div>
              <div className="border-t border-[rgb(var(--color-text))]/10 my-4"></div>
              <div className="flex justify-between font-semibold text-[rgb(var(--color-text))]">
                <span>Total</span>
                <span className='text-[rgb(var(--color-success))]'>{currencyFormatter.format(total)}</span>
              </div>
              <div className="flex justify-between text-xs text-[rgb(var(--color-text))]/60">
                <span>Productos diferentes</span>
                <span>{normalizedCart.length}</span>
              </div>
              <div className="flex justify-between text-xs text-[rgb(var(--color-text))]/60">
                <span>Unidades totales</span>
                <span>{totalUnits}</span>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              disabled={!normalizedCart.length || isLoading}
              onClick={startCheckout}
              className="mt-8 w-full rounded-full bg-[rgb(var(--color-text-base))] text-[rgb(var(--color-text))] font-semibold py-3 px-5 flex items-center justify-center gap-2 hover:bg-[rgb(var(--color-refautomex))] hover:text-[rgb(var(--color-text-base))] transition will-change-transform transform-gpu disabled:opacity-40 disabled:cursor-not-allowed shadow shadow-[rgb(var(--color-galaxy))]"
            >
              <FaCreditCard className="w-5 h-5" />
              {isLoading ? 'Redirigiendo al pago' : 'Proceder al pago'}
            </motion.button>
          </motion.div>
        </motion.div>

        <div className="border border-slate-400/40 mt-12"></div>

        <div className="mt-16 max-w-7xl mx-auto">
          <div className="rounded-3xl bg-[rgb(var(--color-bg))] p-8 shadow shadow-[rgb(var(--color-galaxy))]">
            <h3 className="text-2xl font-semibold linear-text-title text-center">
              Consulta tu folio
            </h3>
            <p className="mt-2 text-sm text-[rgb(var(--color-text))]/70">
              Ingresa el folio corto que aparece al finalizar tu pago para conocer el estatus.
            </p>
            <form className="mt-6 flex flex-col sm:flex-row gap-4" onSubmit={handleLookup}>
              <input
                name="folio"
                value={lookupFolio}
                onChange={(event) => setLookupFolio(event.target.value.toUpperCase())}
                placeholder="W-111222333"
                className="flex-1 rounded-2xl border border-[rgb(var(--color-text))]/20 bg-transparent px-4 py-3 text-sm text-[rgb(var(--color-text))] focus:border-cyan-400 focus:outline-none uppercase"
              />
              <button
                type="submit"
                disabled={isLookupLoading}
                className="rounded-2xl bg-[rgb(var(--color-text-base))] text-[rgb(var(--color-text))] px-6 py-3 text-sm font-semibold shadow shadow-[rgb(var(--color-galaxy))] transition hover:bg-[rgb(var(--color-refautomex))] hover:text-[rgb(var(--color-text-base))] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLookupLoading ? 'Buscando…' : 'Ver folio'}
              </button>
            </form>
            {lookupError && <p className="mt-4 text-sm text-red-600">{lookupError}</p>}
            {lookupResult && (
              <article className="mt-6 rounded-2xl border border-[rgb(var(--color-text))]/15 bg-[rgb(var(--color-card))] p-6 shadow">
                <div className="flex flex-wrap justify-between gap-3 border-b border-[rgb(var(--color-text))]/10 pb-4">
                  <div>
                    <p className="text-xs uppercase font-semibold text-[rgb(var(--color-text))]/60">
                      Folio corto
                    </p>
                    <p className="text-lg font-bold linear-text-title">
                      {lookupResult.friendlyFolio}
                    </p>
                    <p className="text-xs text-[rgb(var(--color-text))]/50">{lookupResult.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold bg-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))]">
                      {lookupResult.paymentStatus === 'paid'
                        ? 'Pagado'
                        : lookupResult.paymentStatus === 'unpaid'
                        ? 'Pendiente'
                        : 'Otro'}
                    </span>
                    {lookupResult.fulfillmentStatus && (
                      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-800">
                        {(() => {
                          const stage =
                            fulfillmentLabels[lookupResult.fulfillmentStatus] ||
                            fulfillmentLabels.en_proceso;
                          const Icon = stage.icon;
                          return (
                            <>
                              <Icon className="text-base" />
                              {stage.label}
                            </>
                          );
                        })()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-[rgb(var(--color-text))]/80 py-4">
                  <div>
                    <p className="font-semibold text-[rgb(var(--color-text))]">Correo</p>
                    <p>{lookupResult.email || 'Sin registro'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[rgb(var(--color-text))]">Monto</p>
                    <p>{currencyFormatter.format((lookupResult.amount || 0) / 100)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[rgb(var(--color-text))]">
                      Teléfono
                    </p>
                    <p>{lookupResult.contactPhone || 'Sin registro'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[rgb(var(--color-text))]">
                      Dirección
                    </p>
                    <p>{lookupResult.contactAddress || 'Sin registro'}</p>
                  </div>
                </div>
                {lookupResult.fulfillmentNote && (
                  <div className="mt-4 rounded-2xl border border-[rgb(var(--color-text))]/10 bg-[rgb(var(--color-card))] px-4 py-3 text-sm text-[rgb(var(--color-text))]/80">
                    <p className="text-xs uppercase font-semibold text-[rgb(var(--color-text))]/60 mb-1">
                      Nota
                    </p>
                    <p>{lookupResult.fulfillmentNote}</p>
                  </div>
                )}
                <div className="py-4 border-t border-[rgb(var(--color-text))]/10">
                  <p className="text-xs font-semibold uppercase text-[rgb(var(--color-text))]/60 mb-2">
                    Artículos
                  </p>
                  <ul className="space-y-2 text-sm text-[rgb(var(--color-text))]/80">
                    {(lookupResult.items ?? []).map((item, idx) => (
                      <li
                        key={`${lookupResult.id}-item-${idx}`}
                        className="flex justify-between gap-3"
                      >
                        <span className="font-medium truncate">{item.description}</span>
                        <span className="whitespace-nowrap">
                          {item.quantity} x{' '}
                          {currencyFormatter.format((item.total || 0) / 100)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
