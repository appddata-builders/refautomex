// Limpieza del catalogo de productos: descripciones sin abreviaturas, grupo,
// marca de auto y modelo inicial y final, deducidos de la descripcion.
//
//   node scripts/db-catalogo.mjs                 solo lee y escribe la propuesta en CSV
//   node scripts/db-catalogo.mjs --aplicar       guarda respaldo y aplica
//   node scripts/db-catalogo.mjs --revertir      regresa todo como estaba antes de --aplicar
//   ... --reporte <archivo.csv>                  donde escribir la propuesta
//
// Por que: las descripciones vienen del sistema anterior, que las cortaba a 30
// caracteres ("TERMINAL DIR.CHEVY P.UP EMB.IM"); 5,730 productos no tienen
// grupo (y el sitio los agrupa por el); la marca de los 5,744 dice VOLKSWAGEN
// porque el sistema anterior le ponia a todo el auto 1 (VENTO), y casi ninguno
// tiene modelo inicial y final.
//
// Solo se escribe lo que se puede afirmar. Lo que no se deduce se deja vacio:
//   - Descripcion: se expanden las abreviaturas que significan lo mismo en
//     cualquier refaccion (NAL., IMP., IZQ., JGO, STD, M/N...) y las que
//     dependen del contexto solo en el (VEL despues de CAJA o PALANCA es
//     VELOCIDADES; C/A es "con aire acondicionado" solo en radiadores, bandas,
//     poleas...; en una balata S/A puede ser "sin asbesto"). Los adjetivos
//     concuerdan con la pieza: CALAVERA TRAS. IZQ. -> CALAVERA TRASERA IZQUIERDA.
//     Si la descripcion pasa de 100 caracteres (el largo de la columna) se queda.
//   - Grupo: por la pieza (BALATA -> Brakes, FARO -> Collision...), solo a los
//     que no tienen.
//   - Marca: por los autos que nombra (TSURU -> NISSAN, CHEVY -> CHEVROLET...).
//     Si nombra autos de varias marcas, TODAS; si no nombra ninguno, vacia.
//     Solo se toca la marca de los productos que traen la de la migracion
//     (VOLKSWAGEN sin modelo capturado): la de uno dado de alta a mano se respeta.
//   - Modelo inicial y final: de rangos de anios en la descripcion (93-99,
//     79/84, 2010-2012), solo a los que no tienen.
//
// --aplicar guarda antes los valores de cada producto que cambia en
// respaldo_catalogo.producto (fuera de `public`: ni push ni los respaldos lo
// ven). --revertir los regresa y borra ese esquema.
//
// Conexion: DATABASE_URL_UNPOOLED o DATABASE_URL (.env.local), como los demas
// scripts db:*. Contra produccion es por el tunel (npm run db:tunnel).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import nextEnv from '@next/env';
import pg from 'pg';
import { requirePgDatabaseUrl } from '../src/app/lib/db/runtime-driver.mjs';

nextEnv.loadEnvConfig(process.cwd());

const argumento = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? null : process.argv[i + 1];
};
const APLICAR = process.argv.includes('--aplicar');
const REVERTIR = process.argv.includes('--revertir');
const REPORTE = resolve(argumento('--reporte') || '.db-local/catalogo-propuesta.csv');
const RESPALDO = 'respaldo_catalogo';
const LARGO_MAXIMO = 100;
const ANIO_ACTUAL = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Genero y numero de la pieza, para que los adjetivos concuerden
// ---------------------------------------------------------------------------

const FEMENINOS = new Set(['BASE', 'LLAVE', 'CLAVE', 'PIEL', 'LUZ', 'LUCES', 'TERMINAL', 'CRUZ', 'TORRE', 'FUENTE', 'PARED']);
const MASCULINOS_EN_A = new Set(['DIA', 'MAPA', 'SISTEMA', 'CLIMA', 'PROGRAMA', 'TEMA', 'PROBLEMA', 'DIAGRAMA', 'EMBLEMA']);
const SINGULARES_EN_S = new Set(['ARNES', 'GAS', 'MES', 'INTERES', 'BUS', 'TRES', 'DOS', 'SEIS']);

const generoDe = (palabra) => {
  const plural = !SINGULARES_EN_S.has(palabra) && (/(AS|OS)$/.test(palabra) || (/ES$/.test(palabra) && palabra.length > 4));
  const base = plural ? palabra.replace(/(ES|S)$/, '') : palabra;
  const femenino = FEMENINOS.has(palabra) || FEMENINOS.has(base)
    || (/A$/.test(base) && !MASCULINOS_EN_A.has(base))
    || /(AS)$/.test(palabra)
    || /(ION|DAD|TUD)$/.test(base);
  return { femenino, plural };
};

// IZQUIERDO -> IZQUIERDA / IZQUIERDOS / IZQUIERDAS
const concordar = (masculino, { femenino, plural }) => {
  const forma = femenino ? masculino.replace(/O$/, 'A') : masculino;
  return plural ? `${forma}S` : forma;
};

// ---------------------------------------------------------------------------
// Abreviaturas
// ---------------------------------------------------------------------------

// `{ g: 'X' }` concuerda con el sustantivo anterior (CALAVERA TRASERA, GOMA
// RUEDA TRASERA); `{ g: 'X', producto: true }`, con la pieza que se vende, la
// primera palabra (BULBO TEMPERATURA ... IMPORTADO: el importado es el bulbo).
// Un texto se usa tal cual.
const g = (masculino) => ({ g: masculino });
const deProducto = (masculino) => ({ g: masculino, producto: true });

