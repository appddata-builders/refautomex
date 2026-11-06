'use client';
import React, { useState, useEffect, useRef } from 'react';
import Select from 'react-select';
import {
    FaArrowLeft,
    FaBoxesStacked,
    FaCamera,
    FaCcStripe,
    FaCircleCheck,
    FaCircleExclamation,
    FaFloppyDisk,
    FaGlobe,
    FaLocationDot,
    FaPlus,
    FaStar,
    FaStore,
    FaTag,
    FaTrashCan,
    FaXmark,
} from 'react-icons/fa6';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import heic2any from 'heic2any';
import { getStorageValue } from '@/app/lib/storage-values';
import PopPortal from '@/app/lib/pop-portal';
import { useTranslation } from '@/app/lib/text/text-provider';
import { UNASSIGNED } from './locations';
import { STRIPE_MX, netAfterStripe, priceForNet, stripeFee } from '@/app/lib/stripe-fees';
import { DEFAULT_UTILITY, IVA_FACTOR, formatMoney, pluralKey } from './inventory-model';
import { Field, INPUT_CLASS, SELECT_STYLES } from './product-form';
import Sheet, { SheetHeader } from './sheet';

const CONFIRM_TITLE_ID = 'almacen-confirmar-baja';

const getAbsoluteApiUrl = (path) => {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return new URL(buildApiUrl(path), base);
};
const sanitizeFileName = (name = '') => {
    const cleaned = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._-]/g, '');
    return cleaned || 'imagen.jpg';
};

const slugifyRefaccion = (value = '') => value.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'producto';

const getFileExtension = (file) => {
    if (file?.name) {
        const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
        if (match) return match[1];
    }
    if (file?.type) {
        if (file.type.includes('jpeg')) return 'jpg';
        if (file.type.includes('png')) return 'png';
        if (file.type.includes('webp')) return 'webp';
        if (file.type.includes('gif')) return 'gif';
    }
    return 'jpg';
};

const buildStandardFilename = ({ refaccion, timestamp, index, extension }) => {
    const slug = slugifyRefaccion(refaccion);
    return sanitizeFileName(`upload_${slug}_${timestamp}_${index}.${extension}`);
};

const parseRoutes = (raw) => {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
            return [];
        }
    }
    return [];
};

const buildImageSrc = (multimediaSrc = '', route) => {
    if (!route) return `${multimediaSrc}productos/no-img.png`;
    return route.startsWith('http') ? route : `${multimediaSrc}${route}`;
};

const isWebBranchValue = (value) => {
    if (value === null || value === undefined) return false;
    const normalized = String(value).trim().toUpperCase();
    return normalized === '1' || normalized === 'WEB';
};

// Sin texto es "por ubicar" ('0'), como en Gestion de almacen e Inventarios.
const normalizeLocation = (location) => String(location ?? '').trim().toUpperCase() || UNASSIGNED;

const hasLeadingZeroSuffix = (location = '') => {
    const parts = location.split('-');
    if (parts.length < 2) return false;
    const suffix = parts[1] || '';
    return suffix.length > 1 && suffix.startsWith('0');
};

const MODEL_YEAR_OPTIONS = Array.from({ length: 36 }, (_, i) => {
    const year = 1990 + i;
    return { value: year, label: `${year}` };
});

// Atajos de utilidad; se puede escribir cualquier otra. Cada sucursal guarda
// la suya (WEB puede ir mas arriba por la comision de Stripe), y las compras
// recalculan el precio de cada sucursal con su propia utilidad.
const UTILITY_PRESETS = [25, 30, 35, 40];

const utilityPercent = (utility) => {
    const value = Number(utility);
    return Number.isFinite(value) && value > 0 ? String(Number(((value - 1) * 100).toFixed(2))) : '';
};

const utilityFromPercent = (percent) => Number((1 + percent / 100).toFixed(4));

// La utilidad que da un precio escrito a mano: se guarda con el precio para
// que la siguiente compra lo vuelva a calcular igual.
const utilityFrom = (price, cost) => {
    const value = parseFloat(price) / (parseFloat(cost) * IVA_FACTOR);
    return Number.isFinite(value) && value > 0 ? Number(value.toFixed(4)) : null;
};

// Precio publico con IVA, como lo guarda la base: costo x utilidad x IVA
// (220.47 x 1.30 x 1.16 = 332.47). Antes se calculaba sin IVA y redondeado,
// y cambiar el costo bajaba el precio 16 %.
const priceFrom = (cost, utility) => {
    const value = parseFloat(cost) * Number(utility) * IVA_FACTOR;
    return Number.isFinite(value) && value > 0 ? value.toFixed(2) : '';
};

// Encabezado de cada bloque, con su numero: el mismo de Nuevo producto en
// Inventarios.
function SectionTitle({ step, title, aside }) {
    return (
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-amber-500 text-xs text-slate-900">{step}</span>
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {aside}
        </h3>
    );
}

