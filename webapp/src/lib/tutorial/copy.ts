// Testi della guida Tutorial.
//
// Un elemento può dichiarare i propri testi in due modi:
//   - `data-tutorial="<id>"`: usa una voce di TUTORIAL_COPY (testi riutilizzati o condivisi);
//   - `data-tutorial-title` / `data-tutorial-description`: testi specifici della pagina,
//     che hanno la precedenza sulla voce dell'id.
// Gli elementi senza attributi ricevono una descrizione generica basata sul tipo di elemento
// (link, pulsante di invio, campo...) e, per i link interni, sulla pagina di destinazione.

export type TutorialContext = {
	/** Titolo già risolto dell'elemento. */
	title: string;
	/** Titolo del dialog che contiene l'elemento, se presente. */
	dialogTitle?: string;
	/** Titolo (h1) della pagina corrente. */
	pageTitle: string;
};

export type TutorialEntry = {
	title?: string;
	description: string | ((ctx: TutorialContext) => string);
};

const inDialog = (ctx: TutorialContext, withDialog: string, fallback: string) =>
	ctx.dialogTitle ? withDialog.replace('%dialog', ctx.dialogTitle) : fallback;

export const TUTORIAL_COPY = {
	// ─── Layout e navigazione ────────────────────────────────────────────────
	'nav.toggle-attendance': {
		title: 'Ingressi',
		description: 'Mostra o nasconde le pagine dedicate alle presenze di corsisti e collaboratori.'
	},
	'nav.toggle-admin': {
		title: 'Amministrazione',
		description:
			'Mostra o nasconde gli strumenti riservati alla gestione tecnica e agli account dello staff.'
	},
	'nav.open-menu': {
		title: 'Apri menu di navigazione',
		description: 'Apre il menu principale per raggiungere le altre sezioni della webapp.'
	},
	'nav.close-menu': {
		title: 'Chiudi menu di navigazione',
		description: 'Chiude il menu principale e torna al contenuto della pagina.'
	},
	'serial.connect': {
		title: 'Connetti dispositivo USB',
		description:
			'Chiede al browser di scegliere il Writer Station collegato via USB, necessario per leggere, scrivere o formattare una tessera.'
	},
	'serial.disconnect': {
		title: 'Disconnetti dispositivo USB',
		description:
			'Interrompe in modo sicuro il collegamento con il Writer Station. Potrai riconnetterlo quando servirà.'
	},
	'serial.dismiss-error': {
		title: 'Chiudi errore',
		description: 'Nasconde il messaggio di errore della connessione USB.'
	},
	'session.logout': {
		title: 'Esci',
		description:
			'Termina la sessione e torna alla schermata di accesso. Le modifiche già salvate restano memorizzate.'
	},

	// ─── Azioni generiche ────────────────────────────────────────────────────
	'list.previous': {
		title: 'Precedente',
		description: 'Torna alla pagina precedente dell’elenco mantenendo i filtri attivi.'
	},
	'list.next': {
		title: 'Successiva',
		description: 'Mostra la pagina successiva dell’elenco mantenendo i filtri attivi.'
	},
	'list.sort': {
		description: (ctx) =>
			`Riordina l’elenco in base a “${ctx.title}”. Un secondo clic inverte l’ordine.`
	},
	'filter.apply': {
		title: 'Filtra',
		description: (ctx) =>
			`Aggiorna “${ctx.pageTitle}” mostrando soltanto i risultati che corrispondono ai criteri inseriti.`
	},
	'filter.reset': {
		title: 'Azzera',
		description: (ctx) =>
			`Rimuove tutti i filtri da “${ctx.pageTitle}” e ripristina l’elenco completo.`
	},
	'flow.back': {
		title: 'Indietro',
		description: 'Torna alla scelta precedente della procedura senza eseguire l’operazione finale.'
	},
	'flow.return': {
		title: 'Torna indietro',
		description: 'Torna al passaggio o alla pagina precedente senza ripetere l’operazione.'
	},
	'flow.continue': {
		title: 'Continua',
		description: 'Conferma l’operazione descritta nel messaggio e passa al passaggio successivo.'
	},
	'dialog.cancel': {
		title: 'Annulla',
		description: (ctx) =>
			inDialog(
				ctx,
				'Chiude “%dialog” senza confermare l’operazione o salvare le modifiche.',
				'Interrompe questa operazione e torna alla pagina precedente senza applicare modifiche.'
			)
	},
	'dialog.close': {
		title: 'Chiudi',
		description: (ctx) =>
			inDialog(
				ctx,
				'Chiude la finestra “%dialog” senza confermare l’operazione.',
				'Chiude questa finestra senza applicare modifiche.'
			)
	},
	'dialog.done': {
		title: 'Chiudi',
		description:
			'Chiude questa finestra dopo che hai copiato o annotato le informazioni necessarie.'
	},
	'form.save': {
		title: 'Salva',
		description: (ctx) =>
			inDialog(
				ctx,
				'Controlla i dati inseriti e li salva in “%dialog”. Se manca qualcosa, il modulo indica cosa correggere.',
				'Controlla i dati inseriti e salva le modifiche. Se manca qualcosa, il modulo indica cosa correggere.'
			)
	},
	'item.delete': {
		title: 'Elimina',
		description: (ctx) =>
			ctx.dialogTitle
				? `Conferma “${ctx.dialogTitle}”. L’azione può essere irreversibile: controlla il messaggio nella finestra prima di procedere.`
				: `Apre la richiesta di conferma per eliminare l’elemento da “${ctx.pageTitle}”, senza agire immediatamente.`
	},
	'item.edit': {
		title: 'Modifica',
		description: (ctx) =>
			`Apre il modulo per correggere o completare i dati visualizzati in “${ctx.pageTitle}”.`
	},
	copy: {
		title: 'Copia',
		description: 'Copia negli appunti il valore mostrato accanto, così puoi incollarlo dove serve.'
	},
	'secret.show': {
		title: 'Mostra',
		description: 'Rende temporaneamente visibile il valore protetto per poterlo controllare.'
	},
	'secret.hide': {
		title: 'Nascondi',
		description: 'Nasconde nuovamente il valore protetto da sguardi accidentali.'
	},
	'date-picker': {
		title: 'Seleziona data',
		description:
			'Inserisci giorno, mese e anno nel formato gg/mm/aaaa oppure scegli il giorno dal calendario. Usa le frecce per cambiare mese e Canc per svuotare un segmento. Gli orari, se presenti, sono riferiti a Europe/Rome.'
	},

	// ─── Iscritti e staff ────────────────────────────────────────────────────
	'subscriber.create': {
		title: 'Nuovo iscritto',
		description:
			'Apre il modulo per aggiungere una nuova persona con i suoi contatti e lo stato di iscrizione.'
	},
	'user.create': {
		title: 'Aggiungi utente',
		description:
			'Crea un account per un amministratore, un operatore o un collaboratore e ne definisce i permessi.'
	},
	'user.edit': {
		title: 'Modifica utente',
		description: 'Apre il modulo per aggiornare nome, email, ruolo o password di questo account.'
	},
	'user.disable': {
		title: 'Disattiva utente',
		description:
			'Blocca l’accesso di questo utente conservandone account, strisciate e storico per eventuali verifiche.'
	},
	'user.enable': {
		title: 'Riattiva utente',
		description:
			'Ripristina l’accesso dell’utente. Le tessere associate restano disabilitate e vanno riabilitate separatamente.'
	},

	// ─── Presenze ────────────────────────────────────────────────────────────
	'attendance.export': {
		title: 'Esporta CSV',
		description:
			'Apre le opzioni per scaricare le presenze come foglio CSV, scegliendo un periodo oppure una persona.'
	},
	'attendance.export-confirm': {
		title: 'Esporta',
		description: 'Scarica il file CSV usando il periodo o la persona che hai selezionato.'
	},
	'attendance.manual-entry': {
		title: 'Inserisci evento',
		description:
			'Apre il modulo per registrare manualmente un ingresso o un’uscita, anche con una data e un’ora passate.'
	},
	'attendance.manual-entry-confirm': {
		title: 'Inserisci',
		description:
			'Registra l’ingresso o l’uscita con la persona, la data e l’ora indicate nel modulo.'
	},
	'attendance.edit-time': {
		title: 'Modifica orario',
		description:
			'Apre una finestra per correggere la data e l’ora di questa presenza senza cambiarne persona o tipo.'
	},
	'attendance.select-page': {
		title: 'Seleziona tutti nella pagina',
		description:
			'Seleziona tutte le presenze visibili in questa pagina per poterle eliminare insieme.'
	},
	'attendance.select-row': {
		title: 'Seleziona record',
		description: 'Aggiunge o rimuove questa presenza dalla selezione per le operazioni di gruppo.'
	},
	'attendance.select-clear': {
		title: 'Annulla selezione',
		description: 'Deseleziona tutte le presenze e non modifica alcun dato.'
	},
	'attendance.select-all-filtered': {
		description:
			'Estende la selezione a tutti i risultati dei filtri, comprese le presenze nelle altre pagine.'
	},
	'attendance.delete-selected': {
		description:
			'Elimina definitivamente tutte le presenze selezionate. Usa questa azione solo per registrazioni errate.'
	},
	'attendance.register-self': {
		description:
			'Registra adesso la tua prossima entrata o uscita, come se avessi avvicinato la tessera al lettore.'
	},

	// ─── Tessere ─────────────────────────────────────────────────────────────
	'card.read': {
		title: 'Leggi carta',
		description:
			'Legge la tessera appoggiata al Writer Station e mostra UID, stato e persona a cui è associata, senza modificarla.'
	},
	'card.open-diagnostics': {
		title: 'Apri diagnostica',
		description:
			'Apre gli strumenti completi per controllare una tessera e osservare la comunicazione con il Writer Station.'
	},
	'card.clear-log': {
		title: 'Pulisci log',
		description:
			'Svuota soltanto i messaggi tecnici mostrati a schermo; non modifica tessere o dati salvati.'
	},
	'card.write': {
		title: 'Scrivi tessera',
		description:
			'Programma la tessera appoggiata al Writer Station e la associa alla persona indicata. Mantienila ferma fino alla conferma.'
	},
	'card.force-erase': {
		title: 'Forza cancellazione',
		description:
			'Tenta di ripulire una tessera sconosciuta usando le chiavi MIFARE più comuni. I dati presenti sulla card verranno cancellati.'
	},
	'card.erase-rewrite': {
		title: 'Cancella e riscrivi',
		description:
			'Cancella i vecchi dati dalla tessera e la programma di nuovo per la persona indicata.'
	},
	'card.erase-format': {
		title: 'Cancella e formatta',
		description:
			'Rimuove l’associazione dal sistema e cancella anche i dati presenti sulla tessera fisica tramite il Writer Station.'
	},
	'card.soft-delete': {
		title: 'Cancella',
		description:
			'Rimuove l’associazione della tessera dal database senza modificare i dati presenti sulla card fisica.'
	},
	'card.disable': {
		title: 'Disabilita tessera',
		description:
			'Blocca l’uso della tessera senza cancellarla: resterà registrata e potrà essere riabilitata in seguito.'
	},
	'card.enable': {
		title: 'Abilita tessera',
		description: 'Rende nuovamente utilizzabile la tessera per registrare ingressi e uscite.'
	},

	// ─── Dispositivi e firmware ──────────────────────────────────────────────
	'device.create': {
		title: 'Registra dispositivo',
		description:
			'Apre il modulo per autorizzare un nuovo reader o writer e generare le credenziali necessarie.'
	},
	'device.provision-usb': {
		title: 'Configurazione automatica via USB',
		description:
			'Collega il reader via USB e gli invia automaticamente ID, token e indirizzo del server.'
	},
	'device.provision-send': {
		title: 'Invia ora',
		description:
			'Invia subito al dispositivo collegato i dati di configurazione mostrati in questa finestra.'
	},
	'device.provision-close': {
		description:
			'Chiude la procedura di configurazione e torna all’elenco dei dispositivi. Se è ancora in corso, la connessione USB viene interrotta.'
	},
	'firmware.upload': {
		title: 'Carica',
		description:
			'Carica il file firmware sul server. Non verrà distribuito ai dispositivi finché non lo attivi.'
	},
	'firmware.activate': {
		title: 'Attiva',
		description:
			'Rende questa release l’aggiornamento disponibile per i reader; eventuali altre release attive vengono sostituite.'
	},
	'firmware.retire': {
		title: 'Ritira',
		description:
			'Interrompe la distribuzione di questa release ai dispositivi che non l’hanno ancora scaricata.'
	},

	// ─── Impostazioni e corsi ────────────────────────────────────────────────
	'courses.sync': {
		title: 'Aggiorna corsi',
		description:
			'Importa dal servizio esterno le iscrizioni più recenti e aggiorna i corsi già presenti.'
	},
	'settings.test-connection': {
		title: 'Test connessione',
		description:
			'Controlla che URL e chiave API permettano davvero di raggiungere il servizio iscrizioni, senza salvare modifiche.'
	},
	'settings.save': {
		title: 'Salva impostazioni',
		description:
			'Salva tutte le modifiche effettuate in questa pagina e le rende operative per NZBadge.'
	},
	'settings.regenerate-keys': {
		title: 'Rigenera chiavi',
		description:
			'Crea nuove chiavi MIFARE globali. Le tessere scritte con le chiavi precedenti potrebbero dover essere riprogrammate.'
	},
	'settings.generate-secret': {
		title: 'Genera secret',
		description:
			'Crea il codice segreto che il servizio esterno dovrà inviare per autenticare i webhook.'
	},
	'settings.regenerate-secret': {
		title: 'Rigenera secret',
		description:
			'Sostituisce il secret del webhook: quello precedente smetterà subito di funzionare e andrà aggiornato sul servizio esterno.'
	},
	'settings.single-key-cancel': {
		title: 'Ho capito, annulla',
		description:
			'Lascia disattivata la modalità a chiave unica e mantiene invariate le tessere esistenti.'
	},

	// ─── Campi ricorrenti ────────────────────────────────────────────────────
	'field.from': {
		title: 'Dal',
		description: 'Imposta il primo giorno del periodo da consultare o esportare.'
	},
	'field.to': {
		title: 'Al',
		description: 'Imposta l’ultimo giorno del periodo da consultare o esportare.'
	},
	'field.datetime': {
		title: 'Data e ora',
		description: 'Indica quando è avvenuto l’ingresso o l’uscita, usando l’ora italiana.'
	},
	'field.subscriber': {
		title: 'Iscritto',
		description: 'Cerca per nome o email per vedere soltanto le presenze di una persona.'
	},
	'field.user': {
		title: 'Utente',
		description: 'Cerca per nome o email per vedere soltanto le presenze di un collaboratore.'
	},
	'field.device': {
		title: 'Dispositivo',
		description:
			'Inserisci l’ID di un reader per vedere soltanto gli eventi registrati da quel dispositivo.'
	},
	'field.source': {
		title: 'Sorgente',
		description:
			'Scegli se mostrare eventi letti da una card, inseriti a mano o registrati dalla Home.'
	},
	'field.event-type': {
		title: 'Tipo',
		description: 'Scegli se l’evento da registrare è un ingresso oppure un’uscita.'
	},
	'field.note': {
		title: 'Nota (facoltativa)',
		description:
			'Aggiungi un breve motivo o promemoria utile a riconoscere questo inserimento manuale.'
	},
	'field.course-end': {
		title: 'Data fine corso',
		description:
			'Indica l’ultimo giorno del corso: serve per attribuire correttamente le presenze e calcolare le ore.'
	},
	'field.firmware-file': {
		title: 'File .bin',
		description: 'Scegli dal computer il file firmware .bin compilato per il reader.'
	},
	'field.release-notes': {
		title: 'Note di rilascio (opzionale)',
		description: 'Riassumi le novità di questa versione per riconoscerla facilmente in futuro.'
	}
} satisfies Record<string, TutorialEntry>;

