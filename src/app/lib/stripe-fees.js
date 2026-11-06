/**
 * Comision de Stripe Mexico, para poner el precio de WEB.
 *
 * Tarifa estandar publicada en https://stripe.com/mx/pricing (consultada el
 * 2026-11-05): 3.6 % + MXN 3.00 por cobro exitoso con tarjeta nacional. "Todas
 * las comisiones excluyen el IVA", asi que sobre la comision se paga 16 % de
 * IVA. Una tarjeta internacional suma 0.5 % y la conversion de moneda 2 %; la
 * tienda cobra en MXN y solo con tarjeta (create-checkout-session), asi que la
 * cuenta usa la nacional. Si Stripe cambia la tarifa, se cambia aqui.
 *
 * La cuota fija es por cobro, no por producto. El precio sugerido la carga
 * completa a cada producto: en un pedido de uno solo se recibe exacto, y en
 * uno de varios sobra un poco.
 */

export const STRIPE_MX = {
    percent: 0.036,
    fixed: 3,
    tax: 0.16,
    internationalPercent: 0.005,
};

const WITH_TAX = 1 + STRIPE_MX.tax;

// Lo que Stripe se queda de un cobro de `amount` pesos, IVA incluido.
export const stripeFee = (amount) => (Number(amount) * STRIPE_MX.percent + STRIPE_MX.fixed) * WITH_TAX;

// Lo que llega a la cuenta de un cobro de `amount` pesos.
export const netAfterStripe = (amount) => Number(amount) - stripeFee(amount);

// El precio de WEB con el que, quitando la comision, llega `net` pesos.
// Se redondea al centavo hacia arriba para no quedar abajo por redondeo.
export const priceForNet = (net) => {
    const value = (Number(net) + STRIPE_MX.fixed * WITH_TAX) / (1 - STRIPE_MX.percent * WITH_TAX);
    return Number.isFinite(value) && value > 0 ? Math.ceil(value * 100) / 100 : null;
};
