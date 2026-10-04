/**
 * Esquema de la base de refautomex (Postgres), para drizzle-kit.
 *
 * POR QUE EXISTE
 * El 2026-10-01 se perdio la base de produccion, y con ella el unico lugar
 * donde estaba definido el esquema: las tablas venian de MySQL y nunca
 * estuvieron en el codigo. Se reconstruyo desde los dumps de noviembre de 2024
 * mas lo que usan las consultas de src/app/api/refautomex (ver
 * infrastructure-terraform-appddata/resources/refautomex-2024). Con este
 * archivo una base vacia vuelve a tener la estructura completa con
 * `npm run db:pg:push`.
 *
 * Lo genero `drizzle-kit pull` contra produccion: es un espejo exacto, con los
 * nombres tal como estan en la base (por eso conviven `idVenta` y
 * `num_parte`). La app no lo importa: sus consultas son SQL a mano en
 * refautomex-db.js. Si una consulta nueva necesita una columna, se agrega aqui
 * y se aplica con `npm run db:pg:push`.
 *
 * `hydrate` NO va aqui: vive en la base de appddata (lib/hydrate/schema.pg.js).
 *
 * OJO con `db:pg:push`: aplica los cambios sin preguntar (solo pide
 * confirmacion si van a borrarse datos). Correrlo contra produccion es
 * aplicar en produccion.
 *
 * Diferencia fantasma conocida: cada push "aplica" `SET CACHE 1` sobre
 * idCantidad, idImagen e idVenta. Es un error de drizzle-kit al leer
 * secuencias con mayusculas en el nombre; la cache ya vale 1 y no cambia nada.
 */

import { date, integer, numeric, pgTable, real, text, varchar } from 'drizzle-orm/pg-core';

// No vino de `drizzle-kit pull`: es lo que cada usuario ya vio en la campana
// de avisos. lib/avisos.js la crea con el mismo DDL al marcar por primera vez.
export const aviso_visto = pgTable('aviso_visto', {
  id: varchar({ length: 80 }).primaryKey().notNull(),
  idusuario: integer().notNull(),
  clave: varchar({ length: 45 }).notNull(),
  firma: varchar({ length: 64 }).notNull(),
});

export const banco = pgTable('banco', {
  idbanco: integer().primaryKey().generatedByDefaultAsIdentity(),
  banco: varchar({ length: 100 }).notNull(),
});

// No vino de `drizzle-kit pull`: es el calendario de cada sucursal.
// /api/calendario la crea con el mismo DDL al guardar por primera vez. `fin` es
// el ultimo dia del evento, inclusivo.
export const calendario_evento = pgTable('calendario_evento', {
  id: varchar({ length: 40 }).primaryKey().notNull(),
  idsucursal: integer().notNull(),
  etiqueta: varchar({ length: 30 }).notNull(),
  titulo: varchar({ length: 120 }).notNull(),
  nota: varchar({ length: 500 }),
  inicio: date().notNull(),
  fin: date().notNull(),
  actualizado_por: integer(),
});

export const cantidad = pgTable('cantidad', {
  idCantidad: integer().primaryKey().generatedByDefaultAsIdentity(),
  cantidad: integer().notNull(),
});

export const categoria = pgTable('categoria', {
  idcategoria: integer().primaryKey().generatedByDefaultAsIdentity(),
  categoria: varchar({ length: 100 }).notNull(),
});

export const cfdi = pgTable('cfdi', {
  idcfdi: integer().primaryKey().notNull(),
  cfdi: varchar({ length: 100 }).notNull(),
});

export const cliente = pgTable('cliente', {
  idcliente: integer().primaryKey().generatedByDefaultAsIdentity(),
  email: varchar({ length: 100 }),
  nombre: varchar({ length: 150 }),
  telefono: varchar({ length: 45 }),
  rfc: varchar({ length: 80 }),
  domicilio: varchar({ length: 255 }),
});

export const compra = pgTable('compra', {
  idcompra: integer().primaryKey().generatedByDefaultAsIdentity(),
  num_factura: varchar({ length: 100 }),
  fecha_compra: date(),
  fecha_pago: date(),
  total: real().default(0).notNull(),
  descuento_total: real().default(0).notNull(),
  subtotal: real().default(0).notNull(),
  neto_total: real().default(0).notNull(),
  status: text(),
  idproveedor: integer(),
  idpoliza: integer(),
});

