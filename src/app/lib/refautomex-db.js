/**
 * Conexion a PostgreSQL para los endpoints que antes vivian en
 * refautomex-calidad.com (ver .apirefautomex, el Express original).
 *
 * Este modulo existe sobre todo por una razon: el driver `mysql` y el driver
 * `pg` devuelven formas distintas para la misma consulta, y el frontend ya
 * esta escrito contra las de MySQL. Migrar los datos sin migrar las formas
 * rompe la interfaz aunque cada dato sea correcto.
 *
 * Las tres diferencias que hay que absorber:
 *
 *   1. Marcadores de parametro:  MySQL usa `?`,  Postgres usa `$1, $2, ...`
 *   2. SELECT directo:           los dos devuelven un array de filas. Igual.
 *   3. CALL de un procedimiento: MySQL devuelve [[filas], okPacket] - anidado.
 *      Postgres devuelve las filas planas. Confirmado contra la API en vivo:
 *      /getProducts responde [[{...}]] y /getCategory responde [{...}].
 *
 * Y una cuarta para las escrituras: un UPDATE/INSERT en MySQL devuelve un
 * OkPacket con affectedRows e insertId, que varias pantallas leen para saber
 * si guardo. `pg` devuelve rowCount. Se traduce en `okPacket()`.
 */

import { Pool } from 'pg';

// Un pool por proceso. En desarrollo, Next recarga los modulos en cada cambio
// y sin esto quedarian conexiones colgadas hasta agotar el limite del
// servidor. El global sobrevive a la recarga; el modulo no.
const globalForPg = globalThis;

const crearPool = () => {
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Falta DATABASE_URL. En el cluster la inyecta el Secret postgres-credentials, ' +
        'que crea Terraform en postgres.tf.'
    );
  }

  return new Pool({
    connectionString,
    // El nodo es un t4g.medium compartido con otra app y con el propio
    // Postgres. Un pool chico evita que un pico de trafico agote las
    // conexiones del servidor (max_connections = 100 por default).
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
};

// El pool se crea en la PRIMERA consulta, no al importar el modulo.
//
// No es una optimizacion: `next build` importa cada route handler para
// recolectar datos de pagina, y en ese momento no existe DATABASE_URL - la
// inyecta el Secret de Kubernetes en tiempo de ejecucion, no en el build.
// Creando el pool al importar, el build entero fallaba con
// "Failed to collect page data for /api/refautomex/[...path]".
//
// Con la creacion diferida, importar el modulo no toca la red ni exige
// credenciales; solo hacerlo cuando de verdad llega una peticion.
let poolActual = null;

export const obtenerPool = () => {
  if (poolActual) return poolActual;

  poolActual = globalForPg.__refautomexPool ?? crearPool();

  if (process.env.NODE_ENV !== 'production') {
    globalForPg.__refautomexPool = poolActual;
  }

  return poolActual;
};

/**
 * Traduce los `?` de MySQL a los `$n` de Postgres.
 *
 * Recorre caracter por caracter en vez de usar un replace global porque un `?`
 * dentro de una cadena literal ('¿que?') no es un parametro y no debe tocarse.
 */
export const traducirMarcadores = (sql) => {
  let salida = '';
  let n = 0;
  let enCadena = false;
  let comilla = '';

  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];

    if (enCadena) {
      salida += c;
      // '' escapa una comilla dentro de la cadena, no la cierra.
      if (c === comilla) {
        if (sql[i + 1] === comilla) {
          salida += sql[i + 1];
          i += 1;
        } else {
          enCadena = false;
        }
      }
      continue;
    }

    if (c === "'" || c === '"') {
      enCadena = true;
      comilla = c;
      salida += c;
      continue;
    }

    if (c === '?') {
      n += 1;
      salida += `$${n}`;
      continue;
    }

    salida += c;
  }

  return salida;
};

/**
 * Consulta que devuelve filas, con la misma forma que daba `mysql`:
 * un array plano de objetos.
 */
export const consultar = async (sql, params = []) => {
  const { rows } = await obtenerPool().query(traducirMarcadores(sql), params);
  return rows;
};

/**
 * Equivalente a un `CALL` de MySQL leido por el driver `mysql`.
 *
 * Devuelve [filas] - anidado un nivel - porque es lo que el frontend espera:
 * `results[0]` en todos los sitios que consumen un procedimiento. Devolver el
 * array plano seria "mas correcto" y rompeia cada pantalla que lo usa.
 */
export const llamar = async (sql, params = []) => {
  const { rows } = await obtenerPool().query(traducirMarcadores(sql), params);
  return [rows];
};

/**
 * Igual que `llamar`, para los procedimientos que en MySQL devolvian varios
 * result sets (GetCaptureWithDetails, GetSalesHistorySummary, ...).
 *
 * Postgres no puede devolver varios result sets desde una sola funcion, asi
 * que del lado de Postgres se resuelve con una funcion por conjunto y aca se
 * arman en el orden original. El consumidor no nota la diferencia.
 */
export const llamarVarios = async (consultas) => {
  const resultados = [];
  for (const { sql, params = [] } of consultas) {
    const { rows } = await obtenerPool().query(traducirMarcadores(sql), params);
    resultados.push(rows);
  }
  return resultados;
};

/**
 * Forma que devolvia MySQL tras un INSERT/UPDATE/DELETE.
 *
 * No es adorno: pantallas como settings.jsx leen `affectedRows` para decidir
 * si muestran el mensaje de guardado.
 */
export const okPacket = (resultado, insertId = 0) => ({
  fieldCount: 0,
  affectedRows: resultado?.rowCount ?? 0,
  insertId,
  serverStatus: 2,
  warningCount: 0,
  message: '',
  protocol41: true,
  changedRows: resultado?.rowCount ?? 0,
});

/**
 * Ejecuta una escritura y devuelve el OkPacket equivalente.
 * `devolver` permite capturar un id generado para el insertId.
 */
export const escribir = async (sql, params = [], devolver = null) => {
  const texto = devolver
    ? `${traducirMarcadores(sql)} RETURNING ${devolver}`
    : traducirMarcadores(sql);

  const resultado = await obtenerPool().query(texto, params);
  const insertId = devolver ? resultado.rows?.[0]?.[devolver] ?? 0 : 0;

  return okPacket(resultado, insertId);
};

/**
 * Envuelve varias sentencias en una transaccion, con la misma conexion.
 *
 * Necesario para los endpoints que el Express original resolvia con varios
 * `executeQuery` seguidos: newSale inserta la venta, luego cada concepto, y
 * descuenta existencias. Sin transaccion, un fallo a mitad deja una venta con
 * la mitad de sus renglones y el inventario descuadrado - que en MySQL ya era
 * un riesgo, porque ahi tampoco estaban dentro de una.
 */
export const enTransaccion = async (fn) => {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query('BEGIN');
    const salida = await fn({
      consultar: async (sql, params = []) => {
        const { rows } = await cliente.query(traducirMarcadores(sql), params);
        return rows;
      },
      escribir: async (sql, params = []) => cliente.query(traducirMarcadores(sql), params),
    });
    await cliente.query('COMMIT');
    return salida;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
};