export type TutorialId = keyof typeof TUTORIAL_COPY;

/** Descrizioni delle pagine, usate dal menu e dai link interni verso di esse. */
export const PAGE_DESCRIPTIONS: Record<string, string> = {
	'/dashboard':
		'Qui trovi a colpo d’occhio le informazioni più importanti e gli strumenti che usi più spesso.',
	'/subscribers':
		'Consulta l’elenco degli iscritti, cerca una persona e apri la sua scheda per vedere corsi, tessere e presenze.',
	'/cards': 'Controlla tutte le tessere RFID, il loro stato e lo storico di quelle cancellate.',
	'/today':
		'Mostra i corsisti con un corso in programma oggi e distingue chi ha già timbrato da chi non ha ancora registrato ingressi o uscite.',
	'/new-students':
		'Consulta i corsisti che iniziano un corso nell’intervallo di date selezionato ed esporta il CSV. Il filtro parte dalla settimana corrente.',
	'/attendance':
		'Consulta e correggi gli ingressi e le uscite dei corsisti, oppure esportali in un file CSV.',
	'/staff-attendance': 'Consulta gli ingressi, le uscite e le ore lavorate dai collaboratori.',
	'/my-attendance':
		'Controlla le tue strisciate e il riepilogo delle ore lavorate nel periodo che ti interessa.',
	'/card-diagnostics':
		'Leggi una tessera con il writer per controllarne UID, stato, intestatario e dati tecnici.',
	'/devices':
		'Gestisci i lettori e i writer autorizzati a comunicare con NZBadge e controlla quando sono stati online l’ultima volta.',
	'/firmware': 'Carica e distribuisci gli aggiornamenti software destinati ai dispositivi reader.',
	'/settings':
		'Configura il funzionamento di NZBadge, le regole delle presenze, le card e i collegamenti con servizi esterni.',
	'/admin/users':
		'Gestisci gli account di amministratori, operatori e collaboratori e i relativi permessi.',
	'/admin/maintenance':
		'Apre gli strumenti di manutenzione per scaricare un backup completo del database.',
	'/courses':
		'Consulta i corsi importati e le persone iscritte, oppure aggiorna i dati dal servizio esterno.',
	'/copyrights':
		'Consulta le informazioni sull’autore e le licenze dei componenti utilizzati dalla webapp.'
};

