#!/usr/bin/env bash
# La base de desarrollo en localhost (compose.local.yaml), aparte de produccion.
#
#   bash scripts/db-local.sh arrancar          levanta Postgres si no esta arriba (lo corre `predev`)
#   bash scripts/db-local.sh cargar [fecha]    la llena con una seccion del respaldo de S3
#   bash scripts/db-local.sh estado            que hay en la base local y de que respaldo vino
#
# `cargar` NO se conecta a produccion. Baja lo que appddata-backup deja cada dia
# en s3://appddata-logs/Dump/<fecha>/: refautomex.dump, y de appddata solo el CSV
# de `hydrate` (los textos). Lo restaura aqui, recorta y anonimiza con
# scripts/db-local-recorte.sql, y anota de donde vino en `entorno.carga`.
# Volver a correrlo reemplaza la base local completa. Las ventas que se quedan
# las fija REFAUTOMEX_LOCAL_VENTAS (2000 por omision).
#
# Pide la sesion de AWS del perfil REFAUTOMEX_AWS_PROFILE (por omision
# refautomex-download): `aws login --profile refautomex-download`.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$PROJECT_DIR/compose.local.yaml")
PERFIL="${REFAUTOMEX_AWS_PROFILE:-refautomex-download}"
BUCKET="s3://appddata-logs/Dump"
# Fuera de git y de la imagen (.gitignore, .dockerignore): son datos de clientes.
DESCARGAS="$PROJECT_DIR/.db-local"

# Sin los NOTICE de "no existe, se omite" de cada DROP ... IF EXISTS.
psql_local() {
  "${COMPOSE[@]}" exec -T -e PGOPTIONS='-c client_min_messages=warning' postgres \
    psql -U refautomex -X -q -v ON_ERROR_STOP=1 "$@"
}

arrancar() {
  if ! docker info >/dev/null 2>&1; then
    echo 'Docker no esta corriendo: abre Docker Desktop y vuelve a intentar.' >&2
    exit 1
  fi
  "${COMPOSE[@]}" --progress quiet up -d --wait --quiet-pull postgres
  # Recien creada, la base no tiene tablas y el login diria "no eres empleado".
  if [[ "$(psql_local -d refautomex -At -c "SELECT to_regclass('public.usuario') IS NOT NULL")" != t ]]; then
    echo 'La base local esta vacia: corre `npm run db:local:cargar` para llenarla desde el respaldo de S3.' >&2
  fi
}

bajar() {
  aws --profile "$PERFIL" s3 cp --only-show-errors "$BUCKET/$1" "$2"
}

cargar() {
  arrancar

  local fecha="${1:-}"
  if [[ -z "$fecha" ]]; then
    fecha="$(aws --profile "$PERFIL" s3 ls "$BUCKET/" | awk '$1 == "PRE" { sub("/", "", $2); print $2 }' | sort | tail -1)"
  fi
  if [[ ! "$fecha" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "No encontre respaldos en $BUCKET (perfil $PERFIL)." >&2
    exit 1
  fi

  local carpeta="$DESCARGAS/$fecha"
  mkdir -p "$carpeta"
  echo ">> respaldo del $fecha"
  [[ -s "$carpeta/refautomex.dump" ]] || bajar "$fecha/refautomex/schemadata/refautomex.dump" "$carpeta/refautomex.dump"
  [[ -s "$carpeta/hydrate.csv" ]] || bajar "$fecha/appddata/schemadata/csv/public/hydrate.csv" "$carpeta/hydrate.csv"

  echo '>> restaurando refautomex en localhost'
  psql_local -d postgres -c 'DROP DATABASE IF EXISTS refautomex WITH (FORCE)' -c 'CREATE DATABASE refautomex'
  # Solo `public`: respaldo_llaves es de la migracion de llaves en produccion.
  "${COMPOSE[@]}" exec -T postgres pg_restore -U refautomex -d refautomex \
    --schema=public --no-owner --no-acl --exit-on-error < "$carpeta/refautomex.dump"

  echo '>> recortando y anonimizando'
  psql_local -d refautomex -v fecha_respaldo="$fecha" -v ventas="${REFAUTOMEX_LOCAL_VENTAS:-2000}" \
    < "$PROJECT_DIR/scripts/db-local-recorte.sql"

  echo '>> textos (hydrate) en la base appddata local'
  psql_local -d postgres -c 'DROP DATABASE IF EXISTS appddata WITH (FORCE)' -c 'CREATE DATABASE appddata'
  # Igual que lib/hydrate/schema.pg.js. Las columnas del COPY salen del
  # encabezado del CSV, por si el orden en produccion es otro.
  psql_local -d appddata -c "CREATE TABLE hydrate (
      id text PRIMARY KEY,
      project_slug text NOT NULL,
      content_key text NOT NULL,
      content_value text NOT NULL,
      created_at timestamp(3) NOT NULL DEFAULT now(),
      updated_at timestamp(3) NOT NULL DEFAULT now()
    )"
  local columnas
  columnas="$(head -1 "$carpeta/hydrate.csv" | tr -d '\r"')"
  psql_local -d appddata -c "COPY hydrate ($columnas) FROM STDIN WITH (FORMAT csv, HEADER)" < "$carpeta/hydrate.csv"
  psql_local -d appddata \
    -c "DELETE FROM hydrate WHERE project_slug <> 'refautomex'" \
    -c 'CREATE INDEX hydrate_project_slug_idx ON hydrate (project_slug)' \
    -c 'CREATE UNIQUE INDEX hydrate_project_slug_content_key_uidx ON hydrate (project_slug, content_key)'

  estado
}

estado() {
  arrancar
  psql_local -d refautomex -P footer=off -x -c 'SELECT * FROM entorno.carga'
  # Conteo exacto: las estadisticas de Postgres tardan en enterarse de lo que
  # el recorte acaba de borrar.
  psql_local -d refautomex -P footer=off -c "
    SELECT table_name AS tabla,
           (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I', table_name), false, true, '')))[1]::text::int AS renglones
      FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY 2 DESC, 1"
}

case "${1:-}" in
  arrancar) arrancar ;;
  cargar) cargar "${2:-}" ;;
  estado) estado ;;
  *)
    echo 'Uso: bash scripts/db-local.sh arrancar | cargar [AAAA-MM-DD] | estado' >&2
    exit 1
    ;;
esac
