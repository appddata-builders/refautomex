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

// Sin sucursal fisica de referencia, lo que la web debe dejar es el costo con
// la utilidad base e IVA (DEFAULT_UTILITY e IVA_FACTOR de inventory-model).
const BASE_UTILITY = 1.3;
const IVA = 1.16;

/**
 * Si el precio de WEB de un producto cubre la comision: con el, despues de
 * Stripe, llega lo mismo que en mostrador. Lo usan Inventarios (Precios WEB),
 * el almacen (la insignia WEB y el detalle) y el servidor al ajustar precios
 * (patchWebPrices), para que los tres digan lo mismo.
 *
 *   webPrice    precio actual del renglon de WEB
 *   references  [{ branch, price }] de las sucursales fisicas; se compara
 *               contra la mas cara, asi la web no deja menos que ninguna
 *   cost        costo del renglon de WEB, para cuando no esta en ninguna fisica
 *
 * `covered` es null cuando no hay contra que comparar (sin referencia ni
 * costo) o el producto no tiene precio en WEB; `gap` es lo que le falta para
 * llegar al sugerido (0 si ya lo cubre o no hay sugerido).
 */
export const webPriceCheck = ({ webPrice, references = [], cost } = {}) => {
    const current = Number(webPrice) > 0 ? Number(webPrice) : null;
    const reference = references.reduce((best, item) => {
        const price = Number(item?.price);
        return price > 0 && (!best || price > best.price) ? { branch: item.branch, price } : best;
    }, null);
    const fromCost = Number(cost) > 0 ? Math.round(Number(cost) * BASE_UTILITY * IVA * 100) / 100 : null;
    const base = reference?.price ?? fromCost;
    const suggested = base ? priceForNet(base) : null;
    const covered = suggested === null || current === null ? null : current >= suggested - 0.005;
    return {
        current,
        fee: current === null ? null : stripeFee(current),
        net: current === null ? null : netAfterStripe(current),
        reference,
        base,
        suggested,
        covered,
        gap: suggested !== null && covered !== true ? suggested - (current ?? 0) : 0,
    };
};
