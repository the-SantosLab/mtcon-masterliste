# Roadmap
- [x] „Mein Tag“ auf Wunsch wieder aus dem Dashboard entfernt; Zähl- und Filterlogik (myDay) bleibt getestet ohne Oberfläche erhalten
- [x] Vorgangsakte: rückrollbare Datenbanktests für Angebot → Auftrag und alle vier Übergaben, Rollen, Empfänger und Duplikate; zehn Regeltests und Browser-Zwischenstände mit isolierten Antworten geprüft; keine Testdaten verblieben
- [x] Vorgangsakte: gemeinsamer Browser-Datenbankdurchlauf mit separaten Admin-/Staff-/Viewer-Testkonten abgeschlossen; Angebot → Einkauf → Werkstatt → Versand → Buchhaltung, Teilstatus, Empfänger und Duplikate geprüft; Viewer-Werkstattlücke geschlossen und erneut geprüft; alle Testkonten/-belege/-Benachrichtigungen entfernt, Prüfsummen echter Aufträge/Bestände/Rechnungen unverändert
- [x] Kundenakquise: eigene Übersicht und acht richtig zugeordnete Unterseiten mit echten CRM-Daten
- [x] Regelbasierte Aktivitäten und MTIQ-Vorschläge mit bestätigter Übernahme in bestehende Aktivitäten ergänzen
- [x] Akquise-Regeln und Seitenleistenregression prüfen: neun Tests erfolgreich; Seitenmodule laden fehlerfrei
- [ ] Angemeldeten MTIQ-Antwortablauf in der Akquise prüfen — offen: Antwortqualität und Kandidenauswahl noch nicht kontrolliert
- [x] Fremdbearbeitung als verknüpften Werkstatt-Schritt mit Materialverlagerung ergänzen; fünf Regeltests erfolgreich
- [x] Fremdbearbeitung als eigenen Auftragstyp mit Lieferantenzuordnung ergänzen
- [x] Materialausgabe und Teilrückbuchung über Wareneingang sicher buchen
- [x] Regeln und angemeldeten Durchlauf testen — FB-3C2C4EA5B3: 1 ausgegeben, zweimal 0,5 zurückgebucht, Übermenge blockiert, Endbestand unverändert; sechs Tests erfolgreich
- [x] Scrollposition und geöffnete Unterpunkte der Seitenleiste beim Seitenwechsel erhalten; zwei Tests und angemeldeter Wechsel Angebote → Ansprechpartner → Kommunikation erfolgreich

- [x] Word-Unterpunkte als aufklappbare CRM-Unternavigation ergänzen
- [x] Direkte Anlage-, Filter- und Ansichtsparameter in CRM-Seiten unterstützen
- [x] Navigation und zentrale Zielpfade prüfen
- [x] Eigene Firmenreiter für Ansprechpartner, Deals und Dokumente ergänzen; Lagerreservierungen unverändert lassen; Fehlercheck erfolgreich
- [x] Angemeldeten Bedienungstest der Firmenreiter abgeschlossen: Ansprechpartner zeigt Kontakte, Deals und Dokumente saubere Zustände
- [x] Ansprechpartner: acht eigene Unterseiten mit Kennzahlen, Zuständigkeitsableitung, E-Mail-Status, Telefonverzeichnis, Verlauf und Nachfassen-Planung
- [x] Ansprechpartner-Regeln automatisch geprüft (acht Tests) und alle 32 Tests des Projekts erfolgreich
- [x] Angemeldeter Menüdurchlauf durch alle acht Ansprechpartner-Punkte sowie 22 Akquise-, Firmen- und Interessentenseiten ohne Fehler
- [ ] Angemeldeten Werkstattauftrag-Durchlauf mit Fremdbearbeitung testen — offen: Ablauf (Materialausgabe, Wareneingang) noch nicht durchgeführt
- [x] Kommunikation & Aufgaben: sieben eigene Unterseiten (Übersicht, Aufgaben, Wiedervorlagen, Termine, Telefonate, E-Mails, Besuchsberichte, Erledigt) mit Kennzahlen, Übernehmen/Erledigen-Aktionen; acht Regeltests erfolgreich
- [x] Verkaufschancen: sechs eigene Unterseiten (Übersicht, Pipeline, Bewerten, Phasen, Fällige Abschlüsse, Zuweisen, Abgeschlossen) mit gewichtetem Volumen und Phasenwechsel; zehn Regeltests erfolgreich

- [x] „Aufträge abwickeln“: alle sieben Menüziele einheitlich neu gestaltet; Suche, Details, Kennzahlenfilter, Navigation und schmale Ansichten angemeldet geprüft; sieben bestehende Tests erfolgreich

