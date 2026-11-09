'use client';

/**
 * Las ofertas vigentes en la tienda (Promociones del panel), para el catalogo,
 * la seccion Promociones y el checkout. Salen de GET /api/promociones, que
 * calcula el precio de oferta igual que el cobro.
 *
 * `desfase` es la diferencia entre el reloj del servidor y el del equipo: el
 * conteo regresivo lo suma para que un celular con la hora mal puesta no
 * muestre una oferta que ya termino (o que aun no la muestre).
 *
 * Se vuelven a pedir cuando termina la primera oferta, cada pocos minutos (una
 * promocion nueva aparece sola) y al volver a la pestana.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

const RECARGA_MS = 3 * 60 * 1000;
const VACIO = { promociones: [], desfase: 0, cargando: true, error: null };

// `inicial` ({ ahora, promociones }) es lo que ya leyo el servidor al armar la
// pagina (el inicio): se pinta de entrada, sin esperar al fetch.
export function useOfertas({ inicial } = {}) {
    const [estado, setEstado] = useState(() => (inicial
        ? {
            promociones: inicial.promociones || [],
            desfase: Number.isFinite(Date.parse(inicial.ahora)) ? Date.parse(inicial.ahora) - Date.now() : 0,
            cargando: false,
            error: null,
        }
        : VACIO));

    const recargar = useCallback(async () => {
        try {
            const response = await fetch('/api/promociones', { cache: 'no-store', headers: { Accept: 'application/json' } });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.error || `Error ${response.status}`);
            setEstado({
                promociones: Array.isArray(data.promociones) ? data.promociones : [],
                desfase: Number.isFinite(Date.parse(data.ahora)) ? Date.parse(data.ahora) - Date.now() : 0,
                cargando: false,
                error: null,
            });
        } catch (error) {
            // Sin ofertas la tienda sigue vendiendo a precio normal.
            setEstado((actual) => ({ ...actual, cargando: false, error }));
        }
    }, []);

    useEffect(() => {
        recargar();
        const timer = setInterval(recargar, RECARGA_MS);
        const alVolver = () => {
            if (document.visibilityState === 'visible') recargar();
        };
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, [recargar]);

    // Cuando termina la primera oferta se vuelve a pedir: sus productos
    // regresan a su precio sin recargar la pagina.
    useEffect(() => {
        const fines = estado.promociones.map((p) => Date.parse(p.fin)).filter(Number.isFinite);
        if (!fines.length) return undefined;
        const espera = Math.min(...fines) - (Date.now() + estado.desfase) + 1000;
        const timer = setTimeout(recargar, Math.max(1000, Math.min(espera, 2 ** 31 - 1)));
        return () => clearTimeout(timer);
    }, [estado.promociones, estado.desfase, recargar]);

    // num_parte -> la oferta mas barata de ese producto.
    const porParte = useMemo(() => {
        const mapa = new Map();
        estado.promociones.forEach((promocion) => {
            promocion.productos.forEach((producto) => {
                const actual = mapa.get(producto.num_parte);
                if (actual && actual.precio <= producto.precio) return;
                mapa.set(producto.num_parte, {
                    precio: producto.precio,
                    precioRegular: producto.precioRegular,
                    ahorro: producto.ahorro,
                    idpromocion: promocion.idpromocion,
                    titulo: promocion.titulo,
                    fin: promocion.fin,
                });
            });
        });
        return mapa;
    }, [estado.promociones]);

    return { ...estado, porParte, recargar };
}

/**
 * El producto del catalogo con su oferta encima: `precio` pasa a ser el de
 * oferta (lo que se agrega al carrito y se cobra), `precioRegular` el de antes
 * y `oferta` lo que pinta la banda y el conteo.
 */
export const conOferta = (producto, porParte) => {
    const oferta = porParte.get(producto.num_parte);
    const regular = Number(producto.precioRegular ?? producto.precio);
    if (!oferta || !(oferta.precio < regular)) {
        if (!producto.oferta) return producto;
        // La oferta termino: de vuelta a su precio.
        const { oferta: _vencida, precioRegular: _regular, ...resto } = producto;
        return { ...resto, precio: regular };
    }
    return {
        ...producto,
        precio: oferta.precio,
        precioRegular: regular,
        oferta: { idpromocion: oferta.idpromocion, titulo: oferta.titulo, fin: oferta.fin, ahorro: oferta.ahorro },
    };
};

export const formatoPrecio = (valor) =>
    (Number(valor) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
