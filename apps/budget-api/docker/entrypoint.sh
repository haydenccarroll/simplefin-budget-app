#!/bin/sh
set -e

# Both commands apply any pending database migrations when they start.
case $1 in
  serve)
    if [ -n "$LITESTREAM_ACCOUNT_NAME" ]; then
      # The database lives in blob storage between runs: fetch the latest copy
      # (a first run with no copy starts empty), then run the API under
      # Litestream, which replicates every write and does a last sync when the
      # API exits.
      litestream restore -config /app/litestream.yml -if-db-not-exists -if-replica-exists "$DATABASE_PATH"
      exec litestream replicate -config /app/litestream.yml -exec "/app/budget-api serve"
    fi
    exec /app/budget-api serve
  ;;

  worker)
    exec /app/budget-api worker
  ;;

  *)
    echo "usage: entrypoint.sh serve|worker" >&2
    exit 64
  ;;
esac