export const concepto = pgTable('concepto', {
  idconcepto: integer().primaryKey().generatedByDefaultAsIdentity(),
  precio_venta: real().notNull(),
  monto_venta: real().notNull(),
  cantidad: integer().notNull(),
  num_parte: varchar({ length: 100 }).notNull(),
  idventa: varchar({ length: 100 }).notNull(),
  type: text().default('N').notNull(),
  concepto_comodin: varchar({ length: 150 }),
  pedido: text().default('E').notNull(),
});

export const detalle = pgTable('detalle', {
  iddetalle: integer().primaryKey().generatedByDefaultAsIdentity(),
  existencia: integer().notNull(),
  costo: real().notNull(),
  aiva: real().notNull(),
  precio: real().notNull(),
  utilidad: real().notNull(),
  fecha_compra: date(),
  idsucursal: integer().notNull(),
  num_parte: varchar({ length: 100 }).notNull(),
  idlocalizacion: integer().notNull(),
});

export const elemento = pgTable('elemento', {
  idelemento: integer().primaryKey().generatedByDefaultAsIdentity(),
  idkit: integer(),
  num_parte: varchar({ length: 100 }),
});

export const factura = pgTable('factura', {
  idfactura: integer().primaryKey().generatedByDefaultAsIdentity(),
  folio: varchar({ length: 150 }),
  idventa: integer(),
  idcfdi: integer(),
  idregimen: integer(),
  idusuario: integer(),
  idcliente: integer(),
  emitida: text().default('P').notNull(),
  // Datos fiscales tal como los escribio el cliente al pedirla (2026-10). Las
  // facturas anteriores no los tienen y getInvoices cae a usuario/cliente.
  nombre: varchar({ length: 150 }),
  rfc: varchar({ length: 20 }),
  email: varchar({ length: 100 }),
  telefono: varchar({ length: 45 }),
  domicilio: varchar({ length: 255 }),
  cp: varchar({ length: 10 }),
});

export const grupo = pgTable('grupo', {
  idgrupo: integer().primaryKey().notNull(),
  grupo: varchar({ length: 45 }).notNull(),
});

export const imagenes = pgTable('imagenes', {
  idImagen: integer().primaryKey().generatedByDefaultAsIdentity(),
  ruta: varchar({ length: 100 }).notNull(),
  num_parte: varchar({ length: 100 }).notNull(),
});

export const kit = pgTable('kit', {
  idkit: integer().primaryKey().generatedByDefaultAsIdentity(),
  nombre: varchar({ length: 255 }),
  descripcion: text(),
  precio_total: numeric({ precision: 10, scale: 2 }),
});

export const localizacion = pgTable('localizacion', {
  idlocalizacion: integer().primaryKey().generatedByDefaultAsIdentity(),
  localizacion: varchar({ length: 45 }).notNull(),
});

export const marca = pgTable('marca', {
  idmarca: integer().primaryKey().generatedByDefaultAsIdentity(),
  marca: varchar({ length: 100 }).notNull(),
});

export const metodo = pgTable('metodo', {
  idmetodo: integer().primaryKey().notNull(),
  metodopago: varchar({ length: 45 }).notNull(),
});

export const pedidos = pgTable('pedidos', {
  idpedido: integer().primaryKey().generatedByDefaultAsIdentity(),
  idconcepto: integer(),
  idusuario: integer(),
  f_pedido: date().notNull(),
  f_entrega: date(),
  status: text().notNull(),
  email: varchar({ length: 100 }),
  telefono: varchar({ length: 45 }).notNull(),
  idventa: varchar({ length: 100 }),
  nombre: varchar({ length: 150 }),
});

// No vino de `drizzle-kit pull`: es de Permisos de perfil. /api/permisos-menu
// la crea con el mismo DDL al guardar por primera vez.
export const permiso_menu = pgTable('permiso_menu', {
  modulo: varchar({ length: 45 }).primaryKey().notNull(),
  admin: integer().default(0).notNull(),
  empleado: integer().default(0).notNull(),
});

