/**
 * Avisos de la campana del panel (notification-bell.jsx). Solo servidor.
 *
 * No son un historial de eventos: cada aviso resume algo que hoy pide atencion
 * ("Pedidos vencidos: 2") y desaparece solo cuando deja de ser cierto. Por eso
 * se calculan en cada consulta desde las tablas de siempre, sin tocar los
 * endpoints que venden o capturan, y hay un renglon por tipo, nunca uno por
 * registro: con 1,200 refacciones sin existencia, uno por registro ahogaria
 * todo lo demas.
 *
 * Quien ve que: solo avisos de modulos que su perfil tiene en Permisos de
 * perfil, y un empleado solo los de su sucursal.
 *
 * `firma` resume el contenido de un aviso. La campana lo cuenta como nuevo
 * mientras la firma no coincida con la que ese usuario ya vio (`aviso_visto`):
 * si entra otro pedido vencido, cambia la firma y vuelve a contar.
 */
import { createHash } from 'node:crypto';

import { consultar, escribir } from '@/app/lib/refautomex-db';
import { perfilDeCategoria, puedeVer } from '@/app/lib/permisos-menu';

const ZONA = 'America/Mexico_City';
const DIA_MS = 86_400_000;
const MAX_NOMBRES = 3;

const NIVELES = { alta: 0, media: 1, info: 2 };

export const CLAVES = [
  'pedidosVencidos', 'pedidosProximos', 'agotadosHoy', 'webPorEnviar',
  'facturasPorEmitir', 'pagosProveedor', 'cuentasNuevas',
  'cumpleHoy', 'cumpleManana', 'miCumple',
];

// "Hoy" es el de la tienda, no el del servidor: el contenedor corre en UTC y a
// las 7 pm de CDMX ya seria el dia siguiente. Mexico no tiene horario de
// verano desde 2022, asi que sumar dias en milisegundos no se desfasa.
export const fechaTienda = (dias = 0, ahora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ahora.getTime() + dias * DIA_MS));

const firmar = (partes) => createHash('sha1').update(partes.join('|')).digest('hex').slice(0, 16);

// `cumple` viene como 'MM-DD'. Quien nacio un 29 de febrero lo festeja el 28
// en los anios que no son bisiestos.
export const cumpleEn = (cumple, fecha) => {
  if (!cumple) return false;
  const anio = Number(fecha.slice(0, 4));
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
  return (cumple === '02-29' && !bisiesto ? '02-28' : cumple) === fecha.slice(5);
};

const nombreCorto = (f) => [f.nombre, String(f.apellido || '').split(' ')[0]].filter(Boolean).join(' ');

const listaNombres = (filas) => ({
  nombres: filas.slice(0, MAX_NOMBRES).map(nombreCorto),
  extra: Math.max(0, filas.length - MAX_NOMBRES),
});

/**
 * Avisos de `usuario` (fila de usuario con nombre, categoria, idsucursal y
 * cumple) segun `permisos` y lo que ya vio (`vistos`: { clave: firma }).
 * `ahora` solo se pasa para probar otra fecha.
 */
