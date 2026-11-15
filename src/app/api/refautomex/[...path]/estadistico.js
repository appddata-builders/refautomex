/**
 * Almacen -> Estadistico: que se vende, cuanto deja y como se compra.
 *
 *   getSalesStatistics          ranking de todo lo vendido, ingreso por mes,
 *                               pares del top 50 y hasta donde llega cada fuente
 *   getProductSalesStatistics   un producto (?parte=) mes a mes y con que sale
 *
 * El SQL esta en estadistico-sql.js. A diferencia de casi todo /api/refautomex
 * pide sesion: son los ingresos de la tienda. Como precios-web.js, la cuenta
 * tiene que ser de un empleado activo cuyo perfil vea el modulo en Permisos de
 * perfil.
 */
import { consultar } from '@/app/lib/refautomex-db';
import { leerPermisos } from '@/app/lib/permisos-menu-db';
import { perfilDeCategoria, puedeVer } from '@/app/lib/permisos-menu';
import { exigirEmpleado } from '@/app/lib/sesion-auth';
import {
  sqlAcompanantes,
  sqlFuentes,
  sqlMensual,
  sqlMeses,
  sqlPares,
  sqlProductoMensual,
  sqlRanking,
} from './estadistico-sql';

const MODULO = 'statistics';

const error = (estado, mensaje) => ({ estado, cuerpo: { error: mensaje, details: mensaje } });

const acceso = async (request) => {
  const sesion = await exigirEmpleado(request);
  if (!sesion.usuario) return error(sesion.estado, sesion.mensaje);
  const permisos = await leerPermisos();
  if (!puedeVer(permisos, MODULO, perfilDeCategoria(sesion.usuario.categoria))) {
    return error(403, 'Tu perfil no tiene acceso a Estadístico.');
  }
  return null;
};

// historial_venta la crea scripts/db-historial.mjs; sin ella solo cuenta `venta`.
const hayHistorial = async () =>
  (await consultar("SELECT to_regclass('historial_venta') IS NOT NULL AS si"))[0].si;

const getSalesStatistics = async ({ request }) => {
  const negado = await acceso(request);
  if (negado) return negado;

  const historial = await hayHistorial();
  const [productos, mensual, meses, pares, [fuentes]] = await Promise.all([
    consultar(sqlRanking(historial)),
    consultar(sqlMensual(historial)),
    consultar(sqlMeses(historial)),
    consultar(sqlPares(historial)),
    consultar(sqlFuentes(historial)),
  ]);

  return {
    cuerpo: {
      historial,
      fuentes,
      // Los 24 meses con ventas que compara la tendencia: n 1-12 los recientes.
      meses,
      mensual,
      productos,
      pares,
    },
  };
};

const getProductSalesStatistics = async ({ request, query }) => {
  const negado = await acceso(request);
  if (negado) return negado;

  const parte = String(query.get('parte') ?? '').trim();
  if (!parte) return error(400, 'Falta el número de parte.');

  const historial = await hayHistorial();
  const [mensual, acompanantes] = await Promise.all([
    consultar(sqlProductoMensual(historial), [parte]),
    consultar(sqlAcompanantes(historial), [parte, parte]),
  ]);
  return { cuerpo: { parte, mensual, acompanantes } };
};

export const ESTADISTICO = {
  GET: {
    getSalesStatistics,
    getProductSalesStatistics,
  },
};