const ABREVIATURAS = {
  NAL: 'NACIONAL', 'NAL.': 'NACIONAL',
  IMP: deProducto('IMPORTADO'), 'IMP.': deProducto('IMPORTADO'), IMPO: deProducto('IMPORTADO'), 'IMPO.': deProducto('IMPORTADO'),
  ORG: 'ORIGINAL', 'ORG.': 'ORIGINAL', ORIG: 'ORIGINAL', 'ORIG.': 'ORIGINAL', ORI: 'ORIGINAL', 'ORI.': 'ORIGINAL',
  // El lado es de la pieza que se vende: CODO ... ADMISION DERECHO.
  IZQ: deProducto('IZQUIERDO'), 'IZQ.': deProducto('IZQUIERDO'), 'IZ.': deProducto('IZQUIERDO'),
  DER: deProducto('DERECHO'), 'DER.': deProducto('DERECHO'),
  'DEL.': g('DELANTERO'), 'DELAN.': g('DELANTERO'), 'DELANT.': g('DELANTERO'),
  TRAS: g('TRASERO'), 'TRAS.': g('TRASERO'), 'TRA.': g('TRASERO'),
  SUP: 'SUPERIOR', 'SUP.': 'SUPERIOR', INF: 'INFERIOR', 'INF.': 'INFERIOR',
  'LAT.': 'LATERAL', 'LATER.': 'LATERAL', 'EXT.': 'EXTERIOR', 'INT.': 'INTERIOR',
  JGO: 'JUEGO', 'JGO.': 'JUEGO', STD: 'ESTANDAR', 'STD.': 'ESTANDAR',
  'ADM.': 'ADMISION', 'ADMIS.': 'ADMISION', 'ESC.': 'ESCAPE',
  'SUSP.': 'SUSPENSION', 'SUS.': 'SUSPENSION', SUSPENCION: 'SUSPENSION',
  'ESTAB.': 'ESTABILIZADORA', 'AMORT.': 'AMORTIGUADOR', 'ALTER.': 'ALTERNADOR',
  'MOT.': 'MOTOR', GDE: 'GRANDE', 'GDE.': 'GRANDE', 'FRE.': 'FRENO', 'FREN.': 'FRENO', 'FRON.': 'FRONTAL',
  'PAL.': 'PALANCA', 'PALA.': 'PALANCA', 'PALAN.': 'PALANCA',
  'HID.': g('HIDRAULICO'), 'HIDR.': g('HIDRAULICO'), HIDRAUL: g('HIDRAULICO'),
  'CALAV.': 'CALAVERA', 'CUAR.': 'CUARTO', 'CUA.': 'CUARTO', CUART: 'CUARTO', CUART0: 'CUARTO',
  'SALP.': 'SALPICADERA', 'SALPIC.': 'SALPICADERA', 'MANG.': 'MANGUERA', 'MOTOV.': 'MOTOVENTILADOR',
  RADIAD: 'RADIADOR', DIRECC: 'DIRECCION', DIRECION: 'DIRECCION', VELOCID: 'VELOCIDADES', DISTRIB: 'DISTRIBUCION',
  CIGUENAL: 'CIGUEÑAL', JUTA: 'JUNTA', BALAT: 'BALATA', 'CLUT.': 'CLUTCH', PLATNA: 'PLATINA', 'POINTE.': 'POINTER',
  'TSUR.': 'TSURU', 'TSU.': 'TSURU', 'POINT.': 'POINTER', 'POIN.': 'POINTER',
  'EUROV.': 'EUROVAN', 'EUROVA.': 'EUROVAN', 'DATS.': 'DATSUN', 'DAT.': 'DATSUN', 'DATSN.': 'DATSUN',
  'SAMU.': 'SAMURAI', 'SAMUR.': 'SAMURAI', 'BRAS.': 'BRASILIA', 'RENAU.': 'RENAULT', 'TRANSP.': 'TRANSPORTER',
  PLATIA: 'PLATINA',
};

