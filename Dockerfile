# Imagen de produccion de la app Next.
#
# Base Debian slim y no Alpine: better-sqlite3 publica binarios precompilados
# para glibc. En Alpine (musl) no aplican y npm tendria que compilarlo desde
# fuente en cada build.
#
# Se construye siempre para linux/amd64 (ver PLATFORM en el Makefile de
# infraestructura): los nodos EKS son x86_64 y una imagen arm64 sube sin
# error pero el pod muere en runtime con "exec format error".

# ----------------------------------------------------------------- deps ----
FROM node:22-bookworm-slim AS deps

# Toolchain por si algun modulo nativo no trae binario para esta plataforma
# y node-gyp tiene que compilarlo. Solo vive en esta etapa, no llega a la
# imagen final.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Solo los manifiestos primero: mientras package.json y el lock no cambien,
# Docker reutiliza la capa de `npm ci` y el build no vuelve a bajar nada.
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------- build ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Las variables NEXT_PUBLIC_* se incrustan en el bundle del navegador durante
# este paso; no se leen en runtime. Un Secret de k8s llega demasiado tarde para
# ellas, asi que tienen que entrar aqui. El resto de las variables NO entra: esas
# si viajan por Secret, y por eso .env.local esta en .dockerignore.
#
# Llegan en un unico ARG, con formato CLAVE=valor por linea, que se escribe a
# .env.production: el archivo que Next lee al construir. Un solo ARG en vez de
# uno por variable para que agregar una publica nueva no obligue a editar este
# Dockerfile.
#
# OJO: `next build` copia ese .env.production dentro de .next/standalone, asi
# que sobrevive en la imagen final aunque aqui se borre el original. Es
# aceptable porque por este ARG solo viajan valores publicos —guard-public-vars
# lo garantiza— y de paso el servidor conserva esas variables aunque el Secret
# no este cargado. Pero si algun dia se pasara un secreto por aqui, quedaria
# dentro de la imagen.
#
# Solo deben viajar valores publicos: un build arg queda registrado en el
# historial de la imagen. `make build` aborta si encuentra una credencial con
# el prefijo NEXT_PUBLIC_.
ARG NEXT_PUBLIC_ENV=""
RUN printf '%s\n' "$NEXT_PUBLIC_ENV" > .env.production \
    && npm run build \
    && rm -f .env.production

# --------------------------------------------------------------- runner ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Sin esto Next escucha solo en localhost dentro del contenedor y el kubelet
# no puede alcanzarlo: las probes fallan y el pod entra en CrashLoopBackOff.
ENV HOSTNAME=0.0.0.0

# Usuario sin privilegios: el proceso no corre como root dentro del pod.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# `output: "standalone"` (next.config.mjs) deja en .next/standalone un server.js
# junto con las unicas dependencias que el trace encontro necesarias. Los
# estaticos y public no entran en ese trace, van copiados aparte.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
