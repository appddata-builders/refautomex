This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

### PostgreSQL del droplet en desarrollo

Antes de iniciar la app, ejecuta `npm run db:tunnel` en otra terminal y mantenla
abierta. Usa la IP del state de `../../../infrastructure-terraform-appddata`, la
llave `~/.ssh/appddata_admin` y descubre la IP actual del contenedor de PostgreSQL.
SSH puede pedir la contraseña de la llave. El puerto local es `127.0.0.1:5433`.

Las URLs de `.env.local` deben usar las credenciales vigentes del droplet con ese
host y puerto: `DATABASE_URL` y `DATABASE_URL_UNPOOLED` apuntan a `refautomex`;
`APPSTRACT_DATABASE_URL` apunta a `appddata`. Reinicia Next.js después de cambiar
credenciales, porque el pool de conexiones se conserva durante la recarga.
Si falta `hydrate`, los textos se leen del JSON local.

Puedes ajustar las rutas con `REFAUTOMEX_INFRA_DIR`, `REFAUTOMEX_SSH_KEY` y
`REFAUTOMEX_DB_PORT`. Las llaves y credenciales no se guardan en el repositorio.

`npm run db:pg:check` compara las tablas, columnas, tipos, nulabilidad, claves
primarias, identidades y valores por defecto de Drizzle con la base configurada,
y muestra el inventario por sucursal. Es de solo lectura y termina con error si
hay diferencias. Tanto esta auditoría como Drizzle cargan `.env.local`; las
variables ya definidas en el entorno tienen prioridad. La app usa la misma
selección de URL (`DATABASE_URL_UNPOOLED`, después `DATABASE_URL`).

En desarrollo se consulta actualmente la base del droplet mediante el túnel:
no hay una copia local de inventario. `npm run db:pg:push` modifica esa base;
solo debe usarse después de revisar los cambios de esquema. No sincroniza datos.

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
