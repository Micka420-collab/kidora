#!/bin/sh
# Container start: wait for the database, sync the schema (idempotent), then run.
set -e

echo "Kidora: syncing database schema…"
n=0
until npm run db:push; do
  n=$((n + 1))
  if [ "$n" -ge 20 ]; then
    echo "Kidora: database not reachable after 20 attempts — check DATABASE_URL." >&2
    exit 1
  fi
  echo "Kidora: database not ready, retrying in 3s ($n/20)…"
  sleep 3
done

echo "Kidora: starting server on :3000"
exec npm start
