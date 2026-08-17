import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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

const sanitizeFileName = (name = '') => {
  const cleaned = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._-]/g, '');
  return cleaned || 'imagen.jpg';
};

// Sin prefijo NEXT_PUBLIC_: esta ruta corre en el servidor y no debe exponer
// las llaves. Con el prefijo, Next las incrustaba en el bundle del navegador.
const accessKeyFromEnv = process.env.ACCESS_KEY_S3 || '';
const secretKeyFromEnv = process.env.SECRET_KEY_S3 || '';

// console.log('[upload-product-image] S3 keys loaded?', {
//   accessKey: accessKeyFromEnv ? 'present' : 'missing',
//   secretKey: secretKeyFromEnv ? 'present' : 'missing',
// });

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
    const refaccion = formData.get('refaccion') || 'producto';
    const providedFilename = formData.get('filename');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'INVALID_FILE', message: 'Archivo inválido.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    const filename = sanitizeFileName(providedFilename || file.name || 'imagen.jpg');
    const key = `productos/${refaccion}/${Date.now()}-${filename}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: file.type || 'application/octet-stream',
      })
    );

    return NextResponse.json({ key });
  } catch (error) {
    console.error('UPLOAD_PRODUCT_IMAGE_ERROR', error);
    return NextResponse.json(
      {
        error: 'UPLOAD_FAILED',
        message: error.message || 'No se pudo subir la imagen.',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'MISSING_KEY', message: 'Especifica la llave del objeto a eliminar.' },
        { status: 400 }
      );
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE_PRODUCT_IMAGE_ERROR', error);
    return NextResponse.json(
      {
        error: 'DELETE_FAILED',
        message: error.message || 'No se pudo eliminar la imagen.',
      },
      { status: 500 }
    );
  }
}
