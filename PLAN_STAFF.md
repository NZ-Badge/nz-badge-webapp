# Piano di sviluppo — Staff, card RFID e ingressi utenti

## 1. Obiettivo e perimetro

Estendere gli utenti di sistema (`users`) con il ruolo `collaborator` (etichetta UI
“Collaboratore”) e con un dominio presenze dedicato allo staff, separato dalle presenze dei
corsisti (`subscribers`). Tutti gli utenti attivi — Amministratori, Operatori e Collaboratori —
potranno avere una card RFID e registrare ingressi/uscite.

La modifica deve preservare integralmente il contratto device esistente e la logica corsisti:

- per i corsisti restano obbligatori card attiva, tolleranza timestamp, intervallo minimo e
  iscrizione con data del corso valida;
- per lo staff restano obbligatori card attiva, tolleranza timestamp e intervallo minimo, ma non
  viene mai interrogato o applicato il range inizio/fine corso;
- l'API reader continua a riconoscere automaticamente il titolare della card e restituisce lo
  stesso formato di risposta al firmware;
- le presenze staff non devono comparire in liste, conteggi, esportazioni o riepiloghi email dei
  corsisti.

## 2. Decisioni funzionali confermate

### Ruoli e visibilità

- Ruoli persistiti: `admin`, `staff`, `collaborator`.
- Etichette: Amministratore, Operatore, Collaboratore.
- Tutti i ruoli possono accedere a “I miei ingressi”.
- Amministratore e Operatore possono:
  - vedere le strisciate di tutti gli utenti;
  - inserire manualmente ingressi/uscite per qualsiasi utente;
  - modificare esclusivamente data e ora delle strisciate staff;
  - visualizzare elenco Staff e riepilogo ore di ogni utente;
  - scrivere e gestire le card RFID dello staff.
- Solo l'Amministratore può creare, modificare, cambiare ruolo/password o disattivare un account.
- Il Collaboratore:
  - vede soltanto le proprie strisciate nelle pagine staff;
  - può inserire manualmente eventi soltanto per sé;
  - non può modificare o cancellare strisciate;
  - non vede e non può raggiungere le aree corsisti (`/subscribers`, `/cards`, `/attendance`) né
    l'area Amministrazione.

### Card staff

- Sono supportate soltanto card RFID fisiche, non il pairing NFC smartphone.
- Ogni utente può avere al massimo una card RFID attiva.
- Lo stesso UID non può appartenere contemporaneamente a un corsista e a un utente.
- La card staff non dipende dai corsi e non ha una scadenza applicativa.
- Scrittura, disabilitazione, riabilitazione ed erase sono consentiti ad Amministratori e
  Operatori e vengono registrati nell'audit log.

### Eventi e monte ore

- Card e pulsante “simula strisciata” determinano automaticamente il prossimo tipo evento.
- L'alternanza viene calcolata per `userId`, non per card o sorgente, così sono validi i mix
  card/pulsante e pulsante/card.
- Si conserva il reset giornaliero configurato e l'intervallo minimo configurato.
- L'inserimento manuale richiede tipo (`entry`/`exit`) e data/ora espliciti; non altera
  automaticamente il tipo scelto.
- Un inserimento manuale antecedente al momento dell'operazione viene marcato in modo persistente
  come retrodatato e mostrato con una piccola icona.
- Non viene introdotta alcuna cancellazione delle strisciate staff.
- Il monte ore usa solo coppie complete ingresso→uscita; eventi spaiati o sequenze invalide sono
  segnalati e non conteggiati.
- La settimana va da lunedì a domenica e tutte le regole temporali usano `Europe/Rome`.
- Una sessione che attraversa mezzanotte o un confine di filtro è attribuita al giorno
  dell'ingresso e viene conteggiata per intero nel periodo contenente l'ingresso.

### Soft delete utenti

- “Eliminare” un utente imposta lo stato a eliminato/disattivato senza rimuovere la riga.
- Un utente disattivato non può autenticarsi, ricevere nuove strisciate o usare una card.
- Lo storico, il nome visualizzato, le card e l'audit restano referenziabili.
- La card attiva eventualmente associata viene disabilitata nella stessa transazione.
- L'ultimo Amministratore attivo e l'utente che esegue l'operazione non possono essere
  disattivati.

## 3. Modello dati e migrazione

Creare una nuova migration SQL versionata, senza modificare migration già applicate.

### `users`

- estendere l'ENUM `role` con `collaborator`;
- aggiungere `status ENUM('active', 'deleted') NOT NULL DEFAULT 'active'`;
- aggiungere `deleted_at TIMESTAMP NULL`;
- indicizzare `status` per login, elenco e selettori.

### `card_rfid`

- aggiungere `user_id INT NULL` con foreign key verso `users.id`;
- aggiungere indice su `user_id`;
- mantenere `subscriber_id` per le card corsisti;
- garantire a livello di servizio che una card abbia un solo titolare fra `subscriber_id` e
  `user_id` e che esista una sola card RFID attiva per utente.

