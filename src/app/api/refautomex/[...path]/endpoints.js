/**
 * Los endpoints que antes atendia el Express de refautomex-calidad.com,
 * reescritos contra PostgreSQL. El original queda como referencia en
 * .apirefautomex, en la raiz del proyecto.
 *
 * Las URL no cambian: el frontend sigue pidiendo /api/refautomex/<nombre> y no
 * hay que tocar ni un componente. Lo que cambia es que la peticion ya no sale
 * a internet, se resuelve contra la base del cluster.
 *
 * COMO ESTA REPARTIDO
 * Aqui viven los 19 endpoints que el Express resolvia con SQL directo. Los que
 * usaban procedimientos almacenados estan en los otros dos modulos, separados
 * por naturaleza y no por capricho:
 *
 *   endpoints-procedimientos.js  15  lecturas que venian de un CALL
 *   endpoints-escrituras.js      13  transacciones, cursores y JSON
 *
 * La migracion esta completa: ningun endpoint sale ya a internet.
 *
 * DIFERENCIAS DE SQL QUE HAY QUE VIGILAR AL TRADUCIR
 *   - MySQL acepta "F" como cadena; en Postgres las comillas dobles son un
 *     identificador y hay que escribir 'F'. Es el error mas facil de cometer
 *     y falla en tiempo de ejecucion, no al compilar.
 *   - Los `?` los traduce refautomex-db.js; aqui se escriben como en el
 *     original para que el diff contra .apirefautomex sea legible.
 */

import { consultar, escribir } from '@/app/lib/refautomex-db';

import { PROCEDIMIENTOS } from './endpoints-procedimientos';
import { ESCRITURAS } from './endpoints-escrituras';

