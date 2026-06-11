// Versions-Historie der App. Bei JEDEM Release kommt der neueste Eintrag
// NACH OBEN — diese Datei wird mit ausgeliefert, jede Version kennt also
// ihre eigene Geschichte.

export type ChangelogEntry = {
  version: string
  date: string // ISO, z. B. '2026-06-11'
  title: string
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.2.0',
    date: '2026-06-11',
    title: 'Epic-Konto verbinden',
    changes: [
      'Neuer Bereich „Konten": Verbinde dein Epic-Games-Konto mit der App (Anmeldung läuft über die offizielle Epic-Seite, das Passwort sieht die App nie).',
      'Epic-Spielzeiten werden automatisch übernommen — die offiziellen Werte aus deinem Epic-Konto, abgeglichen bei jedem App-Start.',
      'Die Zugangsdaten werden mit Windows-Verschlüsselung nur lokal gespeichert; Trennen jederzeit möglich.'
    ]
  },
  {
    version: '0.1.2',
    date: '2026-06-11',
    title: 'Changelog',
    changes: [
      'Neuer Menüpunkt „Changelog": zeigt für jede Version, was sich geändert hat.',
      'Die eigene installierte Version wird im Changelog markiert.'
    ]
  },
  {
    version: '0.1.1',
    date: '2026-06-11',
    title: 'Automatische Updates',
    changes: [
      'Die App prüft beim Start (und alle 6 Stunden) auf GitHub, ob es eine neue Version gibt.',
      'Updates werden still im Hintergrund heruntergeladen — installiert wird erst per Klick auf „Neu starten".',
      'Versionsanzeige unten links in der Seitenleiste.'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-06-11',
    title: 'Erste installierbare Version',
    changes: [
      'Windows-Installer (Setup-exe) mit Startmenü- und Desktop-Verknüpfung.',
      'Startseite mit Highlights, „Weiter spielen"-Schnellauswahl und Launcher-Leiste.',
      'Spiele-Bibliothek: Steam- und Epic-Spiele mit Covern, Start/Schließen aus der App.',
      'Spielzeit-Tracking über Prozess-Überwachung — zählt auch direkt gestartete Spiele.',
      'Steam-Update-Erkennung mit eigener Update-Historie.',
      'World-of-Tanks-Mod-Verwaltung: an/aus, hinzufügen, nach Spiel-Updates wiederherstellen.',
      'Minecraft-Profile aus Modrinth, CurseForge und FTB App.',
      'System-Ansicht: Geräte mit Treiberversionen, Nvidia-Treiber-Update-Prüfung, Laufwerks-Füllstände.'
    ]
  }
]
