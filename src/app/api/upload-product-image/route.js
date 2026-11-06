import { NextResponse } from 'next/server';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

import { bucketName, claveDeObjeto, s3Client } from '@/app/lib/s3-storage';

const sanitizeFileName = (name = '') => {
  const cleaned = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._-]/g, '');
  return cleaned || 'imagen.jpg';
};

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

    // `key` es lo que se guarda en la base y lo que el front pega despues de
    // NEXT_PUBLIC_S3: relativa. El objeto en S3 va con el prefijo del bucket.
    const key = `productos/${refaccion}/${Date.now()}-${filename}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: claveDeObjeto(key),
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
        // Llega la llave relativa que guarda la base; claveDeObjeto tolera que
        // venga ya con prefijo, asi que ambas formas borran el objeto correcto.
        Key: claveDeObjeto(key),
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
