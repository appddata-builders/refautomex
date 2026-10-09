import React, { useContext, useEffect, useRef, useState } from 'react';
import Select from 'react-select';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { MdAddCircle, MdAssignmentAdd } from 'react-icons/md';
import { IoTicket } from 'react-icons/io5';
import FindProducts from '@/app/components/productivity/sales/find-products';
import ComponentToPrint from '@/app/components/productivity/sales/component-print';
import { AuthContext } from '@/app/lib/auth-tracker';
import { useTranslation } from '@/app/lib/text/text-provider';

const parseRoutes = (raw) => {
    if (!raw) return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
        return [];
    }
};

const isWebBranchValue = (value) => {
    if (value === null || value === undefined) return false;
    const normalized = String(value).toUpperCase();
    return normalized === '1' || normalized === 'WEB';
};

const isWebBranchOption = (option) => {
    if (!option) return false;
    if (isWebBranchValue(option.value)) return true;
    return String(option.label || '').toLowerCase().includes('web');
};

const hasLeadingZeroSuffix = (location = '') => {
    const parts = location.split('-');
    if (parts.length < 2) return false;
    const suffix = parts[1] || '';
    return suffix.length > 1 && suffix.startsWith('0');
};

// La opcion vacia de los selects se arma con `t` porque su etiqueta sale de la
// base; solo el `value` centinela es constante.
const NOT_ASSIGNED_VALUE = '__NOT_ASSIGNED__';

const buildNotAssignedOption = (t) => ({ value: NOT_ASSIGNED_VALUE, label: t('panel.addRegister.pickOne'), isDisabled: true });

const withDefaultOption = (options = [], t) => [buildNotAssignedOption(t), ...options];

const getSelectValue = (options = [], value, t) => {
    if (!value) return buildNotAssignedOption(t);
    return options.find((option) => option.value === value) || buildNotAssignedOption(t);
};

const normalizeNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const formatPhoneInput = (value) => {
    const digits = String(value ?? '').replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
};