export const poliza = pgTable('poliza', {
  idpoliza: integer().primaryKey().generatedByDefaultAsIdentity(),
  fecha_poliza: date(),
  importe: real(),
  tipo: text(),
  idbanco: integer(),
});

export const producto = pgTable('producto', {
  num_parte: varchar({ length: 100 }).primaryKey().notNull(),
  status: text().notNull(),
  descripcion: varchar({ length: 100 }).notNull(),
  modelo: varchar({ length: 100 }),
  idgrupo: integer().notNull(),
  idproveedor: integer().default(152).notNull(),
  idmarca: integer(),
  idcategoria: integer(),
  mod_ini: varchar({ length: 45 }),
  mod_fin: varchar({ length: 45 }),
  idelemento: integer(),
});

export const proveedor = pgTable('proveedor', {
  idproveedor: integer().primaryKey().generatedByDefaultAsIdentity(),
  empresa: varchar({ length: 100 }).notNull(),
  agente: varchar({ length: 200 }),
  descuento: real(),
  plazo_dias: integer().notNull(),
});

export const regimen = pgTable('regimen', {
  idregimen: integer().primaryKey().generatedByDefaultAsIdentity(),
  regimen: varchar({ length: 150 }).notNull(),
});

export const registro = pgTable('registro', {
  idregistro: integer().primaryKey().generatedByDefaultAsIdentity(),
  cantidad_solicitada: integer(),
  ultimo_costo: real(),
  costo_actual: real(),
  descuento_uno: real().default(0).notNull(),
  descuento_dos: real().default(0).notNull(),
  descuento_tres: real().default(0).notNull(),
  importe: real(),
  neto: real(),
  idcompra: integer(),
  num_parte: varchar({ length: 100 }),
});

export const sucursal = pgTable('sucursal', {
  idsucursal: integer().primaryKey().generatedByDefaultAsIdentity(),
  sucursal: varchar({ length: 45 }).notNull(),
  telefono_uno: varchar({ length: 45 }),
  telefono_dos: varchar({ length: 45 }),
  whats_uno: varchar({ length: 45 }),
  whats_dos: varchar({ length: 45 }),
  direccion: varchar({ length: 255 }),
});

export const usuario = pgTable('usuario', {
  idusuario: integer().primaryKey().generatedByDefaultAsIdentity(),
  email: varchar({ length: 100 }).notNull(),
  cognitoid: varchar({ length: 150 }).notNull(),
  nombre: varchar({ length: 45 }).notNull(),
  apellido: varchar({ length: 45 }).notNull(),
  telefono: varchar({ length: 45 }).notNull(),
  f_nacimiento: date(),
  genero: text().notNull(),
  rfc: varchar({ length: 80 }).notNull(),
  domicilio: varchar({ length: 255 }).notNull(),
  categoria: varchar({ length: 45 }).notNull(),
  empleado: integer().notNull(),
  idsucursal: integer(),
});

// No vinieron de `drizzle-kit pull`: vacaciones de los empleados.
// /api/vacaciones las crea con el mismo DDL al escribir por primera vez.
// `vacacion` es un renglon por dia tomado ("<idusuario>:<fecha>");
// `vacacion_dias`, los dias que le tocan por ano ("<idusuario>:<anio>").
export const vacacion = pgTable('vacacion', {
  id: varchar({ length: 30 }).primaryKey().notNull(),
  idusuario: integer().notNull(),
  fecha: date().notNull(),
});

export const vacacion_dias = pgTable('vacacion_dias', {
  id: varchar({ length: 20 }).primaryKey().notNull(),
  idusuario: integer().notNull(),
  anio: integer().notNull(),
  dias: integer().default(0).notNull(),
});

export const venta = pgTable('venta', {
  idVenta: integer().primaryKey().generatedByDefaultAsIdentity(),
  folio: varchar({ length: 150 }).notNull(),
  fecha_venta: date().notNull(),
  total_venta: real().notNull(),
  idusuario: integer().notNull(),
  status: text().notNull(),
  idmetodo: integer().default(1).notNull(),
  nota: text(),
  idsucursal: integer(),
  tracking_web: varchar({ length: 150 }),
});