// Las que dependen de lo que tienen alrededor. Reciben la palabra anterior ya
// expandida, la siguiente tal cual y la pieza (primera palabra).
const EN_CONTEXTO = {
  VEL: ({ anterior }) => (['CAJA', 'PALANCA'].includes(anterior) ? 'VELOCIDADES' : null),
  'VEL.': ({ anterior }) => (['CAJA', 'PALANCA'].includes(anterior) ? 'VELOCIDADES' : null),
  DIST: ({ anterior }) => (['CADENA', 'BANDA', 'KIT', 'ENGRANE', 'TENSOR', 'POLEA'].includes(anterior) ? 'DISTRIBUCION' : null),
  'DIST.': ({ anterior }) => (['CADENA', 'BANDA', 'KIT', 'ENGRANE', 'TENSOR', 'POLEA'].includes(anterior) ? 'DISTRIBUCION' : null),
  'CAL.': ({ anterior }) => (['MICA', 'REPUESTO'].includes(anterior) ? 'CALAVERA' : anterior === 'AGUA' ? 'CALEFACCION' : null),
  'DEF.': ({ anterior }) => (['CUARTO', 'MICA'].includes(anterior) ? 'DEFENSA' : null),
  'TAP.': ({ siguiente }) => (/^(PUNT|LAT)/.test(siguiente) ? 'TAPA' : null),
  'PUNT.': ({ anterior }) => (anterior === 'TAPA' ? 'PUNTERIAS' : null),
  'CARB.': ({ siguiente }) => (/^ACTIV/.test(siguiente) ? 'CARBON' : 'CARBURADOR'),
  'ACTIV.': ({ anterior }) => (anterior === 'CARBON' ? 'ACTIVADO' : null),
  'COMB.': ({ anterior }) => (anterior === 'VW' ? 'COMBI' : null),
  'COM.': ({ anterior }) => (anterior === 'VW' ? 'COMBI' : null),
  'DIR.': ({ texto }) => (/\b(MICA|CUARTO|CALAVERA|CUAR\.|CAL\.)/.test(texto) ? 'DIRECCIONAL' : 'DIRECCION'),
  'ACR.': ({ pieza }) => (['MICA', 'CUARTO', 'CALAVERA'].includes(pieza) ? deProducto('ACRILICO') : null),
  'ACRI.': ({ pieza }) => (['MICA', 'CUARTO', 'CALAVERA'].includes(pieza) ? deProducto('ACRILICO') : null),
  'AC.': ({ pieza }) => (['MICA', 'CUARTO', 'CALAVERA'].includes(pieza) ? deProducto('ACRILICO') : null),
  // Al final de la descripcion, recortadas a dos letras por el sistema anterior.
  NA: ({ ultima }) => (ultima ? 'NACIONAL' : null),
  IM: ({ ultima }) => (ultima ? deProducto('IMPORTADO') : null),
  OR: ({ ultima }) => (ultima ? 'ORIGINAL' : null),
};

// Piezas donde C/A y S/A son "con/sin aire acondicionado".
const PIEZAS_CON_AIRE = new Set(['RADIADOR', 'TOLVA', 'BANDA', 'POLEA', 'TENSOR', 'MOTOVENTILADOR', 'MANGUERA', 'TOMA', 'CONDENSADOR', 'COMPRESOR', 'SOPORTE']);

// Antes de partir en palabras: las que llevan diagonal o guion.
const antesDePalabras = (texto, pieza) => {
  let salida = texto
    .replace(/(?<![A-Z0-9])M(\/|\.)N\.?(?![A-Z0-9])/g, 'MODELO NUEVO')
    .replace(/(?<![A-Z0-9])M(\/|\.)V\.?(?![A-Z0-9])/g, 'MODELO VIEJO')
    .replace(/(?<![A-Z0-9])P[-.]UP(?![A-Z0-9])/g, 'PICK-UP')
    .replace(/(?<![A-Z0-9])S\/AA(?![A-Z0-9])/g, 'SIN AIRE ACONDICIONADO')
    .replace(/(?<![A-Z0-9])C\/AIRE(?![A-Z0-9])/g, 'CON AIRE ACONDICIONADO');
  if (PIEZAS_CON_AIRE.has(pieza)) {
    salida = salida
      .replace(/(?<![A-Z0-9])C\/A(?![A-Z0-9])/g, 'CON AIRE ACONDICIONADO')
      .replace(/(?<![A-Z0-9])S\/A(?![A-Z0-9])/g, 'SIN AIRE ACONDICIONADO');
  }
  // C/, S/ y P/ seguidas de una palabra completa (no de otra abreviatura).
  return salida
    .replace(/(?<![A-Z0-9])C\/(TBI|ABS|[A-ZÑ]{4,})(?![A-ZÑ0-9.])/g, 'CON $1')
    .replace(/(?<![A-Z0-9])S\/(TBI|ABS|[A-ZÑ]{4,})(?![A-ZÑ0-9.])/g, 'SIN $1')
    .replace(/(?<![A-Z0-9])P\/([A-ZÑ]{4,})(?![A-ZÑ0-9.])/g, 'PARA $1');
};

// Lo que no es la pieza al buscar con que concuerda un adjetivo.
const MODELOS_Y_MARCAS = new Set([
  'VW', 'VOLKSWAGEN', 'CARIBE', 'GOLF', 'JETTA', 'COMBI', 'EUROVAN', 'POINTER', 'POLO', 'BORA', 'LUPO', 'DERBY',
  'VENTO', 'GOL', 'PASSAT', 'CORSAR', 'BEETLE', 'ATLANTIC', 'BRASILIA', 'SAFARI', 'SEDAN', 'TIGUAN', 'TRANSPORTER',
  'CRAFTER', 'AMAROK', 'SAVEIRO', 'SHARAN', 'FOX', 'CROSSFOX', 'CADDY', 'GTI', 'TSI', 'TDI', 'VR6', 'NISSAN', 'TSURU',
  'DATSUN', 'SENTRA', 'PLATINA', 'URVAN', 'TSUBAME', 'ALTIMA', 'TIIDA', 'MARCH', 'VERSA', 'MAXIMA', 'SAMURAI',
  'HIKARI', 'SAKURA', 'FRONTIER', 'ICHI', 'VAN', 'CHEVY', 'CHEVROLET', 'CORSA', 'AVEO', 'SPARK', 'ASTRA', 'MATIZ',
  'TORNADO', 'OPTRA', 'MERIVA', 'CRUZE', 'SONIC', 'BEAT', 'SEAT', 'IBIZA', 'CORDOBA', 'LEON', 'TOLEDO', 'AUDI',
  'CLIO', 'RENAULT', 'PICK', 'UP', 'MODELO', 'NUEVO', 'VIEJO', 'CLASICO', 'CLASSICO',
]);
const NO_ES_PIEZA = new Set(['Y', 'CON', 'SIN', 'PARA', 'DE', 'EN', 'A', 'O', 'I', 'II', 'III', 'IV', 'V', 'PZA', 'PZAS', 'JUEGO']);
// Adjetivos que se saltan al buscar el sustantivo: los que concuerdan (en sus
// cuatro formas) y los que no cambian.
const ADJETIVOS = new Set(['NACIONAL', 'ORIGINAL', 'SUPERIOR', 'INFERIOR', 'LATERAL', 'EXTERIOR', 'INTERIOR', 'ESTANDAR',
  'GRANDE', 'FRONTAL', 'DIRECCIONAL', 'ESTABILIZADORA', 'UNIVERSAL', 'MANUAL', 'DOBLE', 'SENCILLO', 'SENCILLA']);
