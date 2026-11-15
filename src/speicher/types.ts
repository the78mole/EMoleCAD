/**
 * Speicher-Schnittstelle. Jeder Speicherort (lokal, später GitHub, Nextcloud,
 * Google Drive) liefert Dateien als Text (YAML) und kann sie zurückschreiben –
 * ähnlich wie draw.io: Datei öffnen, bearbeiten, an dieselbe Stelle speichern.
 */
export interface DateiRef {
  /** id des Speicherorts, z. B. 'lokal' */
  ort: string
  /** Anzeigename (Dateiname) */
  name: string
  /** Ortsspezifische Kennung (Pfad, Datei-ID, Handle-Schlüssel …) */
  schluessel: string
}

export interface GeoeffneteDatei {
  ref: DateiRef
  text: string
}

export interface Speicherort {
  id: string
  label: string
  /** Kann direkt in die geöffnete Datei zurückschreiben (sonst: Download) */
  zurueckschreiben: boolean
  oeffnen(): Promise<GeoeffneteDatei | undefined>
  /** Erneut öffnen (z. B. aus „Zuletzt verwendet“) */
  laden(ref: DateiRef): Promise<GeoeffneteDatei>
  speichern(ref: DateiRef, text: string): Promise<DateiRef>
  speichernUnter(vorschlag: string, text: string): Promise<DateiRef | undefined>
}