export default function AddRegister({ onCancelEdit, onRefreshProducts }) {
    const { t } = useTranslation();
    const { userData } = useContext(AuthContext);
    const DEFAULT_CATEGORY_ID = 1;
    const [productForm, setProductForm] = useState({
        refaccion: '',
        descripcion: '',
        mod_ini: '',
        mod_fin: '',
        idgrupo: '',
        idcategoria: DEFAULT_CATEGORY_ID,
        idmarca: '',
        idproveedor: '',
    });
    const IVA_FACTOR = 1.16;

    const [detailForm, setDetailForm] = useState({
        idsucursal: '',
        localizacion: '',
        existencia: '',
        costo: '',
        precio: '',
        aiva: '',
        utilidad: '',
    });
    const [groupOptions, setGroupOptions] = useState([]);
    const [categoryOptions, setCategoryOptions] = useState([]);
    const [brandOptions, setBrandOptions] = useState([]);
    const [providerOptions, setProviderOptions] = useState([]);
    const [sucursalOptions, setSucursalOptions] = useState([]);
    const [quantityOptions, setQuantityOptions] = useState([]);
    const [pendingProducts, setPendingProducts] = useState([]);
    const [activeProducts, setActiveProducts] = useState([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [selectedPendingPart, setSelectedPendingPart] = useState(null);
    const [activeStep, setActiveStep] = useState('product');
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [errorMessages, setErrorMessages] = useState({});
    const [detailGroupId, setDetailGroupId] = useState(null);
    const [showTicketPreview, setShowTicketPreview] = useState(false);
    const [ticketBranchId, setTicketBranchId] = useState('');
    const [ticketPhonePrimary, setTicketPhonePrimary] = useState('');
    const [ticketPhoneSecondary, setTicketPhoneSecondary] = useState('');
    const [ticketWhatsappPrimary, setTicketWhatsappPrimary] = useState('');
    const [ticketWhatsappSecondary, setTicketWhatsappSecondary] = useState('');
    const [ticketAddress, setTicketAddress] = useState('');
    const [ticketSaving, setTicketSaving] = useState(false);
    const [ticketSaveMessage, setTicketSaveMessage] = useState('');
    const [ticketSaveError, setTicketSaveError] = useState('');
    const [ticketPreviewKey, setTicketPreviewKey] = useState(0);

    const findProductsRef = useRef(null);

    const extractGroupOptionsFromProducts = (products = []) => {
        const uniqueGroups = new Map();
        products.forEach((product) => {
            const id = product.idgrupo ?? product.idGrupo ?? product.id_grupo;
            const name = product.grupo ?? product.group;
            if (id && name && !uniqueGroups.has(id)) {
                uniqueGroups.set(id, {
                    value: id,
                    label: name
                });
            }
        });
        return Array.from(uniqueGroups.values()).sort((a, b) =>
            a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })
        );
    };

    const selectedPendingProduct =
        pendingProducts.find((product) => product.num_parte === selectedPendingPart) ||
        activeProducts.find((product) => product.num_parte === selectedPendingPart);

    const extractGroupId = (product) => {
        const raw =
            product?.idgrupo ??
            product?.id_grupo ??
            product?.idGrupo ??
            null;
        if (raw === null || raw === undefined) return null;
        const str = String(raw).trim();
        if (!str || str === '0') return null;
        return raw;
    };

    const extractCategoryId = (product) => {
        const raw =
            product?.idcategoria ??
            product?.idCategoria ??
            product?.id_categoria ??
            null;
        if (raw === null || raw === undefined) return null;
        const str = String(raw).trim();
        if (!str || str === '0') return null;
        return raw;
    };

    const selectedProductGroupId = extractGroupId(selectedPendingProduct);
    const selectedProductCategoryId = extractCategoryId(selectedPendingProduct);
    const selectedProductGroupLabel =
        selectedProductGroupId &&
        groupOptions.find((g) => String(g.value) === String(selectedProductGroupId))?.label;
    const isMissingGroup = !!selectedPendingProduct && !selectedProductGroupId;

    const updateProductGroupForWeb = async (groupId) => {
        if (!selectedPendingProduct?.num_parte || !groupId) return { ok: true };
        const normalizedDescription = (selectedPendingProduct.descripcion || '').toUpperCase();
        const existingRoutes = parseRoutes(selectedPendingProduct.rutas);
        const rutasPayload = existingRoutes.length ? JSON.stringify(existingRoutes) : undefined;
        const payload = {
            refaccion: selectedPendingProduct.num_parte,
            sucursal: selectedPendingProduct.sucursal || selectedPendingProduct.idsucursal || '',
            localizacion: '0',
            descripcion: normalizedDescription,
            existencia: '0',
            costo: normalizeNumber(detailForm.costo || selectedPendingProduct.costo).toFixed(2),
            precio: normalizeNumber(detailForm.precio || selectedPendingProduct.precio).toFixed(2),
            utilidad: normalizeNumber(selectedPendingProduct.utilidad || 1.3),
            mod_ini: selectedPendingProduct.mod_ini || '',
            mod_fin: selectedPendingProduct.mod_fin || '',
            idmarca: selectedPendingProduct.idmarca || '',
            idgrupo: groupId,
            idcategoria: selectedProductCategoryId || DEFAULT_CATEGORY_ID,
            idsucursal: detailForm.idsucursal || selectedPendingProduct.idsucursal || '',
            rutas: rutasPayload,
        };

        try {
            const response = await fetch(buildApiUrl('/patchProduct'), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*',
                },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const msg = `No se pudo asignar grupo para web (error ${response.status}).`;
                return { ok: false, message: msg };
            }
            return { ok: true };
        } catch (error) {
            console.error('Error actualizando grupo para web:', error);
            return { ok: false, message: t('panel.addRegister.webGroupError') };
        }
    };

    const handleStepChange = (nextStep) => {
        setErrorMessage('');
        setErrorMessages(prev => ({ ...prev, selectedProduct: '' }));
        setActiveStep(nextStep);
    };

    const handleSearchProductPick = (product) => {
        if (!product?.num_parte) return;
        setSelectedPendingPart(product.num_parte);
        setDetailGroupId(extractGroupId(product));
        setActiveStep('detail');
        setDetailForm({
            idsucursal: '',
            localizacion: '',
            existencia: '',
            costo: '',
            precio: '',
            aiva: '',
            utilidad: '',
        });
    };

    const prefillDetailFromExisting = (detail) => {
        if (!detail) return;
        setDetailForm(prev => ({
            ...prev,
            idsucursal: '',
            localizacion: detail.localizacion ? detail.localizacion.toUpperCase() : '',
            existencia: detail.existencia ?? '',
            costo: detail.costo ?? '',
            precio: detail.precio ?? '',
            aiva: detail.aiva ?? '',
            utilidad: detail.utilidad ?? '',
        }));
    };

    const handleProductInputChange = (field, value) => {
        const shouldUppercase = (field === 'descripcion' || field === 'refaccion') && typeof value === 'string';
        const normalizedValue = shouldUppercase ? value.toUpperCase() : value;
        setProductForm((prev) => ({
            ...prev,
            [field]: normalizedValue,
        }));
    };

    const recalculateDetailFinance = (priceValue, utilityValue) => {
        const parsedPrice = parseFloat(priceValue);
        if (Number.isNaN(parsedPrice)) {
            return {};
        }
        const computedAIva = (parsedPrice / IVA_FACTOR).toFixed(2);
        const parsedUtility = parseFloat(utilityValue);
        const computedCost =
            Number.isNaN(parsedUtility) || parsedUtility === 0
                ? ''
                : (parsedPrice / IVA_FACTOR / parsedUtility).toFixed(2);
        return {
            aiva: computedAIva,
            costo: computedCost,
        };
    };

    const handleDetailInputChange = (field, value) => {
        const normalizedValue =
            field === 'localizacion' && typeof value === 'string' ? value.toUpperCase() : value;
        setDetailForm((prev) => {
            const next = { ...prev, [field]: normalizedValue };
            const currentBranch = field === 'idsucursal' ? value : prev.idsucursal;
            const isWebBranch = isWebBranchValue(currentBranch);

            if (isWebBranch) {
                next.localizacion = '0';
                next.existencia = '0';
            }

            if (field === 'precio') {
                if (value === '') {
                    next.aiva = '';
                    next.costo = '';
                    return next;
                }
                const recalculated = recalculateDetailFinance(value, next.utilidad);
                return { ...next, ...recalculated };
            }
            if (field === 'utilidad') {
                if (value === '') {
                    next.costo = '';
                    return next;
                }
                if (next.precio) {
                    const recalculated = recalculateDetailFinance(next.precio, value);
                    return { ...next, ...recalculated };
                }
                return next;
            }
            if (field === 'idsucursal') {
                setErrorMessages(prev => {
                    const clone = { ...prev };
                    const activeProduct = activeProducts.find(
                        product => product.num_parte === selectedPendingPart
                    );
                    const existsInBranch = activeProduct?.detalles?.some(
                        detail => String(detail.idsucursal) === String(value)
                    );
                    if (existsInBranch) {
                        clone.idsucursal = t('panel.addRegister.alreadyActive');
                    } else {
                        delete clone.idsucursal;
                    }
                    if (isWebBranchValue(value)) {
                        delete clone.localizacion;
                        delete clone.existencia;
                    }
                    return clone;
                });
            }
            return next;
        });
    };

    const validateProductForm = () => {
        const patterns = {
            refaccion: /^[A-Z0-9-]+$/,
            descripcion: /^\s*\S+.*$/,
            mod_ini: /^[0-9]{1,4}$/,
            mod_fin: /^[0-9]{1,4}$/,
        };
        const newErrors = {};
        let valid = true;

        Object.entries(patterns).forEach(([field, regex]) => {
            if (!regex.test(productForm[field] || '')) {
                valid = false;
                newErrors[field] = `${field} es inválido.`;
            }
        });

        if (!productForm.idgrupo) {
            valid = false;
            newErrors.idgrupo = t('panel.addRegister.pickGroup');
        }

        if (!productForm.idcategoria) {
            valid = false;
            newErrors.idcategoria = t('panel.addRegister.pickCategory');
        }

        if (!productForm.idmarca) {
            valid = false;
            newErrors.idmarca = t('panel.addRegister.pickBrand');
        }

        if (!productForm.idproveedor) {
            valid = false;
            newErrors.idproveedor = t('panel.addRegister.pickProvider');
        }

        setErrorMessages(newErrors);
        return valid;
    };

    const validateDetailForm = () => {
        const patterns = {
            localizacion: /^[0-9]{2}[A-Z]{1}[0-9A-Z]{2}[-0-9]{2,3}$/,
            existencia: /^[0-9]+$/,
            precio: /^[0-9]+(\.[0-9]+)?$/,
            aiva: /^[0-9]+(\.[0-9]+)?$/,
            costo: /^[0-9]+(\.[0-9]+)?$/,
            utilidad: /^[0-9]+(\.[0-9]+)?$/,
        };

        const newErrors = {};
        let valid = true;

        if (!selectedPendingProduct) {
            valid = false;
            newErrors.selectedProduct = t('panel.addRegister.pickPending');
        }
        const webBranchSelected = isWebBranchValue(detailForm.idsucursal);
        const effectiveGroupId = detailGroupId || selectedProductGroupId;
        if (selectedPendingProduct && webBranchSelected && !effectiveGroupId) {
            valid = false;
            newErrors.selectedProduct =
                t('panel.addRegister.noGroup');
        }

        const isWebBranch = webBranchSelected;
        const normalizedForm = {
            ...detailForm,
            localizacion: detailForm.localizacion ? detailForm.localizacion.toUpperCase() : '',
        };

        if (!detailForm.idsucursal) {
            valid = false;
            newErrors.idsucursal = t('panel.addRegister.pickBranch');
        }

        Object.entries(patterns).forEach(([field, regex]) => {
            if (isWebBranch && (field === 'localizacion' || field === 'existencia')) {
                return;
            }
            if (!regex.test(normalizedForm[field] || '')) {
                valid = false;
                newErrors[field] = `${field} es inválido.`;
            }
        });

        if (!isWebBranch && normalizedForm.localizacion && hasLeadingZeroSuffix(normalizedForm.localizacion)) {
            valid = false;
            newErrors.localizacion =
                t('panel.warehouse.indexZero');
        }

        setErrorMessages(newErrors);
        return valid;
    };

    const checkLocationAvailability = async ({ idsucursal, localizacion, refaccion }) => {
        if (!idsucursal || !localizacion || isWebBranchValue(idsucursal)) {
            return { ok: true };
        }
        try {
            const params = new URLSearchParams({
                localizacion,
                idsucursal,
                num_parte: refaccion,
            });
            const response = await fetch(`${buildApiUrl('/verifyLocation')}?${params.toString()}`, {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' },
            });
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.exists) {
                return { ok: false, message: data.message || t('panel.addRegister.locationTaken') };
            }
            return { ok: true };
        } catch (error) {
            console.error('Error verificando localización:', error);
            return { ok: false, message: t('panel.warehouse.locationCheckError') };
        }
    };

    const handleProductSubmit = async (event) => {
        event.preventDefault();
        setErrorMessages({});
        setSuccessMessage('');
        setErrorMessage('');

        if (!validateProductForm()) {
            setErrorMessage(t('panel.newCapture.fixFields'));
            return;
        }

        const normalizedDescription = (productForm.descripcion || '').toUpperCase();
        const normalizedRoutes = parseRoutes(productForm.rutas);

        const payload = {
            refaccion: productForm.refaccion,
            descripcion: normalizedDescription,
            mod_ini: productForm.mod_ini,
            mod_fin: productForm.mod_fin,
            idgrupo: productForm.idgrupo,
            idcategoria: productForm.idcategoria || DEFAULT_CATEGORY_ID,
            idmarca: productForm.idmarca,
            idproveedor: productForm.idproveedor,
            status: 'E',
            rutas: normalizedRoutes.length ? JSON.stringify(normalizedRoutes) : undefined,
        };

        try {
            const response = await fetch(buildApiUrl('/newProduct'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(t('panel.addRegister.saveError'));
            }

            setSuccessMessage(t('panel.addRegister.savedPending'));
            setProductForm({
                refaccion: '',
                descripcion: '',
                mod_ini: '',
                mod_fin: '',
                idgrupo: '',
                idcategoria: DEFAULT_CATEGORY_ID,
                idmarca: '',
                idproveedor: '',
            });
            fetchPendingProducts();
            findProductsRef.current?.refreshProducts?.();
            onRefreshProducts?.();
        } catch (error) {
            console.error('Error al guardar registro:', error);
            setErrorMessage(t('panel.addRegister.saveRetry'));
        }
    };

    const handleDetailSubmit = async (event) => {
        event.preventDefault();
        setErrorMessages({});
        setSuccessMessage('');
        setErrorMessage('');

        const webBranchSelected = isWebBranchValue(detailForm.idsucursal);
        const effectiveGroupId = detailGroupId || selectedProductGroupId;
        if (webBranchSelected && !effectiveGroupId) {
            setErrorMessages(prev => ({
                ...prev,
                selectedProduct: t('panel.addRegister.noGroupWeb'),
            }));
            setErrorMessage(t('panel.addRegister.pickWebGroup'));
            return;
        }

        if (!validateDetailForm()) {
            setErrorMessage(t('panel.newCapture.fixFields'));
            return;
        }

        if (webBranchSelected && effectiveGroupId && effectiveGroupId !== selectedProductGroupId) {
            const groupResult = await updateProductGroupForWeb(effectiveGroupId);
            if (!groupResult.ok) {
                setErrorMessage(groupResult.message);
                return;
            }
        }

        const isWebBranch = isWebBranchValue(detailForm.idsucursal);
        const normalizedLocalizacion = detailForm.localizacion ? detailForm.localizacion.toUpperCase() : '';

        const locationValidation = await checkLocationAvailability({
            idsucursal: detailForm.idsucursal,
            localizacion: normalizedLocalizacion,
            refaccion: selectedPendingProduct?.num_parte,
        });

        if (!isWebBranch && !locationValidation.ok) {
            setErrorMessages(prev => ({ ...prev, localizacion: locationValidation.message }));
            setErrorMessage(locationValidation.message);
            return;
        }
        const payload = {
            refaccion: selectedPendingProduct.num_parte,
            idsucursal: detailForm.idsucursal,
            localizacion: isWebBranch ? '0' : normalizedLocalizacion,
            existencia: isWebBranch ? '0' : detailForm.existencia,
            costo: detailForm.costo,
            precio: detailForm.precio,
            aiva: detailForm.aiva,
            utilidad: detailForm.utilidad,
            status: 'A',
        };

        try {
            const response = await fetch(buildApiUrl('/newProductDetail'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(t('panel.addRegister.detailError'));
            }

            setSuccessMessage(t('panel.addRegister.detailOk'));
            setDetailForm({
                idsucursal: '',
                localizacion: '',
                existencia: '',
                costo: '',
                precio: '',
                aiva: '',
                utilidad: '',
            });
            setSelectedPendingPart(null);
            fetchPendingProducts();
            findProductsRef.current?.refreshProducts?.();
            onRefreshProducts?.();
        } catch (error) {
            console.error('Error al asignar detalle:', error);
            setErrorMessage(t('panel.addRegister.detailRetry'));
        }
    };

    const fetchPendingProducts = async () => {
        setPendingLoading(true);
        try {
            const response = await fetch(buildApiUrl('/getWarehouseProducts'), {
                cache: 'no-store',
                headers: { Accept: 'application/json, text/plain, */*' },
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const formattedExisting = (data?.[0] || []).map(product => ({
                ...product,
                rutas: parseRoutes(product.rutas),
            }));
            const activeGrouped = {};
            (data?.[1] || []).forEach(product => {
                const key = product.num_parte;
                if (!activeGrouped[key]) {
                    activeGrouped[key] = {
                        ...product,
                        rutas: parseRoutes(product.rutas),
                        detalles: []
                    };
                }
                activeGrouped[key].detalles.push({
                    idsucursal: product.idsucursal,
                    sucursal: product.sucursal,
                    localizacion: product.localizacion,
                    existencia: product.existencia,
                    costo: product.costo,
                    precio: product.precio,
                    aiva: product.aiva,
                    utilidad: product.utilidad
                });
            });

            setPendingProducts(formattedExisting);
            setActiveProducts(Object.values(activeGrouped));
            setGroupOptions((prev) => {
                if (prev.length) {
                    return prev;
                }
                const fallback = extractGroupOptionsFromProducts(formattedExisting);
                return fallback.length ? fallback : prev;
            });
        } catch (error) {
            console.error('Error al obtener productos pendientes:', error);
        } finally {
            setPendingLoading(false);
        }
    };

    useEffect(() => {
        const fetchGroupOptions = async () => {
            try {
                const response = await fetch(buildApiUrl('/getGroups'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (response.status === 404) {
                    console.warn('Endpoint /getGroups no disponible. Se usarán datos locales si es posible.');
                    return;
                }

                if (!response.ok) {
                    console.warn(`No se pudieron obtener grupos (${response.status}).`);
                    return;
                }

                const payload = await response.json();
                const normalizedPayload = Array.isArray(payload) ? payload : [];
                const options = normalizedPayload.map(group => ({
                    value: group.idgrupo,
                    label: group.grupo,
                }));
                if (options.length) {
                    setGroupOptions(options);
                }
            } catch (error) {
                console.warn('Error al obtener grupos. Se intentará usar datos locales.', error);
            }
        };

        const fetchCategoryOptions = async () => {
            try {
                const response = await fetch(buildApiUrl('/getCategory'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const normalizedPayload = Array.isArray(payload) ? payload : [];
                const options = normalizedPayload.map((category) => ({
                    value: category.idcategoria ?? category.idCategoria ?? category.id_categoria,
                    label: category.categoria || category.nombre || category.descripcion || `Categoria ${category.idcategoria}`,
                })).filter((option) => option.value !== undefined && option.value !== null);
                setCategoryOptions(options);
            } catch (error) {
                console.error('Error al obtener categorias:', error);
            }
        };

        const fetchBrandOptions = async () => {
            try {
                const response = await fetch(buildApiUrl('/getBrands'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const options = payload.map((brand) => ({
                    value: brand.idmarca,
                    label: brand.marca,
                }));
                setBrandOptions(options);
            } catch (error) {
                console.error('Error al obtener marcas:', error);
            }
        };

        const fetchProviderOptions = async () => {
            try {
                const response = await fetch(buildApiUrl('/getProviders'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const options = payload.map((provider) => ({
                    value: provider.idproveedor,
                    label: provider.empresa,
                }));
                setProviderOptions(options);
            } catch (error) {
                console.error('Error al obtener proveedores:', error);
            }
        };

        const fetchQuantityOptions = async () => {
            try {
                const response = await fetch(buildApiUrl('/getQuantity'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const options = payload.map((quantity) => ({
                    value: quantity.idCantidad,
                    label: quantity.cantidad,
                }));
                setQuantityOptions(options);
            } catch (error) {
                console.error('Error al obtener cantidades:', error);
            }
        };

        const fetchSucursalOptions = async () => {
            try {
                const response = await fetch(buildApiUrl('/getSucursal'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const payload = await response.json();
                const options = payload.map((sucursal) => ({
                    value: sucursal.idsucursal,
                    label: sucursal.sucursal,
                    address: sucursal.direccion || '',
                    phone1: sucursal.telefono_uno || '',
                    phone2: sucursal.telefono_dos || '',
                    whatsapp1: sucursal.whats_uno || '',
                    whatsapp2: sucursal.whats_dos || '',
                }));
                setSucursalOptions(options.filter((option) => !isWebBranchOption(option)));
            } catch (error) {
                console.error('Error al obtener sucursales:', error);
            }
        };

        fetchGroupOptions();
        fetchCategoryOptions();
        fetchBrandOptions();
        fetchProviderOptions();
        fetchQuantityOptions();
        fetchSucursalOptions();
        fetchPendingProducts();
    }, []);

    useEffect(() => {
        if (!sucursalOptions.length || ticketBranchId) return;
        const userBranchId = userData?.idsucursal ?? userData?.idSucursal ?? '';
        if (!userBranchId) return;
        const match = sucursalOptions.find(
            (option) => String(option.value) === String(userBranchId)
        );
        if (match) {
            setTicketBranchId(String(match.value));
        }
    }, [sucursalOptions, ticketBranchId, userData]);

    useEffect(() => {
        if (!ticketBranchId) {
            setTicketPhonePrimary('');
            setTicketPhoneSecondary('');
            setTicketWhatsappPrimary('');
            setTicketWhatsappSecondary('');
            setTicketAddress('');
            return;
        }

        const selected = sucursalOptions.find(
            (option) => String(option.value) === String(ticketBranchId)
        );
        if (!selected) return;
        setTicketPhonePrimary(formatPhoneInput(selected.phone1 || ''));
        setTicketPhoneSecondary(formatPhoneInput(selected.phone2 || ''));
        setTicketWhatsappPrimary(formatPhoneInput(selected.whatsapp1 || ''));
        setTicketWhatsappSecondary(formatPhoneInput(selected.whatsapp2 || ''));
        setTicketAddress(selected.address || '');
    }, [ticketBranchId, sucursalOptions]);

    const existingProductOptions = pendingProducts.map((product) => ({
        value: product.num_parte,
        label: `${product.num_parte} | ${product.descripcion}`,
        status: 'E'
    }));

    const activeProductOptions = activeProducts.map((product) => ({
        value: product.num_parte,
        label: `${product.num_parte} | ${product.descripcion}`,
        status: 'A'
    }));

    const selectedActiveProduct = activeProducts.find(product => product.num_parte === selectedPendingPart);

    useEffect(() => {
        if (!selectedPendingPart) {
            setDetailForm(prev => ({
                ...prev,
                idsucursal: '',
                costo: '',
                precio: '',
                aiva: '',
                utilidad: ''
            }));
            return;
        }

        if (selectedActiveProduct?.detalles?.length) {
            const detail = selectedActiveProduct.detalles[0];
            setDetailForm(prev => ({
                ...prev,
                idsucursal: '',
                costo: detail.costo ?? '',
                precio: detail.precio ?? '',
                aiva: detail.aiva ?? '',
                utilidad: detail.utilidad ?? ''
            }));
        } else {
            setDetailForm(prev => ({
                ...prev,
                idsucursal: '',
                costo: '',
                precio: '',
                aiva: '',
                utilidad: ''
            }));
        }
    }, [selectedPendingPart, selectedActiveProduct]);

    const renderProductForm = () => {
        const groupSelectOptions = groupOptions.filter(
            (option) => option.label && option.label.toLowerCase() !== 'not assigned'
        );
        const categorySelectOptions = categoryOptions.length
            ? categoryOptions
            : [{ value: DEFAULT_CATEGORY_ID, label: t('panel.addRegister.category1') }];
        const brandSelectOptions = withDefaultOption(brandOptions, t);
        const providerSelectOptions = providerOptions.slice(2);
        const yearOptions = withDefaultOption(
            Array.from({ length: 36 }, (_, i) => {
                const year = 1990 + i;
                return { value: year, label: `${year}` };
            }),
            t
        );

        return (
        <form onSubmit={handleProductSubmit}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
                <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                        {t('panel.capture.part')}
                    </label>
                    <input
                        type="text"
                        value={productForm.refaccion}
                        onChange={(e) => handleProductInputChange('refaccion', e.target.value)}
                        className="block w-full rounded-xl border-0 py-2 px-3 text-[rgb(var(--color-text))] bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))] focus:ring-2 focus:ring-indigo-500 uppercase"
                    />
                    {errorMessages.refaccion && (
                        <span className="text-red-600 text-sm">{errorMessages.refaccion}</span>
                    )}
                </div>

                <div className="col-span-full">
                    <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                        {t('panel.capture.descriptionLabel')}
                    </label>
                    <textarea
                        value={productForm.descripcion}
                        onChange={(e) => handleProductInputChange('descripcion', e.target.value)}
                        className="block w-full rounded-xl border-0 py-2 px-3 text-[rgb(var(--color-text))] bg-[rgb(var(--color-card))] shadow shadow-[rgb(var(--color-galaxy))] focus:ring-2 focus:ring-indigo-500 uppercase"
                    />
                    {errorMessages.descripcion && (
                        <span className="text-red-600 text-sm">{errorMessages.descripcion}</span>
                    )}
                </div>

                <div className="sm:col-span-3">
                    <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                        {t('products.group')}
                    </label>
                    <Select
                        options={groupSelectOptions}
                        value={
                            groupSelectOptions.find((option) => option.value === productForm.idgrupo) || null
                        }
                        onChange={(selectedOption) =>
                            handleProductInputChange('idgrupo', selectedOption ? selectedOption.value : '')
                        }
                        placeholder={t('panel.addRegister.pickGroupPlaceholder')}
                        classNamePrefix="react-select"
                    />
                    {errorMessages.idgrupo && (
                        <span className="text-red-600 text-sm">{errorMessages.idgrupo}</span>
                    )}
                </div>

                <div className="sm:col-span-3">
                    <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                        {t('panel.addRegister.category')}
                    </label>
                    <Select
                        options={categorySelectOptions}
                        value={
                            categorySelectOptions.find(
                                (option) => String(option.value) === String(productForm.idcategoria)
                            ) || null
                        }
                        onChange={(selectedOption) =>
                            handleProductInputChange('idcategoria', selectedOption ? selectedOption.value : '')
                        }
                        placeholder={t('panel.addRegister.pickCategoryPlaceholder')}
                        classNamePrefix="react-select"
                    />
                    {errorMessages.idcategoria && (
                        <span className="text-red-600 text-sm">{errorMessages.idcategoria}</span>
                    )}
                </div>

                <div className="sm:col-span-3">
                    <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                        {t('panel.capture.provider')}
                    </label>
                    <Select
                        options={providerSelectOptions}
                        value={
                            providerSelectOptions.find((option) => option.value === productForm.idproveedor) || null
                        }
                        onChange={(selectedOption) =>
                            handleProductInputChange('idproveedor', selectedOption ? selectedOption.value : '')
                        }
                        placeholder={t('panel.newCapture.selectProvider')}
                        classNamePrefix="react-select"
                    />
                    {errorMessages.idproveedor && (
                        <span className="text-red-600 text-sm">{errorMessages.idproveedor}</span>
                    )}
                </div>

                <div className="sm:col-span-3">
                    <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                        {t('panel.addRegister.modelFrom')}
                    </label>
                    <Select
                        options={yearOptions}
                        value={getSelectValue(yearOptions, productForm.mod_ini, t)}
                        onChange={(selectedOption) =>
                            handleProductInputChange('mod_ini', selectedOption ? selectedOption.value : '')
                        }
                        isOptionDisabled={(option) => option.isDisabled}
                        classNamePrefix="react-select"
                    />
                    {errorMessages.mod_ini && (
                        <span className="text-red-600 text-sm">{errorMessages.mod_ini}</span>
                    )}
                </div>

                <div className="sm:col-span-3">
                    <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                        {t('panel.addRegister.modelTo')}
                    </label>
                    <Select
                        options={yearOptions}
                        value={getSelectValue(yearOptions, productForm.mod_fin, t)}
                        onChange={(selectedOption) =>
                            handleProductInputChange('mod_fin', selectedOption ? selectedOption.value : '')
                        }
                        isOptionDisabled={(option) => option.isDisabled}
                        classNamePrefix="react-select"
                    />
                    {errorMessages.mod_fin && (
                        <span className="text-red-600 text-sm">{errorMessages.mod_fin}</span>
                    )}
                </div>

                <div className="sm:col-span-3">
                    <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                        {t('panel.addRegister.carBrand')}
                    </label>
                    <Select
                        options={brandSelectOptions}
                        value={getSelectValue(brandSelectOptions, productForm.idmarca, t)}
                        onChange={(selectedOption) =>
                            handleProductInputChange('idmarca', selectedOption ? selectedOption.value : '')
                        }
                        isOptionDisabled={(option) => option.isDisabled}
                        classNamePrefix="react-select"
                    />
                    {errorMessages.idmarca && (
                        <span className="text-red-600 text-sm">{errorMessages.idmarca}</span>
                    )}
                </div>
            </div>

            <div className="mt-6 flex justify-end gap-4">
                <button
                    type="button"
                    onClick={onCancelEdit}
                    className="px-4 py-2 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                    {t('panel.common.cancel')}
                </button>
                <button
                    type="submit"
                    className="px-4 py-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
                >
                    {t('panel.addRegister.saveProduct')}
                </button>
            </div>
        </form>
    );
    };

    const renderDetailForm = () => {
        const baseSucursalOptions = withDefaultOption(sucursalOptions, t);
        const quantitySelectOptions = withDefaultOption(quantityOptions, t);
        const utilitySelectOptions = withDefaultOption([
            { value: 1.25, label: '25%' },
            { value: 1.3, label: '30%' },
            { value: 1.35, label: '35%' },
        ], t);

        const activeBranchIds = new Set(
            selectedActiveProduct?.detalles?.map(detail => String(detail.idsucursal)) || []
        );
        const availablePhysicalOptions = sucursalOptions.filter(
            option => !activeBranchIds.has(String(option.value))
        );
        const hasWebAssignment = Array.from(activeBranchIds).some((id) => isWebBranchValue(id));
        const allPhysicalAssigned =
            sucursalOptions.length > 0 &&
            sucursalOptions.every(option => activeBranchIds.has(String(option.value)));
        const canAssignWebOnly = selectedActiveProduct && allPhysicalAssigned && !hasWebAssignment;
        const webOption = { value: 1, label: 'WEB' };
        const displayedSucursalOptions = selectedActiveProduct
            ? withDefaultOption(
                canAssignWebOnly ? [...availablePhysicalOptions, webOption] : availablePhysicalOptions,
                t
            )
            : baseSucursalOptions;
        const noAvailableSucursal =
            selectedActiveProduct && displayedSucursalOptions.length <= 1 && !canAssignWebOnly;
        const webBranchSelected = isWebBranchValue(detailForm.idsucursal);
        const effectiveGroupId = detailGroupId || selectedProductGroupId;
        const disableDetail = webBranchSelected && !effectiveGroupId;

        return (
        <form onSubmit={handleDetailSubmit}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] md:px-5 lg:px-0">
                <div className="rounded-3xl bg-[rgb(var(--color-card))] shadow-lg border border-[rgb(var(--color-border))]">
                    <FindProducts
                        ref={findProductsRef}
                        onAddProduct={handleSearchProductPick}
                        onRemoveProduct={() => {}}
                        addedItems={[]}
                        isWarehouse={false}
                        includePendingProducts
                        includeWebBranch
                        showAllBranches
                        onProductPick={handleSearchProductPick}
                        selectedProducts={selectedPendingPart ? [selectedPendingPart] : []}
                    />
                </div>
                <div className="grid grid-cols-1 gap-x-2 gap-y-8 sm:grid-cols-6">
                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                            {t('panel.addRegister.selectedProduct')}
                        </label>
                        {selectedPendingProduct ? (
                            <div className="mt-2 p-3 rounded-xl bg-[rgb(var(--color-bg))] text-xs text-[rgb(var(--color-text))] shadow-inner space-y-2">
                                <div>
                                    <p><span className="font-semibold">{t('panel.addRegister.descriptionField')}</span> {selectedPendingProduct.descripcion}</p>
                                    <p><span className="font-semibold">{t('panel.addRegister.modelsField')}</span> {selectedPendingProduct.mod_ini} - {selectedPendingProduct.mod_fin}</p>
                                    <p>
                                        <span className="font-semibold">{t('panel.addRegister.groupField')}</span>{' '}
                                        {selectedProductGroupLabel || t('panel.addRegister.assignBeforeWeb')}
                                    </p>
                                    {webBranchSelected && isMissingGroup && (
                                        <p className="text-[rgb(var(--color-error))] font-semibold">
                                            {t('panel.addRegister.noGroupShort')}
                                        </p>
                                    )}
                                </div>
                            {selectedActiveProduct?.detalles?.length > 0 && (
                                <div className="space-y-1">
                                    <p className="font-semibold text-emerald-500">{t('panel.addRegister.existingAssignments')}</p>
                                    {selectedActiveProduct.detalles.map((detail, idx) => (
                                        <button
                                            type="button"
                                            key={`${selectedActiveProduct.num_parte}-${detail.idsucursal}-${idx}`}
                                            onClick={() => prefillDetailFromExisting(detail)}
                                            className="flex flex-col rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-left hover:border-emerald-400 hover:shadow transition"
                                        >
                                            <span className="text-gray-500">
                                                <span className="font-semibold">{t('panel.addRegister.branchField')}</span> {detail.sucursal || detail.idsucursal}
                                            </span>
                                            <span className="text-gray-500">
                                                <span className="font-semibold">{t('panel.addRegister.locationField')}</span> {detail.localizacion || '—'}
                                            </span>
                                            <span className="text-gray-500">
                                                <span className="font-semibold">{t('panel.addRegister.stockField')}</span> {detail.existencia ?? '—'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            </div>
                        ) : (
                            <div className="mt-2 p-3 rounded-xl bg-amber-50 text-amber-700 text-sm border border-amber-200">
                                {t('panel.addRegister.noPartSelected')}
                            </div>
                        )}
                        {errorMessages.selectedProduct && (
                            <span className="text-red-600 text-sm">{errorMessages.selectedProduct}</span>
                        )}
                    </div>

                    <div className="sm:col-span-3">
                        <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                            {t('panel.addRegister.branchToAssign')}
                        </label>
                        {noAvailableSucursal ? (
                            <div className="mt-2 p-3 rounded-xl bg-amber-50 text-amber-700 text-sm border border-amber-200">
                                {t('panel.addRegister.allBranchesAssigned')}
                            </div>
                        ) : (
                            <>
                                <Select
                                    options={displayedSucursalOptions}
                                    value={getSelectValue(displayedSucursalOptions, detailForm.idsucursal, t)}
                                    onChange={(selectedOption) =>
                                        handleDetailInputChange('idsucursal', selectedOption ? selectedOption.value : '')
                                    }
                                    isOptionDisabled={(option) => option.isDisabled}
                                    isDisabled={disableDetail}
                                    classNamePrefix="react-select"
                                />
                                {errorMessages.idsucursal && (
                                    <span className="text-red-600 text-sm">{errorMessages.idsucursal}</span>
                                )}
                            </>
                        )}
                    </div>

                    {webBranchSelected && (
                        <div className="sm:col-span-3">
                            <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                                {t('panel.addRegister.webGroup')}
                            </label>
                            <Select
                                options={groupOptions}
                                value={
                                    groupOptions.find(
                                        (option) =>
                                            String(option.value) ===
                                            String(detailGroupId || selectedProductGroupId || '')
                                    ) || null
                                }
                                onChange={(selectedOption) => setDetailGroupId(selectedOption?.value || null)}
                                classNamePrefix="react-select"
                                placeholder={t('panel.addRegister.pickGroupPlaceholder')}
                            />
                            {disableDetail && (
                                <span className="text-red-600 text-sm">
                                    {t('panel.addRegister.assignGroupWeb')}
                                </span>
                            )}
                        </div>
                    )}

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                            {t('panel.tableDesc.locationTitle')}
                        </label>
                        <input
                            type="text"
                            value={detailForm.localizacion}
                            onChange={(e) => handleDetailInputChange('localizacion', e.target.value)}
                            disabled={webBranchSelected || disableDetail}
                            className={`block w-full rounded-xl border-0 py-2 px-3 text-[rgb(var(--color-text))] shadow focus:ring-2 focus:ring-indigo-500 uppercase ${
                                webBranchSelected || disableDetail
                                    ? 'bg-gray-100 cursor-not-allowed'
                                    : 'bg-[rgb(var(--color-card))]'
                            }`}
                        />
                        {errorMessages.localizacion && (
                            <span className="text-red-600 text-sm">{errorMessages.localizacion}</span>
                        )}
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                            {t('panel.tableDesc.stockTitle')}
                        </label>
                        {webBranchSelected ? (
                            <input
                                type="text"
                                value="0"
                                disabled
                                className="block w-full rounded-xl border-0 py-2 px-3 text-[rgb(var(--color-text))] bg-gray-100 shadow cursor-not-allowed"
                            />
                        ) : (
                            <Select
                                options={quantitySelectOptions}
                                value={getSelectValue(quantitySelectOptions, detailForm.existencia, t)}
                                onChange={(selectedOption) =>
                                    handleDetailInputChange('existencia', selectedOption ? selectedOption.value : '')
                                }
                                isOptionDisabled={(option) => option.isDisabled}
                                isDisabled={disableDetail}
                                classNamePrefix="react-select"
                            />
                        )}
                        {errorMessages.existencia && (
                            <span className="text-red-600 text-sm">{errorMessages.existencia}</span>
                        )}
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                            {t('panel.addRegister.utility')}
                        </label>
                        <Select
                            options={utilitySelectOptions}
                            value={getSelectValue(utilitySelectOptions, detailForm.utilidad, t)}
                            onChange={(selectedOption) =>
                                handleDetailInputChange('utilidad', selectedOption ? selectedOption.value : '')
                            }
                            isOptionDisabled={(option) => option.isDisabled}
                            isDisabled={disableDetail}
                            classNamePrefix="react-select"
                        />
                        {errorMessages.utilidad && (
                            <span className="text-red-600 text-sm">{errorMessages.utilidad}</span>
                        )}
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-500">
                            {t('panel.capture.cost')}
                        </label>
                        <input
                            type="text"
                            value={detailForm.costo}
                            readOnly
                            className="block w-full rounded-xl border-0 py-2 px-3 text-gray-500 bg-gray-100 shadow focus:ring-2 focus:ring-indigo-500 uppercase cursor-not-allowed"
                        />
                        {errorMessages.costo && (
                            <span className="text-red-600 text-sm">{errorMessages.costo}</span>
                        )}
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-500">
                            {t('panel.addRegister.aiva')}
                        </label>
                        <input
                            type="text"
                            value={detailForm.aiva}
                            readOnly
                            className="block w-full rounded-xl border-0 py-2 px-3 text-gray-500 bg-gray-100 shadow focus:ring-2 focus:ring-indigo-500 uppercase cursor-not-allowed"
                        />
                        {errorMessages.aiva && (
                            <span className="text-red-600 text-sm">{errorMessages.aiva}</span>
                        )}
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-[rgb(var(--color-text))]">
                            {t('panel.invoice.price')}
                        </label>
                        <input
                            type="text"
                            value={detailForm.precio}
                            onChange={(e) => handleDetailInputChange('precio', e.target.value)}
                            disabled={disableDetail}
                            className="block w-full rounded-xl border-0 py-2 px-3 text-[rgb(var(--color-text))] bg-[rgb(var(--color-card))] shadow focus:ring-2 focus:ring-indigo-500 uppercase disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        {errorMessages.precio && (
                            <span className="text-red-600 text-sm">{errorMessages.precio}</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-6 flex justify-end gap-4">
                <button
                    type="button"
                    onClick={onCancelEdit}
                    className="px-4 py-2 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                    {t('panel.common.cancel')}
                </button>
                <button
                    type="submit"
                    disabled={disableDetail}
                    className={`px-4 py-2 rounded-full text-white ${
                        disableDetail
                            ? 'bg-indigo-300 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                >
                    {t('panel.addRegister.saveDetail')}
                </button>
            </div>
        </form>
    );
    };

    const renderTicketConfigurator = () => {
        const previewItems = [
            { cantidad: 2, refaccion: '0111', descripcion: t('panel.addRegister.sampleItemOne'), aIva: 120, monto: 240 },
            { cantidad: 1, refaccion: '0112', descripcion: t('panel.addRegister.sampleItemTwo'), aIva: 80, monto: 80 },
        ];
        const previewDate = new Date().toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const previewNotes = t('panel.addRegister.sampleNote');
        const selectedBranch = sucursalOptions.find(
            (option) => String(option.value) === String(ticketBranchId)
        );

        const handleTicketSave = async () => {
            if (!ticketBranchId) {
                setTicketSaveError(t('panel.addRegister.pickBranchSave'));
                return;
            }

            setTicketSaving(true);
            setTicketSaveMessage('');
            setTicketSaveError('');

            const payload = {
                idsucursal: ticketBranchId,
                telefono_uno: ticketPhonePrimary,
                telefono_dos: ticketPhoneSecondary,
                whats_uno: ticketWhatsappPrimary,
                whats_dos: ticketWhatsappSecondary,
                direccion: ticketAddress,
            };

            try {
                const response = await fetch(buildApiUrl('/patchSucursal'), {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json, text/plain, */*',
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || errorData.error || t('panel.addRegister.branchUpdateError'));
                }

                setSucursalOptions((prev) =>
                    prev.map((option) =>
                        String(option.value) === String(ticketBranchId)
                            ? {
                                  ...option,
                                  phone1: ticketPhonePrimary,
                                  phone2: ticketPhoneSecondary,
                                  whatsapp1: ticketWhatsappPrimary,
                                  whatsapp2: ticketWhatsappSecondary,
                                  address: ticketAddress,
                              }
                            : option
                    )
                );

                setTicketPreviewKey((prev) => prev + 1);
                setTicketSaveMessage(t('panel.addRegister.branchUpdateOk'));
            } catch (error) {
                setTicketSaveError(error.message || t('panel.addRegister.branchUpdateError'));
            } finally {
                setTicketSaving(false);
            }
        };

        return (
            <div className="flex flex-col space-y-6 max-w-7xl mx-auto p-4">
                <div className="rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6 shadow-lg">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-2xl font-semibold text-[rgb(var(--color-text))]">
                                {t('panel.addRegister.ticketsTitle')}
                            </p>
                            <p className="text-sm text-[rgb(var(--color-text))]/70 mt-1">
                                {t('panel.addRegister.ticketsSubtitle')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowTicketPreview(false)}
                            className="inline-flex items-center justify-center rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-text))] shadow hover:bg-[rgb(var(--color-amber))]/20 transition"
                        >
                            {t('panel.addRegister.backToForm')}
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                    <div className="order-1 rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]/70 p-6 shadow-md lg:flex-[1.2]">
                        <p className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--color-text))]/70">
                            {t('panel.addRegister.ticketData')}
                        </p>
                        <div className="mt-4 space-y-3 text-sm text-[rgb(var(--color-text))]">
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-text))]/70">
                                    {t('panel.common.branch')}
                                </label>
                                <select
                                    value={ticketBranchId}
                                    onChange={(e) => setTicketBranchId(e.target.value)}
                                    className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-sm"
                                >
                                    <option value="">{t('panel.common.pickBranch')}</option>
                                    {sucursalOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                                </select>
                            </div>
                            {selectedBranch && (
                                <p className="text-xs text-[rgb(var(--color-text))]/70">
                                    Editando datos para: <span className="font-semibold">{selectedBranch.label}</span>
                                </p>
                            )}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-text))]/70">
                                        {t('panel.addRegister.phone1')}
                                    </label>
                                    <input
                                        type="text"
                                        value={ticketPhonePrimary}
                                        onChange={(e) => setTicketPhonePrimary(formatPhoneInput(e.target.value))}
                                        placeholder="55 0000 0000"
                                        className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-text))]/70">
                                        {t('panel.addRegister.phone2')}
                                    </label>
                                    <input
                                        type="text"
                                        value={ticketPhoneSecondary}
                                        onChange={(e) => setTicketPhoneSecondary(formatPhoneInput(e.target.value))}
                                        placeholder="55 0000 0000"
                                        className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-text))]/70">
                                        {t('panel.addRegister.whatsapp1')}
                                    </label>
                                    <input
                                        type="text"
                                        value={ticketWhatsappPrimary}
                                        onChange={(e) => setTicketWhatsappPrimary(formatPhoneInput(e.target.value))}
                                        placeholder="55 0000 0000"
                                        className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-text))]/70">
                                        {t('panel.addRegister.whatsapp2')}
                                    </label>
                                    <input
                                        type="text"
                                        value={ticketWhatsappSecondary}
                                        onChange={(e) => setTicketWhatsappSecondary(formatPhoneInput(e.target.value))}
                                        placeholder="55 0000 0000"
                                        className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-text))]/70">
                                    {t('panel.providers.address')}
                                </label>
                                <textarea
                                    rows={3}
                                    value={ticketAddress}
                                    onChange={(e) => setTicketAddress(e.target.value)}
                                    placeholder={t('panel.addRegister.addressPlaceholder')}
                                    className="mt-1 w-full rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-sm"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleTicketSave}
                                    disabled={ticketSaving || !ticketBranchId}
                                    className="inline-flex items-center justify-center rounded-full bg-[rgb(var(--color-galaxy))] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[rgb(var(--color-galaxy))]/80 transition disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {ticketSaving ? t('panel.providers.saving') : t('panel.providers.save')}
                                </button>
                                {ticketSaveMessage && (
                                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                                        {ticketSaveMessage}
                                    </span>
                                )}
                                {ticketSaveError && (
                                    <span className="text-xs font-semibold text-red-700 bg-red-50 px-3 py-1 rounded-full">
                                        {ticketSaveError}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="order-2 flex justify-center lg:flex-1">
                        <div className="rounded-2xl bg-white p-3 shadow-lg">
                            <ComponentToPrint
                                items={previewItems}
                                subtotal={320}
                                discount={0}
                                total={320}
                                currentDate={previewDate}
                                employee={t('panel.addRegister.previewEmployee')}
                                folio={t('panel.addRegister.previewFolio')}
                                notes={previewNotes}
                                useDefaults={false}
                                branchId={ticketBranchId}
                                refreshKey={ticketPreviewKey}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (showTicketPreview) {
        return renderTicketConfigurator();
    }

    return (
        <div className="flex flex-col space-y-6 max-w-7xl mx-auto p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-3xl bg-[rgb(var(--color-card))] shadow-lg p-6 border border-[rgb(var(--color-border))]">
                    <p className="text-sm text-[rgb(var(--color-text))] uppercase tracking-widest">
                        {t('panel.addRegister.title')}
                    </p>
                    <h2 className="text-2xl font-semibold text-[rgb(var(--color-text))] mt-2">
                        {t('panel.addRegister.subtitle')}
                    </h2>
                    <p className="text-sm text-[rgb(var(--color-text))]/70 mt-2">
                        {t('panel.addRegister.hint')}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-4">
                        <button
                            type="button"
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${
                                activeStep === 'product'
                                    ? 'bg-[rgb(var(--color-galaxy))] text-white shadow-lg'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                            onClick={() => setActiveStep('product')}
                        >
                            <MdAddCircle className="text-lg" />
                            {t('panel.addRegister.step1')}
                        </button>
                        <button
                            type="button"
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${
                                activeStep === 'detail'
                                    ? 'bg-[rgb(var(--color-galaxy))] text-white shadow-lg'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                            onClick={() => handleStepChange('detail')}
                        >
                            <MdAssignmentAdd className="text-lg" />
                            {t('panel.addRegister.step2')}
                        </button>
                    </div>
                </div>

                <div className="relative rounded-3xl overflow-hidden shadow-lg bg-gradient-to-br from-[rgb(var(--color-galaxy))] via-[rgb(var(--color-bg))] to-[rgb(var(--color-card))] text-[rgb(var(--color-text))] p-6">
                    <div className="relative space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-lg font-semibold">{t('panel.addRegister.statusTitle')}</p>
                            <button
                                type="button"
                                onClick={() => setShowTicketPreview(true)}
                                className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-1 text-xs font-semibold text-[rgb(var(--color-text))] shadow hover:bg-[rgb(var(--color-amber))]/20 transition"
                            >
                                <IoTicket className="text-[rgb(var(--color-amber))]" />
                                {t('panel.addRegister.ticketsTitle')}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="border rounded-2xl p-4 bg-amber-50 text-amber-700 shadow-inner">
                        <p className="text-xs uppercase tracking-wide">{t('panel.addRegister.existing')}</p>
                        <p className="text-3xl font-bold">{pendingProducts.length}</p>
                                <p className="text-xs">{t('panel.addRegister.pendingAssign')}</p>
                            </div>
                            <div className="border rounded-2xl p-4 bg-emerald-50 text-emerald-700 shadow-inner">
                                <p className="text-xs uppercase tracking-wide">{t('panel.addRegister.activeProducts')}</p>
                                <p className="text-3xl font-bold">{activeProducts.length}</p>
                                <p className="text-xs">{t('panel.addRegister.withDetail')}</p>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                                <p className="font-semibold text-amber-600 mb-1">{t('panel.addRegister.existingShort')}</p>
                                <div className="space-y-1 max-h-28 overflow-y-auto pr-2">
                                    {pendingProducts.slice(0, 6).map((product) => (
                                        <div key={`pending-${product.num_parte}`} className="flex items-center gap-2 bg-[rgb(var(--color-card))/80] rounded-lg px-2 py-1 border border-amber-200">
                                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                                            <span className="truncate">{product.num_parte} - {product.descripcion}</span>
                                        </div>
                                    ))}
                                    {pendingProducts.length === 0 && <p className="text-[rgb(var(--color-text))]/70">{t('panel.addRegister.noPending')}</p>}
                                </div>
                            </div>
                            <div>
                                <p className="font-semibold text-emerald-600 mb-1">{t('panel.addRegister.activeShort')}</p>
                                <div className="space-y-1 max-h-28 overflow-y-auto pr-2">
                                    {activeProducts.slice(0, 6).map((product) => (
                                        <div key={`active-${product.num_parte}`} className="flex items-center gap-2 bg-[rgb(var(--color-card))/80] rounded-lg px-2 py-1 border border-emerald-200">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span className="truncate">{product.num_parte} - {product.descripcion}</span>
                                        </div>
                                    ))}
                                    {activeProducts.length === 0 && <p className="text-[rgb(var(--color-text))]/70">{t('panel.addRegister.noActive')}</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {successMessage && (
                <div className="text-green-600 text-sm font-semibold">{successMessage}</div>
            )}
            {errorMessage && (
                <div className="text-red-600 text-sm font-semibold">{errorMessage}</div>
            )}

            <div className="rounded-3xl bg-[rgb(var(--color-card))] shadow-lg border border-[rgb(var(--color-border))] p-6">
                {activeStep === 'product' ? renderProductForm() : renderDetailForm()}
            </div>
        </div>
    );
}
