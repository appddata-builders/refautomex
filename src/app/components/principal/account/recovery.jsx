import { useState, useEffect } from 'react';
import { CognitoUser } from 'amazon-cognito-identity-js';
import { userPool } from '@/app/lib/cognito-manager';
import RefautomexLogo from "@/app/components/refautomex-logo";
import { AiFillEye } from 'react-icons/ai';
import { useTranslation } from '@/app/lib/text/text-provider';
import { useRouter, useSearchParams } from 'next/navigation';

export default function Recovery() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const lang = searchParams.get('lang') || 'es';
    const { i18n, t } = useTranslation();
    const [email, setEmail] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [verifyNewPassword, setVerifyNewPassword] = useState('');
    const [step, setStep] = useState(1);
    const [alertMessage, setAlertMessage] = useState(null);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [isValid, setIsValid] = useState({
        minLength: false,
        hasNumber: false,
        hasSpecialChar: false,
        hasUppercase: false,
        hasLowercase: false,
        isSame: false,
    });

    const handleSendCode = async () => {
        const cognitoUser = new CognitoUser({
            Username: email,
            Pool: userPool,
        });

        cognitoUser.forgotPassword({
            onSuccess: (data) => {
                console.log('Code sent:', data);
                setStep(2);
            },
            onFailure: (err) => {
                console.error(err);
                setAlertMessage(err.message || JSON.stringify(err));
            },
        });
    };

    const handleResetPassword = () => {
        if (newPassword !== verifyNewPassword) {
            setAlertMessage(t('password.match'));
            return;
        }

        const cognitoUser = new CognitoUser({
            Username: email,
            Pool: userPool,
        });

        cognitoUser.confirmPassword(verificationCode, newPassword, {
            onSuccess: () => {
                console.log('Password confirmed');
                setAlertMessage(null);
                setStep(3);
            },
            onFailure: (err) => {
                console.error(err);
                setAlertMessage(err.message || JSON.stringify(err));
            },
        });
    };

    const validatePassword = (password, verifyPassword) => {
        setIsValid({
            minLength: password.length >= 8,
            hasNumber: /\d/.test(password),
            hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password),
            hasUppercase: /[A-Z]/.test(password),
            hasLowercase: /[a-z]/.test(password),
            isSame: password === verifyPassword,
        });
    };

    useEffect(() => {
        if (i18n.language !== lang) {
            i18n.changeLanguage(lang);
        }
    }, [lang, i18n]);

    return (
        <div className="relative mx-auto w-full md:w-[500px] bg-[rgb(var(--color-card))]/50 md:rounded-xl shadow shadow-[rgb(var(--color-text))]/10 p-6">
            <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
                <div className="sm:mx-auto sm:w-full sm:max-w-sm">
                    <RefautomexLogo classAttr={"h-24 md:h-32 w-auto object-contain p-2 md:p-3 mx-auto"} />
                    <h2 className="text-center text-2xl leading-9 tracking-tight text-[rgb(var(--color-text))] text-shadow">
                        {t('account.recovery')}
                    </h2>
                </div>
                <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
                    {step === 1 && (
                        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSendCode(); }}>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.mail')}
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        placeholder={t('account.mail')}
                                        required
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-1 justify-center items-center">
                                <button type="submit" className="bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer font-bold">
                                    {t('account.code')}
                                </button>
                            </div>
                        </form>
                    )}
                    {step === 2 && (
                        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleResetPassword(); }}>
                            <div>
                                <label htmlFor="verificationCode" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.verifyCode')}
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="verificationCode"
                                        name="verificationCode"
                                        placeholder={t('account.verifyCode')}
                                        type="text"
                                        required
                                        onChange={(e) => setVerificationCode(e.target.value)}
                                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="newPassword" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.new')}
                                </label>
                                <div className="mt-2 relative">
                                    <input
                                        id="newPassword"
                                        name="newPassword"
                                        placeholder={t('account.new')}
                                        type={passwordVisible ? "text" : "password"}
                                        required
                                        onChange={(e) => {
                                            setNewPassword(e.target.value);
                                            validatePassword(e.target.value, verifyNewPassword);
                                        }}
                                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                    <div 
                                        className='absolute right-0 top-0 bg-blue-300 cursor-pointer m-1.5 p-1 rounded-full shadow-xl'
                                        onClick={() => setPasswordVisible(!passwordVisible)}>
                                        <AiFillEye />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="verifyNewPassword" className="block text-sm font-medium leading-6 text-[rgb(var(--color-text))]">
                                    {t('account.verifyNew')}
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="verifyNewPassword"
                                        name="verifyNewPassword"
                                        placeholder={t('account.verifyNew')}
                                        type={passwordVisible ? "text" : "password"}
                                        required
                                        onChange={(e) => {
                                            setVerifyNewPassword(e.target.value);
                                            validatePassword(newPassword, e.target.value);
                                        }}
                                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                </div>
                            </div>
                            <div className={`grid grid-cols-2 p-2 leading-3 text-xs mt-1.5 opacity-40 shadow bg-[rgb(var(--color-gray))] rounded-md ${newPassword && verifyNewPassword ? '' : 'hidden'}`}>
                                <p className={isValid.minLength ? 'text-green-500' : 'text-red-400'}>
                                    - {isValid.minLength ? t('password.minLengthOk') : t('password.minLength')}
                                </p>
                                <p className={isValid.hasNumber ? 'text-green-500' : 'text-red-400'}>
                                    - {isValid.hasNumber ? t('password.numberOk') : t('password.number')}
                                </p>
                                <p className={isValid.hasSpecialChar ? 'text-green-500' : 'text-red-400'}>
                                    - {isValid.hasSpecialChar ? t('password.specialOk') : t('password.special')}
                                </p>
                                <p className={isValid.hasUppercase ? 'text-green-500' : 'text-red-400'}>
                                    - {isValid.hasUppercase ? t('password.upperOk') : t('password.upper')}
                                </p>
                                <p className={isValid.hasLowercase ? 'text-green-500' : 'text-red-400'}>
                                    - {isValid.hasLowercase ? t('password.lowerOk') : t('password.lower')}
                                </p>
                                <p className={isValid.isSame ? 'text-green-500' : 'text-red-400'}>
                                    - {isValid.isSame ? t('password.matchOk') : t('password.match')}
                                </p>
                            </div>
                            <div className="flex flex-1 justify-center items-center">
                                <button type="submit" className="bg-gradient-to-bl hover:bg-gradient-to-tr from-amber-500 via-yellow-400 to-slate-300 shadow text-slate-900 p-3 rounded-full mt-3 transition-all duration-500 ease-in-out hover:scale-105 cursor-pointer font-bold">
                                    {t('account.btnChange')}
                                </button>
                            </div>
                        </form>
                    )}
                    {step === 3 && (
                        <div className="text-center text-green-500">
                            <p>{t('account.change')}</p>
                        </div>
                    )}
                    {alertMessage && (
                        <div className="text-center text-red-500 mt-4">
                            <p>{alertMessage}</p>
                        </div>
                    )}
                    <p className="mt-5 text-center text-sm text-[rgb(var(--color-text))]">
                        {t('account.haveAccount')}{' '}
                        <a href="/section/account?load=login" className="font-semibold leading-6 text-[rgb(var(--color-refautomex))] text-shadow">
                            {t('account.login')}
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
