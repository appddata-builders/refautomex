'use client';
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { getStorageValue, setStorageValue } from "@/app/lib/storage-values";
import { BiSolidUserCircle } from 'react-icons/bi';
import { MdEdit, MdSave } from 'react-icons/md';
import { IoHome } from 'react-icons/io5';
import { useTranslation } from '@/app/lib/text/text-provider';
import GooglePlacesAutocomplete from '@/app/components/principal/account/google-places';
import { FaStarHalfAlt } from 'react-icons/fa';
import { buildApiUrl } from '@/app/lib/refautomex-api';

const HeicToJpgUploader = dynamic(() => import('@/app/components/productivity/stock/heic-to-jpg-uploader'), { ssr: false });

// La misma clase estaba copiada en los seis campos. Al centrarla se puede
// pintar el estado de error sin repetir la cadena una septima vez.
const inputClass = (isEditable, hasError) => [
    // El preflight de Tailwind deja los inputs sin padding: sin px-3 el texto
    // iba pegado al borde, y py-2.5 da un area tactil usable en telefono.
    'block w-full rounded-md border-0 py-2.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset',
    'placeholder:text-gray-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6',
    hasError
        ? 'ring-red-400 focus:ring-red-500'
        : 'ring-gray-300 focus:ring-indigo-600',
    isEditable ? 'bg-white' : 'bg-gray-100',
].join(' ');

// Los mensajes por campo se calculaban desde el primer dia y nunca se pintaban:
// al fallar la validacion el boton no hacia nada y no se decia por que.
const FieldError = ({ id, message }) =>
    message ? (
        <p id={id} role="alert" className="mt-1 text-xs font-medium text-red-600">
            {message}
        </p>
    ) : null;

