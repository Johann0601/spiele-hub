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
    version: '0.10.0',
    date: '2026-06-14',
    title: 'Neuer Name: buffd',
    changes: [
      'Die App heißt jetzt „buffd" — mit eigenem Logo (Hexagon-Hub-Symbol) und Wortmarke in der Seitenleiste und im Kopfbereich.',
      'Neues App-Icon für Fenster, Taskleiste, Startmenü- und Desktop-Verknüpfung.',
      'Hell-Modus überarbeitet: Kopfzeilen sind jetzt im hellen Design gut lesbar (vorher dunkel auf dunkel), und die Seitenleiste bleibt bewusst dunkel, damit die Symbole klar erkennbar sind.',
      'Der Schalter heißt jetzt „Darkmode" und ist standardmäßig an.',
      'Deine Daten bleiben vollständig erhalten — Spielzeiten, Konten und Einstellungen wandern unverändert mit.'
    ]
  },
  {
    version: '0.9.2',
    date: '2026-06-14',
    title: 'Nicht-installiert: Suche, Filter & Sortierung',
    changes: [
      'Die Kategorie „Nicht installiert" hat jetzt eine eigene Suchleiste, einen Plattform-Filter und eine Sortierung (zuletzt gespielt, Spielzeit, Name) — unabhängig von den installierten Spielen.',
      'Filter und Sortierung der Liste werden gemerkt.'
    ]
  },
  {
    version: '0.9.1',
    date: '2026-06-14',
    title: 'Glocke aktualisieren',
    changes: [
      'Neuer Knopf „↻ Aktualisieren" in den Benachrichtigungen: prüft sofort alles neu — Spiel-Updates (frischer Bibliotheks-Scan), Wunschlisten-Preise, Nvidia-Treiber und Epic-Gratisspiele — ohne auf die automatische 6-Stunden-Prüfung zu warten.'
    ]
  },
  {
    version: '0.9.0',
    date: '2026-06-14',
    title: 'Nicht installierte Spiele',
    changes: [
      'Neue Kategorie „Nicht installiert" unter den installierten Spielen: zeigt deinen kompletten Besitz-Katalog, der gerade nicht installiert ist — mit Spielzeit und (wo verfügbar) „zuletzt gespielt".',
      'Steam liefert den ganzen Besitz-Katalog samt echtem „zuletzt gespielt" (braucht den Steam-Web-API-Key und öffentliche Spieldetails); Epic die komplette Bibliothek (braucht das verbundene Konto).',
      'Andere Launcher (Battle.net, Ubisoft, Riot, RSI, Xbox) haben keine solche Schnittstelle — dort erscheinen Spiele, die mal installiert waren (z. B. dein deinstalliertes Call of Duty), weiterhin mit erhaltener Spielzeit.',
      'Direkt aus der Kachel installieren: bei Steam öffnet sich der Installations-Dialog, bei Epic der Launcher; Suche und Plattform-Filter gelten auch hier.',
      'Ein Hinweis erklärt, was noch fehlt (Key hinterlegen, Konto verbinden oder Steam-Spieldetails auf „öffentlich" stellen).'
    ]
  },
  {
    version: '0.8.2',
    date: '2026-06-12',
    title: 'Deinstallierte Spiele werden erkannt',
    changes: [
      'Deinstallierst du ein Spiel, verschwindet es jetzt automatisch aus der Bibliothek — samt veralteter Update-Hinweise in der 🔔-Glocke (vorher blieb beides hängen).',
      'Deine Spielzeiten bleiben dabei vollständig erhalten: Installierst du das Spiel später neu, ist alles sofort wieder da.'
    ]
  },
  {
    version: '0.8.1',
    date: '2026-06-12',
    title: 'Sidebar-Feinschliff',
    changes: [
      'Die Seitenleiste klappt beim Drüberfahren wieder sofort auf — die kurze Wartezeit ist raus.'
    ]
  },
  {
    version: '0.8.0',
    date: '2026-06-12',
    title: 'Wunschliste, Preise & Xbox-Spiele',
    changes: [
      'Shop-übergreifende Wunschliste mit Preisalarm (Shops → ⭐ Wunschliste): Spiele aus Steam UND Epic per Suche oder ☆ hinzufügen, die App prüft Preise alle 6 Stunden — Rabatte melden sich in der 🔔-Glocke.',
      'Steam-Wunschliste importieren: Ein Klick übernimmt die Wunschliste deines Steam-Kontos.',
      'Epic-Gratisspiel-Erinnerung: Die Glocke meldet Wochen-Gratisspiele, die noch nicht in deiner Epic-Bibliothek sind (ausblendbar).',
      'Preise auf den Spiel-Detailseiten: aktueller Steam-Preis, mit IsThereAnyDeal-Key (Einstellungen → Konten) zusätzlich bester Shop-Preis und historischer Tiefstpreis.',
      'Store-Suche in den Shop-Bereichen von Steam und Epic; die Shop-Übersicht zeigt Highlights aus allen Shops.',
      'Spiele-Seite: Suchleiste, Plattform-Filter und Sortierung (Spielzeit, zuletzt gespielt, Name, Größe) — Filter und Sortierung werden gemerkt.',
      'Xbox-App-Spiele werden erkannt und getrackt (z. B. Minecraft Launcher und Roblox aus dem XboxGames-Ordner); der Xbox-Launcher-Chip zeigt jetzt das echte Logo.'
    ]
  },
  {
    version: '0.7.0',
    date: '2026-06-12',
    title: 'Speicherplatz-Analyse',
    changes: [
      'Neuer Bereich „Speicherplatz der Spiele" unter System / Treiber: alle Spiele nach Größe sortiert, mit Balken, Gesamtsumme und Laufwerk — einmal berechnet, dauerhaft gespeichert.',
      'Aufräum-Tipps: Spiele über 10 GB, die seit über 3 Monaten nicht gespielt wurden, zeigen an, wie viel Platz eine Deinstallation freigeben würde.',
      'Deinstallieren-Knopf (🗑) in der Speicherplatz-Liste und auf der Spiel-Detailseite: bei Steam öffnet sich direkt der offizielle Bestätigungs-Dialog, bei anderen Launchern der passende Launcher mit Wegbeschreibung. Die App selbst löscht nie etwas.',
      'Spiel-Detailseite zeigt den belegten Speicher als eigene Kachel (mit Berechnen-Knopf).',
      'System / Treiber aufgeräumt: zwei aufklappbare Hauptbereiche „Speicherplatz der Spiele" und „Hardware" — die Geräteliste steht damit wieder direkt oben.'
    ]
  },
  {
    version: '0.6.0',
    date: '2026-06-12',
    title: 'Spiel-Detailseiten',
    changes: [
      'Detailseiten zeigen jetzt Store-Infos: Genres, Metacritic-Wertung, deutsche Beschreibung, Entwickler/Publisher/Erscheinungsdatum und eine scrollbare Screenshot-Reihe mit Großansicht — auch für Nicht-Steam-Spiele wie Call of Duty oder Star Citizen.',
      'Neuer Bereich „Neuigkeiten & Patchnotes" pro Spiel: die letzten Meldungen mit Datum und Quelle, Klick öffnet die volle Meldung im Browser.',
      'Steam-Erfolge auf der Detailseite: Fortschrittsbalken und alle Erfolge mit weltweiter Freischalt-Quote — dafür unter Einstellungen → Konten den kostenlosen Steam-Web-API-Key hinterlegen.',
      'SteamGridDB-Anbindung für bessere Cover (Einstellungen → Konten): ersetzt die bisherigen Wikipedia-Logos automatisch durch echte Box-Art.',
      'Beide Schlüssel werden mit Windows-Verschlüsselung nur lokal gespeichert.'
    ]
  },
  {
    version: '0.5.0',
    date: '2026-06-12',
    title: 'Launcher-Welle 2',
    changes: [
      'Sechs neue Launcher als Schnellstart: Battle.net, Ubisoft Connect, Riot Client, EA App, Rockstar Games, Wargaming Game Center und die Xbox App.',
      'Spiele dieser Launcher werden automatisch erkannt und getrackt — z. B. Call of Duty, Hearthstone (Battle.net) und Star Citizen (RSI); Ubisoft- und Riot-Spiele erscheinen, sobald welche installiert sind.',
      'Update-Erkennung für Battle.net-Spiele: Die App vergleicht die installierte Version mit Blizzards Versions-Server — Hinweise erscheinen in der 🔔-Glocke und im Updates-Tab, inklusive Historie.',
      'Online-Cover für Spiele ohne lokale Bilder (über die Steam-Store-Suche bzw. Wikipedia); Logos werden als elegante Logo-Kacheln dargestellt.'
    ]
  },
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
