#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTOSTART_DIR="${HOME}/.config/autostart"
DESKTOP_FILE="${AUTOSTART_DIR}/mahlzeit-dashboard.desktop"

if ! command -v node >/dev/null 2>&1; then
  echo "Fehler: Node.js ist nicht installiert. Bitte Node.js 20 oder neuer installieren."
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( NODE_MAJOR < 20 )); then
  echo "Fehler: Node.js 20 oder neuer wird benötigt. Gefunden: $(node --version)"
  exit 1
fi

cd "$APP_DIR"
echo "Installiere Abhängigkeiten …"
npm install

mkdir -p "$AUTOSTART_DIR"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Mahlzeit Dashboard
Comment=Office Monitoring und Info Dashboard
Exec=/usr/bin/env bash -lc 'cd "$APP_DIR" && npm start'
Path=$APP_DIR
Terminal=false
X-GNOME-Autostart-enabled=true
StartupNotify=false
EOF

chmod +x "$DESKTOP_FILE"
echo
echo "Installation abgeschlossen."
echo "Direkt starten: cd \"$APP_DIR\" && npm start"
echo "Autostart-Datei: $DESKTOP_FILE"
echo "Monitoring-URL und Standort: $APP_DIR/config.json"