Non viene riutilizzato `expiration_date` per lo staff: rimane `NULL`. La modalità MIFARE e le
chiavi continuano a seguire le impostazioni runtime esistenti.

### Nuova tabella `staff_attendance`

Tabella separata da `attendance` per impedire contaminazioni nei flussi corsisti. Campi previsti:

- identificativo bigint;
- `user_id` obbligatorio;
- UID/card e UID raw opzionali (assenti per eventi web);
- device ID opzionale;
- `event_type` (`entry`/`exit`);
- `read_timestamp` con millisecondi;
- timestamp raw del device, sincronizzazione, flag offline e diagnostica coda per gli eventi
  reader;
- `source` (`card`, `manual`, `simulation`);
- `created_by_user_id` per manuale/simulazione e audit;
- `is_backdated` persistente;
- payload raw, validazione e nota, coerenti con il tracciamento esistente.

Indici: utente+timestamp, timestamp, card UID, device e source.

## 4. Servizi di dominio

### Autenticazione e autorizzazione

- includere `collaborator` fra i ruoli ammessi alla sessione;
- rifiutare il login e invalidare sessioni di utenti con stato diverso da `active`;
- introdurre helper espliciti per:
  - solo Amministratore;
  - Amministratore o Operatore;
  - accesso al proprio utente oppure Amministratore/Operatore;
- applicare gli helper sul server e sulle API, senza affidarsi alla sola visibilità del menu.

### Presenze da reader

Il lookup card deve restituire un owner discriminato:

1. card corsista → percorso attuale invariato, incluso controllo corso;
2. card staff → percorso staff senza controllo corso;
3. card non attiva, owner eliminato o card sconosciuta → risposta rifiutata esistente.

Per lo staff:

- controllo tolleranza timestamp;
- controllo intervallo minimo sulla cronologia dell'utente;
- calcolo del tipo sulla cronologia dell'utente e sugli eventi virtuali precedenti nello stesso
  batch;
- insert in `staff_attendance`;
- risposta device `confirm` con nome dell'utente.

I test dovranno dimostrare esplicitamente che una strisciata staff fuori da qualsiasi range corso
è accettata e che lo stesso evento corsista continua a essere rifiutato.

### Eventi web

Creare un servizio unico per:

- inserimento manuale con tipo e data/ora espliciti;
- simulazione con timestamp corrente e tipo automatico;
- modifica del solo timestamp;
- validazione ownership/ruolo, utente attivo e intervallo minimo dove richiesto;
- audit delle creazioni e delle modifiche.

Il servizio di simulazione usa la stessa funzione di alternanza del reader. Gli inserimenti
manuali sono correzioni esplicite e non vengono rifiutati dall'intervallo minimo; eventuali
sequenze incomplete restano visibili come anomalie nel riepilogo.

### Calcolo ore

Riutilizzare `calculateAttendanceHours` come motore di pairing, aggiungendo un livello staff che:

- costruisce sessioni complete sull'intera cronologia necessaria;
- attribuisce ogni sessione alla data dell'ingresso in `Europe/Rome`;
- calcola totale settimana corrente, mese corrente e range personalizzato;
- restituisce sessioni ed anomalie con un unico view model usato sia da “I miei ingressi” sia dal
  dettaglio Staff.

## 5. Routing e interfaccia

### Menu

- `Panoramica` resta sempre disponibile.
- Nuovo contenitore `Ingressi`:
  - `Corsisti` → `/attendance`, solo Amministratore/Operatore;
  - `Collaboratori` → `/staff-attendance`, tutti i ruoli, con dataset limitato al proprio utente
    per il Collaboratore.
- Nuova voce `I miei ingressi` → `/my-attendance`, tutti i ruoli.
- `Iscritti` e `Tessere` sono nascosti e vietati al Collaboratore.
- In `Amministrazione`, la voce `Utenti` diventa `Staff`, mantenendo `/admin/users`.
- L'Operatore vede nel contenitore Amministrazione soltanto `Staff`; l'Amministratore conserva le
  altre voci amministrative.

### `/staff-attendance`

Schermata basata sui pattern dell'attuale `/attendance`, ma senza cancellazione:

- filtri data da/a, utente, device/sorgente;
- paginazione e tabella con data/ora, utente, evento, sorgente/device e indicatore retrodatato;
- Collaboratore forzato lato server al proprio `userId`, senza filtro per altri utenti;
- dialog inserimento manuale;
- modifica data/ora visibile soltanto ad Amministratore/Operatore.

### `/my-attendance` e dettaglio Staff

Un componente condiviso renderizza:

- intestazione utente;
- totale settimana corrente;
- totale mese corrente;
- filtro da/a e totale del periodo;
- sessioni complete e anomalie;
- collegamento rapido all'inserimento manuale.

`/my-attendance` forza sempre l'utente di sessione. `/admin/users/[id]` usa lo stesso loader/service
e lo stesso componente, ma richiede ruolo Amministratore/Operatore. Il dettaglio include inoltre
la card RFID e i relativi comandi di gestione.

