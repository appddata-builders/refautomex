import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Title from '../title';
import ProfilePermissions from './profile-permissions';
import { FaStar } from 'react-icons/fa';
import { FaUsersViewfinder } from 'react-icons/fa6';
import { BiSolidUserCircle } from 'react-icons/bi';
import { BsStars } from 'react-icons/bs';
import {
    FiCalendar,
    FiChevronDown,
    FiDatabase,
    FiMail,
    FiMapPin,
    FiPhone,
    FiSearch,
    FiSun,
    FiTag,
    FiUser,
    FiUserCheck,
    FiUserX,
    FiUsers,
} from 'react-icons/fi';
import { buildApiUrl } from '@/app/lib/refautomex-api';
import { getStorageValue, setStorageValue } from '@/app/lib/storage-values';
import { AuthContext } from '@/app/lib/auth-tracker';
import { obtenerIdToken } from '@/app/lib/respaldo-diario';
import { useTranslation } from '@/app/lib/text/text-provider';

const isLikelyPlaceId = (val) => {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (trimmed.length < 5 || trimmed.length > 250) return false;
    if (/\s/.test(trimmed)) return false;
    return true;
};

export default function Personal() {
    const { t } = useTranslation();
    const { setUserData } = useContext(AuthContext);
    const [users, setUsers] = useState([]);
    const [searchEmail, setSearchEmail] = useState('');
    const [imgErrors, setImgErrors] = useState({});
    const [expandedUserId, setExpandedUserId] = useState(null);
    const [activeTab, setActiveTab] = useState('employees');
    const [branchDraftByUser, setBranchDraftByUser] = useState({});
    const [branches, setBranches] = useState([]);
    const [branchesLoading, setBranchesLoading] = useState(false);
    const [editingUserId, setEditingUserId] = useState(null);
    const [editFormByUser, setEditFormByUser] = useState({});
    const [savingUserId, setSavingUserId] = useState(null);
    const [vacResumen, setVacResumen] = useState({ anio: null, porUsuario: {} });
    const [vacDraftByUser, setVacDraftByUser] = useState({});
    const [vacSavingUserId, setVacSavingUserId] = useState(null);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [currentUserCategory, setCurrentUserCategory] = useState(null);
    const [placeCache, setPlaceCache] = useState({});
    const placeCacheRef = useRef({});
    const placesServiceRef = useRef(null);
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;

    useEffect(() => {
        if (!placesServiceRef.current && typeof window !== 'undefined' && window.google?.maps?.places) {
            placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement('div'));
        }
    }, []);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await fetch(buildApiUrl('/getAllUsers'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                const rows = Array.isArray(data?.[0]) ? data[0] : Array.isArray(data) ? data : [];
                const normalized = rows.map((user, index) => ({
                    ...user,
                    __key: user.idusuario ?? user.email ?? `user-${index}`,
                }));
                setUsers(normalized);
            } catch (error) {
                console.error('Error fetching users:', error);
            }
        };

        fetchUsers();
    }, []);

    useEffect(() => {
        const session = getStorageValue('CognitoUserSession');
        const username = session?.idToken?.payload?.['cognito:username'];
        const userData = username ? getStorageValue(`user_${username}`) : null;
        setCurrentUserId(userData?.idusuario ?? null);
        setCurrentUserCategory(userData?.categoria ?? null);
    }, []);

    useEffect(() => {
        const fetchBranches = async () => {
            setBranchesLoading(true);
            try {
                const response = await fetch(buildApiUrl('/getSucursal'), {
                    cache: 'no-store',
                    headers: { Accept: 'application/json, text/plain, */*' },
                });

                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                const rows = Array.isArray(data?.[0]) ? data[0] : Array.isArray(data) ? data : [];
                const normalized = rows
                    .map((branch) => ({
                        id: branch.idsucursal ?? branch.idSucursal ?? branch.id,
                        name: branch.sucursal ?? branch.nombre ?? branch.branch,
                    }))
                    .filter((branch) => {
                        if (branch.id == null || !branch.name) return false;
                        if (Number(branch.id) === 1) return false;
                        return !String(branch.name).toLowerCase().includes('web');
                    });
                setBranches(normalized);
            } catch (error) {
                console.error('Error fetching branches:', error);
                setBranches([]);
            } finally {
                setBranchesLoading(false);
            }
        };

        fetchBranches();
    }, []);

    const handleSearchChange = (event) => {
        setSearchEmail(event.target.value);
    };

    const safeValue = (value) => {
        if (value === null || value === undefined || value === '') return 'Sin dato';
        return String(value);
    };

    const formatBirthDate = (value) => {
        if (!value) return value;
        if (typeof value === 'string') return value.split('T')[0];
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.toISOString().split('T')[0];
        }
        return value;
    };

    const getUserKey = (user) => user.__key ?? user.idusuario ?? user.email;
    // La 1 y las "web" no son sucursales donde se trabaje: no salen en el selector.
    const validBranchId = (user) => {
        if (user.idsucursal == null || Number(user.idsucursal) === 1) return '';
        if (String(user.sucursal || '').toLowerCase().includes('web')) return '';
        return String(user.idsucursal);
    };
    const isEmployee = (user) => Number(user.empleado) === 1;

    const toggleDetails = (userKey) => {
        setExpandedUserId((prev) => (prev === userKey ? null : userKey));
    };

    const updateUserEmployment = async ({ idusuario, empleado, idsucursal }) => {
        const response = await fetch(buildApiUrl('/patchUserEmployment'), {
            method: 'PATCH',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
            },
            body: JSON.stringify({
                idusuario,
                empleado,
                idsucursal,
            }),
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        return response.json().catch(() => null);
    };

    const updateUserCategory = async ({ idusuario, categoria }) => {
        const response = await fetch(buildApiUrl('/patchUserCategory'), {
            method: 'PATCH',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
            },
            body: JSON.stringify({
                idusuario,
                categoria,
            }),
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        return response.json().catch(() => null);
    };

    const updateEmployeeData = async ({ idusuario, idsucursal, telefono }) => {
        const response = await fetch(buildApiUrl('/patchEmployeeData'), {
            method: 'PATCH',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*',
            },
            body: JSON.stringify({
                idusuario,
                idsucursal,
                telefono,
            }),
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        return response.json().catch(() => null);
    };

    // Si el admin se cambia a si mismo de sucursal, el panel tiene que vender
    // desde la nueva sin volver a entrar: la sesion lee user_<username>.
    const refreshOwnSession = (changes) => {
        const session = getStorageValue('CognitoUserSession');
        const username = session?.idToken?.payload?.['cognito:username'];
        const cached = username ? getStorageValue(`user_${username}`) : null;
        if (!cached) return;
        const next = { ...cached, ...changes };
        setStorageValue(`user_${username}`, next);
        setUserData?.(next);
    };

    const startEditUser = (user) => {
        const userKey = getUserKey(user);
        setExpandedUserId(userKey);
        setEditingUserId(userKey);
        setEditFormByUser((prev) => ({
            ...prev,
            [userKey]: {
                telefono: user.telefono ?? '',
            },
        }));
    };

    const handleEditChange = (userKey, field, value) => {
        setEditFormByUser((prev) => ({
            ...prev,
            [userKey]: {
                ...(prev[userKey] || {}),
                [field]: value,
            },
        }));
    };

    const cancelEditUser = (userKey) => {
        setEditingUserId((prev) => (prev === userKey ? null : prev));
        setEditFormByUser((prev) => {
            if (!prev[userKey]) return prev;
            const next = { ...prev };
            delete next[userKey];
            return next;
        });
    };

    const saveEditUser = async (editedUser) => {
        const isAdmin = String(currentUserCategory || '').toUpperCase() === 'A';
        if (!isAdmin) return;
        const userKey = getUserKey(editedUser);
        const draft = editFormByUser[userKey];
        if (!draft) return;
        const telefono = String(draft.telefono ?? '').trim();

        setSavingUserId(userKey);
        try {
            await updateEmployeeData({ idusuario: editedUser.idusuario, telefono });
        } catch (error) {
            console.error('Error saving employee:', error);
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.saveError'));
            }
            return;
        } finally {
            setSavingUserId(null);
        }

        setUsers((prevUsers) => prevUsers.map((user) => {
            const key = getUserKey(user);
            if (key !== userKey) return user;
            return { ...user, telefono };
        }));
        if (currentUserId != null && String(editedUser.idusuario) === String(currentUserId)) {
            refreshOwnSession({ telefono });
        }
        cancelEditUser(userKey);
    };

    const handleRemoveEmployee = async (userKey, userId) => {
        const isAdmin = String(currentUserCategory || '').toUpperCase() === 'A';
        if (!isAdmin) return;
        if (!userId) {
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.noUser'));
            }
            return;
        }
        if (currentUserId != null && String(userId) === String(currentUserId)) {
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.cantRemoveSelf'));
            }
            return;
        }
        const confirmRemoval = typeof window === 'undefined'
            ? true
            : window.confirm(t('panel.personal.confirmRemove'));
        if (!confirmRemoval) return;

        try {
            await updateUserEmployment({ idusuario: userId, empleado: 0, idsucursal: null });
            setUsers((prevUsers) => prevUsers.map((user) => {
                const key = getUserKey(user);
                if (key !== userKey) return user;
                return { ...user, empleado: 0, idsucursal: null, sucursal: null };
            }));
            cancelEditUser(userKey);
        } catch (error) {
            console.error('Error removing employee:', error);
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.removeError'));
            }
        }
    };

    const handleBranchSelect = (userKey, value) => {
        setBranchDraftByUser((prev) => ({ ...prev, [userKey]: value }));
    };

    // La sucursal es de los empleados: se cambia aqui y se guarda al momento.
    // Dias de vacaciones de este ano por empleado; cada quien los marca en su
    // calendario y cada dia marcado descuenta uno (ver /api/vacaciones).
    useEffect(() => {
        if (String(currentUserCategory || '').toUpperCase() !== 'A') return;
        const fetchVacations = async () => {
            try {
                const token = await obtenerIdToken();
                const response = await fetch('/api/vacaciones?vista=resumen', {
                    cache: 'no-store',
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                setVacResumen({
                    anio: data.anio,
                    porUsuario: Object.fromEntries((data.empleados || []).map((row) => [
                        String(row.idusuario),
                        { asignados: Number(row.asignados) || 0, usados: Number(row.usados) || 0 },
                    ])),
                });
            } catch (error) {
                console.error('Error fetching vacations:', error);
            }
        };
        fetchVacations();
    }, [currentUserCategory]);

    const handleSaveVacationDays = async (employee) => {
        const isAdmin = String(currentUserCategory || '').toUpperCase() === 'A';
        if (!isAdmin) return;
        const userKey = getUserKey(employee);
        const dias = Number(vacDraftByUser[userKey]);
        if (!Number.isInteger(dias) || dias < 0) return;

        setVacSavingUserId(userKey);
        try {
            const token = await obtenerIdToken();
            const response = await fetch('/api/vacaciones', {
                method: 'PUT',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ idusuario: employee.idusuario, dias }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = data.codigo === 'usados'
                    ? t('panel.vacation.belowUsed', { usados: data.usados })
                    : response.status === 400 ? t('panel.vacation.range') : t('panel.vacation.saveError');
                if (typeof window !== 'undefined') window.alert(message);
                return;
            }
            setVacResumen((prev) => ({
                anio: data.anio ?? prev.anio,
                porUsuario: {
                    ...prev.porUsuario,
                    [String(employee.idusuario)]: { asignados: data.asignados, usados: data.usados },
                },
            }));
            setVacDraftByUser((prev) => {
                const next = { ...prev };
                delete next[userKey];
                return next;
            });
        } catch (error) {
            console.error('Error saving vacation days:', error);
            if (typeof window !== 'undefined') window.alert(t('panel.vacation.saveError'));
        } finally {
            setVacSavingUserId(null);
        }
    };

    const handleChangeBranch = async (employee) => {
        const isAdmin = String(currentUserCategory || '').toUpperCase() === 'A';
        if (!isAdmin) return;
        const userKey = getUserKey(employee);
        const branch = branches.find((item) => String(item.id) === String(branchDraftByUser[userKey]));
        if (!branch) {
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.pickValidBranch'));
            }
            return;
        }

        setSavingUserId(userKey);
        try {
            await updateEmployeeData({ idusuario: employee.idusuario, idsucursal: branch.id });
        } catch (error) {
            console.error('Error changing branch:', error);
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.saveError'));
            }
            return;
        } finally {
            setSavingUserId(null);
        }

        setUsers((prevUsers) => prevUsers.map((user) => {
            const key = getUserKey(user);
            if (key !== userKey) return user;
            return { ...user, idsucursal: branch.id, sucursal: branch.name };
        }));
        setBranchDraftByUser((prev) => {
            const next = { ...prev };
            delete next[userKey];
            return next;
        });
        if (currentUserId != null && String(employee.idusuario) === String(currentUserId)) {
            refreshOwnSession({ idsucursal: branch.id });
        }
    };

    // Activar solo cambia el estado; la sucursal se asigna despues en
    // Empleados, donde la cuenta queda arriba y marcada hasta tener una.
    const handleActivateUser = async (userKey, userId) => {
        const isAdmin = String(currentUserCategory || '').toUpperCase() === 'A';
        if (!isAdmin) return;
        if (!userId) {
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.noUser'));
            }
            return;
        }
        const confirmActivation = typeof window === 'undefined'
            ? true
            : window.confirm(t('panel.personal.confirmActivate'));
        if (!confirmActivation) return;

        setSavingUserId(userKey);
        try {
            await updateUserEmployment({ idusuario: userId, empleado: 1, idsucursal: null });
            setUsers((prevUsers) => prevUsers.map((user) => {
                const key = getUserKey(user);
                if (key !== userKey) return user;
                return { ...user, empleado: 1, idsucursal: null, sucursal: null };
            }));
            setActiveTab('employees');
        } catch (error) {
            console.error('Error activating employee:', error);
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.activateError'));
            }
        } finally {
            setSavingUserId(null);
        }
    };

    const handlePromoteAdmin = async (userKey, userId) => {
        const isAdmin = String(currentUserCategory || '').toUpperCase() === 'A';
        if (!isAdmin) return;
        if (!userId) {
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.noUser'));
            }
            return;
        }
        const confirmPromotion = typeof window === 'undefined'
            ? true
            : window.confirm(t('panel.personal.confirmPromote'));
        if (!confirmPromotion) return;

        try {
            await updateUserCategory({ idusuario: userId, categoria: 'A' });
            setUsers((prevUsers) => prevUsers.map((user) => {
                const key = getUserKey(user);
                if (key !== userKey) return user;
                return { ...user, categoria: 'A' };
            }));
        } catch (error) {
            console.error('Error promoting admin:', error);
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.roleError'));
            }
        }
    };

    const handleDemoteAdmin = async (userKey, userId) => {
        const isAdmin = String(currentUserCategory || '').toUpperCase() === 'A';
        if (!isAdmin) return;
        if (!userId) {
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.noUser'));
            }
            return;
        }
        if (currentUserId != null && String(userId) === String(currentUserId)) {
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.cantDemoteSelf'));
            }
            return;
        }
        const confirmDemotion = typeof window === 'undefined'
            ? true
            : window.confirm(t('panel.personal.confirmDemote'));
        if (!confirmDemotion) return;

        try {
            await updateUserCategory({ idusuario: userId, categoria: 'G' });
            setUsers((prevUsers) => prevUsers.map((user) => {
                const key = getUserKey(user);
                if (key !== userKey) return user;
                return { ...user, categoria: 'G' };
            }));
        } catch (error) {
            console.error('Error demoting admin:', error);
            if (typeof window !== 'undefined') {
                window.alert(t('panel.personal.roleError'));
            }
        }
    };

    const handleImageError = (userId) => {
        setImgErrors((prevErrors) => ({
            ...prevErrors,
            [userId]: true
        }));
    };

    const handleImageLoad = (userId) => {
        setImgErrors((prevErrors) => ({
            ...prevErrors,
            [userId]: false
        }));
    };

    const normalizedSearch = searchEmail.trim().toLowerCase();
    const filteredUsers = users.filter((user) =>
        (user.email || '').toLowerCase().includes(normalizedSearch)
    );

    // Los empleados sin sucursal van primero: recien activados, les falta una.
    const employees = filteredUsers
        .filter((user) => isEmployee(user))
        .sort((a, b) => Number(Boolean(validBranchId(a))) - Number(Boolean(validBranchId(b))));
    const nonEmployees = filteredUsers.filter((user) => !isEmployee(user));

    const groupOptions = [
        {
            value: 1,
            label: t('panel.personal.activeEmployee'),
            icon: FiUserCheck,
            activeClass: 'bg-emerald-500 text-white border-emerald-400',
            softClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            dotClass: 'bg-emerald-500',
        },
        {
            value: 0,
            label: t('panel.personal.externalUser'),
            icon: FiUserX,
            activeClass: 'bg-rose-500 text-white border-rose-400',
            softClass: 'bg-rose-50 text-rose-700 border-rose-200',
            dotClass: 'bg-rose-500',
        },
    ];

    const resolvePlace = useCallback((placeId) => {
        if (!placeId || placeCacheRef.current[placeId]) return;
        if (!isLikelyPlaceId(placeId)) return;
        const service = placesServiceRef.current;
        if (!service) return;

        service.getDetails(
            { placeId, fields: ['formatted_address'] },
            (place, status) => {
                const formatted =
                    status === window.google.maps.places.PlacesServiceStatus.OK
                        ? place?.formatted_address || placeId
                        : placeId;
                setPlaceCache((prev) => {
                    if (prev[placeId]) return prev;
                    const next = { ...prev, [placeId]: formatted };
                    placeCacheRef.current = next;
                    return next;
                });
            }
        );
    }, []);

    useEffect(() => {
        const uniquePlaceIds = Array.from(
            new Set(users.map((user) => user.domicilio).filter(Boolean))
        )
            .filter(isLikelyPlaceId)
            .slice(0, 50);
        uniquePlaceIds.forEach(resolvePlace);
    }, [users, resolvePlace]);

    const renderUserCard = (user, showActivation) => {
        const userKey = getUserKey(user);
        const active = isEmployee(user);
        const fullName = [user.nombre, user.apellido].filter(Boolean).join(' ') || 'Sin nombre';
        const expanded = expandedUserId === userKey;
        const isUserAdmin = String(user.categoria || '').toUpperCase() === 'A';
        // La etiqueta distingue a los admins; las opciones de Otros siguen
        // diciendo "Empleado activo" porque activar no da rol de admin.
        const groupMeta = active && isUserAdmin
            ? {
                label: t('panel.personal.activeAdmin'),
                softClass: 'bg-amber-50 text-amber-700 border-amber-200',
                dotClass: 'bg-amber-500',
            }
            : groupOptions.find((option) => option.value === (active ? 1 : 0));
        const address = user.domicilio ? (placeCache[user.domicilio] || user.domicilio) : user.domicilio;

        const primaryDetails = [
            { label: t('panel.personal.email'), value: user.email, icon: FiMail },
            { label: t('panel.personal.phone'), value: user.telefono, icon: FiPhone, field: 'telefono' },
        ];

        const dbDetails = [
            { label: t('panel.personal.gender'), value: user.genero, icon: FiUser },
            { label: t('panel.personal.birth'), value: formatBirthDate(user.f_nacimiento), icon: FiCalendar },
            { label: t('invoice.rfc'), value: user.rfc, icon: FiTag },
            { label: t('panel.personal.address'), value: address, icon: FiMapPin },
        ];

        const isEditing = editingUserId === userKey;
        const isSaving = savingUserId === userKey;
        const currentBranchId = validBranchId(user);
        const selectedBranch = branchDraftByUser[userKey] ?? currentBranchId;
        const canChangeBranch = Boolean(selectedBranch) && selectedBranch !== currentBranchId && !isSaving;
        const vacation = vacResumen.porUsuario[String(user.idusuario)] || { asignados: 0, usados: 0 };
        const vacationDraft = vacDraftByUser[userKey] ?? String(vacation.asignados);
        const isSavingVacation = vacSavingUserId === userKey;
        const canSaveVacation = /^\d+$/.test(vacationDraft)
            && Number(vacationDraft) !== vacation.asignados && !isSavingVacation;
        const editValues = editFormByUser[userKey] || {};
        const isSelf = currentUserId != null && String(user.idusuario) === String(currentUserId);
        const isAdmin = String(currentUserCategory || '').toUpperCase() === 'A';
        // Editar escribe el telefono en la base: solo administradores.
        const canEdit = active && !showActivation && isAdmin;
        const canPromoteAdmin = canEdit && isAdmin && !isUserAdmin && !isSelf;
        const canDemoteAdmin = canEdit && isAdmin && isUserAdmin && !isSelf;

        const renderInfoItem = (item) => {
            const Icon = item.icon;
            const valueClass =
                item.label === t('panel.personal.email')
                    ? 'break-all overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]'
                    : '';
            const isTelefono = item.field === 'telefono';

            if (canEdit && isEditing && isTelefono) {
                return (
                    <div key={item.label} className="flex items-center gap-3 rounded-xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))]/70 p-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow-sm">
                            <Icon className="h-4 w-4" />
                        </span>
                        <div className="w-full">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--color-text))]">{item.label}</p>
                            <input
                                value={editValues.telefono || ''}
                                onChange={(e) => handleEditChange(userKey, 'telefono', e.target.value)}
                                className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-inner outline-none focus:ring-2 focus:ring-[rgb(var(--color-text))]/70"
                            />
                        </div>
                    </div>
                );
            }

            return (
                <div key={item.label} className="flex items-center gap-3 rounded-xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))]/70 p-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow-sm">
                        <Icon className="h-4 w-4" />
                    </span>
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--color-text))]">{item.label}</p>
                        <p className={`text-sm font-semibold text-[rgb(var(--color-text))] ${valueClass}`}>{safeValue(item.value)}</p>
                    </div>
                </div>
            );
        };

        return (
            <article key={userKey} className="group relative overflow-hidden rounded-2xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-card))] p-4 shadow shadow-[rgb(var(--color-galaxy))] transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="absolute inset-0 bg-gradient-to-br from-[rgb(var(--color-text))]/10 via-transparent to-[rgb(var(--color-galaxy))]/10 opacity-0 transition group-hover:opacity-100" />
                <div className="relative z-10 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                {!imgErrors[user.idusuario] ? (
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--color-card))] shadow-lg shadow-[rgb(var(--color-galaxy))]/20 border border-[rgb(var(--color-border))] overflow-hidden">
                                        <img
                                            src={`${multimediaSrc}usr/${user.idusuario}.jpg`}
                                            onError={() => handleImageError(user.idusuario)}
                                            onLoad={() => handleImageLoad(user.idusuario)}
                                            className="h-full w-full object-cover bg-[rgb(var(--color-card-white))]"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--color-bg))] border border-[rgb(var(--color-border))]/80 shadow-lg">
                                        <BiSolidUserCircle className="h-8 w-8 text-[rgb(var(--color-text))]" />
                                    </div>
                                )}
                                {active && (
                                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow">
                                        {isUserAdmin ? (
                                            <FaStar className="h-3 w-3 text-amber-400" />
                                        ) : (
                                            <BsStars className="h-3 w-3 text-amber-500" />
                                        )}
                                    </span>
                                )}
                            </div>
                            <div className="space-y-1 min-w-0">
                                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${groupMeta?.softClass || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                    <span className={`h-2 w-2 rounded-full ${groupMeta?.dotClass || 'bg-slate-400'}`} />
                                    {groupMeta?.label || t('panel.personal.noStatus')}
                                </span>
                                <h3 className="text-lg font-semibold text-[rgb(var(--color-text))]">{fullName}</h3>
                            </div>
                        </div>
                        <div className="flex flex-row flex-wrap items-center gap-2">
                            {canEdit && !isEditing && (
                                <button
                                    type="button"
                                    onClick={() => startEditUser(user)}
                                    className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] px-3 py-1 text-xs font-semibold text-[rgb(var(--color-text))] shadow-sm transition hover:-translate-y-0.5"
                                >
                                    {t('panel.personal.edit')}
                                </button>
                            )}
                            {canEdit && isEditing && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => saveEditUser(user)}
                                        disabled={isSaving}
                                        className="inline-flex items-center gap-2 rounded-full border border-emerald-400 bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-60"
                                    >
                                        {isSaving ? t('panel.permissions.saving') : t('panel.personal.save')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => cancelEditUser(userKey)}
                                        disabled={isSaving}
                                        className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] px-3 py-1 text-xs font-semibold text-[rgb(var(--color-text))] shadow-sm"
                                    >
                                        {t('panel.common.cancel')}
                                    </button>
                                </>
                            )}
                            {canEdit && !isEditing && isAdmin && !isSelf && (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveEmployee(userKey, user.idusuario)}
                                    className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-[rgb(var(--color-border))]/60 disabled:bg-[rgb(var(--color-bg))] disabled:text-[rgb(var(--color-text))]/60"
                                >
                                    {t('panel.personal.remove')}
                                </button>
                            )}
                            {canPromoteAdmin && (
                                <button
                                    type="button"
                                    onClick={() => handlePromoteAdmin(userKey, user.idusuario)}
                                    className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition hover:-translate-y-0.5"
                                >
                                    {t('panel.personal.makeAdmin')}
                                </button>
                            )}
                            {canDemoteAdmin && (
                                <button
                                    type="button"
                                    onClick={() => handleDemoteAdmin(userKey, user.idusuario)}
                                    disabled={isSelf}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-[rgb(var(--color-border))]/60 disabled:bg-[rgb(var(--color-bg))] disabled:text-[rgb(var(--color-text))]/60"
                                >
                                    {t('panel.personal.removeAdmin')}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => toggleDetails(userKey)}
                                className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] px-3 py-1 text-xs font-semibold text-[rgb(var(--color-text))] shadow-sm transition hover:-translate-y-0.5"
                            >
                                {t('panel.personal.details')}
                                <FiChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-1">
                        {primaryDetails.map(renderInfoItem)}
                    </div>

                    {showActivation && isAdmin ? (
                        <div className="rounded-xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))]/70 p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[rgb(var(--color-text))]">
                                <FiTag className="text-[rgb(var(--color-text))]" />
                                {t('panel.personal.statusTitle')}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {groupOptions.map((option) => {
                                    const OptionIcon = option.icon;
                                    const selected = Number(option.value) === (active ? 1 : 0);
                                    return (
                                        <button
                                            key={option.label}
                                            type="button"
                                            onClick={() => handleActivateUser(userKey, user.idusuario)}
                                            disabled={selected || isSaving}
                                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-default ${selected ? option.activeClass : 'border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] hover:border-[rgb(var(--color-text))]/60'}`}
                                        >
                                            <OptionIcon className="h-4 w-4" />
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-2 text-xs text-[rgb(var(--color-text))]">{t('panel.personal.activateHint')}</p>
                        </div>
                    ) : !showActivation && isAdmin ? (
                        <div className="rounded-xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))]/70 p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[rgb(var(--color-text))]">
                                <FiMapPin className="text-[rgb(var(--color-text))]" />
                                {t('panel.common.branch')}
                            </div>
                            {!currentBranchId && (
                                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                                    {t('panel.personal.noBranchAssigned')}
                                </p>
                            )}
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                                <select
                                    value={selectedBranch}
                                    onChange={(e) => handleBranchSelect(userKey, e.target.value)}
                                    disabled={isSaving}
                                    className="w-full rounded-xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-inner outline-none focus:ring-2 focus:ring-[rgb(var(--color-text))]/70 sm:flex-1"
                                >
                                    <option value="" disabled>
                                        {branchesLoading ? t('panel.personal.loadingBranches') : t('panel.common.pickBranch')}
                                    </option>
                                    {branches.map((branch) => (
                                        <option key={branch.id} value={String(branch.id)}>
                                            {branch.name}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => handleChangeBranch(user)}
                                    disabled={!canChangeBranch}
                                    className="inline-flex items-center justify-center rounded-xl border border-emerald-400 bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-[rgb(var(--color-border))]/60 disabled:bg-[rgb(var(--color-bg))] disabled:text-[rgb(var(--color-text))]/60"
                                >
                                    {isSaving ? t('panel.permissions.saving') : t('panel.personal.changeBranch')}
                                </button>
                            </div>
                            {!branchesLoading && !branches.length && (
                                <p className="mt-2 text-xs text-[rgb(var(--color-text))]">{t('panel.personal.noBranches')}</p>
                            )}
                        </div>
                    ) : null}

                    {!showActivation && isAdmin && (
                        <div className="rounded-xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))]/70 p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[rgb(var(--color-text))]">
                                <FiSun className="text-[rgb(var(--color-text))]" />
                                {t('panel.vacation.title', { anio: vacResumen.anio ?? '' })}
                            </div>
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                                <label className="flex items-center gap-2 text-sm text-[rgb(var(--color-text))] sm:flex-1">
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={60}
                                        value={vacationDraft}
                                        onChange={(e) => setVacDraftByUser((prev) => ({ ...prev, [userKey]: e.target.value }))}
                                        disabled={isSavingVacation}
                                        className="w-24 rounded-xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-[rgb(var(--color-text))] shadow-inner outline-none focus:ring-2 focus:ring-[rgb(var(--color-text))]/70"
                                    />
                                    {t('panel.vacation.days')}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => handleSaveVacationDays(user)}
                                    disabled={!canSaveVacation}
                                    className="inline-flex items-center justify-center rounded-xl border border-emerald-400 bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-[rgb(var(--color-border))]/60 disabled:bg-[rgb(var(--color-bg))] disabled:text-[rgb(var(--color-text))]/60"
                                >
                                    {isSavingVacation ? t('panel.permissions.saving') : t('panel.vacation.save')}
                                </button>
                            </div>
                            <p className="mt-2 text-xs text-[rgb(var(--color-text))]">
                                {t('panel.vacation.usage', {
                                    usados: vacation.usados,
                                    restan: Math.max(0, vacation.asignados - vacation.usados),
                                })}
                            </p>
                        </div>
                    )}

                    {expanded && (
                        <div className="rounded-xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--color-text))]">
                                <FiDatabase className="text-[rgb(var(--color-text))]" />
                                Detalle de usuario
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-1">
                                {dbDetails.map(renderInfoItem)}
                            </div>
                        </div>
                    )}
                </div>
            </article>
        );
    };

    const canManagePermissions = String(currentUserCategory || '').toUpperCase() === 'A';
    const showPermissions = activeTab === 'permissions' && canManagePermissions;
    const tabLabels = {
        employees: t('panel.personal.tabEmployees'),
        others: t('panel.personal.tabOthers'),
        permissions: t('panel.personal.tabPermissions'),
    };

    return (
        <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-transparent to-[rgb(var(--color-card))] backdrop-blur-md py-28">
            <Title
                title={t('panel.personal.title')}
                icon={FaUsersViewfinder}
                back={t('panel.common.back')}
                path='/productivity'
            />
            <div className="mx-auto max-w-7xl 2xl:max-w-[1900px] px-6 lg:px-8">
                <div className="mx-auto mt-4 max-w-7xl 2xl:max-w-[1900px] space-y-6">
                    {!showPermissions && (
                        <div className="rounded-2xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-card))] p-4 shadow-xl shadow-[rgb(var(--color-galaxy))]/20">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="relative flex-1">
                                    <FiSearch className="absolute left-3 top-3 h-5 w-5 text-[rgb(var(--color-text))]" />
                                    <input
                                        type="text"
                                        placeholder={t('panel.personal.searchPlaceholder')}
                                        value={searchEmail}
                                        onChange={handleSearchChange}
                                        className="w-full rounded-xl border border-[rgb(var(--color-border))]/80 bg-[rgb(var(--color-bg))] py-2 pl-10 pr-4 text-sm text-[rgb(var(--color-text))] shadow-inner outline-none focus:ring-2 focus:ring-[rgb(var(--color-text))]/70"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] px-3 py-1 text-xs font-semibold text-[rgb(var(--color-text))] shadow-sm">
                                        <FiUsers className="h-4 w-4 text-[rgb(var(--color-text))]" />
                                        {t('panel.personal.total')} {filteredUsers.length}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-card))] p-3 shadow-sm">
                        <div className="flex items-center gap-2 rounded-full border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] px-3 py-1 text-xs font-semibold text-[rgb(var(--color-text))]">
                            <FiUsers className="h-4 w-4" />
                            {t('panel.calendar.view')} {tabLabels[activeTab]}
                        </div>
                        <div className="flex items-center gap-2 rounded-full border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-bg))] p-1">
                            <button
                                type="button"
                                onClick={() => setActiveTab('employees')}
                                className={`rounded-full px-4 py-1 text-xs font-semibold transition ${activeTab === 'employees' ? 'bg-emerald-500 text-white shadow' : 'text-[rgb(var(--color-text))]'}`}
                            >
                                {t('panel.personal.tabEmployees')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('others')}
                                className={`rounded-full px-4 py-1 text-xs font-semibold transition ${activeTab === 'others' ? 'bg-rose-500 text-white shadow' : 'text-[rgb(var(--color-text))]'}`}
                            >
                                {t('panel.personal.tabOthers')}
                            </button>
                            {canManagePermissions && (
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('permissions')}
                                    className={`rounded-full px-4 py-1 text-xs font-semibold transition ${activeTab === 'permissions' ? 'bg-amber-500 text-white shadow' : 'text-[rgb(var(--color-text))]'}`}
                                >
                                    {t('panel.personal.tabPermissions')}
                                </button>
                            )}
                        </div>
                    </div>

                    {showPermissions ? (
                        <ProfilePermissions />
                    ) : (
                        <section className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-2xl font-bold text-[rgb(var(--color-text))]">
                                        {activeTab === 'employees' ? t('panel.personal.activeTitle') : t('panel.personal.othersTitle')}
                                    </h2>
                                    <p className="text-sm text-[rgb(var(--color-text))]">
                                        {activeTab === 'employees'
                                            ? t('panel.personal.activeSubtitle')
                                            : t('panel.personal.othersSubtitle')}
                                    </p>
                                </div>
                                {activeTab === 'employees' ? (
                                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
                                        <FiUserCheck className="h-4 w-4" />
                                        {employees.length} {t('panel.personal.activeCount')}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 shadow-sm">
                                        <FiUserX className="h-4 w-4" />
                                        {nonEmployees.length} {t('panel.personal.externalCount')}
                                    </span>
                                )}
                            </div>
                            {activeTab === 'employees' ? (
                                employees.length === 0 ? (
                                    <div className="rounded-2xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-card))] p-6 text-sm text-[rgb(var(--color-text))] shadow-sm">
                                        {t('panel.personal.emptyEmployees')}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3 ">
                                        {employees.map((user) => renderUserCard(user, false))}
                                    </div>
                                )
                            ) : (
                                nonEmployees.length === 0 ? (
                                    <div className="rounded-2xl border border-[rgb(var(--color-border))]/70 bg-[rgb(var(--color-card))] p-6 text-sm text-[rgb(var(--color-text))] shadow-sm">
                                        {t('panel.personal.emptyOthers')}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                        {nonEmployees.map((user) => renderUserCard(user, true))}
                                    </div>
                                )
                            )}
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