export default function Settings() {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const lang = searchParams.get('lang') || 'es';
    const dashboardHref = pathname?.startsWith('/productivity')
        ? `/productivity?lang=${lang}`
        : `/section/refautomex?lang=${lang}`;
    const [email, setEmail] = useState("");
    const [name, setName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [gender, setGender] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [placeId, setPlaceId] = useState('');
    const [cognitoid, setCognitoId] = useState('');
    const [rfc, setRfc] = useState('');
    const [empleado, setEmpleado] = useState('');
    const [isLoading, setLoading] = useState(false);
    const [mediaUploading, setMediaUploading] = useState(false);
    const [profile, setProfile] = useState(null);
    const [profilePreview, setProfilePreview] = useState('');
    const [imageError, setImageError] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [errorMessages, setErrorMessages] = useState({
        nombre: '',
        last_name: '',
        birthDate: '',
        phone: '',
        rfc: '',
        gender: '',
    });
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');
    const cognitoUserSession = getStorageValue('CognitoUserSession');
    const username = cognitoUserSession.idToken.payload["cognito:username"];
    const userData = getStorageValue(`user_${username}`);
    const idUsuario = userData?.idusuario || 0;

    const [isEditable, setEditable] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleImageError = () => {
        setImageError(true);
    }

    // createObjectURL se llamaba dentro del render: cada re-render creaba una
    // URL nueva y ninguna se liberaba.
    useEffect(() => {
        if (!profile) {
            setProfilePreview('');
            return;
        }
        const url = URL.createObjectURL(profile);
        setProfilePreview(url);
        return () => URL.revokeObjectURL(url);
    }, [profile]);

    useEffect(() => {
        if (!successMessage && !profileSuccess) return;
        const id = setTimeout(() => {
            setSuccessMessage('');
            setProfileSuccess('');
        }, 5000);
        return () => clearTimeout(id);
    }, [successMessage, profileSuccess]);

    // El error de un campo desaparece en cuanto el usuario lo corrige, no
    // hasta el siguiente envio.
    const clearFieldError = (field) =>
        setErrorMessages((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));

    const toggleEdit = (event) => {
        event.preventDefault();
        setEditable(!isEditable);
    };

    const handleSaveImage = async () => {
        setMediaUploading(true);
        setIsSaving(true);
        setProfileError('');
        setProfileSuccess('');
        if (!profile) {
            setProfileError('Selecciona una imagen antes de guardar.');
            setMediaUploading(false);
            setIsSaving(false);
            return;
        }
        if (!idUsuario) {
            setProfileError('No se encontró el usuario para guardar la imagen.');
            setMediaUploading(false);
            setIsSaving(false);
            return;
        }

        try {
            const formData = new FormData();
            formData.append('file', profile);
            formData.append('userId', String(idUsuario));

            const response = await fetch('/api/upload-user-image', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Error al subir imagen. Por favor intenta de nuevo.');
            }

            setProfileSuccess('Imagen guardada correctamente.');
            setImageError(false);
        } catch (err) {
            setProfileError(err.message || 'Error al subir imagen. Por favor intenta de nuevo.');
            console.error('Error al subir imagen:', err);
        } finally {
            setMediaUploading(false);
            setIsSaving(false);
        }
    };

    const patchUserInfo = async (e) => {
        e.preventDefault();

        let newErrors = {
            nombre: '',
            last_name: '',
            birthDate: '',
            phone: '',
            rfc: '',
            gender: ''
        };

        const regexGeneral = {
            nombre: /^[a-zA-ZáéíóúÁÉÍÓÚ\s\.]+$/,
            last_name: /^[a-zA-ZáéíóúÁÉÍÓÚ\s\.]+$/,
            birthDate: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
            phone: /^[0-9]{10}$/
        };

        if (!name || !regexGeneral.nombre.test(name)) {
            newErrors.nombre = 'Por favor, ingresa un nombre válido.';
        }

        if (!lastName || !regexGeneral.last_name.test(lastName)) {
            newErrors.last_name = 'Por favor, ingresa un apellido válido.';
        }

        if (!birthDate || !regexGeneral.birthDate.test(birthDate)) {
            newErrors.birthDate = 'Por favor, ingresa una fecha de nacimiento válida.';
        }

        if (!phone || !regexGeneral.phone.test(phone)) {
            newErrors.phone = 'Por favor, ingresa un teléfono válido.';
        }

        setErrorMessages(newErrors);

        const hasErrors = Object.values(newErrors).some(error => error !== '');
        if (hasErrors) {
            const idPorCampo = {
                nombre: 'name',
                last_name: 'lastname',
                phone: 'phone',
                rfc: 'rfc',
                birthDate: 'birthDate',
                gender: 'gender',
            };
            const primero = Object.keys(idPorCampo).find(campo => newErrors[campo]);
            document.getElementById(idPorCampo[primero])?.focus();
            return;
        }

        setLoading(true);
        setIsSaving(true);

        const user_data = {
            nombre: name || "",
            apellido: lastName || "",
            telefono: phone || "",
            rfc: rfc || "",
            f_nacimiento: birthDate || "",
            genero: gender || "",
            email: email || "",
            cognitoid: cognitoid,
            domicilio: placeId || "",
            categoria: "G",
            empleado: empleado || "",
        };

        try {
            const response = await fetch(buildApiUrl('/patchUser'), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/plain, */*',
                },
                body: JSON.stringify(user_data),
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json().catch(() => null);
            console.log('Respuesta del servidor:', data);
            setSuccessMessage("Usuario actualizado correctamente.");
            let updatedUserData = { ...userData };
            updatedUserData.idusuario = idUsuario;
            updatedUserData.cognitoid = cognitoid;
            updatedUserData.nombre = name;
            updatedUserData.apellido = lastName;
            updatedUserData.telefono = phone;
            updatedUserData.genero = gender;
            updatedUserData.f_nacimiento = birthDate;
            updatedUserData.domicilio = placeId;
            updatedUserData.rfc = rfc;
            updatedUserData.email = email;
            updatedUserData.empleado = empleado;
            setStorageValue(`user_${username}`, updatedUserData);
        } catch (error) {
            console.error('Error al actualizar usuario:', error);
            setErrorMessage("Imposible actualizar usuario.");
        } finally {
            setLoading(false);
            setIsSaving(false);
        }
    };

    useEffect(() => {
        if (userData) {
            const formattedBirthDate = userData?.f_nacimiento 
                ? new Date(userData.f_nacimiento).toISOString().split('T')[0] 
                : '';
            setEmail(userData?.email || '');
            setName(userData?.nombre || '');
            setLastName(userData?.apellido || '');
            setPhone(userData?.telefono || '');
            setGender(userData?.genero || '');
            setBirthDate(formattedBirthDate);
            setPlaceId(userData?.domicilio || '');
            setCognitoId(userData?.cognitoid || '');
            setRfc(userData?.rfc || '');
            setEmpleado(userData?.empleado || '');
        }
    }, []);

    return (
        <div className="relative">
            {isSaving && (
                <div
                    role="status"
                    aria-live="polite"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6"
                >
                    <div className="flex flex-col items-center">
                        <FaStarHalfAlt className="animate-spin text-white text-5xl sm:text-6xl" />
                        <p className="text-white mt-4 text-center">Guardando...</p>
                    </div>
                </div>
            )}
            <div className="bg-gradient-to-b min-h-screen from-[rgb(var(--color-bg))] via-[rgb(var(--color-card))] to-[rgb(var(--color-galaxy))] backdrop-blur-md pt-28">
                <form className="space-y-8" onSubmit={patchUserInfo}>
                    <div className="mx-auto max-w-6xl px-3 sm:px-6 pb-16">
                        <div className="rounded-2xl sm:rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]/60 p-3 sm:p-6 shadow-lg">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="text-2xl sm:text-3xl font-bold gradient-text-title">
                                        {t('account.settingsTitle')}
                                    </p>
                                    <p className="mt-1 text-sm text-[rgb(var(--color-text))]/80">
                                        {t('account.settingsSubtitle')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={toggleEdit}
                                    aria-pressed={isEditable}
                                    className={`inline-flex w-full md:w-auto shrink-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow transition ${
                                        isEditable
                                            ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                            : 'bg-[rgb(var(--color-galaxy))] text-[rgb(var(--color-text))]'
                                    }`}
                                >
                                    <MdEdit size={18}/>
                                    {isEditable ? t('account.editDisable') : t('account.editEnable')}
                                </button>
                            </div>
                            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div role="alert" aria-live="polite" className="text-sm empty:hidden">
                                    {errorMessage && <p className="text-red-800 bg-red-50 rounded-md shadow text-center animate-up px-3 py-2">{errorMessage}</p>}
                                    {successMessage && <p className="text-green-800 bg-green-50 rounded-md shadow text-center animate-up px-3 py-2">{successMessage}</p>}
                                </div>
                                <Link
                                    href={dashboardHref}
                                    className="inline-flex w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-4 py-2 text-xs font-semibold text-[rgb(var(--color-text))] shadow hover:bg-[rgb(var(--color-amber))]/20 transition"
                                >
                                    <IoHome className="h-4 w-4 text-[rgb(var(--color-text))]" aria-hidden="true" />
                                    {t('account.backToDashboard')}
                                </Link>
                            </div>
                            <section className="rounded-2xl sm:rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/70 p-4 sm:p-6 shadow-md my-5">
                                <div className="flex flex-col gap-6 md:flex-row md:items-center">
                                    <div className="flex justify-center md:justify-start">
                                        <div className="flex h-28 w-28 sm:h-36 sm:w-36 md:h-40 md:w-40 shrink-0 items-center justify-center bg-[rgb(var(--color-card))] border border-[rgb(var(--color-border))] shadow-lg rounded-full overflow-hidden">
                                            {profilePreview ? (
                                                <img
                                                    src={profilePreview}
                                                    alt="Profile preview"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                userData && !imageError ? (
                                                    <img
                                                        src={`${multimediaSrc}usr/${userData.idusuario}.jpg`}
                                                        alt="profile"
                                                        className="w-full h-full object-cover"
                                                        onError={handleImageError}
                                                    />
                                                ) : (
                                                    <BiSolidUserCircle className="w-16 h-16 sm:w-24 sm:h-24 my-auto animate-up text-[rgb(var(--color-text))]" />
                                                )
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex-1 text-center md:text-left">
                                        <p className="text-lg font-bold text-[rgb(var(--color-text))]">
                                            {t('account.photo')}
                                        </p>
                                        <p className="mt-1 text-sm text-[rgb(var(--color-text))]/80">
                                            {t('account.photoHint')}
                                        </p>
                                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                                            <HeicToJpgUploader
                                                setProfile={setProfile}
                                                setProfileError={setProfileError}
                                                mediaUploading={mediaUploading}
                                                onProfileSelect={() => setProfileSuccess('')}
                                                label={t('account.photoSelect')}
                                                className="inline-flex items-center justify-center gap-2 rounded-full bg-[rgb(var(--color-card-white))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-text))] shadow hover:bg-[rgb(var(--color-amber))]/20 transition"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleSaveImage}
                                                disabled={!profile || mediaUploading}
                                                className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow transition ${
                                                    !profile || mediaUploading
                                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                        : 'bg-amber-400 text-white hover:bg-amber-500'
                                                }`}
                                            >
                                                <MdSave size={18} />
                                                {mediaUploading ? t('account.photoSaving') : t('account.photoSave')}
                                            </button>
                                        </div>
                                        {profile && (
                                            <p className="mt-2 text-xs text-[rgb(var(--color-text))]/80">
                                                {t('account.photoSelected')}{' '}
                                                <span className="font-semibold break-all">{profile.name}</span>
                                            </p>
                                        )}
                                        {profileError && (
                                            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                                                {profileError}
                                            </p>
                                        )}
                                        {profileSuccess && (
                                            <p className="mt-3 text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
                                                {profileSuccess}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-2xl sm:rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/70 p-4 sm:p-6 shadow-md">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-lg font-semibold text-[rgb(var(--color-text))]">
                                        {t('account.info')}
                                    </p>
                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                                        isEditable
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-slate-200 text-slate-600'
                                    }`}>
                                        {isEditable ? t('account.settingsUnlocked') : t('account.settingsLocked')}
                                    </span>
                                </div>
                                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                            <div className="sm:col-span-1">
                                <label htmlFor="name" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.name')}
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="name"
                                        name="Nombre"
                                        type="text"
                                        required
                                        placeholder={t('account.name')}
                                        value={name}
                                        onChange={(e) => { setName(e.target.value); clearFieldError('nombre'); }}
                                        className={inputClass(isEditable, Boolean(errorMessages.nombre))}
                                        aria-invalid={Boolean(errorMessages.nombre)}
                                        aria-describedby={errorMessages.nombre ? "name-error" : undefined}
                                        disabled={!isEditable}
                                    />
                                    <FieldError id="name-error" message={errorMessages.nombre} />
                                </div>
                            </div>
                            <div className="sm:col-span-1">
                                <label htmlFor="lastname" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.lastname')}
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="lastname"
                                        name="Apellido"
                                        type="text"
                                        required
                                        placeholder={t('account.lastname')}
                                        value={lastName}
                                        onChange={(e) => { setLastName(e.target.value); clearFieldError('last_name'); }}
                                        className={inputClass(isEditable, Boolean(errorMessages.last_name))}
                                        aria-invalid={Boolean(errorMessages.last_name)}
                                        aria-describedby={errorMessages.last_name ? "lastname-error" : undefined}
                                        disabled={!isEditable}
                                    />
                                    <FieldError id="lastname-error" message={errorMessages.last_name} />
                                </div>
                            </div>
                            <div className="sm:col-span-1">
                                <label htmlFor="phone" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.phone')}
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="phone"
                                        name="Teléfono"
                                        type="text"
                                        required
                                        placeholder={t('account.phone')}
                                        value={phone}
                                        onChange={(e) => { setPhone(e.target.value); clearFieldError('phone'); }}
                                        className={inputClass(isEditable, Boolean(errorMessages.phone))}
                                        aria-invalid={Boolean(errorMessages.phone)}
                                        aria-describedby={errorMessages.phone ? "phone-error" : undefined}
                                        disabled={!isEditable}
                                    />
                                    <FieldError id="phone-error" message={errorMessages.phone} />
                                </div>
                            </div>
                            <div className="sm:col-span-1">
                                <label htmlFor="rfc" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    RFC
                                </label>
                                <div className="mt-2">
                                    <input
                                        type="text"
                                        name="rfc"
                                        id="rfc"
                                        required
                                        placeholder='RFC'
                                        value={rfc}
                                        onChange={(e) => { setRfc(e.target.value); clearFieldError('rfc'); }}
                                        className={inputClass(isEditable, Boolean(errorMessages.rfc))}
                                        aria-invalid={Boolean(errorMessages.rfc)}
                                        aria-describedby={errorMessages.rfc ? "rfc-error" : undefined}
                                        disabled={!isEditable}
                                    />
                                    <FieldError id="rfc-error" message={errorMessages.rfc} />
                                </div>
                            </div>
                            <div className="sm:col-span-1">
                                <label htmlFor="birthDate" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.birthdate')}
                                </label>
                                <div className="mt-2">
                                    <input type="date" name="birthDate" id="birthDate"
                                        value={birthDate}
                                        onChange={(e) => { setBirthDate(e.target.value); clearFieldError('birthDate'); }}
                                        placeholder={t('account.birthdate')}
                                        className={inputClass(isEditable, Boolean(errorMessages.birthDate))}
                                        aria-invalid={Boolean(errorMessages.birthDate)}
                                        aria-describedby={errorMessages.birthDate ? "birthDate-error" : undefined}
                                        disabled={!isEditable}
                                    />
                                    <FieldError id="birthDate-error" message={errorMessages.birthDate} />
                                </div>
                            </div>
                            <div className="sm:col-span-1">
                                <label htmlFor="gender" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.gener')}
                                </label>
                                <div>
                                    <select
                                        name="gender"
                                        id="gender"
                                        value={gender}
                                        onChange={(e) => { setGender(e.target.value); clearFieldError('gender'); }}
                                        className={`mt-2 ${inputClass(isEditable, Boolean(errorMessages.gender))}`}
                                        aria-invalid={Boolean(errorMessages.gender)}
                                        aria-describedby={errorMessages.gender ? "gender-error" : undefined}
                                        disabled={!isEditable}
                                    >
                                        <option id="gender_0" value="" disabled>{t('account.gener')}</option>
                                        <option id="gender_1" value="M">Masculino</option>
                                        <option id="gender_2" value="F">Femenino</option>
                                        <option id="gender_3" value="O">Otro</option>
                                    </select>
                                    <FieldError id="gender-error" message={errorMessages.gender} />
                                </div>
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="email" className="block font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.mail')}
                                </label>
                                <div className="mt-2">
                                    <input type="text"
                                        name="email"
                                        id="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder={t('account.mail')}
                                        className={inputClass(isEditable, false)}
                                        disabled={!isEditable}
                                    />
                                </div>
                            </div>
                                </div>
                            </section>

                            {isEditable && (
                            <section className="rounded-2xl sm:rounded-3xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/70 p-4 sm:p-6 mt-5 shadow-md">
                                <p className="text-lg font-semibold text-[rgb(var(--color-text))]">
                                    {t('account.address')}
                                </p>
                                <div className="mt-4 relative">
                                    <GooglePlacesAutocomplete
                                        placeId={placeId}
                                        setPlaceId={setPlaceId}
                                    />
                                </div>
                            </section>
                            )}
                        </div>

                        <div className='mt-8 flex items-center justify-center'>
                            <button
                                type="submit"
                                disabled={isLoading || isSaving || !isEditable}
                                title={!isEditable ? t('account.settingsLocked') : undefined}
                                className='w-full sm:w-auto cursor-pointer bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 px-6 py-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 disabled:cursor-not-allowed disabled:opacity-70'
                            >
                                {isLoading ? t('account.btnUpdating') : t('account.btnUpdate')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