- [x] „Einkaufen & lagern“: acht Menüziele einheitlich neu gestaltet; angemeldete Seiten-, Such-, Detail- und Lagerreitertests sowie sieben Regressionstests erfolgreich; Buchungen unverändert

## Ausbau „alles davon“ (Reihenfolge: Empfehlung)
- [x] Kundenblick im CRM: offene Aufträge, Lieferstatus, Forderungen, Zahlungsverhalten, Hinweise (90 Tage / überfällig)
- [x] Bestellvorschläge: bereits vorhanden unter Disposition (Mindestbestand, offener Bedarf, Lieferzeit, Bestellung per Klick)
- [x] Angebot: Positionen aus früherem Angebot/Auftrag übernehmen (Preise aus Preisliste waren schon vorhanden)
- [x] Posteingang → Einkauf: Eingangsrechnungen/Auftragsbestätigungen der Bestellung zuordnen; isoliert getestet und zurückgerollt
- [x] Werkstattauslastung (/werkstatt-auslastung) und Soll/Ist-Kosten je Werkstattauftrag; fünf Regeltests
- [x] Mobil: Scan-Seite /scan (Kamera + Handscanner) für Wareneingang, Entnahme, Inventur; isoliert getestet
- [x] Geschäftsführungs-Kennzahlen (/kennzahlen): Umsatz, Auftragseingang, Liefertreue, Forderungen; drei Regeltests
- [x] Bankabgleich per Kontoauszug-Upload (CSV/CAMT) mit Zuordnung und Bestätigung; drei Regeltests
- [x] Teilrechnungen: Abschläge (Prozent/Betrag) und Schlussrechnung mit automatischem Abzug; isoliert getestet und zurückgerollt

## Vertiefung Runde Okt 16
- [x] Etiketten (QR) für Werkstattaufträge drucken
- [x] EAN an Artikeln + Scan-Suche über EAN
- [ ] Werkstatt-Kapazität/Stundensatz — wartet auf echte Werte vom Nutzer
- [ ] Echter Lieferanten-Testversand — wartet auf Testadresse/Freigabe vom Nutzer
- [x] Posteingang → Bestellung im Browser durchklicken (isoliert)
- [x] Angebot direkt bei Firma anlegen
- [x] Artikelinfos (Bestand, Preis, offene Aufträge) in Vorgangsansicht
- [x] Forecast: Kundenvergleich + Entwicklung über Zeit
- [x] Bankabgleich: Kontoauszug-Import, Zuordnung zu offenen Rechnungen

## Kalkulation
- [x] Allgemeine Kalkulation /kalkulation mit Tabelle price_calculations + calc_settings; Rechte: Mitarbeitende kalkulieren, nur Admins Faktoren/Grundwerte und Abschluss; Regeltests
- [x] Unbelegte Werte (Faktor, SWS-Formel, LZ-Herkunft) ausdrücklich als ungeklärt gekennzeichnet, nur belegter Rechenweg (Durchschnitt − Basis) × Verbrauch eingebaut
- [x] Verbindung zum Angebot: „Aus Kalkulation“ im Angebotsdetail, abgeschlossene Staffel als Position übernehmbar; 8 Kalkulations-Tests erfolgreich
- [x] Bereichsnavigation „Aufträge abwickeln“ um Kalkulation und Werkstattauslastung ergänzt
- [ ] Faktor und SWS-Formel MGK 3 klären — wartet auf Werte/Regel vom Nutzer
- [ ] Herkunft der Legierungszuschlags-Werte (9,85/5/5,798) klären — wartet auf Info vom Nutzer
- [ ] Master-Kalkulation 2nd/3rd GEN (Relaissockel 200-xxx) als eigenen Bereich umsetzen
- [ ] Herstellkosten automatisch aus Stückliste vorschlagen
- [ ] Vergleich Kalkulation gegen Werkstatt-Kosten (Soll/Ist)
- [ ] Echter Durchlauf mit Preis — blockiert: allgemeiner Faktor fehlt, kein Abschluss möglich

## Wareneingang / QS / Folgepunkte (16.10.)
- [x] Wareneingang auf i-Punkt, Prüfvorgang an Lager, Freigabe → Meldung Einlagern, Fehlerhaft einlagerbar bis Rücksendung, Überlieferung abfragen
- [ ] Zwei Bilder je Artikel (Zeichnung, real/gerendert) in Wareneingang, Kalkulation, Angebot
- [ ] Angebot muss mit Vorgang verknüpft sein; Anfragen-Container je Kategorie mit 0–100-%-Balken und Abteilungsschritten; MTIQ-Vorschläge für Kundenanfragen
- [ ] UI: Sidebar/Tabellen kompakter, Zeilenhöhe klein, ausgeblendete Filter markieren
- [ ] Vorgangsansicht mit Widget-Leiste oben (Notizen, Dateien, E-Mails), Druck prüfen
