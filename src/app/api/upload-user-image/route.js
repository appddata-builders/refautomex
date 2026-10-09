import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';

import { bucketName, claveDeObjeto, s3Client } from '@/app/lib/s3-storage';

const normalizeUserId = (value) => {
  const cleaned = String(value || '').replace(/[^0-9]/g, '');
  return cleaned || '';
};

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

    // El avatar se lee como `${NEXT_PUBLIC_S3}usr/<id>.jpg`, asi que la llave
    // relativa es esa y el objeto vive bajo el prefijo del bucket.
    const key = `usr/${userId}.jpg`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: claveDeObjeto(key),
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
