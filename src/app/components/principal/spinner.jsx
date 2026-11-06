'use client';
import { Cielo, FONDO_LOADER, StarOrbit, useRetenerEntrada } from '@/app/components/principal/star-loader';

/**
 * Cualquier espera: la misma orbita de la entrada al sitio (star-loader.jsx).
 * Por omision ocupa la pantalla; `compact` es para dentro de un panel, como el
 * buscador de productos.
 */
export default function Spinner({ compact = false }) {
    if (compact) return <SpinnerCompacto />;
    return <SpinnerPantalla />;
}

function SpinnerCompacto() {
    return (
        <div className="flex min-h-64 w-full items-center justify-center py-8">
            <StarOrbit tam="chico" />
        </div>
    );
}

// Ocupa la pantalla: si todavia esta el loader de entrada, lo mantiene puesto.
function SpinnerPantalla() {
    useRetenerEntrada();
    return (
        <div
            className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[rgb(var(--color-bg))]"
            style={{ backgroundImage: FONDO_LOADER }}
        >
            <Cielo />
            <StarOrbit />
        </div>
    );
}