export const calcularAvisos = async (usuario, permisos, vistos = {}, ahora = new Date()) => {
  const perfil = perfilDeCategoria(usuario.categoria);
  const ve = (modulo) => puedeVer(permisos, modulo, perfil);
  // Admin ve todas las sucursales. Un empleado sin sucursal no ve avisos de
  // sucursal: -1 no coincide con ninguna.
  const sucursal = perfil === 'admin' ? null : Number(usuario.idsucursal) || -1;
  const hoy = fechaTienda(0, ahora);
  const manana = fechaTienda(1, ahora);
  const avisos = [];

  if (ve('site')) {
    // Misma regla que En Sucursal: el pedido es de la sucursal de quien lo vendio.
    const pedidos = await consultar(
      `SELECT p.idpedido, CASE WHEN p.f_entrega < ?::date THEN 'vencido'
                               WHEN p.f_entrega = ?::date THEN 'hoy' ELSE 'manana' END AS cuando
         FROM pedidos p
         JOIN venta v ON p.idventa = v."idVenta"::text
         LEFT JOIN usuario u ON u.idusuario = v.idusuario
        WHERE v.folio LIKE 'T%' AND p.status = 'P' AND p.f_entrega <= ?::date
          AND (?::int IS NULL OR u.idsucursal = ?::int)
        ORDER BY p.idpedido`,
      [hoy, hoy, manana, sucursal, sucursal]
    );
    const vencidos = pedidos.filter((p) => p.cuando === 'vencido');
    const proximos = pedidos.filter((p) => p.cuando !== 'vencido');
    if (vencidos.length) {
      avisos.push({
        clave: 'pedidosVencidos', nivel: 'alta', modulo: 'site',
        datos: { n: vencidos.length },
        firma: firmar(vencidos.map((p) => p.idpedido)),
      });
    }
    if (proximos.length) {
      const deHoy = proximos.filter((p) => p.cuando === 'hoy').length;
      avisos.push({
        clave: 'pedidosProximos', nivel: 'media', modulo: 'site',
        datos: { n: proximos.length, hoy: deHoy, manana: proximos.length - deHoy },
        firma: firmar(proximos.map((p) => `${p.idpedido}:${p.cuando}`)),
      });
    }
  }

  if (ve('missing')) {
    // Lo que se vendio hoy y dejo la existencia en cero. Los renglones de
    // pedido no descuentan almacen, asi que no cuentan.
    const agotados = await consultar(
      `SELECT DISTINCT c.num_parte
         FROM venta v
         JOIN concepto c ON c.idventa = v."idVenta"::text AND c.pedido = 'E'
         JOIN detalle d ON d.num_parte = c.num_parte AND d.idsucursal = v.idsucursal
        WHERE v.fecha_venta = ?::date AND v.status = 'A' AND d.existencia <= 0
          AND (?::int IS NULL OR v.idsucursal = ?::int)
        ORDER BY c.num_parte`,
      [hoy, sucursal, sucursal]
    );
    if (agotados.length) {
      avisos.push({
        clave: 'agotadosHoy', nivel: 'media', modulo: 'missing',
        datos: { n: agotados.length },
        firma: firmar([hoy, ...agotados.map((a) => a.num_parte)]),
      });
    }
  }

  if (ve('delivery')) {
    const web = await consultar(
      `SELECT "idVenta" AS id FROM venta WHERE folio LIKE 'W%' AND tracking_web = 'P' ORDER BY 1`
    );
    if (web.length) {
      avisos.push({
        clave: 'webPorEnviar', nivel: 'media', modulo: 'delivery',
        datos: { n: web.length }, firma: firmar(web.map((w) => w.id)),
      });
    }
  }

  if (ve('invoice')) {
    const facturas = await consultar(`SELECT idfactura AS id FROM factura WHERE emitida = 'P' ORDER BY 1`);
    if (facturas.length) {
      avisos.push({
        clave: 'facturasPorEmitir', nivel: 'media', modulo: 'invoice',
        datos: { n: facturas.length }, firma: firmar(facturas.map((f) => f.id)),
      });
    }
  }

  if (ve('capture')) {
    // Solo lo que vence en los proximos 7 dias: una compra nunca deja el
    // estado 'P' (no hay como marcarla pagada), asi que "vencidas" serian
    // todas las viejas y el aviso no se iria nunca.
    const pagos = await consultar(
      `SELECT idcompra AS id, fecha_pago = ?::date AS hoy
         FROM compra
        WHERE status = 'P' AND fecha_pago BETWEEN ?::date AND ?::date + 7
        ORDER BY 1`,
      [hoy, hoy, hoy]
    );
    if (pagos.length) {
      avisos.push({
        clave: 'pagosProveedor', nivel: pagos.some((p) => p.hoy) ? 'alta' : 'media', modulo: 'capture',
        datos: { n: pagos.length, hoy: pagos.filter((p) => p.hoy).length },
        firma: firmar([hoy, ...pagos.map((p) => p.id)]),
      });
    }
  }

  if (perfil === 'admin' && ve('personal')) {
    // `usuario` no tiene fecha de alta: "nueva" es la que tiene un id mayor al
    // ultimo que este admin vio. Al verla desaparece; si es un cliente de la
    // tienda en linea no hay nada que hacer y no debe quedarse para siempre.
    const ultimoVisto = Number(vistos.cuentasNuevas) || 0;
    const nuevas = await consultar(
      `SELECT idusuario, nombre, apellido FROM usuario
        WHERE empleado = 0 AND idusuario > ? ORDER BY idusuario`,
      [ultimoVisto]
    );
    if (nuevas.length) {
      avisos.push({
        clave: 'cuentasNuevas', nivel: 'info', modulo: 'personal',
        datos: { n: nuevas.length, ...listaNombres(nuevas) },
        firma: String(nuevas[nuevas.length - 1].idusuario),
      });
    }
  }

  if (cumpleEn(usuario.cumple, hoy)) {
    avisos.push({
      clave: 'miCumple', nivel: 'info', modulo: null,
      datos: { nombre: usuario.nombre }, firma: hoy,
    });
  }

  if (perfil === 'admin') {
    // Al admin se le recuerda un dia antes y el mismo dia; el empleado solo
    // recibe su felicitacion (miCumple).
    const companeros = await consultar(
      `SELECT idusuario, nombre, apellido, to_char(f_nacimiento, 'MM-DD') AS cumple
         FROM usuario
        WHERE empleado = 1 AND f_nacimiento IS NOT NULL AND idusuario <> ?
        ORDER BY nombre`,
      [usuario.idusuario]
    );
    for (const [clave, fecha] of [['cumpleHoy', hoy], ['cumpleManana', manana]]) {
      const festejados = companeros.filter((c) => cumpleEn(c.cumple, fecha));
      if (festejados.length) {
        avisos.push({
          clave, nivel: 'info', modulo: null,
          datos: { n: festejados.length, ...listaNombres(festejados) },
          firma: firmar([fecha, ...festejados.map((c) => c.idusuario)]),
        });
      }
    }
  }

  return avisos.sort((a, b) => NIVELES[a.nivel] - NIVELES[b.nivel]);
};