export default function EditRegister({ prodOverview, onCancelEdit, setProdOverview, onRefreshProducts }) {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const [saving, setSaving] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    // Lo que se va escribiendo en Utilidad (%), para no perder el punto de
    // "32." mientras se teclea; null muestra la utilidad guardada.
    const [utilityDraft, setUtilityDraft] = useState(null);
    const [brandOptions, setBrandOptions] = useState([]);
    const [groupOptions, setGroupOptions] = useState([]);
    const [categoryOptions, setCategoryOptions] = useState([]);
    const [QuantityOptions, setQuantityOptions] = useState([]);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [errorMessages, setErrorMessages] = useState({
        num_parte: '',
        sucursal: '',
        localizacion: '',
        descripcion: '',
        existencia: '',
        costo: '',
        precio: '',
        utilidad: '',
        mod_ini: '',
        mod_fin: '',
        idmarca: '',
        idgrupo: '',
        idcategoria: ''
    });

    const defaultProdOverview = {
        rutas: [],
        idgrupo: '',
        grupo: '',
        idcategoria: 1
    };

    const currentProduct = prodOverview || defaultProdOverview;
    const normalizedRoutes = parseRoutes(currentProduct.rutas);
    const [imageRoutes, setImageRoutes] = useState(normalizedRoutes);
    const [pendingImages, setPendingImages] = useState([]);
    const pendingImagesRef = useRef([]);
    const [selectedImage, setSelectedImage] = useState(
        normalizedRoutes.length > 0
            ? buildImageSrc(multimediaSrc, normalizedRoutes[0])
            : `${multimediaSrc}productos/no-img.png`
    );
    const [mediaUploading, setMediaUploading] = useState(false);
    const [imageFeedback, setImageFeedback] = useState({ error: '', success: '' });
    const fileInputRef = useRef(null);
    const [branchDetails, setBranchDetails] = useState([]);
    const [selectedBranchId, setSelectedBranchId] = useState(null);
    const [branchLoading, setBranchLoading] = useState(false);
    const [branchError, setBranchError] = useState('');
    const [userBranchId, setUserBranchId] = useState(null);
    const [deletingBranchId, setDeletingBranchId] = useState(null);
    const [detailPendingDelete, setDetailPendingDelete] = useState(null);
    const [productDeleting, setProductDeleting] = useState(false);
    const [productPendingDelete, setProductPendingDelete] = useState(false);
    const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
    const activeBranchId = selectedBranchId || (currentProduct?.idsucursal ? String(currentProduct.idsucursal) : null);
    const isWebBranchSelected = isWebBranchValue(activeBranchId);

    const revokePreviewUrl = (image) => {
        if (image?.previewUrl) {
            URL.revokeObjectURL(image.previewUrl);
        }
    };

    useEffect(() => {
        pendingImagesRef.current = pendingImages;
    }, [pendingImages]);

    useEffect(() => {
        return () => {
            pendingImagesRef.current.forEach(revokePreviewUrl);
        };
    }, []);

    const routesKey = JSON.stringify(parseRoutes(prodOverview?.rutas));
    useEffect(() => {
        const updatedRoutes = parseRoutes(routesKey);
        setImageRoutes(updatedRoutes);
        setPendingImages(prev => {
            prev.forEach(revokePreviewUrl);
            return [];
        });
        const initialImage = updatedRoutes.length > 0
            ? buildImageSrc(multimediaSrc, updatedRoutes[0])
            : `${multimediaSrc}productos/no-img.png`;
        setSelectedImage(initialImage);
    }, [routesKey, multimediaSrc]);

    useEffect(() => {
        if (!prodOverview) return;
        const candidateId =
            prodOverview.idgrupo ??
            prodOverview.idGrupo ??
            prodOverview.id_grupo ??
            null;
        const candidateLabel = prodOverview.grupo || prodOverview.group;

        if (candidateId) {
            setProdOverview(prev => {
                if (!prev) return prev;
                if (String(prev.idgrupo ?? '') === String(candidateId)) return prev;
                return { ...prev, idgrupo: candidateId };
            });
            setGroupOptions((prev) => {
                const exists = prev.some(
                    (option) => String(option.value) === String(candidateId)
                );
                if (exists) return prev;
                return [
                    ...prev,
                    {
                        value: candidateId,
                        label: candidateLabel || `Grupo ${candidateId}`,
                    },
                ];
            });
        } else if (candidateLabel) {
            const matched = groupOptions.find(
                (option) => option.label.toLowerCase() === candidateLabel.toLowerCase()
            );
            if (matched) {
                setProdOverview(prev => {
                    if (!prev || String(prev.idgrupo ?? '') === String(matched.value)) return prev;
                    return { ...prev, idgrupo: matched.value };
                });
            }
        }
    }, [prodOverview, groupOptions, setProdOverview]);

    useEffect(() => {
        if (!prodOverview) return;
        const candidateId =
            prodOverview.idcategoria ??
            prodOverview.idCategoria ??
            prodOverview.id_categoria ??
            null;

        if (candidateId) {
            setProdOverview(prev => {
                if (!prev) return prev;
                if (String(prev.idcategoria ?? '') === String(candidateId)) return prev;
                return { ...prev, idcategoria: candidateId };
            });
            setCategoryOptions((prev) => {
                const exists = prev.some(
                    (option) => String(option.value) === String(candidateId)
                );
                if (exists) return prev;
                return [
                    ...prev,
                    {
                        value: candidateId,
                        label: `Categoria ${candidateId}`,
                    },
                ];
            });
        } else if (!prodOverview.idcategoria) {
            setProdOverview(prev => prev ? { ...prev, idcategoria: 1 } : prev);
        }
    }, [prodOverview, setProdOverview]);

    useEffect(() => {
        const session = getStorageValue('CognitoUserSession');
        const username = session?.idToken?.payload?.['cognito:username'];
        const user = username ? getStorageValue(`user_${username}`) : null;
        const resolvedBranch = user?.idsucursal ? String(user.idsucursal) : null;
        setUserBranchId(resolvedBranch);
    }, []);

    useEffect(() => {
        if (!prodOverview?.refaccion) {
            setBranchDetails([]);
            setSelectedBranchId(null);
            return;
        }

        let ignore = false;
        const fetchBranchDetails = async () => {
            setBranchLoading(true);
            setBranchError('');
            try {
                const response = await fetch(buildApiUrl('/getWarehouseProducts'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const activeRows = Array.isArray(payload?.[1]) ? payload[1] : [];
                const normalized = activeRows
                    .filter(detail => detail.num_parte === prodOverview.refaccion)
                    .map(detail => ({
                        idsucursal: String(detail.idsucursal),
                        sucursal: detail.sucursal,
                        localizacion: detail.localizacion,
                        existencia: detail.existencia,
                        costo: detail.costo,
                        precio: detail.precio,
                        utilidad: detail.utilidad,
                        descripcion: detail.descripcion,
                        rutas: parseRoutes(detail.rutas),
                    }));

                if (!ignore) {
                    setBranchDetails(normalized);
                    setBranchError(normalized.length === 0 ? t('panel.editRegister.noAssignments') : '');
                }
            } catch (error) {
                console.error('Error fetching branch details:', error);
                if (!ignore) {
                    setBranchDetails([]);
                    setBranchError(t('panel.editRegister.detailsError'));
                }
            } finally {
                if (!ignore) {
                    setBranchLoading(false);
                }
            }
        };

        fetchBranchDetails();

        return () => {
            ignore = true;
        };
    }, [prodOverview?.refaccion]);

    useEffect(() => {
        if (!branchDetails.length) {
            setSelectedBranchId(null);
            return;
        }

        setSelectedBranchId((prev) => {
            if (prev && branchDetails.some(detail => detail.idsucursal === prev)) {
                return prev;
            }

            const normalizedUserBranch = userBranchId ? String(userBranchId) : null;
            if (normalizedUserBranch && branchDetails.some(detail => detail.idsucursal === normalizedUserBranch)) {
                return normalizedUserBranch;
            }

            const normalizedProductBranch = prodOverview?.idsucursal ? String(prodOverview.idsucursal) : null;
            if (normalizedProductBranch && branchDetails.some(detail => detail.idsucursal === normalizedProductBranch)) {
                return normalizedProductBranch;
            }

            return branchDetails[0].idsucursal;
        });
    }, [branchDetails, userBranchId, prodOverview?.idsucursal]);

    useEffect(() => {
        if (!selectedBranchId) {
            return;
        }
        const detail = branchDetails.find(item => item.idsucursal === selectedBranchId);
        if (!detail) {
            return;
        }

        setProdOverview(prev => {
            if (!prev) return prev;
            const isWebBranch = isWebBranchValue(detail.idsucursal);
            const next = {
                ...prev,
                idsucursal: detail.idsucursal ? Number(detail.idsucursal) : prev.idsucursal,
                sucursal: detail.sucursal || prev.sucursal,
                localizacion: isWebBranch ? '0' : (detail.localizacion ?? ''),
                existencia: isWebBranch ? '0' : (detail.existencia ?? ''),
                costo: detail.costo ?? prev.costo,
                precio: detail.precio ?? prev.precio,
                utilidad: detail.utilidad ?? prev.utilidad,
            };
            const fields = ['idsucursal', 'sucursal', 'localizacion', 'existencia', 'costo', 'precio', 'utilidad'];
            if (fields.every(field => Object.is(prev[field], next[field]))) return prev;
            return next;
        });
    }, [selectedBranchId, branchDetails, setProdOverview]);

    useEffect(() => {
        const existingUrls = imageRoutes.map(route => buildImageSrc(multimediaSrc, route));
        const pendingUrls = pendingImages.map(image => image.previewUrl);
        const placeholder = `${multimediaSrc}productos/no-img.png`;
        const knownUrls = new Set([...existingUrls, ...pendingUrls, placeholder]);

        if (knownUrls.has(selectedImage)) {
            return;
        }

        if (existingUrls.length > 0) {
            setSelectedImage(existingUrls[0]);
        } else if (pendingUrls.length > 0) {
            setSelectedImage(pendingUrls[0]);
        } else {
            setSelectedImage(placeholder);
        }
    }, [imageRoutes, pendingImages, multimediaSrc, selectedImage]);

    // La marca puede quedar vacia: la descripcion no siempre dice de que auto es.
    const handleBrandChange = (selectedOption) => {
        setProdOverview(prevState => ({ ...prevState, idmarca: selectedOption ? selectedOption.value : null }));
    };

    const handleQuantityChange = (selectedOption) => {
        setProdOverview(prevState => ({ ...prevState, existencia: selectedOption.value }));
    };

    // Utilidad y precio se mueven juntos: cambiar uno recalcula el otro con el
    // costo de la sucursal elegida.
    // El aviso de precio se va en cuanto se corrige algo de lo que lo calcula.
    const clearPriceErrors = () => setErrorMessages(prev => ({ ...prev, precio: '', costo: '' }));

    const applyUtility = (utility) => {
        clearPriceErrors();
        setProdOverview(prevState => ({
            ...prevState,
            utilidad: utility,
            precio: priceFrom(prevState.costo, utility) || prevState.precio,
        }));
    };

    const handleUtilityInput = (event) => {
        const text = event.target.value.replace(',', '.');
        setUtilityDraft(text);
        const percent = parseFloat(text);
        if (Number.isFinite(percent) && percent > 0) applyUtility(utilityFromPercent(percent));
    };

    const handleUtilityPreset = (percent) => {
        setUtilityDraft(null);
        applyUtility(utilityFromPercent(percent));
    };

    const handleSuggestedPrice = (price) => {
        setUtilityDraft(null);
        clearPriceErrors();
        setProdOverview(prevState => ({
            ...prevState,
            precio: price.toFixed(2),
            utilidad: utilityFrom(price, prevState.costo) ?? prevState.utilidad,
        }));
    };

    const handlePriceChange = (event) => {
        const price = event.target.value.replace(',', '.');
        setUtilityDraft(null);
        clearPriceErrors();
        setProdOverview(prevState => ({
            ...prevState,
            precio: price,
            utilidad: utilityFrom(price, prevState.costo) ?? prevState.utilidad,
        }));
    };

    const handleGroupChange = (selectedOption) => {
        setProdOverview(prevState => ({
            ...prevState,
            idgrupo: selectedOption ? selectedOption.value : '',
            grupo: selectedOption ? selectedOption.label : ''
        }));
    };

    const resolveGroupId = () => {
        if (prodOverview?.idgrupo) return prodOverview.idgrupo;
        if (currentProduct?.idgrupo) return currentProduct.idgrupo;
        const candidateLabel = prodOverview?.grupo || currentProduct?.grupo;
        if (!candidateLabel || !groupOptions.length) return '';
        const match = groupOptions.find(
            (option) => String(option.label || '').toLowerCase() === String(candidateLabel).toLowerCase()
        );
        return match?.value || '';
    };

    const resolveCategoryId = () => {
        if (prodOverview?.idcategoria) return prodOverview.idcategoria;
        if (currentProduct?.idcategoria) return currentProduct.idcategoria;
        return categoryOptions[0]?.value || 1;
    };

    const handleDescriptionChange = (event) => {
        const value = event.target.value;
        setProdOverview(prevState => ({ ...prevState, descripcion: value }));
    };

    const handleDescriptionBlur = (event) => {
        const normalized = (event.target.value || '').toUpperCase();
        setProdOverview(prevState => {
            if (!prevState) return prevState;
            if (prevState.descripcion === normalized) return prevState;
            return { ...prevState, descripcion: normalized };
        });
    };

    const handleLocationChange = (event) => {
        const value = event.target.value;
        setProdOverview(prevState => ({ ...prevState, localizacion: value }));
    };

    const handleLocationBlur = (event) => {
        const normalized = (event.target.value || '').toUpperCase();
        setProdOverview(prevState => {
            if (!prevState) return prevState;
            if (prevState.localizacion === normalized) return prevState;
            return { ...prevState, localizacion: normalized };
        });
    };

    const handleCategoryChange = (selectedOption) => {
        setProdOverview(prevState => ({
            ...prevState,
            idcategoria: selectedOption ? selectedOption.value : ''
        }));
    };

    const handleCostChange = (e) => {
        const cost = e.target.value;
        clearPriceErrors();
        setProdOverview(prevState => ({
            ...prevState,
            costo: cost,
            precio: priceFrom(cost, prevState.utilidad) || prevState.precio,
        }));
    };

    const normalizeImageFile = async (file) => {
        if (!file) throw new Error(t('panel.editRegister.invalidFile'));
        if (!file.type || !file.type.startsWith('image/')) {
            throw new Error(t('panel.editRegister.onlyImages'));
        }
        if (file.type === 'image/heic' || file.type === 'image/heif') {
            const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg' });
            const newFile = new File([convertedBlob], `${file.name.split('.')[0]}.jpg`, { type: 'image/jpeg' });
            return { file: newFile, contentType: 'image/jpeg' };
        }
        return { file, contentType: file.type || 'image/jpeg' };
    };

    const updateRoutesState = (routes = []) => {
        setImageRoutes(routes.filter(Boolean));
    };

    // Del boton de agregar o de arrastrar fotos sobre la galeria.
    const addImageFiles = async (files) => {
        if (files.length === 0) return;

        setMediaUploading(true);
        setImageFeedback({ error: '', success: '' });

        try {
            const preparedFiles = [];
            const timestamp = Date.now();
            const refaccionSlug = currentProduct.refaccion || 'producto';
            for (let i = 0; i < files.length; i += 1) {
                const file = files[i];
                const { file: normalizedFile } = await normalizeImageFile(file);
                const extension = getFileExtension(normalizedFile);
                const standardName = buildStandardFilename({
                    refaccion: refaccionSlug,
                    timestamp,
                    index: i + 1,
                    extension,
                });
                preparedFiles.push({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    file: normalizedFile,
                    name: standardName,
                    previewUrl: URL.createObjectURL(normalizedFile),
                });
            }
            setPendingImages(prev => [...prev, ...preparedFiles]);
            if (preparedFiles[0]) {
                setSelectedImage(preparedFiles[0].previewUrl);
            }
            setImageFeedback({ error: '', success: 'Imagen agregada. Guarda el producto para subirla.' });
        } catch (error) {
            console.error('Error preparando imágenes:', error);
            setImageFeedback({ error: t('panel.editRegister.imagePrepError'), success: '' });
        } finally {
            setMediaUploading(false);
        }
    };

    const handleImageInputChange = (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        addImageFiles(files);
    };

    const handleImageDrop = (event) => {
        event.preventDefault();
        setDragActive(false);
        addImageFiles(Array.from(event.dataTransfer?.files || []));
    };

    const clearPendingImages = () => {
        setPendingImages(prev => {
            prev.forEach(revokePreviewUrl);
            return [];
        });
    };

    const handleRemovePendingImage = (imageId) => {
        setPendingImages(prev => {
            const target = prev.find(image => image.id === imageId);
            if (target) {
                revokePreviewUrl(target);
            }
            return prev.filter(image => image.id !== imageId);
        });
    };

    const uploadPendingImages = async () => {
        const uploadedKeys = [];
        for (const pending of pendingImages) {
            const refaccion = currentProduct.refaccion || 'producto';
            const formData = new FormData();
            formData.append('file', pending.file);
            formData.append('refaccion', refaccion);
            formData.append('filename', pending.name);

            const response = await fetch('/api/upload-product-image', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || t('panel.editRegister.imageUploadError'));
            }
            const data = await response.json();
            if (!data.key) {
                throw new Error(t('panel.editRegister.imageUploadBadResponse'));
            }
            uploadedKeys.push(data.key);
        }
        return uploadedKeys;
    };

    const deleteUploadedKeys = async (keys = []) => {
        if (!keys.length) return;
        await Promise.all(
            keys.map(async (key) => {
                try {
                    await fetch(`/api/upload-product-image?key=${encodeURIComponent(key)}`, {
                        method: 'DELETE',
                    });
                } catch (error) {
                    console.error('Error eliminando imagen subida:', error);
                }
            })
        );
    };

    const triggerImageUpload = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // La principal es la primera de rutas (la que muestra el buscador). Solo se
    // reordena la galeria: cambiar prodOverview.rutas la reiniciaba y tiraba
    // las fotos nuevas sin subir. Se guarda con el producto.
    const promoteExistingImage = (route) => {
        setImageRoutes(prev => [route, ...prev.filter(r => r !== route)]);
        setSelectedImage(buildImageSrc(multimediaSrc, route));
    };

    const promotePendingImage = (imageId) => {
        setPendingImages(prev => {
            const target = prev.find(image => image.id === imageId);
            if (!target) return prev;
            const without = prev.filter(image => image.id !== imageId);
            return [target, ...without];
        });
    };

    const openImageViewer = () => setIsImageViewerOpen(true);
    const closeImageViewer = () => setIsImageViewerOpen(false);

    useEffect(() => {
        if (!isImageViewerOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsImageViewerOpen(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isImageViewerOpen]);

    const handleDeleteBranchDetail = async (detail) => {
        if (!detail?.idsucursal || !currentProduct?.refaccion) {
            return;
        }

        setBranchError('');
        setDeletingBranchId(detail.idsucursal);
        try {
            const response = await fetch(buildApiUrl('/deleteProductDetail'), {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*',
                },
                body: JSON.stringify({
                    refaccion: currentProduct.refaccion,
                    idsucursal: Number(detail.idsucursal),
                }),
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            setBranchDetails(prev => prev.filter(item => item.idsucursal !== detail.idsucursal));
            if (selectedBranchId === detail.idsucursal) {
                setSelectedBranchId(null);
            }
            setSuccessMessage(t('panel.editRegister.detailDeleted'));
            onRefreshProducts?.();
            setDetailPendingDelete(null);
        } catch (error) {
            console.error('Error deleting branch detail:', error);
            setBranchError(t('panel.editRegister.detailDeleteError'));
        } finally {
            setDeletingBranchId(null);
        }
    };

    const confirmDeleteDetail = (detail) => {
        setDetailPendingDelete(detail);
    };

    const cancelDeleteDetail = () => {
        setDetailPendingDelete(null);
    };

    const handleConfirmDelete = () => {
        if (!detailPendingDelete) return;
        handleDeleteBranchDetail(detailPendingDelete);
    };

    const handleConfirmDeleteProduct = () => {
        if (!currentProduct?.refaccion) return;
        setProductPendingDelete(true);
    };

    const cancelProductDelete = () => {
        setProductPendingDelete(false);
    };

    const handleProductSoftDelete = async () => {
        if (!currentProduct?.refaccion) return;
        setProductDeleting(true);
        setErrorMessage('');
        try {
            const response = await fetch(buildApiUrl('/deleteProductCascade'), {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*',
                },
                body: JSON.stringify({
                    refaccion: currentProduct.refaccion,
                }),
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            setSuccessMessage(t('panel.editRegister.productRemoved'));
            onRefreshProducts?.();
            onCancelEdit?.();
        } catch (error) {
            console.error('Error al dar de baja producto:', error);
            setErrorMessage(t('panel.editRegister.productRemoveError'));
        } finally {
            setProductDeleting(false);
            setProductPendingDelete(false);
        }
    };

    const handleRemoveImage = (route) => {
        if (!route) return;
        const updatedRoutes = imageRoutes.filter(existingRoute => existingRoute !== route);
        updateRoutesState(updatedRoutes);
        setImageFeedback({ error: '', success: 'Imagen eliminada de la lista. Guarda para aplicar cambios.' });
    };

    const validateSubmit = async () => {
        const regexPatterns = {
            num_parte: /^[A-Z0-9-]+$/,
            localizacion: /^[0-9]{2}[A-Z]{1}[0-9A-Z]{2}[-0-9]{2,3}$/,
            descripcion: /^\s*\S+.*$/,
            // El modelo es opcional: casi ningun producto lo trae.
            mod_ini: /^(?:[0-9]{1,4})?$/,
            mod_fin: /^(?:[0-9]{1,4})?$/,
            existencia: /^[0-9]+$/,
            precio: /^[0-9]+(\.[0-9]+)?$/,
            costo: /^[0-9]+(\.[0-9]+)?$/,
        };
        let isValid = true;
        let newErrorMessages = {};
        const resolvedGroupId = resolveGroupId();
        if (!resolvedGroupId) {
            isValid = false;
            newErrorMessages.idgrupo = t('panel.addRegister.pickGroup');
        } else {
            newErrorMessages.idgrupo = '';
        }
        const resolvedCategoryId = resolveCategoryId();
        if (!resolvedCategoryId) {
            isValid = false;
            newErrorMessages.idcategoria = t('panel.addRegister.pickCategory');
        } else {
            newErrorMessages.idcategoria = '';
        }
        const normalizedLocalizacion = normalizeLocation(prodOverview.localizacion);
        // Solo se revisa la ubicacion que cambio. Por ubicar siempre se puede, y
        // la que ya tenia en la sucursal no es un conflicto nuevo: corregir el
        // precio no debe pedir arreglar una ubicacion vieja.
        const originalLocalizacion = normalizeLocation(
            branchDetails.find(detail => detail.idsucursal === activeBranchId)?.localizacion
        );
        const checkLocation = !isWebBranchSelected
            && normalizedLocalizacion !== UNASSIGNED
            && normalizedLocalizacion !== originalLocalizacion;
        // Validar campos locales con regex
        for (const [key, value] of Object.entries(prodOverview)) {
            if (key === 'costo') {
                if (value == null || value === '' || isNaN(value) || Number(value) <= 0) {
                    isValid = false;
                    newErrorMessages[key] = t('panel.editRegister.costInvalid');
                }
                continue;
            }
            if ((isWebBranchSelected && key === 'existencia') || (key === 'localizacion' && !checkLocation)) {
                newErrorMessages[key] = '';
                continue;
            }
            if (!regexPatterns[key]) {
                continue;
            }
            const valueToTest = key === 'localizacion' ? normalizedLocalizacion : (value ?? '');
            if (!regexPatterns[key].test(valueToTest)) {
                isValid = false;
                newErrorMessages[key] = `${key} - inválido.`;
            } else {
                newErrorMessages[key] = '';
            }
        }
        // Un precio que no cubre el costo con IVA es casi siempre un error de
        // dedo (35.9 por 359).
        const minimumPrice = parseFloat(prodOverview.costo) * IVA_FACTOR;
        if (!newErrorMessages.precio && !newErrorMessages.costo && parseFloat(prodOverview.precio) <= minimumPrice) {
            isValid = false;
            newErrorMessages.precio = t('panel.editRegister.priceBelowCost', { amount: formatMoney(minimumPrice) });
        }
        if (checkLocation && hasLeadingZeroSuffix(normalizedLocalizacion)) {
            isValid = false;
            newErrorMessages.localizacion =
                t('panel.warehouse.indexZero');
        }
        // Validar la localización en el servidor
        if (checkLocation) {
            try {
                const url = getAbsoluteApiUrl('/verifyLocation');
                url.searchParams.set('localizacion', normalizedLocalizacion);
                url.searchParams.set(
                    'idsucursal',
                    activeBranchId ? Number(activeBranchId) : currentProduct.idsucursal
                );
                url.searchParams.set('num_parte', prodOverview.refaccion || '');

                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json, text/plain, */*',
                    },
                    cache: 'no-store',
                });
                if (response.status === 404) {
                    console.warn('verifyLocation endpoint no disponible. Se omitirá la validación remota.');
                    return { isValid, newErrorMessages };
                }
                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                if (data.exists) {
                    newErrorMessages.localizacion = data.message || t('panel.addRegister.locationTaken');
                    isValid = false;
                }
            } catch (error) {
                console.error('Error verificando localización:', error);
                newErrorMessages.localizacion = t('panel.warehouse.locationCheckError');
                isValid = false;
            }
        }
        return { isValid, newErrorMessages };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessages({});
        setSuccessMessage('');
        setErrorMessage('');

        const validation = await validateSubmit();
        if (!validation.isValid) {
            setErrorMessages(validation.newErrorMessages);
            setErrorMessage(t('panel.newCapture.fixFields'));
            return;
        }

        let uploadedKeys = [];
        setSaving(true);
        try {
            if (pendingImages.length > 0) {
                setMediaUploading(true);
                setImageFeedback({ error: '', success: 'Subiendo imágenes pendientes...' });
                uploadedKeys = await uploadPendingImages();
            }

            const existing = imageRoutes.filter(Boolean);
            const mergedRoutes = [...existing, ...uploadedKeys];

            console.log('Merged routes before patch:', mergedRoutes);
            const resolvedBranchId = activeBranchId ? Number(activeBranchId) : currentProduct.idsucursal;
            const payloadLocalizacion = isWebBranchSelected ? UNASSIGNED : normalizeLocation(prodOverview.localizacion);
            const payloadExistencia = isWebBranchSelected ? '0' : prodOverview.existencia;
            const normalizedDescription = (prodOverview.descripcion || '').toUpperCase();
            const resolvedGroupId = resolveGroupId();
            const resolvedCategoryId = resolveCategoryId();
            const update_data = {
                refaccion: currentProduct.refaccion,
                sucursal: currentProduct.sucursal,
                localizacion: payloadLocalizacion,
                descripcion: normalizedDescription,
                existencia: payloadExistencia,
                costo: parseFloat(prodOverview.costo).toFixed(2),
                precio: parseFloat(prodOverview.precio).toFixed(2),
                aiva: (parseFloat(prodOverview.precio) / IVA_FACTOR).toFixed(2),
                utilidad: prodOverview.utilidad,
                mod_ini: prodOverview.mod_ini || null,
                mod_fin: prodOverview.mod_fin || null,
                idmarca: prodOverview.idmarca || null,
                idgrupo: resolvedGroupId,
                idcategoria: resolvedCategoryId,
                idsucursal: resolvedBranchId,
                rutas: JSON.stringify(mergedRoutes),
            };

            console.log('PatchProduct payload:', update_data);
            const response = await fetch(buildApiUrl('/patchProduct'), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*',
                },
                body: JSON.stringify(update_data),
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            console.log('PatchProduct response:', response.status);
            setSuccessMessage(t('panel.editRegister.updateOk'));
            setErrorMessages({});
            clearPendingImages();
            updateRoutesState(mergedRoutes);
            setProdOverview(prev => ({
                ...(prev || {}),
                rutas: mergedRoutes,
            }));
            setImageFeedback({ error: '', success: '' });
            if (typeof onRefreshProducts === 'function') {
                onRefreshProducts();
            }
            onCancelEdit?.();
        } catch (error) {
            if (uploadedKeys.length > 0) {
                await deleteUploadedKeys(uploadedKeys);
            }
            setErrorMessage(t('panel.addRegister.saveRetry'));
            setImageFeedback({ error: t('panel.editRegister.imagesSaveError'), success: '' });
            console.error('Error submitting the form:', error);
        } finally {
            setMediaUploading(false);
            setSaving(false);
        }
    };

    useEffect(() => {
        const fetchBrand = async () => {
        try {
                const response = await fetch(buildApiUrl('/getBrands'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const formattedBrandOptions = payload.map(marca => ({
                    value: marca.idmarca,
                    label: marca.marca
                }));
                setBrandOptions(formattedBrandOptions);
            } catch (error) {
                console.error('Error fetching Brands:', error);
            }
        };

        const fetchGroup = async () => {
            try {
                const response = await fetch(buildApiUrl('/getGroups'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const formattedGroups = payload
                    .filter(group => group.grupo && group.grupo.toLowerCase() !== 'not assigned')
                    .map(group => ({
                        value: group.idgrupo,
                        label: group.grupo,
                    }));
                setGroupOptions(formattedGroups);
            } catch (error) {
                console.error('Error fetching Groups:', error);
            }
        };

        const fetchCategory = async () => {
            try {
                const response = await fetch(buildApiUrl('/getCategory'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const formattedCategories = payload
                    .map(category => ({
                        value: category.idcategoria ?? category.idCategoria ?? category.id_categoria,
                        label: category.categoria || category.nombre || category.descripcion || `Categoria ${category.idcategoria}`,
                    }))
                    .filter(category => category.value !== undefined && category.value !== null);
                setCategoryOptions(formattedCategories);
            } catch (error) {
                console.error('Error fetching Categories:', error);
            }
        };

        const fetchQuantity = async () => {
            try {
                const response = await fetch(buildApiUrl('/getQuantity'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const formattedQuantityOptions = payload.map(cantidad => ({
                    value: cantidad.idCantidad,
                    label: cantidad.cantidad
                }));
                setQuantityOptions(formattedQuantityOptions);
            } catch (error) {
                console.error('Error fetching Quantity:', error);
            }
        };

        fetchBrand();
        fetchGroup();
        fetchCategory();
        fetchQuantity();
    }, []);
    // Galeria: las fotos guardadas y despues las nuevas, que se suben al
    // guardar. La primera es la principal.
    const gallery = [
        ...imageRoutes.map(route => ({ key: `ruta-${route}`, src: buildImageSrc(multimediaSrc, route), route })),
        ...pendingImages.map(image => ({ key: image.id, src: image.previewUrl, pendingId: image.id })),
    ];
    const previewSrc = gallery.some(item => item.src === selectedImage) ? selectedImage : gallery[0]?.src;
    const activeBranch = branchDetails.find(detail => detail.idsucursal === activeBranchId) || null;
    const branchName = activeBranch?.sucursal || currentProduct.sucursal || '';
    const busy = saving || mediaUploading;
    const referencePrice = (() => {
        const other = branchDetails.find(detail => detail.idsucursal !== activeBranchId
            && !isWebBranchValue(detail.idsucursal) && parseFloat(detail.precio) > 0);
        const current = parseFloat(currentProduct.precio);
        if (!other || !(current > 0)) return null;
        const diff = Math.round((current / parseFloat(other.precio) - 1) * 1000) / 10;
        return {
            branch: other.sucursal,
            price: parseFloat(other.precio),
            amount: formatMoney(other.precio),
            diff,
            diffText: `${diff > 0 ? '+' : ''}${diff.toFixed(1)} %`,
        };
    })();
    // En WEB: cuanto se queda Stripe con el precio actual y que precio deja
    // limpio lo mismo que la sucursal fisica (o, si no esta en ninguna, el
    // precio con la utilidad base). La tarifa vive en lib/stripe-fees.
    const webFee = (() => {
        if (!isWebBranchSelected) return null;
        const current = parseFloat(currentProduct.precio);
        const base = referencePrice?.price ?? parseFloat(priceFrom(currentProduct.costo, DEFAULT_UTILITY));
        const suggested = base > 0 ? priceForNet(base) : null;
        return {
            fee: current > 0 ? stripeFee(current) : null,
            net: current > 0 ? netAfterStripe(current) : null,
            base,
            suggested,
            covered: suggested !== null && current >= suggested - 0.005,
        };
    })();
    const confirmBusy = !!deletingBranchId || productDeleting;
    const closeConfirm = productPendingDelete ? cancelProductDelete : cancelDeleteDetail;
    const locationLabel = (location) => {
        const text = String(location ?? '').trim();
        return !text || text === UNASSIGNED ? t('panel.assignment.statUnassigned') : text;
    };
    const selectProps = {
        styles: SELECT_STYLES,
        placeholder: t('panel.addRegister.pickOne'),
        noOptionsMessage: () => t('panel.inventories.noOptions'),
    };
    const dropHandlers = {
        onDragOver: (event) => {
            event.preventDefault();
            setDragActive(true);
        },
        onDragLeave: () => setDragActive(false),
        onDrop: handleImageDrop,
    };

    return (
        <form onSubmit={handleSubmit} noValidate className="mx-auto mt-5 max-w-7xl space-y-5 px-2 pb-24 sm:px-4 xl:px-8">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageInputChange}
            />

            <header className="flex items-center gap-3 rounded-2xl bg-[rgb(var(--color-card))] p-3 shadow shadow-[rgb(var(--color-galaxy))] sm:gap-4 sm:p-4">
                <button
                    type="button"
                    onClick={onCancelEdit}
                    aria-label={t('panel.editRegister.back')}
                    title={t('panel.editRegister.back')}
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] transition hover:bg-[rgb(var(--color-text))]/10"
                >
                    <FaArrowLeft className="size-4" aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--color-gray-base))]">{t('panel.capture.part')}</p>
                    <h2 className="truncate text-xl font-bold tabular-nums sm:text-2xl">{currentProduct.refaccion}</h2>
                    <p className="truncate text-sm text-[rgb(var(--color-gray-base))]">{currentProduct.descripcion}</p>
                </div>
                {branchDetails.length > 0 && (
                    <span className="hidden shrink-0 items-center gap-2 rounded-full bg-[rgb(var(--color-bg))] px-3 py-1.5 text-sm font-semibold sm:inline-flex">
                        <FaStore className="size-3.5 text-amber-500" aria-hidden="true" />
                        {t(pluralKey('panel.editRegister.inBranches', branchDetails.length), { count: branchDetails.length })}
                    </span>
                )}
            </header>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
                <section className="space-y-4 rounded-2xl bg-[rgb(var(--color-card))] p-4 shadow shadow-[rgb(var(--color-galaxy))] sm:p-5 lg:sticky lg:top-24">
                    <SectionTitle
                        step="1"
                        title={t('panel.editRegister.photosTitle')}
                        aside={gallery.length > 0 && (
                            <span className="rounded-full bg-[rgb(var(--color-bg))] px-2 py-0.5 text-xs tabular-nums normal-case tracking-normal">{gallery.length}</span>
                        )}
                    />

                    {previewSrc ? (
                        <div className="relative" {...dropHandlers}>
                            <button
                                type="button"
                                onClick={openImageViewer}
                                aria-label={t('panel.editRegister.previewAlt')}
                                className={`block aspect-square w-full overflow-hidden rounded-2xl border bg-white transition focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/60 ${dragActive ? 'border-amber-500 ring-4 ring-amber-400/50' : 'border-[rgb(var(--color-border))]'}`}
                            >
                                <img src={previewSrc} alt={t('panel.editRegister.selectedProduct')} className="h-full w-full object-contain" />
                            </button>
                            {previewSrc === gallery[0]?.src && (
                                <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-slate-900 shadow">
                                    <FaStar className="size-3" aria-hidden="true" />
                                    {t('panel.editRegister.mainPhoto')}
                                </span>
                            )}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={triggerImageUpload}
                            disabled={mediaUploading}
                            {...dropHandlers}
                            className={`flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition disabled:opacity-60 ${dragActive
                                ? 'border-amber-500 bg-amber-500/15'
                                : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] hover:border-amber-400'}`}
                        >
                            <span className="grid size-16 place-items-center rounded-2xl bg-amber-500 text-slate-900 shadow">
                                <FaCamera className="size-7" aria-hidden="true" />
                            </span>
                            <span className="text-base font-semibold">{t('panel.editRegister.addPhotos')}</span>
                            <span className="max-w-xs text-sm text-[rgb(var(--color-gray-base))]">{t('panel.editRegister.photosHint')}</span>
                        </button>
                    )}

                    {gallery.length > 0 && (
                        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                            {gallery.map((item, index) => {
                                const selected = item.src === previewSrc;
                                return (
                                    <li key={item.key} className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedImage(item.src)}
                                            aria-pressed={selected}
                                            className={`block aspect-square w-full overflow-hidden rounded-xl border-2 bg-white transition ${selected ? 'border-amber-500 shadow' : 'border-transparent opacity-80 hover:opacity-100'}`}
                                        >
                                            <img src={item.src} alt="" className="h-full w-full object-contain" />
                                        </button>
                                        {index === 0 && (
                                            <span className="pointer-events-none absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-amber-500 text-slate-900 shadow" title={t('panel.editRegister.mainPhoto')}>
                                                <FaStar className="size-2.5" aria-hidden="true" />
                                            </span>
                                        )}
                                        {item.pendingId && (
                                            <span className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white shadow">
                                                {t('panel.editRegister.newPhoto')}
                                            </span>
                                        )}
                                        {item.route && index > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => promoteExistingImage(item.route)}
                                                title={t('panel.editRegister.makeMain')}
                                                aria-label={t('panel.editRegister.makeMain')}
                                                className="absolute bottom-1 left-1 grid size-6 place-items-center rounded-full bg-[rgb(var(--color-card))]/90 text-[rgb(var(--color-gray-base))] shadow transition hover:text-amber-500"
                                            >
                                                <FaStar className="size-3" aria-hidden="true" />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => (item.pendingId ? handleRemovePendingImage(item.pendingId) : handleRemoveImage(item.route))}
                                            title={t(item.pendingId ? 'panel.editRegister.removePendingImage' : 'panel.editRegister.removeImage')}
                                            aria-label={t(item.pendingId ? 'panel.editRegister.removePendingImage' : 'panel.editRegister.removeImage')}
                                            className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-red-600 text-white shadow transition hover:bg-red-500"
                                        >
                                            <FaXmark className="size-3" aria-hidden="true" />
                                        </button>
                                    </li>
                                );
                            })}
                            <li>
                                <button
                                    type="button"
                                    onClick={triggerImageUpload}
                                    disabled={mediaUploading}
                                    title={t('panel.editRegister.addPhotos')}
                                    aria-label={t('panel.editRegister.addPhotos')}
                                    {...dropHandlers}
                                    className={`grid aspect-square w-full place-items-center rounded-xl border-2 border-dashed transition disabled:opacity-60 ${dragActive
                                        ? 'border-amber-500 bg-amber-500/15'
                                        : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-gray-base))] hover:border-amber-400 hover:text-amber-500'}`}
                                >
                                    <FaPlus className="size-5" aria-hidden="true" />
                                </button>
                            </li>
                        </ul>
                    )}

                    {(mediaUploading || imageFeedback.error || imageFeedback.success || pendingImages.length > 0) && (
                        <div className="space-y-1 text-sm">
                            {mediaUploading && <p className="text-amber-600">{t('panel.editRegister.processingImages')}</p>}
                            {imageFeedback.error && (
                                <p className="flex items-center gap-2 text-[rgb(var(--color-error))]">
                                    <FaCircleExclamation className="size-3.5 shrink-0" aria-hidden="true" />
                                    {imageFeedback.error}
                                </p>
                            )}
                            {!mediaUploading && pendingImages.length > 0 && (
                                <p className="text-[rgb(var(--color-gray-base))]">
                                    {t(pluralKey('panel.editRegister.pendingPhotos', pendingImages.length), { count: pendingImages.length })}
                                </p>
                            )}
                        </div>
                    )}
                </section>

                <section className="space-y-8 rounded-2xl bg-[rgb(var(--color-card))] p-4 shadow shadow-[rgb(var(--color-galaxy))] sm:p-6">
                    <div className="space-y-3">
                        <SectionTitle step="2" title={t('panel.editRegister.branchToEdit')} />
                        {branchLoading && <p className="text-sm text-[rgb(var(--color-gray-base))]">{t('panel.editRegister.searchingDetails')}</p>}
                        {branchError && (
                            <p className="flex items-center gap-2 rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2 text-sm text-[rgb(var(--color-error))]">
                                <FaCircleExclamation className="size-4 shrink-0" aria-hidden="true" />
                                {branchError}
                            </p>
                        )}
                        {branchDetails.length > 0 && (
                            <div role="radiogroup" aria-label={t('panel.editRegister.branchToEdit')} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {branchDetails.map(detail => {
                                    const selected = detail.idsucursal === selectedBranchId;
                                    const web = isWebBranchValue(detail.idsucursal);
                                    const Icon = web ? FaGlobe : FaStore;
                                    return (
                                        <div
                                            key={detail.idsucursal}
                                            className={`relative rounded-xl border transition ${selected
                                                ? 'border-amber-500 bg-amber-500/15 shadow'
                                                : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] hover:border-amber-400'}`}
                                        >
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={selected}
                                                onClick={() => {
                                                    setUtilityDraft(null);
                                                    setSelectedBranchId(detail.idsucursal);
                                                }}
                                                className="flex w-full items-start gap-3 p-3 pr-12 text-left"
                                            >
                                                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${selected ? 'bg-amber-500 text-slate-900' : 'bg-[rgb(var(--color-gray))] text-[rgb(var(--color-text))]'}`}>
                                                    <Icon className="size-4" aria-hidden="true" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate font-semibold">{detail.sucursal || t('panel.common.branch')}</span>
                                                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-[rgb(var(--color-gray-base))]">
                                                        {!web && (
                                                            <span className="inline-flex items-center gap-1" title={t('panel.tableDesc.locationTitle')}>
                                                                <FaLocationDot className="size-3" aria-hidden="true" />
                                                                {locationLabel(detail.localizacion)}
                                                            </span>
                                                        )}
                                                        {!web && (
                                                            <span className="inline-flex items-center gap-1" title={t('panel.tableDesc.stockTitle')}>
                                                                <FaBoxesStacked className="size-3" aria-hidden="true" />
                                                                {detail.existencia ?? '—'}
                                                            </span>
                                                        )}
                                                        <span className="inline-flex items-center gap-1" title={t('panel.editRegister.minPrice')}>
                                                            <FaTag className="size-3" aria-hidden="true" />
                                                            {formatMoney(detail.precio)}
                                                        </span>
                                                    </span>
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => confirmDeleteDetail(detail)}
                                                disabled={deletingBranchId === detail.idsucursal}
                                                title={t('panel.editRegister.removeDetail')}
                                                aria-label={`${t('panel.editRegister.removeDetail')}: ${detail.sucursal || ''}`}
                                                className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-red-600 transition hover:bg-red-500/10 disabled:opacity-50"
                                            >
                                                <FaTrashCan className="size-3.5" aria-hidden="true" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <fieldset className="space-y-4">
                        <legend className="mb-3 w-full"><SectionTitle step="3" title={t('panel.inventories.sectionIdentity')} /></legend>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                            <Field label={t('panel.capture.descriptionLabel')} error={errorMessages.descripcion} className="sm:col-span-6">
                                <textarea
                                    rows={2}
                                    value={currentProduct.descripcion ?? ''}
                                    onChange={handleDescriptionChange}
                                    onBlur={handleDescriptionBlur}
                                    className={`${INPUT_CLASS} h-auto min-h-11 py-2 uppercase`}
                                />
                            </Field>
                            <Field label={t('products.group')} error={errorMessages.idgrupo} className="sm:col-span-3">
                                <Select
                                    {...selectProps}
                                    options={groupOptions}
                                    value={groupOptions.find(option => String(option.value) === String(prodOverview?.idgrupo)) || null}
                                    onChange={handleGroupChange}
                                    placeholder={t('panel.addRegister.pickGroupPlaceholder')}
                                />
                            </Field>
                            <Field label={t('panel.addRegister.category')} error={errorMessages.idcategoria} className="sm:col-span-3">
                                <Select
                                    {...selectProps}
                                    options={categoryOptions}
                                    value={categoryOptions.find(option => String(option.value) === String(prodOverview?.idcategoria)) || null}
                                    onChange={handleCategoryChange}
                                    placeholder={t('panel.addRegister.pickCategoryPlaceholder')}
                                />
                            </Field>
                        </div>
                    </fieldset>

                    <fieldset className="space-y-4">
                        <legend className="mb-3 w-full"><SectionTitle step="4" title={t('panel.inventories.sectionFitment')} /></legend>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                            <Field label={t('panel.addRegister.modelFrom')} error={errorMessages.mod_ini} className="sm:col-span-2">
                                <Select
                                    {...selectProps}
                                    options={MODEL_YEAR_OPTIONS}
                                    value={currentProduct.mod_ini
                                        ? { value: currentProduct.mod_ini, label: String(currentProduct.mod_ini) }
                                        : null}
                                    isClearable
                                    onChange={(selectedOption) => {
                                        setProdOverview(prevState => ({ ...prevState, mod_ini: selectedOption ? selectedOption.value : '' }));
                                    }}
                                />
                            </Field>
                            <Field label={t('panel.addRegister.modelTo')} error={errorMessages.mod_fin} className="sm:col-span-2">
                                <Select
                                    {...selectProps}
                                    options={MODEL_YEAR_OPTIONS}
                                    value={currentProduct.mod_fin
                                        ? { value: currentProduct.mod_fin, label: String(currentProduct.mod_fin) }
                                        : null}
                                    isClearable
                                    onChange={(selectedOption) => {
                                        setProdOverview(prevState => ({ ...prevState, mod_fin: selectedOption ? selectedOption.value : '' }));
                                    }}
                                />
                            </Field>
                            <Field label={t('panel.addRegister.carBrand')} error={errorMessages.idmarca} className="sm:col-span-2">
                                <Select
                                    {...selectProps}
                                    options={brandOptions}
                                    value={brandOptions.find(option => option.value === prodOverview?.idmarca) || null}
                                    onChange={handleBrandChange}
                                    isClearable
                                />
                            </Field>
                        </div>
                    </fieldset>

                    <fieldset className="space-y-4">
                        <legend className="mb-3 w-full">
                            <SectionTitle step="5" title={branchName ? t('panel.editRegister.sectionPricing', { branch: branchName }) : t('panel.editRegister.sectionPricingNoBranch')} />
                        </legend>
                        {isWebBranchSelected && (
                            <p className="flex items-center gap-2 rounded-xl bg-sky-500/10 px-3 py-2 text-sm">
                                <FaGlobe className="size-3.5 shrink-0 text-sky-600" aria-hidden="true" />
                                <span>
                                    {t('panel.inventories.webNoStock')} {t('panel.editRegister.webPriceHint')}
                                </span>
                            </p>
                        )}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                            {!isWebBranchSelected && (
                                <Field label={t('panel.tableDesc.locationTitle')} error={errorMessages.localizacion} hint={t('panel.editRegister.locationHint')} className="sm:col-span-3">
                                    <input
                                        type="text"
                                        autoComplete="off"
                                        value={currentProduct.localizacion ?? ''}
                                        onChange={handleLocationChange}
                                        onBlur={handleLocationBlur}
                                        className={`${INPUT_CLASS} font-semibold uppercase tabular-nums tracking-wide`}
                                    />
                                </Field>
                            )}
                            {!isWebBranchSelected && (
                                <Field label={t('panel.tableDesc.stockTitle')} error={errorMessages.existencia} className="sm:col-span-3">
                                    <Select
                                        {...selectProps}
                                        options={QuantityOptions}
                                        value={QuantityOptions.find(option => option.value === prodOverview?.existencia) || null}
                                        onChange={handleQuantityChange}
                                    />
                                </Field>
                            )}
                            <Field label={t('panel.editRegister.providerCost')} error={errorMessages.costo} className="sm:col-span-3">
                                <span className="relative block">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-gray-base))]">$</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        value={currentProduct.costo ?? ''}
                                        onChange={handleCostChange}
                                        className={`${INPUT_CLASS} pl-7 tabular-nums`}
                                    />
                                </span>
                            </Field>
                            <Field label={t('panel.addRegister.utility')} className="sm:col-span-3">
                                <span className="relative block">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        value={utilityDraft ?? utilityPercent(currentProduct.utilidad)}
                                        onChange={handleUtilityInput}
                                        onBlur={() => setUtilityDraft(null)}
                                        className={`${INPUT_CLASS} pr-8 tabular-nums`}
                                    />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-gray-base))]">%</span>
                                </span>
                                <span className="mt-2 flex flex-wrap gap-1.5">
                                    {UTILITY_PRESETS.map(percent => {
                                        const active = utilityPercent(currentProduct.utilidad) === String(percent);
                                        return (
                                            <button
                                                key={percent}
                                                type="button"
                                                onClick={() => handleUtilityPreset(percent)}
                                                aria-pressed={active}
                                                className={`h-8 rounded-full px-3 text-xs font-semibold tabular-nums transition ${active
                                                    ? 'bg-amber-500 text-slate-900 shadow'
                                                    : 'bg-[rgb(var(--color-bg))] text-[rgb(var(--color-gray-base))] hover:text-[rgb(var(--color-text))]'}`}
                                            >
                                                {percent}%
                                            </button>
                                        );
                                    })}
                                </span>
                            </Field>
                            <div className={`space-y-2 rounded-2xl px-4 py-3 sm:col-span-6 ${errorMessages.precio ? 'bg-[rgb(var(--color-error))]/10' : 'bg-amber-500/15'}`}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <span className="flex min-w-0 items-center gap-3">
                                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-slate-900">
                                            <FaTag className="size-4" aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0">
                                            <label htmlFor="almacen-precio" className="block text-sm font-medium">
                                                {branchName ? t('panel.editRegister.priceIn', { branch: branchName }) : t('panel.editRegister.minPrice')}
                                            </label>
                                            <span className="block text-xs text-[rgb(var(--color-gray-base))]">{t('panel.editRegister.priceFormula')}</span>
                                        </span>
                                    </span>
                                    <span className="ml-auto shrink-0 text-right">
                                        <span className="relative block">
                                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl font-bold text-[rgb(var(--color-gray-base))]">$</span>
                                            <input
                                                id="almacen-precio"
                                                type="text"
                                                inputMode="decimal"
                                                autoComplete="off"
                                                value={currentProduct.precio ?? ''}
                                                onChange={handlePriceChange}
                                                onBlur={() => {
                                                    const value = parseFloat(currentProduct.precio);
                                                    if (Number.isFinite(value)) setProdOverview(prev => ({ ...prev, precio: value.toFixed(2) }));
                                                }}
                                                className="h-12 w-40 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] pl-7 pr-3 text-right text-2xl font-bold tabular-nums text-[rgb(var(--color-text))] focus:outline-none focus:ring-2 focus:ring-amber-400"
                                            />
                                        </span>
                                        {parseFloat(currentProduct.precio) > 0 && (
                                            <span className="mt-1 block text-xs tabular-nums text-[rgb(var(--color-gray-base))]">
                                                {t('panel.editRegister.priceNoTax', { amount: formatMoney(parseFloat(currentProduct.precio) / IVA_FACTOR) })}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                {referencePrice && (
                                    <p className="text-xs tabular-nums text-[rgb(var(--color-gray-base))]">
                                        {referencePrice.diff === 0
                                            ? t('panel.editRegister.priceSameAs', { branch: referencePrice.branch, amount: referencePrice.amount })
                                            : t('panel.editRegister.priceVs', referencePrice)}
                                    </p>
                                )}
                                {errorMessages.precio && (
                                    <p className="flex items-center gap-2 text-sm text-[rgb(var(--color-error))]">
                                        <FaCircleExclamation className="size-3.5 shrink-0" aria-hidden="true" />
                                        {errorMessages.precio}
                                    </p>
                                )}
                            </div>
                            {webFee && (
                                <div className="space-y-2 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm sm:col-span-6">
                                    <p className="flex items-start gap-2">
                                        <FaCcStripe className="mt-0.5 size-5 shrink-0 text-indigo-500" aria-hidden="true" />
                                        <span>
                                            {t('panel.editRegister.stripeRate', {
                                                percent: `${(STRIPE_MX.percent * 100).toFixed(1)} %`,
                                                fixed: formatMoney(STRIPE_MX.fixed),
                                            })}
                                        </span>
                                    </p>
                                    {webFee.net !== null && (
                                        <p className="tabular-nums">
                                            {t('panel.editRegister.stripeNet', { net: formatMoney(webFee.net), fee: formatMoney(webFee.fee) })}
                                        </p>
                                    )}
                                    {webFee.suggested !== null && (
                                        webFee.covered ? (
                                            <p className="flex items-center gap-2 font-medium text-[rgb(var(--color-success))]">
                                                <FaCircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
                                                {referencePrice
                                                    ? t('panel.editRegister.stripeCovered', { branch: referencePrice.branch, amount: referencePrice.amount })
                                                    : t('panel.editRegister.stripeCoveredBase', { amount: formatMoney(webFee.base) })}
                                            </p>
                                        ) : (
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="min-w-0 flex-1 tabular-nums">
                                                    {referencePrice
                                                        ? t('panel.editRegister.stripeSuggest', { branch: referencePrice.branch, amount: referencePrice.amount, suggested: formatMoney(webFee.suggested) })
                                                        : t('panel.editRegister.stripeSuggestBase', { amount: formatMoney(webFee.base), suggested: formatMoney(webFee.suggested) })}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSuggestedPrice(webFee.suggested)}
                                                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 font-semibold text-white shadow transition hover:bg-indigo-500"
                                                >
                                                    {t('panel.editRegister.stripeUse', { suggested: formatMoney(webFee.suggested) })}
                                                </button>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    </fieldset>

                    {successMessage && (
                        <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm">
                            <FaCircleCheck className="size-4 shrink-0 text-[rgb(var(--color-success))]" aria-hidden="true" />
                            {successMessage}
                        </p>
                    )}
                    {errorMessage && (
                        <p role="alert" className="flex items-center gap-2 rounded-xl bg-[rgb(var(--color-error))]/10 px-3 py-2 text-sm text-[rgb(var(--color-error))]">
                            <FaCircleExclamation className="size-4 shrink-0" aria-hidden="true" />
                            {errorMessage}
                        </p>
                    )}

                    <div className="flex flex-col-reverse gap-3 border-t border-[rgb(var(--color-border))] pt-5 sm:flex-row sm:items-center">
                        <button
                            type="button"
                            onClick={handleConfirmDeleteProduct}
                            disabled={productDeleting || busy}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold text-red-600 transition hover:bg-red-500/10 disabled:opacity-60"
                        >
                            <FaTrashCan className="size-3.5" aria-hidden="true" />
                            {productDeleting ? t('panel.editRegister.removing') : t('panel.editRegister.remove')}
                        </button>
                        <span className="hidden flex-1 sm:block" />
                        <button
                            type="button"
                            onClick={onCancelEdit}
                            disabled={busy}
                            className="h-11 rounded-xl px-5 font-semibold text-[rgb(var(--color-gray-base))] transition hover:bg-[rgb(var(--color-text))]/10 disabled:opacity-60"
                        >
                            {t('panel.common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 font-semibold text-slate-900 shadow transition hover:bg-amber-400 disabled:opacity-60"
                        >
                            <FaFloppyDisk className="size-4" aria-hidden="true" />
                            {saving ? t('panel.providers.saving') : t('panel.personal.save')}
                        </button>
                    </div>
                </section>
            </div>

            <Sheet isOpen={Boolean(detailPendingDelete || productPendingDelete)} onClose={closeConfirm} locked={confirmBusy} labelledBy={CONFIRM_TITLE_ID}>
                <SheetHeader
                    icon={FaTrashCan}
                    title={productPendingDelete ? t('panel.editRegister.removeProductTitle') : t('panel.editRegister.confirmDelete')}
                    titleId={CONFIRM_TITLE_ID}
                    subtitle={productPendingDelete
                        ? `${currentProduct.refaccion || ''} · ${currentProduct.descripcion || ''}`
                        : `${currentProduct.refaccion || ''} · ${detailPendingDelete?.sucursal || ''}`}
                    onClose={closeConfirm}
                    closeDisabled={confirmBusy}
                />
                <p className="text-sm">
                    {productPendingDelete ? t('panel.editRegister.confirmProductHint') : t('panel.editRegister.confirmDetailHint')}
                </p>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={closeConfirm} disabled={confirmBusy} className="h-11 rounded-xl px-4 font-semibold hover:bg-[rgb(var(--color-text))]/10">
                        {t('panel.common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={productPendingDelete ? handleProductSoftDelete : handleConfirmDelete}
                        disabled={confirmBusy}
                        className="h-11 rounded-xl bg-red-600 px-5 font-semibold text-white shadow hover:bg-red-500 disabled:opacity-60"
                    >
                        {productPendingDelete
                            ? (productDeleting ? t('panel.editRegister.removing') : t('panel.editRegister.remove'))
                            : (deletingBranchId ? t('panel.common.deleting') : t('panel.common.delete'))}
                    </button>
                </div>
            </Sheet>

            {isImageViewerOpen && previewSrc && (
                <PopPortal>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={t('panel.editRegister.previewAlt')}
                        onClick={closeImageViewer}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    >
                        <button
                            type="button"
                            onClick={closeImageViewer}
                            aria-label={t('panel.editRegister.closeViewer')}
                            className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white text-slate-900 shadow-lg"
                        >
                            <FaXmark className="size-4" aria-hidden="true" />
                        </button>
                        <img
                            src={previewSrc}
                            alt={t('panel.editRegister.previewAlt')}
                            className="max-h-[85vh] max-w-full rounded-2xl bg-white object-contain shadow-2xl"
                        />
                    </div>
                </PopPortal>
            )}
        </form>
    );
}
