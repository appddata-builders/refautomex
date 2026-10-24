import { useTranslation } from '@/app/lib/text/text-provider';

const resolveLabelImageSrc = (product, basePath) => {
    const fallback = `${basePath}productos/no-img.png`;
    const rawImage = product.imageSrc || product.ruta || (product.rutas?.[0] ?? '');

    if (!rawImage) return fallback;
    if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
        return rawImage;
    }
    return `${basePath}${rawImage}`;
};

const getMainLocation = (location) => {
    if (!location) return '';
    const lastDashIndex = location.lastIndexOf('-');
    if (lastDashIndex === -1) return location;
    return location.substring(0, lastDashIndex);
};

const getLocationSuffix = (location) => {
    if (!location) return '';
    const lastDashIndex = location.lastIndexOf('-');
    if (lastDashIndex === -1) return '';
    return location.substring(lastDashIndex + 1);
};

const compareBySuffix = (a, b) => {
    const suffixA = getLocationSuffix(a.localizacion);
    const suffixB = getLocationSuffix(b.localizacion);

    const numA = parseInt(suffixA, 10);
    const numB = parseInt(suffixB, 10);
    const isNumA = !Number.isNaN(numA);
    const isNumB = !Number.isNaN(numB);

    if (isNumA && isNumB) {
        return numA - numB;
    }
    if (isNumA) return -1;
    if (isNumB) return 1;
    return suffixA.localeCompare(suffixB);
};

// Productos agrupados por localización principal, cada grupo ordenado por su
// índice: el orden en que se pegan en el anaquel.
const groupByMainLocation = (products) => {
    const groups = products.reduce((acc, product) => {
        const mainLocation = getMainLocation(product.localizacion);
        if (!acc[mainLocation]) {
            acc[mainLocation] = [];
        }
        acc[mainLocation].push(product);
        return acc;
    }, {});
    return Object.entries(groups).map(([mainLocation, locationProducts]) => [
        mainLocation,
        locationProducts.slice().sort(compareBySuffix),
    ]);
};

export default function Labels({ products }) {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3 || '';

    return (
        <div className="p-4 print-no-scroll">
            {groupByMainLocation(products).map(([mainLocation, sortedProducts]) => {
                return (
                <div
                    key={mainLocation}
                    className="my-4 border border-dashed border-gray-800 -mx-1 p-1 rounded-lg"
                    style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                >
                    {/* Grid que incluye tanto la localización como los productos */}
                    <div
                        className="grid grid-cols-2 gap-4"
                        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                    >
                        {/* Etiqueta de localización como primer elemento del grid */}
                        <div className="flex items-center justify-center p-1 border border-gray-400 rounded-lg bg-gray-100 shadow-sm print:border print:shadow-none">
                            <div className="flex flex-col w-full">
                                <div className="w-full flex items-center justify-center">
                                    <img
                                        loading="eager"
                                        className="h-8"
                                        src={`${multimediaSrc}refautomex_n.svg`}
                                        alt={t('meta.brand')}
                                    />
                                </div>
                                <div className="w-full flex items-center justify-center">
                                    <span className="text-7xl font-bold text-gray-800 uppercase text-center px-2">
                                        {mainLocation}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Productos de esta localización */}
                        {sortedProducts.map((product, index) => {
                            const locationSuffix = getLocationSuffix(product.localizacion);
                            const displayedIndex = locationSuffix || index + 1;

                            return (
                            <div
                                key={`${product.refaccion}-${index}`}
                                className="relative flex p-3 border border-gray-300 rounded-lg bg-white shadow-sm print:border print:shadow-none"
                                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                            >
                                <div className="absolute top-2 right-2 pointer-events-none z-10 bg-white/90 rounded px-1">
                                    <img
                                        loading="eager"
                                        className="h-8"
                                        src={`${multimediaSrc}refautomex_n.svg`}
                                        alt={t('meta.brand')}
                                    />
                                </div>
                                <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md border border-gray-200">
                                    <img
                                        loading="eager"
                                        src={resolveLabelImageSrc(product, multimediaSrc)}
                                        alt={product.refaccion}
                                        className="h-full w-full object-contain object-center"
                                        onError={(event) => {
                                            event.currentTarget.src = `${multimediaSrc}productos/no-img.png`;
                                        }}
                                    />
                                </div>
                                <div className="relative ml-3 flex flex-1 flex-col">
                                    {/* Índice secuencial dentro del grupo */}
                                    <div className="absolute -right-1 -bottom-1 bg-black text-white p-0.5 rounded-full text-center w-7 h-7 flex items-center justify-center">
                                        <span className="font-bold text-xl">
                                            {displayedIndex}
                                        </span>
                                    </div>
                                    <div className="flex justify-start text-md font-normal text-gray-900 overflow-hidden h-[66px] w-36">
                                        <h3 className="italic">
                                            {product.descripcion}
                                        </h3>
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">{product.category}</p>
                                    <div className="flex flex-1 items-end justify-between pt-1 mr-12">
                                        <p className="text-black font-bold text-xl truncate">{product.refaccion}</p>
                                    </div>
                                </div>
                            </div>
                        );
                        })}
                    </div>
                </div>
            )})}
        </div>
    );
}