### `/admin/users`

- titolo e voce menu “Staff”;
- nome utente cliccabile verso `/admin/users/[id]`;
- ruolo Collaboratore nei form e nei badge;
- account eliminati esclusi dall'elenco predefinito oppure chiaramente visualizzati tramite filtro
  di stato;
- pulsanti CRUD account presenti soltanto per Amministratori;
- Operatori in modalità consultazione.

### Dashboard Collaboratore

Per `collaborator` la Panoramica viene sostituita con:

- ultime 10 strisciate proprie;
- link rapido all'inserimento manuale;
- pulsante “Registra ingresso/uscita” che simula una strisciata;
- indicazione del prossimo evento previsto e feedback dell'operazione.

La dashboard di Amministratori e Operatori resta invariata e continua a mostrare esclusivamente
KPI e dati corsisti.

## 6. Card writer staff

Generalizzare il servizio writer con un target discriminato (`subscriber` oppure `user`) senza
cambiare il contratto del flusso corsista:

1. autorizzazione server e session token breve;
2. comando WebSerial al writer;
3. conferma server dopo la scrittura fisica;
4. persistenza con un solo owner;
5. audit con tipo owner e identificativo.

La pagina staff riusa l'interfaccia WebSerial esistente senza introdurre date di corso nel payload
del writer. Per lo staff `card_rfid.expiration_date` resterà nullo e la validazione server non
applicherà alcuna scadenza; il flusso corsista continuerà invece a persistere la propria scadenza
come avviene attualmente.

## 7. Protezione anti-regressione

- Non cambiare payload richiesti o risposte dell'API device.
- Non cambiare i codici `unknown_card`, `timestamp_out_of_range` e
  `course_date_out_of_range` per i corsisti.
- Non spostare le presenze corsisti nella nuova tabella.
- Non includere eventi staff in `/attendance`, export CSV corsisti, KPI corsisti, dettaglio
  iscritto o riepilogo email settimanale.
- Non modificare il pairing NFC, che resta esclusivamente corsista.
- Applicare filtri e autorizzazioni lato server anche quando l'interfaccia nasconde un comando.
- Usare sempre conversioni esplicite `Europe/Rome` per filtri, raggruppamenti, giorni e
  retrodatazione.
- Conservare audit e storico quando utenti o card vengono disattivati.
- Eseguire le operazioni correlate di soft delete utente/card in transazione.

## 8. Test previsti

### Unitari

- alternanza staff per utente fra sorgenti diverse;
- reset giornaliero e intervallo minimo;
- staff accettato senza enrollment/date corso;
- corsista ancora soggetto alla validazione corso;
- calcolo ore, anomalie, settimana lunedì-domenica, mese e range;
- sessione notturna attribuita al giorno dell'ingresso;
- flag retrodatato;
- matrice permessi per lettura, inserimento e modifica.

### Route/API

- Collaboratore non può leggere o mutare dati di altri utenti;
- Collaboratore riceve 403 sulle aree corsisti e amministrative;
- Operatore può leggere Staff, gestire card e presenze ma non modificare account;
- Amministratore mantiene tutte le capacità;
- utente soft-deleted non può autenticarsi né usare una sessione esistente;
- soft delete disabilita la card e conserva storico;
- nessuna API staff espone password hash, chiavi MIFARE o altri secret.

### Verifica finale

Da `webapp/`:

```bash
npm run check
npm run test
npm run lint
npm run build
```

I test d'integrazione database saranno eseguiti solo se è disponibile un MySQL configurato; in
caso contrario migration e query saranno verificate staticamente e la limitazione verrà
segnalata nella consegna.

## 9. Ordine di implementazione

1. Migration e schema Drizzle.
2. Ruoli, stato account e helper ACL.
3. Servizi staff attendance e calcolo ore con test unitari.
4. Branch staff nei flussi reader singolo e batch con test anti-regressione.
5. API web per lista, manuale, simulazione e modifica timestamp.
6. Generalizzazione card writer e pagine card staff.
7. Pagine Collaboratori, I miei ingressi e dettaglio Staff condiviso.
8. Menu, ACL route e dashboard Collaboratore.
9. Soft delete utenti e aggiornamento schermata Staff.
10. Documentazione pubblica, suite completa e build.

## 10. Criteri di accettazione

La funzionalità è completa quando:

- tutti e tre i ruoli possono registrare eventi tramite la propria card senza enrollment;
- card, simulazione e manuale condividono una cronologia coerente per utente;
- il Collaboratore può vedere e inserire soltanto i propri dati;
- Amministratore e Operatore possono operare sui dati di tutti senza ottenere capacità di gestione
  account riservate all'Amministratore;
- riepiloghi e filtri ore producono risultati coerenti in `Europe/Rome`;
- gli account eliminati non accedono più ma tutto lo storico rimane leggibile;
- i flussi corsisti e il contratto reader esistente continuano a superare i test.