for (const masculino of ['IZQUIERDO', 'DERECHO', 'DELANTERO', 'TRASERO', 'IMPORTADO', 'HIDRAULICO', 'ACRILICO', 'CHICO',
  'LARGO', 'CORTO', 'NUEVO', 'VIEJO', 'NEGRO', 'CROMADO', 'COMPLETO', 'DELGADO', 'GRUESO', 'REDONDO', 'ELECTRICO',
  'AUTOMATICO', 'BLANCO', 'ROJO', 'MEDIANO']) {
  for (const femenino of [false, true]) {
    for (const plural of [false, true]) ADJETIVOS.add(concordar(masculino, { femenino, plural }));
  }
}

// Palabras que el catalogo escribe completas: un punto pegado a ellas es
// basura del recorte ("VW.NAL." -> "VW NACIONAL"). Se llena con el catalogo.
const COMPLETAS = new Set();
export const conocerPalabras = (descripciones) => {
  const veces = new Map();
  for (const d of descripciones) {
    for (const palabra of String(d ?? '').toUpperCase().match(/[A-ZÑ]{3,}(?![A-ZÑ.])/g) || []) {
      veces.set(palabra, (veces.get(palabra) || 0) + 1);
    }
  }
  for (const [palabra, n] of veces) if (n >= 5) COMPLETAS.add(palabra);
  COMPLETAS.add('VW');
};

const piezaAntesDe = (palabras, pieza) => {
  for (let i = palabras.length - 1; i >= 0; i -= 1) {
    const palabra = palabras[i];
    if (palabra.length <= 2 || /\d/.test(palabra) || ADJETIVOS.has(palabra) || MODELOS_Y_MARCAS.has(palabra) || NO_ES_PIEZA.has(palabra)) continue;
    return palabra;
  }
  return pieza;
};

// Numero con punto (1.8T, 2.0L, .30), palabra con su punto, espacio, o lo demas.
const PIEZAS_DE_TEXTO = /\d*\.\d+[A-Z]*|[A-ZÑ0-9]+\.?|\s+|[^A-ZÑ0-9\s]/g;

