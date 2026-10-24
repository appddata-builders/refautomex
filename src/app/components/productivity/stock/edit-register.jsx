'use client';
import { MdDelete, MdAddPhotoAlternate } from 'react-icons/md';
import React, { useState, useEffect, useRef } from 'react';
import Select from 'react-select';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import heic2any from 'heic2any';
import { getStorageValue } from '@/app/lib/storage-values';
import { useTranslation } from '@/app/lib/text/text-provider';

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

export default function EditRegister({ prodOverview, onCancelEdit, setProdOverview, onRefreshProducts }) {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const [isSuccessfull, setIsSuccessfull] = useState(false);
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
    const branchSelectOptions = branchDetails.map(detail => ({
        value: detail.idsucursal,
        label: detail.sucursal || 'Sucursal',
    }));
    const selectedBranchOption =
        branchSelectOptions.find(option => option.value === selectedBranchId) || null;

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

    useEffect(() => {
        const updatedRoutes = parseRoutes(prodOverview?.rutas);
        setImageRoutes(updatedRoutes);
        setPendingImages(prev => {
            prev.forEach(revokePreviewUrl);
            return [];
        });
        const initialImage = updatedRoutes.length > 0
            ? buildImageSrc(multimediaSrc, updatedRoutes[0])
            : `${multimediaSrc}productos/no-img.png`;
        setSelectedImage(initialImage);
    }, [prodOverview, multimediaSrc]);

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
                if (prev.idgrupo === candidateId) return prev;
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
                setProdOverview(prev => prev ? { ...prev, idgrupo: matched.value } : prev);
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
                if (prev.idcategoria === candidateId) return prev;
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
            return {
                ...prev,
                idsucursal: detail.idsucursal ? Number(detail.idsucursal) : prev.idsucursal,
                sucursal: detail.sucursal || prev.sucursal,
                localizacion: isWebBranch ? '0' : (detail.localizacion ?? ''),
                existencia: isWebBranch ? '0' : (detail.existencia ?? ''),
                costo: detail.costo ?? prev.costo,
                precio: detail.precio ?? prev.precio,
                utilidad: detail.utilidad ?? prev.utilidad,
            };
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

    const handleBrandChange = (selectedOption) => {
        setProdOverview(prevState => ({ ...prevState, idmarca: selectedOption.value }));
    };

    const handleQuantityChange = (selectedOption) => {
        setProdOverview(prevState => ({ ...prevState, existencia: selectedOption.value }));
    };

    const handleUtilityChange = (selectedOption) => {
        setProdOverview(prevState => ({ ...prevState, utilidad: selectedOption.value }));
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
        const price = Math.round(cost * currentProduct.utilidad);
        setProdOverview(prevState => ({ ...prevState, precio: price }));
        setProdOverview(prevState => ({ ...prevState, costo : cost }));
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

    const handleImageInputChange = async (event) => {
        const files = Array.from(event.target.files || []);
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
            if (event.target) {
                event.target.value = '';
            }
        }
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

    const promoteExistingImage = (route) => {
        setImageRoutes(prev => {
            const without = prev.filter(r => r !== route);
            return [route, ...without];
        });
        setProdOverview(prev => {
            const nextRoutes = [route, ...prev.rutas.filter(r => r !== route)];
            return { ...prev, rutas: nextRoutes };
        });
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

    const handleExistingImageClick = (route) => {
        if (!route) return;
        setSelectedImage(buildImageSrc(multimediaSrc, route));
        openImageViewer();
    };

    const handlePendingImageClick = (imageId, previewUrl) => {
        setSelectedImage(previewUrl);
        openImageViewer();
    };

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
            mod_ini: /^[0-9]{1,4}$/,
            mod_fin: /^[0-9]{1,4}$/,
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
        const normalizedLocalizacion = (prodOverview.localizacion || '').toUpperCase();
        // Validar campos locales con regex
        for (const [key, value] of Object.entries(prodOverview)) {
            if (key === 'costo') {
                if (value == null || value === '' || isNaN(value) || Number(value) <= 0) {
                    isValid = false;
                    newErrorMessages[key] = t('panel.editRegister.costInvalid');
                }
                continue;
            }
            if (isWebBranchSelected && (key === 'localizacion' || key === 'existencia')) {
                newErrorMessages[key] = '';
                continue;
            }
            if (!regexPatterns[key]) {
                continue;
            }
            const valueToTest = key === 'localizacion' ? normalizedLocalizacion : value;
            if (!regexPatterns[key].test(valueToTest)) {
                isValid = false;
                newErrorMessages[key] = `${key} - inválido.`;
            } else {
                newErrorMessages[key] = '';
            }
        }
        if (!isWebBranchSelected && normalizedLocalizacion && hasLeadingZeroSuffix(normalizedLocalizacion)) {
            isValid = false;
            newErrorMessages.localizacion =
                t('panel.warehouse.indexZero');
        }
        // Validar la localización en el servidor
        if (!isWebBranchSelected) {
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
            const payloadLocalizacion = isWebBranchSelected ? '0' : (prodOverview.localizacion || '').toUpperCase();
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
                utilidad: prodOverview.utilidad,
                mod_ini: prodOverview.mod_ini,
                mod_fin: prodOverview.mod_fin,
                idmarca: prodOverview.idmarca,
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
    return (
        <form onSubmit={handleSubmit}>
            <div className="md:px-20 py-10">
                <div className="flex flex-col xl:flex-row">
                    <div className="flex-1 flex flex-col xl:flex-row items-center my-auto">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handleImageInputChange}
                        />
                        <div
                            className="overflow-hidden rounded-3xl shadow-xl bg-gray-200 h-[250px] w-[250px] sm:h-[350px] sm:w-[350px] xl:w-[400px] xl:h-[400px] cursor-pointer"
                            onClick={openImageViewer}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    openImageViewer();
                                }
                            }}
                        >
                            <img
                                src={selectedImage}
                                alt={t('panel.editRegister.selectedProduct')}
                                className="h-full w-full object-cover object-center"
                            />
                        </div>
                        <div className="flex flex-row xl:flex-col justify-center items-center xl:m-10 m-2">
                            <button
                                type="button"
                                onClick={triggerImageUpload}
                                disabled={mediaUploading}
                                className='flex justify-center items-center my-2 opacity-80 hover:opacity-100 w-16 h-16 object-cover cursor-pointer rounded-xl mr-2 bg-[rgb(var(--color-card))] border-[rgb(var(--color-border))] border border-dashed hover:animate-out disabled:cursor-not-allowed disabled:opacity-50'
                                title={t('panel.editRegister.addPhotos')}
                            >
                                <MdAddPhotoAlternate className='h-10 w-10' />
                            </button>
                            <div className='flex flex-col'>
                                {imageRoutes.map((ruta, index) => {
                                    const imagePath = buildImageSrc(multimediaSrc, ruta);
                                    return (
                                        <div key={`existing-${index}`} className='relative inline-block'>
                                            <img
                                                src={imagePath}
                                                alt={`product ${index + 1}`}
                                                className={`w-16 h-16 object-cover cursor-pointer my-2 rounded-xl mr-2 ${selectedImage === imagePath ? 'border-2 border-[rgb(var(--color-amber))]' : 'border border-[rgb(var(--color-border))]'}`}
                                                onClick={() => handleExistingImageClick(ruta)}
                                            />
                                            <button
                                                type="button"
                                                className='absolute -top-1 -right-1 bg-red-100 text-red-600 rounded-full border border-gray-400 p-1'
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleRemoveImage(ruta);
                                                }}
                                                aria-label={t('panel.editRegister.removeImage')}
                                            >
                                                <MdDelete className='h-3 w-3' />
                                            </button>
                                        </div>
                                    );
                                })}
                                {pendingImages.length > 0 && (
                                    <p className='text-xs text-[rgb(var(--color-text))] mt-2 mb-1'>
                                        {t('panel.editRegister.newImages')}
                                    </p>
                                )}
                                {pendingImages.map((image) => (
                                    <div key={image.id} className='relative inline-block'>
                                        <img
                                            src={image.previewUrl}
                                            alt={t('panel.editRegister.pendingProduct')}
                                            className={`w-16 h-16 object-cover cursor-pointer my-2 rounded-xl mr-2 ${selectedImage === image.previewUrl ? 'border-2 border-[rgb(var(--color-amber))]' : 'border border-[rgb(var(--color-border))]'}`}
                                            onClick={() => handlePendingImageClick(image.id, image.previewUrl)}
                                        />
                                        <button
                                            type="button"
                                            className='absolute -top-1 -right-1 bg-red-100 text-red-600 rounded-full border border-gray-400 p-1'
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleRemovePendingImage(image.id);
                                            }}
                                            aria-label={t('panel.editRegister.removePendingImage')}
                                        >
                                            <MdDelete className='h-3 w-3' />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {(mediaUploading || imageFeedback.error || imageFeedback.success) && (
                                <div className='w-full text-center text-xs text-[rgb(var(--color-text))] my-2'>
                                    {mediaUploading && <p className='text-[rgb(var(--color-amber))]'>{t('panel.editRegister.processingImages')}</p>}
                                    {imageFeedback.error && <p className='text-[rgb(var(--color-error))]'>{imageFeedback.error}</p>}
                                    {imageFeedback.success && <p className='text-[rgb(var(--color-success))]'>{imageFeedback.success}</p>}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 px-2 2xl:px-20 my-auto">
                        <div className="rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-inner shadow-[rgb(var(--color-galaxy))]">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col xl:flex-row gap-4 ">
                                    <div className="flex-1 rounded-2xl bg-[rgb(var(--color-bg))] border border-dashed border-[rgb(var(--color-border))] p-4">
                                        <p className="text-xs uppercase tracking-wide text-[rgb(var(--color-text))]/60">
                                        Total sucursales activas: {branchDetails.length}
                                        </p>
                                        <label className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                            {t('panel.editRegister.branchToEdit')}
                                        </label>
                                        <Select
                                            options={branchSelectOptions}
                                            value={selectedBranchOption}
                                            onChange={(option) => setSelectedBranchId(option ? option.value : null)}
                                            isDisabled={branchSelectOptions.length === 0}
                                            isLoading={branchLoading}
                                            placeholder={branchLoading ? t('panel.personal.loadingBranches') : t('panel.editRegister.pickBranch')}
                                            classNamePrefix="react-select"
                                        />
                                        {branchError && (
                                            <p className="text-[rgb(var(--color-error))] text-sm mt-2">
                                                {branchError}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {branchLoading && (
                                    <p className="text-xs text-[rgb(var(--color-text))]/70">
                                        {t('panel.editRegister.searchingDetails')}
                                    </p>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-52 overflow-y-auto">
                                    {branchDetails.length === 0 && !branchLoading ? (
                                        <div className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] p-4 text-sm text-[rgb(var(--color-text))]/70">
                                            {t('panel.editRegister.noOtherBranches')}
                                        </div>
                                    ) : (
                                        branchDetails.map(detail => {
                                            const isActive = detail.idsucursal === selectedBranchId;
                                            return (
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    key={`${detail.idsucursal}-${detail.localizacion}`}
                                                    onClick={() => setSelectedBranchId(detail.idsucursal)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            setSelectedBranchId(detail.idsucursal);
                                                        }
                                                    }}
                                                    className={`text-left rounded-2xl border p-3 transition hover:shadow ${
                                                        isActive
                                                            ? 'border-[rgb(var(--color-refautomex))] bg-[rgb(var(--color-gray))]/40'
                                                            : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className="text-sm font-semibold text-[rgb(var(--color-text))]">
                                                            {detail.sucursal || 'Sucursal'}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="p-1 rounded-full bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                confirmDeleteDetail(detail);
                                                            }}
                                                            disabled={deletingBranchId === detail.idsucursal}
                                                            title={t('panel.editRegister.removeDetail')}
                                                        >
                                                            <MdDelete className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-[rgb(var(--color-text))]/80">
                                                        <p><span className="font-semibold text-[rgb(var(--color-text))]">{t('panel.editRegister.locField')}</span> {detail.localizacion || '—'}</p>
                                                        <p><span className="font-semibold text-[rgb(var(--color-text))]">{t('panel.addRegister.stockField')}</span> {detail.existencia ?? '—'}</p>
                                                        <p>
                                                            <span className="font-semibold text-[rgb(var(--color-text))]">{t('panel.editRegister.costField')}</span>{' '}
                                                            {detail.costo !== undefined && detail.costo !== null && detail.costo !== ''
                                                                ? `$${Number(detail.costo).toFixed(2)}`
                                                                : '—'}
                                                        </p>
                                                        <p>
                                                            <span className="font-semibold text-[rgb(var(--color-text))]">{t('panel.editRegister.priceField')}</span>{' '}
                                                            {detail.precio !== undefined && detail.precio !== null && detail.precio !== ''
                                                                ? `$${Number(detail.precio).toFixed(2)}`
                                                                : '—'}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
                            <div className="sm:col-span-2">
                                <label htmlFor="first-name" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('panel.capture.part')}
                                </label>
                                <div className="mt-2 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] animate-up rounded-md p-1 shadow">
                                    {currentProduct.refaccion}
                                </div>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('products.group')}
                                </label>
                                <div className="mt-2">
                                    <Select
                                        options={groupOptions}
                                        value={groupOptions.find(option => String(option.value) === String(prodOverview?.idgrupo)) || null}
                                        onChange={handleGroupChange}
                                        placeholder={t('panel.addRegister.pickOne')}
                                        classNamePrefix="react-select"
                                    />
                                    {errorMessages.idgrupo && (
                                        <span className="text-[rgb(var(--color-error))] text-sm">
                                            {errorMessages.idgrupo}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('panel.addRegister.category')}
                                </label>
                                <div className="mt-2">
                                    <Select
                                        options={categoryOptions}
                                        value={categoryOptions.find(option => String(option.value) === String(prodOverview?.idcategoria)) || null}
                                        onChange={handleCategoryChange}
                                        placeholder={t('panel.addRegister.pickOne')}
                                        classNamePrefix="react-select"
                                    />
                                    {errorMessages.idcategoria && (
                                        <span className="text-[rgb(var(--color-error))] text-sm">
                                            {errorMessages.idcategoria}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="sm:col-span-2">
                                <label htmlFor="email" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('panel.addRegister.carBrand')}
                                </label>
                                <div className="mt-2">
                                    <Select
                                        id="marca"
                                        name="marca"
                                        value={brandOptions.find(option => option.value === prodOverview?.idmarca)}
                                        onChange={handleBrandChange}
                                        options={brandOptions}
                                        isDisabled={isSuccessfull}
                                        classNamePrefix="react-select"
                                    />
                                    {errorMessages.idmarca && (
                                        <span className="text-[rgb(var(--color-error))] text-sm">
                                            {errorMessages.idmarca}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="col-span-full">
                                <label htmlFor="descripcion" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('panel.capture.descriptionLabel')}
                                </label>
                                <div className="mt-2">
                                    <textarea
                                    id="descripcion"
                                    name="descripcion"
                                    type="text"
                                    autoComplete="descripcions"
                                    value={currentProduct.descripcion ?? ''}
                                    className="block w-full rounded-md border-0 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 uppercase"
                                    onChange={handleDescriptionChange}
                                    onBlur={handleDescriptionBlur}
                                    />
                                    {errorMessages.descripcion && (
                                        <span className="text-[rgb(var(--color-error))] text-sm">
                                            {errorMessages.descripcion}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {!isWebBranchSelected && (
                                <div className="sm:col-span-2">
                                    <label htmlFor="location" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                        {t('panel.tableDesc.locationTitle')}
                                    </label>
                                    <div className="mt-2">
                                        <input
                                            id="location"
                                            name="location"
                                            type="text"
                                            autoComplete="location"
                                            value={currentProduct.localizacion ?? ''}
                                            className="block w-full rounded-md border-0 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 uppercase"
                                            onChange={handleLocationChange}
                                            onBlur={handleLocationBlur}
                                        />
                                        {errorMessages.localizacion && (
                                            <span className="text-[rgb(var(--color-error))] text-sm">
                                                {errorMessages.localizacion}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('panel.addRegister.modelFrom')}
                                </label>
                                <div className="mt-2">
                                    <Select
                                        id='mod_ini'
                                        name='mod_ini'
                                        className='w-full'
                                        options={MODEL_YEAR_OPTIONS}
                                        value={currentProduct.mod_ini
                                            ? { value: currentProduct.mod_ini, label: String(currentProduct.mod_ini) }
                                            : null}
                                        onChange={(selectedOption) => {
                                            setProdOverview(prevState => ({ ...prevState, mod_ini: selectedOption.value }));
                                        }}
                                    />
                                    {errorMessages.mod_ini && (
                                        <span className="text-[rgb(var(--color-error))] text-sm">
                                            {errorMessages.mod_ini}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('panel.addRegister.modelTo')}
                                </label>
                                <div className="mt-2">
                                    <Select
                                        id='mod_fin'
                                        name='mod_fin'
                                        className='w-full'
                                        options={MODEL_YEAR_OPTIONS}
                                        value={currentProduct.mod_fin
                                            ? { value: currentProduct.mod_fin, label: String(currentProduct.mod_fin) }
                                            : null}
                                        onChange={(selectedOption) => {
                                            setProdOverview(prevState => ({ ...prevState, mod_fin: selectedOption.value }));
                                        }}
                                    />
                                    {errorMessages.mod_fin && (
                                        <span className="text-[rgb(var(--color-error))] text-sm">
                                            {errorMessages.mod_fin}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {!isWebBranchSelected && (
                                <div className="sm:col-span-2">
                                    <label htmlFor="last-name" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                        {t('panel.tableDesc.stockTitle')}
                                    </label>
                                    <div className="mt-2">
                                        <Select
                                            id="existencia"
                                            name="existencia"
                                            value={QuantityOptions.find(option => option.value === prodOverview?.existencia)}
                                            onChange={handleQuantityChange}
                                            options={QuantityOptions}
                                            isDisabled={isSuccessfull}
                                            classNamePrefix="react-select"
                                        />
                                        {errorMessages.existencia && (
                                            <span className="text-[rgb(var(--color-error))] text-sm">
                                                {errorMessages.existencia}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="sm:col-span-2">
                                <label htmlFor="last-name" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('panel.addRegister.utility')}
                                </label>
                                <div className="mt-2">
                                    <Select
                                        options={[
                                            { value: 1.25, label: '25%' },
                                            { value: 1.3, label: '30%' },
                                            { value: 1.35, label: '35%' },
                                        ]}
                                        value={currentProduct?.utilidad
                                            ? { value: currentProduct.utilidad, label: `${((currentProduct.utilidad - 1) * 100).toFixed(0)}%` }
                                            : null}
                                        onChange={handleUtilityChange}
                                    />
                                </div>
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="costo" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('panel.editRegister.providerCost')}
                                </label>
                                <div className="mt-2">
                                    <input
                                    id="costo"
                                    name="costo"
                                    type="text"
                                    autoComplete="costo"
                                    value={currentProduct.costo ?? ''}
                                    onChange={handleCostChange}
                                    className="block w-full rounded-md border-0 p-1.5 text-[rgb(var(--color-text))] shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                    {errorMessages.costo && (
                                        <span className="text-[rgb(var(--color-error))] text-sm">
                                            {errorMessages.costo}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="last-name" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('panel.editRegister.minPrice')}
                                </label>
                                <div className="mt-2 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] animate-up rounded-md p-1 shadow">
                                    {currentProduct.precio}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div>
                    {successMessage && <div className="text-[rgb(var(--color-success))]">{successMessage}</div>}
                    {errorMessages && (
                        <div className="text-[rgb(var(--color-error))]">
                            {errorMessages.num_parte}
                        </div>
                    )}
                </div>
                <div className="flex flex-col justify-center items-center mt-3 max-w-7xl">
                    <div className="grid grid-cols-1 md:grid-cols-3 mt-6 items-center justify-end gap-4">
                        <button
                        onClick={onCancelEdit}
                        type="button"
                        className="bg-gradient-to-bl hover:bg-gradient-to-tr bg-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out text-[rgb(var(--color-text))]">
                        {t('panel.newCapture.back')}
                        </button>
                        <button
                        type="button"
                        onClick={handleConfirmDeleteProduct}
                        className="bg-gradient-to-bl from-red-500 via-rose-500 to-red-700 text-white shadow p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 disabled:opacity-60"
                        disabled={productDeleting}
                        >
                        {productDeleting ? t('panel.editRegister.removing') : t('panel.editRegister.remove')}
                        </button>
                        <button
                        type="submit"
                        className={isSuccessfull ? 'bg-gradient-to-bl hover:bg-gradient-to-tr bg-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out cursor-not-allowed' : 'bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer'}
                        disabled={isSuccessfull}
                        >
                        {t('panel.personal.save')}
                        </button>
                    </div>
                </div>
            </div>
            {(detailPendingDelete || productPendingDelete) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-[rgb(var(--color-card))] rounded-2xl shadow-2xl max-w-md w-full p-6 border border-[rgb(var(--color-border))]">
                        <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">
                            {productPendingDelete ? t('panel.editRegister.removeProductTitle') : t('panel.editRegister.confirmDelete')}
                        </h3>
                        <p className="text-sm text-[rgb(var(--color-text))]/80 mt-2">
                            {productPendingDelete
                                ? t('panel.editRegister.confirmProductHint')
                                : t('panel.editRegister.confirmDetailHint')}
                        </p>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                className="px-4 py-2 rounded-full bg-gray-200 text-gray-800 hover:bg-gray-300"
                                onClick={productPendingDelete ? cancelProductDelete : cancelDeleteDetail}
                                disabled={!!deletingBranchId || productDeleting}
                            >
                                {t('panel.common.cancel')}
                            </button>
                            <button
                                type="button"
                                className="px-4 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-70"
                                onClick={productPendingDelete ? handleProductSoftDelete : handleConfirmDelete}
                                disabled={!!deletingBranchId || productDeleting}
                            >
                                {productPendingDelete
                                    ? (productDeleting ? t('panel.editRegister.removing') : t('panel.editRegister.remove'))
                                    : (deletingBranchId ? t('panel.common.deleting') : t('panel.common.delete'))}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isImageViewerOpen && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
                    <div className="relative max-w-3xl w-full">
                        <button
                            type="button"
                            className="absolute -top-4 -right-4 bg-white text-black rounded-full px-3 py-1 shadow-lg text-sm font-semibold"
                            onClick={closeImageViewer}
                            aria-label={t('panel.editRegister.closeViewer')}
                        >
                            {t('common.close')}
                        </button>
                        <img
                            src={selectedImage}
                            alt={t('panel.editRegister.previewAlt')}
                            className="rounded-3xl shadow-2xl w-full max-h-[80vh] object-contain bg-[rgb(var(--color-card))]"
                            onClick={closeImageViewer}
                        />
                    </div>
                </div>
            )}
        </form>
    )
}
