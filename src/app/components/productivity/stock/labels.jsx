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

export default function Labels({ products }) {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3 || '';

    // Agrupar productos por localización principal
    const groupedProducts = products.reduce((groups, product) => {
        const mainLocation = getMainLocation(product.localizacion);
        if (!groups[mainLocation]) {
            groups[mainLocation] = [];
        }
        groups[mainLocation].push(product);
        return groups;
    }, {});

    return (
        <div className="p-4 print-no-scroll">
            {Object.entries(groupedProducts).map(([mainLocation, locationProducts]) => {
                const sortedProducts = locationProducts.slice().sort(compareBySuffix);

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
