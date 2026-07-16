# Mahlzeit Dashboard

Ein für Fernseher optimiertes Linux-Kiosk-Dashboard mit:

- eingebettetem Browser für das Device Monitoring
- Wetter über die kostenlose Open-Meteo-API, ohne API-Key
- Meme des Tages mit lokalem Text-Fallback
- großer Uhr und Datum
- automatischen Mittagspausen-Hinweisen in der Zeitzone `Europe/Berlin`
- Vollbild-/Kioskmodus und Linux-Autostart

## Zeitsteuerung

Standardmäßig gelten folgende Anzeigen:

| Uhrzeit | Anzeige |
|---|---|
| 11:50–11:54 | Rot blinkend: **Gleich ist Mittag!** |
| 11:55–12:50 | Vollflächig rot: **Mahlzeit!** |
| 13:00–13:00:59 | Rot blinkend: **Mittagspause zu Ende** |

Die App wertet den aktuellen Zeitraum bei jedem Start neu aus. Wird sie beispielsweise um 12:20 Uhr gestartet, erscheint sofort die Mahlzeit-Anzeige.

## Voraussetzungen

- Linux mit grafischer Oberfläche, beispielsweise Linux Mint oder Ubuntu
- Node.js 20 oder neuer
- npm
- Internetzugriff für Wetter und Meme; das Monitoring kann auch intern erreichbar sein

## Installation

```bash
git clone https://github.com/lgaa08/Mahlzeit-Dash.git
cd Mahlzeit-Dash
chmod +x scripts/install-linux.sh
npm run install:linux
```

Direkter Start:

```bash
npm start
```

Teststart ohne fest erzwungenen Produktivablauf:

```bash
npm run dev
```

Der Installationshelfer legt zusätzlich diese Autostart-Datei an:

```text
~/.config/autostart/mahlzeit-dashboard.desktop
```

Nach der nächsten grafischen Anmeldung startet das Dashboard automatisch.

## Konfiguration

Alle wichtigen Einstellungen liegen in `config.json`.

### Monitoring-URL ändern

```json
"monitoringUrl": "https://monitoring.firma.local"
```

Die eingebettete Electron-Webview ist ein eigener Browser-Kontext. Dadurch funktionieren viele Monitoring-Oberflächen, die eine normale iframe-Einbettung verhindern würden.

### Wetterstandort ändern

```json
"weather": {
  "locationName": "Kempten (Allgäu)",
  "latitude": 47.7267,
  "longitude": 10.3139,
  "timezone": "Europe/Berlin"
}
```

Breiten- und Längengrad können beispielsweise aus OpenStreetMap übernommen werden.

### Zeiten ändern

```json
"schedule": {
  "timezone": "Europe/Berlin",
  "almostLunch": "11:50",
  "lunchStart": "11:55",
  "lunchEndDisplayUntil": "12:50",
  "breakFinished": "13:00",
  "breakFinishedDurationSeconds": 60
}
```

### Kioskmodus vorübergehend abschalten

Zum Einrichten kann in `config.json` geändert werden:

```json
"kiosk": false
```

Anschließend `npm start` erneut ausführen. Für den Fernseher sollte der Wert danach wieder auf `true` gesetzt werden.

## Bedienung

Im Monitoring-Bereich stehen Zurück, Vor, Startseite und Neu laden zur Verfügung. `F5` lädt ebenfalls die Monitoring-Seite neu. Die Wetterdaten werden alle zehn Minuten aktualisiert; das Meme standardmäßig alle sechs Stunden oder über den Button **Neu**.

## Fehlerbehebung

### Dashboard startet nicht

```bash
node --version
npm install
npm run check
npm start
```

### Electron benötigt zusätzliche Linux-Bibliotheken

Auf Debian/Ubuntu/Linux Mint können je nach Minimalinstallation zusätzliche Pakete nötig sein:

```bash
sudo apt update
sudo apt install -y libgtk-3-0 libnss3 libxss1 libasound2t64 libgbm1
```

Bei älteren Distributionen heißt das Audiopaket eventuell `libasound2` statt `libasound2t64`.

### Interne HTTPS-Seite mit selbstsigniertem Zertifikat

Am saubersten wird die interne CA auf dem Linuxclient als vertrauenswürdig installiert. Das Dashboard deaktiviert Zertifikatsprüfungen absichtlich nicht.

## Datenschutz

Wetteranfragen gehen an Open-Meteo. Meme-Inhalte werden von `meme-api.com` geladen. Die Meme-Funktion kann in `config.json` mit `"enabled": false` vollständig deaktiviert werden.
