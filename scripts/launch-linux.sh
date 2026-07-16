#!/usr/bin/env bash
set -u

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR" || exit 1

# Nach der grafischen Anmeldung kurz warten, bis Netzwerk und Desktop bereit sind.
sleep 8

while true; do
  npm start
  EXIT_CODE=$?
  echo "Mahlzeit Dashboard wurde mit Code ${EXIT_CODE} beendet. Neustart in 5 Sekunden …" >&2
  sleep 5
done