// ------------------------------------------------------------ aviso_visto ---

// Mismo trato que permiso_menu: se crea al guardar por primera vez y tiene que
// ser identica a `aviso_visto` en lib/db/schema.pg.js. La llave es
// "<idusuario>:<clave>" porque el respaldo CSV solo maneja llaves de una
// columna.
const CREAR_TABLA = `
  CREATE TABLE IF NOT EXISTS aviso_visto (
    id varchar(80) PRIMARY KEY NOT NULL,
    idusuario integer NOT NULL,
    clave varchar(45) NOT NULL,
    firma varchar(64) NOT NULL
  )`;

/** { clave: firma } de lo que `idusuario` ya vio. */
export const leerVistos = async (idusuario) => {
  try {
    const filas = await consultar('SELECT clave, firma FROM aviso_visto WHERE idusuario = ?', [idusuario]);
    return Object.fromEntries(filas.map((f) => [f.clave, f.firma]));
  } catch (error) {
    if (error?.code === '42P01') return {};
    throw error;
  }
};

export const marcarVistos = async (idusuario, vistos) => {
  const validos = vistos.filter(({ clave, firma }) =>
    CLAVES.includes(clave) && typeof firma === 'string' && firma.length > 0 && firma.length <= 64
  );
  if (!validos.length) return 0;
  await escribir(CREAR_TABLA);
  for (const { clave, firma } of validos) {
    await escribir(
      `INSERT INTO aviso_visto (id, idusuario, clave, firma) VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET firma = EXCLUDED.firma`,
      [`${idusuario}:${clave}`, idusuario, clave, firma]
    );
  }
  return validos.length;
};
