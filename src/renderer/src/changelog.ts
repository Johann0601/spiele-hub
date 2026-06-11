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
    version: '0.4.1',
    date: '2026-06-12',
    title: 'Aufgeräumte Startseite & Sidebar-Verhalten',
    changes: [
      'Startseite verschlankt: Die Karten „Updates" und „System / Treiber" sind weg — das übernimmt jetzt die 🔔-Glocke.',
      'Seitwärts scrollbare Reihen reagieren nicht mehr aufs Mausrad (nur noch per Scrollbalken) — das Rad scrollt überall ganz normal die Seite hoch und runter.',
      'Die Seitenleiste verdeckt beim Aufklappen nichts mehr: Der Inhalt rückt sanft mit zur Seite, und die Leiste klappt erst nach kurzem Verweilen auf.'
    ]
  },
  {
    version: '0.4.0',
    date: '2026-06-12',
    title: 'Benachrichtigungen',
    changes: [
      'Neue Glocke unten in der Seitenleiste: bündelt alles rund um Updates an einem Ort — App-Updates, ausstehende Steam-Spiel-Updates und Nvidia-Treiber-Updates.',
      'Zähler-Badge an der Glocke zeigt auf einen Blick, wie viel ansteht (auch bei eingeklappter Leiste).',
      'Der orange Update-Knopf unten links ist dafür in die Benachrichtigungen umgezogen („Jetzt neu starten").'
    ]
  },
  {
    version: '0.3.2',
    date: '2026-06-11',
    title: 'Sidebar-Feinschliff',
    changes: [
      'Der Update-Hinweis unten links wird nicht mehr abgeschnitten: eingeklappt ein kompaktes ⬆️-Kästchen, ausgeklappt mit vollständigem Text.'
    ]
  },
  {
    version: '0.3.1',
    date: '2026-06-11',
    title: 'Scroll-Feinschliff',
    changes: [
      'Mausrad über einer seitlich scrollbaren Reihe bewegt jetzt nur noch die Reihe — die Seite scrollt dabei nicht mehr mit.'
    ]
  },
  {
    version: '0.3.0',
    date: '2026-06-11',
    title: 'Shops, Angebote & neues Design',
    changes: [
      'Neuer Bereich „Shops": Epic-Gratisspiele der Woche, deine komplette Epic-Bibliothek (auch nicht installierte Spiele, mit offizieller Spielzeit) und die aktuellen Steam-Angebote.',
      'Startseite zeigt jetzt Top-Angebote: „Gratis bei Epic" und „Steam-Angebote" als seitlich scrollbare Reihen.',
      'Schnellauswahl „Weiter spielen": scrollbare Reihe statt Umbruch; der ▶-Knopf in der Bildmitte startet das Spiel, ein Klick daneben öffnet die Detailansicht.',
      'Die Seitenleiste ist jetzt ein schmaler Balken und klappt beim Drüberfahren aus.',
      'Neuer Einstellungen-Bereich (unten in der Leiste): Konten, System/Treiber und Changelog sind dorthin umgezogen — dazu ein Schalter für den Hell-Modus.',
      'Layout im Vollbild verbessert: Inhalt zentriert, Bereiche nutzen die Breite.'
    ]
  },
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
