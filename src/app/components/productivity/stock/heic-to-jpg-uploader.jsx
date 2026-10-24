import React, { useRef } from 'react';
import heic2any from 'heic2any';
import { FaImage } from 'react-icons/fa6';
import { useTranslation } from '@/app/lib/text/text-provider';

const HeicToJpgUploader = ({
    setProfile,
    setProfileError,
    mediaUploading,
    onProfileSelect,
    label,
    className = '',
    iconClassName = '',
}) => {
    const { t } = useTranslation();
    const fileInputRef = useRef();
    const buttonLabel = label ?? t('account.photoSelect');

    const triggerUpload = () => {
        if (mediaUploading) return;
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleProfileUpload = async (e) => {
        const file = e.target.files[0];
        const updateProfile = (nextFile) => {
            setProfile(nextFile);
            setProfileError('');
            if (onProfileSelect) {
                onProfileSelect(nextFile);
            }
        };

        if (file && file.type.startsWith('image/')) {
            try {
                if (file.type === 'image/heic' || file.type === 'image/heif') {
                    const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg' });
                    const jpgFile = new File([convertedBlob], `${file.name.split('.')[0]}.jpg`, { type: 'image/jpeg' });
                    updateProfile(jpgFile);
                } else if (file.type !== 'image/jpeg') {
                    // Ensure proper conversion for non-JPG images
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            canvas.toBlob((blob) => {
                                const jpgFile = new File([blob], `${file.name.split('.')[0]}.jpg`, { type: 'image/jpeg' });
                                updateProfile(jpgFile);
                            }, 'image/jpeg');
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                } else {
                    updateProfile(file);
                }
            } catch (error) {
                setProfileError(t('panel.uploader.convertError'));
            }
        } else {
            setProfileError(t('panel.uploader.pickImage'));
        }
    };
    

    return (
        <div>
            <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleProfileUpload}
                disabled={mediaUploading}
            />
            <button
                type="button"
                onClick={triggerUpload}
                disabled={mediaUploading}
                className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow transition ${
                    mediaUploading ? 'opacity-60 cursor-not-allowed' : 'hover:scale-[1.02]'
                } ${className}`}
            >
                <FaImage className={`text-stone-600 ${iconClassName}`} />
                <span>{buttonLabel}</span>
            </button>
        </div>
    );
};

export default HeicToJpgUploader;