const avoidBreak = { breakInside: 'avoid', pageBreakInside: 'avoid' };

/**
 * Los mismos rótulos para la impresora térmica de los tickets. Van uno debajo
 * de otro, en blanco y negro y separados para cortarlos con tijera.
 *
 * Miden y se acomodan como el ticket de venta (component-print): 55 mm
 * centrados y con el mismo margen por dentro. La impresora solo marca el
 * centro del rollo (unos 48 mm en uno de 58), así que lo que queda pegado a la
 * orilla se pierde. El tamaño de la hoja lo pone el papel que se elige al
 * imprimir.
 *
 * Su @page aplica a todo el documento y react-to-print copia todos los <style>
 * de la página: si se quedara montado, los rótulos normales también saldrían
 * sin margen. Por eso solo se monta mientras se imprime.
 */
export function ThermalLabels({ products }) {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3 || '';
    const logoSrc = `${multimediaSrc}refautomex_n.svg`;

    return (
        <div className="mx-auto w-[55mm] bg-white px-4 pb-[15mm] text-black">
            <style>
                {`
                @page {
                    margin: 0;
                }
                @media print {
                    * {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    body {
                        margin: 0;
                    }
                }
                `}
            </style>
            {groupByMainLocation(products).map(([mainLocation, sortedProducts]) => (
                <section
                    key={mainLocation}
                    className="space-y-[3mm] border-b-2 border-dashed border-black py-[3mm]"
                >
                    <div className="rounded-lg border-2 border-black p-[2mm] text-center" style={avoidBreak}>
                        <img loading="eager" className="mx-auto h-[6mm]" src={logoSrc} alt={t('meta.brand')} />
                        <p className="mt-[1mm] break-all text-[12mm] font-bold uppercase leading-none">
                            {mainLocation}
                        </p>
                    </div>

                    {sortedProducts.map((product, index) => {
                        const displayedIndex = getLocationSuffix(product.localizacion) || index + 1;

                        return (
                            <div
                                key={`${product.refaccion}-${index}`}
                                className="rounded-lg border border-black p-[1.5mm]"
                                style={avoidBreak}
                            >
                                <div className="flex gap-[2mm]">
                                    <img
                                        loading="eager"
                                        src={resolveLabelImageSrc(product, multimediaSrc)}
                                        alt={product.refaccion}
                                        className="size-[16mm] shrink-0 object-contain grayscale"
                                        onError={(event) => {
                                            event.currentTarget.src = `${multimediaSrc}productos/no-img.png`;
                                        }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <img loading="eager" className="ml-auto h-[3.5mm]" src={logoSrc} alt={t('meta.brand')} />
                                        {/* break-words: una palabra larga sin espacios
                                            ("CONTROL(UNIDAD)MANDO") se cortaba a la derecha. */}
                                        <h3 className="mt-[0.5mm] line-clamp-3 break-words text-[2.8mm] italic leading-tight">
                                            {product.descripcion}
                                        </h3>
                                        {product.category && <p className="text-[2.2mm]">{product.category}</p>}
                                    </div>
                                </div>
                                {/* A todo el ancho: un número de parte largo se parte en
                                    vez de cortarse, como en el ticket de venta. */}
                                <div className="mt-[1mm] flex items-center justify-between gap-[1.5mm]">
                                    <p className="min-w-0 break-all text-[4.5mm] font-bold leading-none">{product.refaccion}</p>
                                    <span className="grid size-[7mm] shrink-0 place-items-center rounded-full bg-black text-[3.8mm] font-bold text-white">
                                        {displayedIndex}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </section>
            ))}
        </div>
    );
}
