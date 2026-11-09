This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

### Base local de desarrollo

En desarrollo la app usa su propio PostgreSQL en `127.0.0.1:5432`
(`compose.local.yaml`, Docker), aparte de producción. Necesita Docker Desktop
abierto; `npm run dev` levanta la base antes de iniciar Next (`predev`).

La primera vez, y cuando quieras datos más nuevos, llénala con
`npm run db:local:cargar`. No se conecta a producción: baja de
`s3://appddata-logs/Dump/<último día>/` el `refautomex.dump` y el CSV de
`hydrate` (los textos), los restaura en local y recorta con
`scripts/db-local-recorte.sql`:

- catálogos, productos, inventario y ubicaciones completos;
- los empleados tal cual, para entrar con la misma cuenta de Cognito;
- las 2000 ventas más recientes (`REFAUTOMEX_LOCAL_VENTAS`) y las compras del
  último año;
- clientes, pedidos y facturas anonimizados con correos `@local.test`.

Pide la sesión de AWS del perfil `refautomex-download`
(`aws login --profile refautomex-download`; otro con `REFAUTOMEX_AWS_PROFILE`).
Los respaldos quedan en `.db-local/`, fuera de git y de la imagen. Volver a
cargar reemplaza la base local completa. `npm run db:local:estado` dice de qué
respaldo vino y cuántos renglones tiene cada tabla.

`.env.local` apunta `DATABASE_URL` y `DATABASE_URL_UNPOOLED` a
`postgresql://refautomex:refautomex@127.0.0.1:5432/refautomex` y
`APPSTRACT_DATABASE_URL` a `.../appddata` del mismo contenedor.

### PostgreSQL del droplet (solo a propósito)

`npm run db:tunnel` abre un túnel SSH al PostgreSQL de producción en
`127.0.0.1:5433`. Usa la IP del state de `../../../infrastructure-terraform-appddata`,
la llave `~/.ssh/appddata_admin` y descubre la IP actual del contenedor; SSH
puede pedir la contraseña de la llave. La app ya no lo usa: es para operar sobre
producción con los scripts de abajo, pasándoles la URL de producción en
`DATABASE_URL` en el mismo comando. Puedes ajustar las rutas con
`REFAUTOMEX_INFRA_DIR`, `REFAUTOMEX_SSH_KEY` y `REFAUTOMEX_DB_PORT`. Las llaves y
credenciales no se guardan en el repositorio.

`npm run db:pg:check` compara las tablas, columnas, tipos, nulabilidad, claves
primarias, identidades y valores por defecto de Drizzle con la base configurada,
y muestra el inventario por sucursal. Es de solo lectura y termina con error si
hay diferencias. Tanto esta auditoría como Drizzle cargan `.env.local`; las
variables ya definidas en el entorno tienen prioridad. La app usa la misma
selección de URL (`DATABASE_URL_UNPOOLED`, después `DATABASE_URL`).

`npm run db:pg:llaves` revisa las llaves foráneas de `schema.pg.js` contra la
base: cuáles faltan, cuáles están sin validar y cuántos renglones huérfanos
tiene cada una. Es de solo lectura. Con `-- --aplicar` las crea en una
transacción (las que tienen huérfanos quedan `NOT VALID`), y lo que cambia de
datos lo guarda antes en el esquema `respaldo_llaves`. `-- --revertir` deja la
base como estaba antes de aplicarlas. En una base con datos va antes de
`db:pg:push`.

`npm run db:web:catalogo` revisa la sucursal WEB de la tienda en línea: los
productos activos con foto que existe en S3 y sin renglón en WEB. Es de solo
lectura. Con `-- --aplicar` les crea su renglón copiado de TLALNEPANTLA
(precio, costo y existencia; ubicación `0`) y lo anota en el esquema
`respaldo_web`; `-- --revertir` borra exactamente esos renglones. La tienda solo
muestra los que además tienen categoría (`idgrupo > 0`).

Estos scripts y `npm run db:pg:push` usan `DATABASE_URL`: con `.env.local` tal
cual, trabajan sobre la base local. `db:pg:push` modifica la base a la que
apunta; contra producción solo después de revisar los cambios de esquema. No
sincroniza datos.

Por ahora tickets opera con TLALNEPANTLA (sucursal 2), independientemente de la
sucursal asignada al empleado. El buscador, la venta y la impresión usan esa
misma sucursal; no se modifica la asignación de la cuenta.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
