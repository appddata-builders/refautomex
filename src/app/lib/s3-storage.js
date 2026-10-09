import { S3Client } from '@aws-sdk/client-s3';

const urlBase = process.env.NEXT_PUBLIC_S3 || '';

const partirUrlBase = () => {
  try {
    const { hostname, pathname } = new URL(urlBase);
    return { bucket: hostname.split('.')[0], prefijo: pathname };
  } catch {
    return { bucket: '', prefijo: '' };
  }
};

const { bucket: bucketDeUrl, prefijo: prefijoDeUrl } = partirUrlBase();

export const bucketName =
  process.env.S3_BUCKET || process.env.NEXT_PUBLIC_S3_BUCKET || bucketDeUrl || 'refautomex';

export const storagePrefix = (() => {
  const crudo = process.env.S3_PREFIX ?? prefijoDeUrl;
  const limpio = String(crudo || '').replace(/^\/+/, '').replace(/\/+$/, '');
  return limpio ? `${limpio}/` : '';
})();

export const claveDeObjeto = (relativa) => {
  const limpia = String(relativa || '').replace(/^\/+/, '');
  return limpia.startsWith(storagePrefix) ? limpia : `${storagePrefix}${limpia}`;
};

export const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_S3 || '',
    secretAccessKey: process.env.SECRET_KEY_S3 || '',
  },
});
