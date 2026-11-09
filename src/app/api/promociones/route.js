/**
 * /api/promociones - Servicios > Promociones y la seccion Promociones del sitio.
 *
 *   GET                          { ahora, promociones }  las vigentes, publico
 *   GET ?panel=1                 { ahora, promociones }  todas, solo admin
 *   POST   multipart datos+foto  crea una promocion            -> { idpromocion }
 *   PUT    multipart datos[+foto] reemplaza una (datos.idpromocion)
 *   PATCH  { idpromocion, activa } la pausa o la reanuda
 *   DELETE ?id=N                 la borra con su foto
 *
 * `datos` es JSON: { titulo, descripcion, inicio, fin (ISO con zona),
 * activa, productos: [{ num_parte, tipo: 'porcentaje'|'precio', valor }] }.
 * La foto se sube a S3 en promocion/<id>/ (promociones-db.js).
 *
 * `ahora` es la hora del servidor: el conteo regresivo del sitio la usa para
 * no depender del reloj del celular de cada cliente.
 */
import { NextResponse } from 'next/server';

import { exigirAdmin } from '@/app/lib/sesion-auth';
import {
    ErrorPromocion,
    borrarPromocion,
    cambiarActiva,
    guardarPromocion,
    leerPromocionesPanel,
    leerPromocionesVigentes,
    revisarFoto,
} from '@/app/lib/promociones-db';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'no-store' };
const SOLO_ADMIN = 'Solo un administrador puede cambiar las promociones.';

const json = (cuerpo, estado = 200) => NextResponse.json(cuerpo, { status: estado, headers: SIN_CACHE });
const sinAcceso = (acceso) => json({ error: acceso.mensaje }, acceso.estado);

const fallo = (error, contexto) => {
    if (error instanceof ErrorPromocion) return json({ error: error.message, detalle: error.detalle }, error.estado);
    console.error(`[promociones] ${contexto}`, error);
    return json({ error: 'No se pudo completar. Intenta de nuevo.' }, 500);
};

const idValido = (valor) => {
    const id = Number(valor);
    return Number.isInteger(id) && id > 0 ? id : null;
};

// multipart: `datos` (JSON) y, opcional, `foto`.
const leerFormulario = async (request) => {
    let formulario;
    try {
        formulario = await request.formData();
    } catch {
        throw new ErrorPromocion(400, 'El formulario llegó incompleto.');
    }
    let datos;
    try {
        datos = JSON.parse(String(formulario.get('datos') || ''));
    } catch {
        throw new ErrorPromocion(400, 'Faltan los datos de la promoción.');
    }
    return { datos, foto: revisarFoto(formulario.get('foto')) };
};

export async function GET(request) {
    const panel = request.nextUrl.searchParams.get('panel') === '1';
    try {
        if (panel) {
            const acceso = await exigirAdmin(request);
            if (!acceso.usuario) return sinAcceso(acceso);
            return json({ ahora: new Date().toISOString(), promociones: await leerPromocionesPanel() });
        }
        return json({ ahora: new Date().toISOString(), promociones: await leerPromocionesVigentes() });
    } catch (error) {
        return fallo(error, 'GET');
    }
}

export async function POST(request) {
    const acceso = await exigirAdmin(request, SOLO_ADMIN);
    if (!acceso.usuario) return sinAcceso(acceso);
    try {
        const { datos, foto } = await leerFormulario(request);
        const idpromocion = await guardarPromocion({ datos, foto, idusuario: acceso.usuario.idusuario });
        return json({ idpromocion }, 201);
    } catch (error) {
        return fallo(error, 'POST');
    }
}

export async function PUT(request) {
    const acceso = await exigirAdmin(request, SOLO_ADMIN);
    if (!acceso.usuario) return sinAcceso(acceso);
    try {
        const { datos, foto } = await leerFormulario(request);
        const idpromocion = idValido(datos?.idpromocion);
        if (!idpromocion) return json({ error: 'Falta la promoción.' }, 400);
        await guardarPromocion({ idpromocion, datos, foto, idusuario: acceso.usuario.idusuario });
        return json({ idpromocion });
    } catch (error) {
        return fallo(error, 'PUT');
    }
}

export async function PATCH(request) {
    const acceso = await exigirAdmin(request, SOLO_ADMIN);
    if (!acceso.usuario) return sinAcceso(acceso);
    try {
        const cuerpo = await request.json().catch(() => null);
        const idpromocion = idValido(cuerpo?.idpromocion);
        if (!idpromocion || typeof cuerpo?.activa !== 'boolean') return json({ error: 'Faltan la promoción o el estado.' }, 400);
        await cambiarActiva({ idpromocion, activa: cuerpo.activa, idusuario: acceso.usuario.idusuario });
        return json({ idpromocion, activa: cuerpo.activa });
    } catch (error) {
        return fallo(error, 'PATCH');
    }
}

export async function DELETE(request) {
    const acceso = await exigirAdmin(request, SOLO_ADMIN);
    if (!acceso.usuario) return sinAcceso(acceso);
    try {
        const idpromocion = idValido(request.nextUrl.searchParams.get('id'));
        if (!idpromocion) return json({ error: 'Falta la promoción.' }, 400);
        await borrarPromocion(idpromocion);
        return json({ idpromocion });
    } catch (error) {
        return fallo(error, 'DELETE');
    }
}
