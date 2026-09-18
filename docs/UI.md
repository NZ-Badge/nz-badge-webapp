# Interfaccia e colori

Le pagine condividono `PageHeader`, filtri raccolti in `filter-panel` e componenti
per tabelle, pulsanti e indicatori di stato. Le intestazioni spiegano lo scopo
della pagina e raccolgono le azioni disponibili; i dettagli mantengono un ritorno
alla pagina di origine.

## Tabelle

Tutti gli stili delle tabelle sono in
`webapp/src/lib/components/ui/table/table.css`, importato da `app.css`.
I componenti espongono i `data-slot` usati dal foglio di stile: non duplicare
colori, padding, bordi, hover o righe alternate nelle pagine.

- `Table` include cornice e scorrimento orizzontale.
- Per titoli, caricamento o paginazione usare `TablePanel` con `Table embedded`:
  il pannello fornisce l'unica cornice, senza bordi doppi.
- I contenitori con `data-slot="table-panel-header"` e
  `data-slot="table-panel-footer"` condividono spaziatura e sfondo.
- Usare `data-slot="table-loading"` e `role="status"` per il caricamento.
- Usare `data-empty` sulla cella con `colspan` per gli stati vuoti.
- Usare `data-state="selected"` sulla riga selezionata. Le righe normali hanno
  sfondi neutri alternati; ingresso/uscita e altri stati si distinguono nei badge.
- Le pagine possono definire larghezze e allineamenti delle colonne e formattare
  contenuti specifici (per esempio un identificativo monospaziato).

Il colore dell'intestazione segue l'area blu/viola; geometria e comportamento
rimangono identici. Il tema scuro e gli stati hover/focus sono definiti nello
stesso foglio di stile.

Regressione visuale: con il server Vite attivo (`npm run dev`), eseguire
`npm run test:e2e -- table-styles.spec.ts`. I test usano dati fittizi e verificano
cornici, spaziature, righe alternate, hover, selezione e scorrimento in tema
chiaro e scuro, senza scrivere sul database.

## Aree

- **Gestione quotidiana, blu**: panoramica, iscritti, corsi, tessere e presenze.
- **Amministrazione, viola**: staff e accessi, dispositivi, aggiornamenti,
  impostazioni e verifica tecnica delle tessere.

Il layout determina l'area dalla navigazione e la espone con `data-area`.
L'identità dell'area compare nelle intestazioni, nelle tabelle e nella navigazione,
insieme a un'etichetta testuale. Non cambia il significato dei pulsanti.

## Azioni e informazioni

- Blu: azione principale e collegamenti interni.
- Verde smeraldo: abilita, ripristina, stato attivo ed esito positivo.
- Ambra: attenzione, sospensione e attesa; anche gli elementi della guida Tutorial.
- Rosso: elimina, disabilita, cancella ed errori.
- Grigio: azioni di supporto e stati non operativi.

Usare le varianti condivise di `Button` e `Badge`. Il testo deve sempre spiegare
il significato anche senza colore. Per ogni nuova azione aggiungere una spiegazione
Tutorial tramite `data-tutorial-title` e `data-tutorial-description`.

Preferire termini familiari (tessera, aggiornamenti, ingressi e uscite), mantenendo
i dettagli tecnici nelle sezioni in cui servono. Filtri e azioni devono andare a capo
su schermi piccoli; le tabelle mantengono lo scorrimento orizzontale.