const faltan = (detalle) => ({
  estado: 400,
  cuerpo: { error: 'Bad Request', details: detalle },
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

const getUser = async ({ query }) => {
  const id = query.get('id');
  if (!id) return faltan('Missing cognitoid parameter');
  return { cuerpo: await consultar('SELECT * FROM usuario WHERE cognitoid = ?', [id]) };
};

const verifyEmployee = async ({ query }) => {
  const id = query.get('id');
  if (!id) return faltan('Missing id parameter');

  const filas = await consultar('SELECT empleado FROM usuario WHERE cognitoid = ?', [id]);
  if (filas.length === 0) {
    return { estado: 404, cuerpo: { error: 'User not found' } };
  }
  return { cuerpo: { empleado: filas[0].empleado } };
};

const verifyLocation = async ({ query }) => {
  const localizacion = query.get('localizacion');
  const idsucursal = query.get('idsucursal');
  const num_parte = query.get('num_parte');

  if (!localizacion || !idsucursal || !num_parte) return faltan('Missing parameters');

  const filas = await consultar(
    `SELECT d.num_parte
       FROM detalle d
       INNER JOIN localizacion l USING (idlocalizacion)
       INNER JOIN sucursal s USING (idsucursal)
      WHERE l.localizacion = ?
        AND s.idsucursal = ?`,
    [localizacion, idsucursal]
  );

  if (filas.length === 0) {
    return { cuerpo: { exists: false, message: 'Localización disponible.' } };
  }

  // Ocupada por la misma refaccion no es conflicto: es la que ya estaba ahi.
  return filas[0].num_parte === num_parte
    ? { cuerpo: { exists: false, message: 'Localización ocupada por la misma refacción.' } }
    : { cuerpo: { exists: true, message: 'Localización ocupada por otra refacción.' } };
};

const getAllEmployees = async () => ({
  cuerpo: await consultar(
    'SELECT * FROM usuario INNER JOIN sucursal USING (idsucursal) WHERE empleado = 1'
  ),
});

// Una consulta a una tabla entera, sin parametros ni filtro. Son las mas
// simples y las que el Express resolvia con `SELECT * FROM x`.
const tablaCompleta = (tabla) => async () => ({
  cuerpo: await consultar(`SELECT * FROM ${tabla}`),
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

const newUser = async ({ body }) => {
  const campos = [
    'email', 'cognitoid', 'nombre', 'apellido', 'telefono', 'f_nacimiento',
    'genero', 'rfc', 'domicilio', 'categoria', 'empleado',
  ];

  const marcadores = campos.map(() => '?').join(', ');
  const valores = campos.map((c) => body?.[c] ?? null);

  return {
    cuerpo: await escribir(
      `INSERT INTO usuario (${campos.join(', ')}) VALUES (${marcadores})`,
      valores,
      // MySQL devolvia el id en insertId; en Postgres hay que pedirlo.
      'idusuario'
    ),
  };
};

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

const patchUser = async ({ body }) => {
  const campos = [
    'email', 'cognitoid', 'nombre', 'apellido', 'telefono', 'f_nacimiento',
    'genero', 'rfc', 'domicilio', 'categoria', 'empleado',
  ];

  const asignaciones = campos.map((c) => `${c} = ?`).join(', ');
  const valores = [...campos.map((c) => body?.[c] ?? null), body?.idusuario];

  return {
    cuerpo: await escribir(
      `UPDATE usuario SET ${asignaciones} WHERE idusuario = ?`,
      valores
    ),
  };
};

const patchUserEmployment = async ({ body }) => {
  if (!body?.idusuario) return faltan('Missing idusuario.');
  return {
    cuerpo: await escribir(
      'UPDATE usuario SET empleado = ?, idsucursal = ? WHERE idusuario = ?',
      [body.empleado ?? null, body.idsucursal ?? null, body.idusuario]
    ),
  };
};

const patchUserCategory = async ({ body }) => {
  if (!body?.idusuario || !body?.categoria) return faltan('Missing idusuario or categoria.');
  return {
    cuerpo: await escribir('UPDATE usuario SET categoria = ? WHERE idusuario = ?', [
      body.categoria,
      body.idusuario,
    ]),
  };
};

const finalizeInvoice = async ({ body }) => {
  const { idfactura, folio } = body || {};
  if (!idfactura && !folio) return faltan('Missing idfactura or folio.');

  // El original decia SET emitida = "F". En MySQL eso es la cadena F; en
  // Postgres seria la columna llamada F y falla. Va con comilla simple.
  return idfactura
    ? { cuerpo: await escribir("UPDATE factura SET emitida = 'F' WHERE idfactura = ?", [idfactura]) }
    : { cuerpo: await escribir("UPDATE factura SET emitida = 'F' WHERE folio = ?", [folio]) };
};

const patchSucursal = async ({ body }) => {
  if (!body?.idsucursal) return faltan('Missing idsucursal.');

  // El original normaliza null/undefined a cadena vacia antes de guardar.
  const limpio = (v) => (v === null || v === undefined ? '' : String(v).trim());

  return {
    cuerpo: await escribir(
      `UPDATE sucursal
          SET telefono_uno = ?, telefono_dos = ?, whats_uno = ?, whats_dos = ?, direccion = ?
        WHERE idsucursal = ?`,
      [
        limpio(body.telefono_uno),
        limpio(body.telefono_dos),
        limpio(body.whats_uno),
        limpio(body.whats_dos),
        limpio(body.direccion),
        body.idsucursal,
      ]
    ),
  };
};

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

// Los que venian de SQL directo, aqui. Los que venian de un procedimiento
// almacenado viven en endpoints-procedimientos.js y se fusionan abajo: son de
// naturaleza distinta y tenerlos separados hace visible cuanto queda por
// traducir.
const DIRECTOS = {
  GET: {
    getUser,
    verifyEmployee,
    verifyLocation,
    getAllEmployees,
    getAllProviders: tablaCompleta('proveedor'),
    getProviders: tablaCompleta('proveedor'),
    getCFDI: tablaCompleta('cfdi'),
    getRegimen: tablaCompleta('regimen'),
    getBrands: tablaCompleta('marca'),
    getGroups: tablaCompleta('grupo'),
    getSucursal: tablaCompleta('sucursal'),
    getQuantity: tablaCompleta('cantidad'),
    getCategory: tablaCompleta('categoria'),
  },
  POST: {
    newUser,
  },
  PATCH: {
    patchUser,
    patchUserEmployment,
    patchUserCategory,
    finalizeInvoice,
    patchSucursal,
  },
  DELETE: {},
  PUT: {},
};

// Fusion por metodo. Un endpoint no puede estar en los dos lados: si algun dia
// se repite un nombre, gana el de procedimientos, que es el que se migro
// despues.
export const ENDPOINTS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].reduce(
  (acc, metodo) => ({
    ...acc,
    [metodo]: {
      ...(DIRECTOS[metodo] ?? {}),
      ...(PROCEDIMIENTOS[metodo] ?? {}),
      ...(ESCRITURAS[metodo] ?? {}),
    },
  }),
  {}
);

// Aqui vivia PENDIENTES, la lista de endpoints que todavia se reenviaban a
// refautomex-calidad.com. Se vacio al migrar el ultimo, y con el se fue el
// reenvio de route.js. No hace falta reemplazarla por nada: si un endpoint no
// esta en ENDPOINTS, el despachador responde 404.
