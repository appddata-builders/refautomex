import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const resolveBucketName = () => {
  if (process.env.S3_BUCKET) return process.env.S3_BUCKET;
  if (process.env.NEXT_PUBLIC_S3_BUCKET) return process.env.NEXT_PUBLIC_S3_BUCKET;
  const baseUrl = process.env.NEXT_PUBLIC_S3;
  if (baseUrl) {
    try {
      const host = new URL(baseUrl).hostname;
      return host.split('.')[0];
    } catch {
      return 'refautomex';
    }
  }
  return 'refautomex';
};

const normalizeUserId = (value) => {
  const cleaned = String(value || '').replace(/[^0-9]/g, '');
  return cleaned || '';
};

// Sin prefijo NEXT_PUBLIC_: esta ruta corre en el servidor y no debe exponer
// las llaves. Con el prefijo, Next las incrustaba en el bundle del navegador.
const accessKeyFromEnv = process.env.ACCESS_KEY_S3 || '';
const secretKeyFromEnv = process.env.SECRET_KEY_S3 || '';

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: accessKeyFromEnv,
    secretAccessKey: secretKeyFromEnv,
  },
});

const bucketName = resolveBucketName();

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const userId = normalizeUserId(formData.get('userId'));

    if (!userId) {
      return NextResponse.json(
        { error: 'MISSING_USER_ID', message: 'Falta el identificador del usuario.' },
        { status: 400 }
      );
    }

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'INVALID_FILE', message: 'Archivo inválido.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    const key = `usr/${userId}.jpg`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: file.type || 'application/octet-stream',
        CacheControl: 'no-cache',
      })
    );

    return NextResponse.json({ key });
  } catch (error) {
    console.error('UPLOAD_USER_IMAGE_ERROR', error);
    return NextResponse.json(
      {
        error: 'UPLOAD_FAILED',
        message: error.message || 'No se pudo subir la imagen.',
      },
      { status: 500 }
    );
  }
}