export const expandir = (original) => {
  const texto = String(original ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  const pieza = (texto.match(/^[A-ZÑ]+/) || [''])[0];
  const partes = antesDePalabras(texto, pieza).match(PIEZAS_DE_TEXTO) || [];
  const indicesDePalabra = partes.map((p, i) => (/^[A-ZÑ0-9]/.test(p) ? i : -1)).filter((i) => i >= 0);
  const ultimaPalabra = indicesDePalabra.at(-1);
  const salida = [];
  const palabrasSalida = [];
  for (let i = 0; i < partes.length; i += 1) {
    const parte = partes[i];
    if (!/^[A-ZÑ]/.test(parte)) {
      salida.push(parte);
      if (/^[0-9]/.test(parte)) palabrasSalida.push(parte);
      continue;
    }
    const siguiente = (partes.slice(i + 1).find((p) => /^[A-ZÑ0-9]/.test(p)) || '');
    const regla = EN_CONTEXTO[parte];
    let valor = regla
      ? regla({ anterior: palabrasSalida.at(-1) || '', siguiente, pieza, texto, ultima: i === ultimaPalabra })
      : ABREVIATURAS[parte] ?? null;
    if (valor === null || valor === undefined) {
      const palabra = parte.replace(/\.$/, '');
      // "CARIBE." pegado a lo que sigue: el punto sobra.
      const sobraPunto = parte.endsWith('.') && COMPLETAS.has(palabra) && /^[A-ZÑ0-9(]/.test(partes[i + 1] || '');
      salida.push(sobraPunto ? `${palabra} ` : parte);
      palabrasSalida.push(palabra);
      continue;
    }
    if (typeof valor !== 'string') {
      valor = concordar(valor.g, generoDe(valor.producto ? pieza : piezaAntesDe(palabrasSalida, pieza)));
    }
    // " .NA" -> " NACIONAL": el punto suelto antes de la abreviatura sobra.
    if (salida.at(-1) === '.' && /\s$/.test(salida.at(-2) || '')) salida.pop();
    if (/[A-ZÑ0-9]\.$/.test(salida.at(-1) || '')) salida.push(' ');
    salida.push(valor);
    palabrasSalida.push(...valor.split(' '));
    // "MOT.FRON." -> "MOTOR FRONTAL": la abreviatura iba pegada a la siguiente.
    if (parte.endsWith('.') && /^[A-ZÑ0-9(]/.test(partes[i + 1] || '')) salida.push(' ');
  }
  return salida.join('').replace(/\s+/g, ' ').trim();
};

// ---------------------------------------------------------------------------
// Marca de auto
// ---------------------------------------------------------------------------

const MARCAS = {
  VOLKSWAGEN: ['VW', 'VOLKSWAGEN', 'CARIBE', 'GOLF', 'JETTA', 'COMBI', 'EUROVAN', 'POINTER', 'POLO', 'BORA', 'LUPO',
    'DERBY', 'VENTO', 'GOL', 'PASSAT', 'CORSAR', 'BEETLE', 'ATLANTIC', 'BRASILIA', 'SAFARI', 'VOCHO', 'TIGUAN',
    'TRANSPORTER', 'CRAFTER', 'AMAROK', 'SAVEIRO', 'SHARAN', 'CROSSFOX', 'FOX', 'CADDY', 'TOUAREG', 'GTI', 'TSI',
    'TDI', 'VR6', 'MK6', 'CLASICO', 'CLASSICO', 'VIRTUS', 'TAOS', 'NIVUS', 'TERAMONT', 'POINTE', 'JETT', 'CARIB'],
  NISSAN: ['NISSAN', 'TSURU', 'TSURUI', 'TSURUII', 'TSURUIII', 'DATSUN', 'SENTRA', 'PLATINA', 'PLATNA', 'URVAN', 'D21',
    'D22', 'NP300', 'ICHIVAN', 'TSUBAME', 'ALTIMA', 'TIIDA', 'MARCH', 'VERSA', 'MAXIMA', 'NV350', 'SAMURAI', 'HIKARI',
    'SAKURA', 'FRONTIER', 'XTRAIL', 'PATHFINDER', 'KICKS', 'ESTAQUITAS', 'QUEST', 'XTERRA'],
  CHEVROLET: ['CHEVY', 'CHEVROLET', 'CORSA', 'AVEO', 'SPARK', 'ASTRA', 'MATIZ', 'TORNADO', 'OPTRA', 'MERIVA', 'CRUZE',
    'SONIC', 'BEAT', 'MALIBU', 'S10', 'SILVERADO', 'MONZA', 'CAVALIER', 'TRAX'],
  SEAT: ['SEAT', 'IBIZA', 'CORDOBA', 'LEON', 'TOLEDO', 'ALTEA', 'ALHAMBRA', 'ATECA', 'ARONA'],
  AUDI: ['AUDI'],
};
const MARCA_DE_PALABRA = new Map(Object.entries(MARCAS).flatMap(([marca, palabras]) => palabras.map((p) => [p, marca])));
// Las generaciones de Golf y Jetta: VW, salvo que la descripcion diga otra marca.
const GENERACIONES_VW = /(?<![A-Z0-9])A[234](?![0-9])/;

export const marcaDe = (descripcion) => {
  const texto = String(descripcion ?? '').toUpperCase()
    .replace(/ICHI[\s-]?VAN/g, 'ICHIVAN').replace(/CROSS[\s-]?FOX/g, 'CROSSFOX').replace(/X-TRAIL/g, 'XTRAIL')
    // Caribe, Golf y Jetta recortados: CAR-GO-JE, GO/JE, G/J.
    .replace(/(?<![A-Z])(CAR-GO-JE|GO\/JE|G\/J)(?![A-Z])/g, ' VW ');
  const marcas = new Set(texto.split(/[^A-Z0-9Ñ]+/).map((p) => MARCA_DE_PALABRA.get(p)).filter(Boolean));
  if (!marcas.size && GENERACIONES_VW.test(texto)) marcas.add('VOLKSWAGEN');
  if (!marcas.size) return null;
  return marcas.size === 1 ? [...marcas][0] : 'TODAS';
};

// ---------------------------------------------------------------------------
// Modelo inicial y final
// ---------------------------------------------------------------------------

const anio = (texto) => {
  const n = Number(texto);
  if (texto.length === 4) return n;
  return n >= 50 ? 1900 + n : 2000 + n;
};

// "93-99", "79/84", "2010-2012"; varios rangos -> del menor al mayor. No cuenta
// medidas (10-12MM), versiones (1.4-1.6) ni fracciones (1/2).
const RANGO = /(?<![\d.A-Z/-])((?:19|20)\d{2}|\d{2})\s*[-/]\s*((?:19|20)\d{2}|\d{2})(?![\d.A-Z/])(?!\s*(?:MM|CM|PULG|LTS?|AMP|HP|PZAS?|PIEZAS|DIENTES|GRAD|KG|OHM|V|W|A)\b)/g;

export const modelosDe = (descripcion) => {
  const rangos = [];
  for (const [, desde, hasta] of String(descripcion ?? '').toUpperCase().matchAll(RANGO)) {
    if (desde.length !== hasta.length) continue;
    const ini = anio(desde);
    const fin = anio(hasta);
    if (ini > fin || fin > ANIO_ACTUAL + 1 || ini < 1950 || fin - ini > 40) continue;
    rangos.push([ini, fin]);
  }
  if (!rangos.length) return null;
  return { ini: Math.min(...rangos.map((r) => r[0])), fin: Math.max(...rangos.map((r) => r[1])) };
};

// ---------------------------------------------------------------------------
// Grupo
// ---------------------------------------------------------------------------

// En orden: la primera que coincide. Los nombres son los de la tabla `grupo`.
// Dirección incluye la suspensión; Motor, todo el tren motriz (enfriamiento,
// combustible, escape, clutch y caja); Collision, la carrocería y sus luces.
const GRUPOS = [
  ['Brakes', /^(BALATAS?|FRENOS?|CALIPER|MORDAZA|TAMBOR|PASTILLAS? FRENO|ZAPATAS?|BOO?STER|AJUSTADOR|ANCLA BALATA)\b|\bFRENOS?\b/],
  ['Direction', /^(AMORTIGUADOR(ES)?|ROTULAS?|HORQUILLAS?|CREMALLERA|TIRANTES?|MAZAS?|RESORTES?|BIELETAS?|MANGUETA|BIRLOS?|COPELA|ESTABILIZADORA|SUSPENSION|DIRECCION|RUEDA|MUELLES?)\b|^BARRA (ESTABILIZADORA|DIRECCION|AXIAL|TORSION)\b|^(CAJA|BOMBA|DEPOSITO|COLUMNA|BRAZO) DIRECCION\b/],
  ['Electrical', /^(ALTERNADOR|GENERADOR|MARCHA|BOBINA|BUJIAS?|FOCOS?|SWITCH|SENSOR(ES)?|RELAY|RELEVADOR|FUSIBLES?|ARNES|BULBO|REGULADOR|SOQUET|SOCKET|DISTRIBUIDOR|MODULO|COMPUTADORA|BATERIA|CLAXON|POTENCIOMETRO|SONDA|PLATINOS?|CONDENSADOR|ROTOR|ESCOBILLAS?|INTERRUPTOR|BORNES?|CONECTOR|BENDIX|DESTELLADOR|TRANSMISOR|ENCENDEDOR|RESISTENCIA|VELOCIMETRO|CHISGUETERO|LIMPIADOR(ES)?|VOLTAJE)\b|^CABLES? (BUJIAS?|BATERIA)\b|^MOTOR LIMPIADOR\b/],
  ['Collision', /^(DEFENSA|FACIA|COFRE|SALPICADERA|PUERTA|ESPEJOS?|FAROS?|CALAVERAS?|CUARTOS?|REJILLA|PARRILLA|MOLDURAS?|EMBLEMAS?|MANIJAS?|CHAPAS?|BISAGRAS?|TOLVA|ALERON|MICAS?|CRISTAL|VIDRIO|TAPACUBOS?|ELEVADOR|DEFLECTOR|SPOILER|ESTRIBO|LODERA|REFLEJANTE|BISEL|JALADERA|CANTONERA|MANIVELA|CAJUELA|VENTILA)\b/],
  ['Motor', /^(JUNTAS?|EMPAQUES?|FILTRO|BANDA|POLEA|TENSOR|TERMOSTATO|RADIADOR|TOMA|VALVULAS?|PISTON(ES)?|ANILLOS?|BIELAS?|CIGUEÑAL|PUNTERIAS?|CABEZA|MONOBLOCK|CARTER|MULTIPLE|CARBURADOR|CLUTCH|PLATO|COLLARIN|METAL(ES)?|BRONCES?|ESPIGAS?|FLECHA|HOMOCINETICO|CRUCETA|ENGRANE|CADENA|INYECTOR(ES)?|BUZOS?|MOTOVENTILADOR|VENTILADOR|BALANCIN|DIAFRAGMA|ESPREA|FLOTADOR|CARRETE|TRIPODE|SINCRONIZADOR|BAYONETA|MARIPOSA|TURBINA|LEVAS?|ARBOL|SELLO|ASPAS?|PURGADOR|CAZUELA|CORONA|MOTOR|AGUA|ACEITE|GASOLINA|GAS|ANTICONGELANTE|ACELERADOR|ACELERACION|ESCAPE|ADMISION|DISTRIBUCION|TIEMPO|TRANSMISION|VELOCIDADES|CAMPANA)\b|^(SOPORTE|CAJA|PALANCA|CUERPO) (MOTOR|CAJA|TRANSMISION|VELOCIDADES|ACELERACION)\b/],
  ['Accessories', /^(ACEITE|ANTICONGELANTE|LIQUIDO|ADITIVO|SILICON|GRASA|SHELAC|VELOCIL|TAPETES?|FUNDAS?|PERILLAS?|VISERAS?|PARASOL|ANTENA|CONSOLA|GUANTERA|ASIENTO|CINTURON|PLUMAS?|CENICERO)\b|^PORTA PLACA\b/],
];

// Piezas que no dicen de que sistema son: se clasifican por lo que sostienen
// o a lo que pertenecen (GOMA BARRA ESTABILIZADORA -> Direction, TORNILLO
// CABEZA -> Motor, SEGURO PUERTA -> Collision). Si eso tampoco lo dice, las
// que casi siempre son de un sistema toman ese; las demas se quedan sin grupo.
const GENERICAS = new Set(['GOMA', 'GOMAS', 'TORNILLO', 'TORNILLOS', 'SOPORTE', 'SEGURO', 'BALERO', 'TAPON', 'REPUESTO',
  'GRAPA', 'TAPA', 'BUJE', 'BUJES', 'KIT', 'TUERCA', 'VARILLA', 'PALANCA', 'TUBO', 'HULE', 'CILINDRO', 'PERNO', 'BASE',
  'PORTA', 'ABRAZADERA', 'GATILLO', 'RONDANA', 'LAINA', 'BRIDA', 'BOTON', 'CUBRE', 'TERMINAL', 'CONTRA', 'TOPE',
  'SEPARADOR', 'PLATILLO', 'DISCO', 'RETEN', 'CHICOTE', 'BOMBA', 'DEPOSITO', 'MANGUERA', 'LIGA', 'LIGAS', 'CODO',
  'JUNTA', 'JUNTAS', 'CUERPO', 'MACHETA', 'BIRLO', 'PIJA', 'CLAVO', 'CINCHO', 'RESORTE', 'PEDAL', 'BRAZO', 'MANGO',
  'HORQUILLA', 'REGULADOR', 'TOLVA']);
const POR_OMISION = {
  JUNTA: 'Motor', JUNTAS: 'Motor', RETEN: 'Motor', MANGUERA: 'Motor', DISCO: 'Brakes', RESORTE: 'Direction',
  BIRLO: 'Direction', HORQUILLA: 'Direction', REGULADOR: 'Electrical', TOLVA: 'Collision',
};

// Las que la primera regla que coincide clasificaria mal: van antes.
const ESPECIALES = [
  ['Collision', /^AMORTIGUADOR(ES)? (COFRE|CAJUELA|PUERTA|QUINTA|TAPA)\b/],
  ['Motor', /^ASIENTO Y AGUJA\b/],
  ['Motor', /^HORQUILLAS? (\d+A|MARCHA|REVERSA|CLUTCH|VELOCIDADES|CAJA|SELECTORA|CAMBIOS?)\b/],
  ['Motor', /^REGULADOR (PRESION|GAS|GASOLINA)\b/],
  ['Collision', /^REGULADOR ELEVADOR\b/],
  ['Motor', /^TOLVA (CABEZA|MOTOR|RADIADOR|MOTOVENTILADOR|VENTILADOR)\b/],
];

const porReglas = (texto) => {
  for (const [grupo, regla] of ESPECIALES) if (regla.test(texto)) return grupo;
  for (const [grupo, regla] of GRUPOS) if (regla.test(texto)) return grupo;
  return null;
};

export const grupoDe = (descripcion) => {
  const texto = String(descripcion ?? '').toUpperCase().replace(/[^A-ZÑ0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const [pieza, ...resto] = texto.split(' ');
  for (const [grupo, regla] of ESPECIALES) if (regla.test(texto)) return grupo;
  if (!GENERICAS.has(pieza)) return porReglas(texto);
  // Un cilindro maestro o de rueda es de frenos, salvo que diga clutch.
  if (pieza === 'CILINDRO' && /^(MAESTRO|RUEDA)\b/.test(resto.join(' '))) return /\bCLUTCH\b/.test(texto) ? 'Motor' : 'Brakes';
  const deQue = resto.join(' ').replace(/^(DE|DEL|PARA|P) /, '');
  return porReglas(deQue) ?? POR_OMISION[pieza] ?? null;
};

// ---------------------------------------------------------------------------
// Propuesta, respaldo y aplicacion
// ---------------------------------------------------------------------------

const csv = (valor) => {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

const pool = new pg.Pool({ connectionString: requirePgDatabaseUrl(), max: 1, connectionTimeoutMillis: 8000 });
const client = await pool.connect().catch((error) => {
  console.error(`No hay conexion con la base: ${error.message}`);
  process.exit(1);
});
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const revertir = async () => {
  const [{ hay }] = await q(`SELECT to_regclass('${RESPALDO}.producto') IS NOT NULL AS hay`);
  if (!hay) {
    console.log('No hay respaldo: no hay nada que revertir.');
    return;
  }
  await client.query('BEGIN');
  const r = await client.query(
    `UPDATE producto p SET descripcion = r.descripcion, idgrupo = r.idgrupo, idmarca = r.idmarca,
            mod_ini = r.mod_ini, mod_fin = r.mod_fin
       FROM ${RESPALDO}.producto r WHERE r.num_parte = p.num_parte`
  );
  await q(`DROP SCHEMA ${RESPALDO} CASCADE`);
  await client.query('COMMIT');
  console.log(`${r.rowCount} productos regresaron a como estaban; respaldo borrado.`);
};

try {
  if (REVERTIR) {
    await revertir();
  } else {
    const productos = await q('SELECT num_parte, descripcion, idgrupo, idmarca, mod_ini, mod_fin FROM producto ORDER BY num_parte');
    conocerPalabras(productos.map((p) => p.descripcion));
    const grupoPorNombre = new Map((await q('SELECT idgrupo, grupo FROM grupo')).map((r) => [r.grupo.toUpperCase(), r.idgrupo]));
    const marcaPorNombre = new Map((await q('SELECT idmarca, marca FROM marca')).map((r) => [r.marca.toUpperCase(), r.idmarca]));
    const nombreDeMarca = new Map([...marcaPorNombre].map(([nombre, id]) => [id, nombre]));
    const nombreDeGrupo = new Map([...grupoPorNombre].map(([nombre, id]) => [id, nombre]));
    const VW = marcaPorNombre.get('VOLKSWAGEN');

    const cambios = [];
    const reporte = [['num_parte', 'campo', 'antes', 'despues']];
    const cuenta = { descripcion: 0, largas: 0, grupo: 0, marca: 0, marcaVacia: 0, modelos: 0 };
    const porGrupo = {};
    const porMarca = {};

    for (const p of productos) {
      const nuevo = { ...p };
      const expandida = expandir(p.descripcion);
      if (expandida !== String(p.descripcion ?? '').replace(/\s+/g, ' ').trim()) {
        if (expandida.length <= LARGO_MAXIMO) {
          nuevo.descripcion = expandida;
          cuenta.descripcion += 1;
          reporte.push([p.num_parte, 'descripcion', p.descripcion, expandida]);
        } else {
          cuenta.largas += 1;
        }
      }

      if (!p.idgrupo || Number(p.idgrupo) === 0) {
        const grupo = grupoDe(nuevo.descripcion);
        const id = grupo ? grupoPorNombre.get(grupo.toUpperCase()) : null;
        if (id) {
          nuevo.idgrupo = id;
          cuenta.grupo += 1;
          porGrupo[grupo] = (porGrupo[grupo] || 0) + 1;
          reporte.push([p.num_parte, 'grupo', nombreDeGrupo.get(p.idgrupo) || '', grupo]);
        }
      }

      // Solo la marca de la migracion: VOLKSWAGEN sin modelo capturado.
      const deMigracion = (p.idmarca === VW || p.idmarca === null) && !String(p.mod_ini ?? '').trim();
      if (deMigracion) {
        const marca = marcaDe(`${p.descripcion} ${nuevo.descripcion}`);
        const id = marca ? marcaPorNombre.get(marca) ?? null : null;
        if (id !== p.idmarca) {
          nuevo.idmarca = id;
          if (id) cuenta.marca += 1;
          else cuenta.marcaVacia += 1;
          porMarca[marca || '(vacia)'] = (porMarca[marca || '(vacia)'] || 0) + 1;
          reporte.push([p.num_parte, 'marca', nombreDeMarca.get(p.idmarca) || '', marca || '']);
        }
      }

      if (!String(p.mod_ini ?? '').trim() && !String(p.mod_fin ?? '').trim()) {
        const modelos = modelosDe(p.descripcion);
        if (modelos) {
          nuevo.mod_ini = String(modelos.ini);
          nuevo.mod_fin = String(modelos.fin);
          cuenta.modelos += 1;
          reporte.push([p.num_parte, 'modelos', '', `${modelos.ini}-${modelos.fin}`]);
        }
      }

      if (['descripcion', 'idgrupo', 'idmarca', 'mod_ini', 'mod_fin'].some((campo) => nuevo[campo] !== p[campo])) cambios.push(nuevo);
    }

    await mkdir(dirname(REPORTE), { recursive: true });
    await writeFile(REPORTE, `${reporte.map((fila) => fila.map(csv).join(',')).join('\n')}\n`);

    console.log(`${productos.length} productos; cambian ${cambios.length}.`);
    console.log(`  descripciones: ${cuenta.descripcion} expandidas (${cuenta.largas} se quedan: pasarian de ${LARGO_MAXIMO} caracteres)`);
    console.log(`  grupo: ${cuenta.grupo} asignados ${JSON.stringify(porGrupo)}`);
    console.log(`  marca: ${cuenta.marca} deducidas, ${cuenta.marcaVacia} quedan vacias ${JSON.stringify(porMarca)}`);
    console.log(`  modelo inicial y final: ${cuenta.modelos}`);
    console.log(`Propuesta completa: ${REPORTE}`);

    if (!APLICAR) {
      console.log('\nSolo lectura. Para aplicar: node scripts/db-catalogo.mjs --aplicar');
    } else {
      await client.query('BEGIN');
      await q(`CREATE SCHEMA IF NOT EXISTS ${RESPALDO}`);
      await q(`CREATE TABLE IF NOT EXISTS ${RESPALDO}.producto (
                 num_parte varchar(100) PRIMARY KEY, descripcion varchar(100), idgrupo integer,
                 idmarca integer, mod_ini varchar(45), mod_fin varchar(45),
                 respaldado timestamptz NOT NULL DEFAULT now())`);
      const partes = cambios.map((c) => c.num_parte);
      // ON CONFLICT DO NOTHING: si se aplica dos veces, el respaldo sigue siendo el original.
      await q(`INSERT INTO ${RESPALDO}.producto (num_parte, descripcion, idgrupo, idmarca, mod_ini, mod_fin)
               SELECT num_parte, descripcion, idgrupo, idmarca, mod_ini, mod_fin FROM producto
                WHERE num_parte = ANY($1::varchar[]) ON CONFLICT (num_parte) DO NOTHING`, [partes]);
      const r = await client.query(
        `UPDATE producto p SET descripcion = c.descripcion, idgrupo = c.idgrupo, idmarca = c.idmarca,
                mod_ini = c.mod_ini, mod_fin = c.mod_fin
           FROM unnest($1::varchar[], $2::varchar[], $3::int[], $4::int[], $5::varchar[], $6::varchar[])
                AS c(num_parte, descripcion, idgrupo, idmarca, mod_ini, mod_fin)
          WHERE p.num_parte = c.num_parte`,
        [partes, cambios.map((c) => c.descripcion), cambios.map((c) => c.idgrupo), cambios.map((c) => c.idmarca),
          cambios.map((c) => c.mod_ini), cambios.map((c) => c.mod_fin)]
      );
      await client.query('COMMIT');
      console.log(`\nAplicado: ${r.rowCount} productos. Respaldo en ${RESPALDO}.producto (--revertir lo regresa).`);
    }
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\nNo se cambio nada: ${error.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