/** Descrizioni dei link interni con parametri, in base al percorso di destinazione. */
export const ROUTE_DESCRIPTIONS: Array<[RegExp, (title: string) => string]> = [
	[
		/^\/subscribers\/[^/]+\/write-card$/,
		() =>
			'Avvia la procedura guidata per programmare una tessera RFID e associarla a questo iscritto.'
	],
	[
		/^\/admin\/users\/[^/]+\/write-card$/,
		() =>
			'Avvia la procedura guidata per programmare una tessera RFID e associarla a questo collaboratore.'
	],
	[
		/^\/cards\/[^/]+\/erase$/,
		() =>
			'Avvia la rimozione della tessera dal sistema e, se scegli la formattazione, anche la cancellazione dei dati dalla card fisica.'
	],
	[
		/^\/subscribers\/[^/]+\/attendance-anomalies\/[^/]+$/,
		() =>
			'Apre le presenze incomplete del corso per abbinare le uscite mancanti e ottenere un conteggio ore corretto.'
	],
	[
		/^\/subscribers\/[^/]+$/,
		(title) =>
			`Apre la scheda di ${title}, con dati personali, corsi, tessere associate e presenze recenti.`
	],
	[
		/^\/admin\/users\/[^/]+$/,
		(title) => `Apre la scheda di ${title}, con riepilogo ore, strisciate e tessere RFID associate.`
	]
];
