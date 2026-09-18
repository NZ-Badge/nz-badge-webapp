<script lang="ts">
	import { onMount } from 'svelte';
	import { CircleHelp, X } from '@lucide/svelte';

	type TutorialCopy = {
		title: string;
		description: string;
	};

	type Rect = {
		top: number;
		left: number;
		width: number;
		height: number;
	};

	let { enabled, onDisable }: { enabled: boolean; onDisable: () => void } = $props();

	let activeElement = $state<HTMLElement | null>(null);
	let activeRect = $state<Rect | null>(null);
	let copy = $state<TutorialCopy | null>(null);

	const interactiveSelector = [
		'a[href]',
		'button:not([disabled])',
		'input:not([type="hidden"]):not([disabled])',
		'select:not([disabled])',
		'textarea:not([disabled])',
		'[role="button"]',
		'[role="menuitem"]',
		'[role="switch"]',
		'[role="spinbutton"]'
	].join(',');

	function compact(value: string | null | undefined): string {
		return (value ?? '').replace(/\s+/g, ' ').trim();
	}

	function normalized(value: string): string {
		return compact(value)
			.replace(/\s*\(pagina corrente\)\s*/gi, '')
			.replace(/…/g, '...')
			.toLocaleLowerCase('it-IT');
	}

	function associatedLabel(element: HTMLElement): string {
		const wrappingLabel = element.closest<HTMLLabelElement>('label');
		const wrappingText = compact(wrappingLabel?.innerText);
		if (wrappingText) return wrappingText;

		const fieldName =
			element instanceof HTMLInputElement ||
			element instanceof HTMLSelectElement ||
			element instanceof HTMLTextAreaElement
				? element.name
				: '';
		const labelTarget = element.id || fieldName;
		if (!labelTarget) return '';

		const label = document.querySelector<HTMLLabelElement>(
			`label[for="${CSS.escape(labelTarget)}"]`
		);
		return compact(label?.innerText);
	}

	function iconLabel(element: HTMLElement): string {
		const icons: Array<[string, string]> = [
			['.lucide-arrow-left', 'Torna indietro'],
			['.lucide-pencil', 'Modifica'],
			['.lucide-trash-2', 'Elimina'],
			['.lucide-copy', 'Copia'],
			['.lucide-eye', 'Mostra'],
			['.lucide-eye-off', 'Nascondi'],
			['.lucide-eraser', 'Cancella fisicamente'],
			['.lucide-rotate-ccw', 'Ripristina']
		];

		return icons.find(([selector]) => element.querySelector(selector))?.[1] ?? '';
	}

	function elementLabel(element: HTMLElement): string {
		const tutorialOwner = element.closest<HTMLElement>('[data-tutorial-title]');
		const explicit = compact(tutorialOwner?.dataset.tutorialTitle);
		if (explicit) return explicit;

		const label = associatedLabel(element);
		if (label) return label;

		const ariaLabel = compact(element.getAttribute('aria-label'));
		if (ariaLabel) return ariaLabel;

		if (
			element instanceof HTMLInputElement ||
			element instanceof HTMLSelectElement ||
			element instanceof HTMLTextAreaElement
		) {
			const placeholder = compact(element.getAttribute('placeholder'));
			if (placeholder) return placeholder;
		}

		const text = compact(element.innerText || element.getAttribute('title')).replace(
			/\s*\(pagina corrente\)\s*/gi,
			''
		);
		return text || iconLabel(element) || 'Elemento interattivo';
	}

	const pageDescriptions: Record<string, string> = {
		'/dashboard':
			'Qui trovi a colpo d’occhio le informazioni più importanti e gli strumenti che usi più spesso.',
		'/subscribers':
			'Consulta l’elenco degli iscritti, cerca una persona e apri la sua scheda per vedere corsi, tessere e presenze.',
		'/cards': 'Controlla tutte le tessere RFID, il loro stato e lo storico di quelle cancellate.',
		'/attendance':
			'Consulta e correggi gli ingressi e le uscite dei corsisti, oppure esportali in un file CSV.',
		'/staff-attendance': 'Consulta gli ingressi, le uscite e le ore lavorate dai collaboratori.',
		'/my-attendance':
			'Controlla le tue strisciate e il riepilogo delle ore lavorate nel periodo che ti interessa.',
		'/card-diagnostics':
			'Leggi una tessera con il writer per controllarne UID, stato, intestatario e dati tecnici.',
		'/devices':
			'Gestisci i lettori e i writer autorizzati a comunicare con NZBadge e controlla quando sono stati online l’ultima volta.',
		'/firmware':
			'Carica e distribuisci gli aggiornamenti software destinati ai dispositivi reader.',
		'/settings':
			'Configura il funzionamento di NZBadge, le regole delle presenze, le card e i collegamenti con servizi esterni.',
		'/admin/users':
			'Gestisci gli account di amministratori, operatori e collaboratori e i relativi permessi.',
		'/courses':
			'Consulta i corsi importati e le persone iscritte, oppure aggiorna i dati dal servizio esterno.',
		'/copyrights':
			'Consulta le informazioni sull’autore e le licenze dei componenti utilizzati dalla webapp.'
	};

	function anchorDescription(anchor: HTMLAnchorElement, title: string): string {
		const href = anchor.getAttribute('href') ?? '';
		const titleKey = normalized(title);

		if (href.startsWith('mailto:')) {
			return `Prepara una nuova email indirizzata a ${href.slice('mailto:'.length)} nel programma di posta del dispositivo.`;
		}

		let url: URL;
		try {
			url = new URL(anchor.href, window.location.href);
		} catch {
			return `Apre la destinazione “${title}”.`;
		}

		if (url.origin !== window.location.origin) {
			return `Apre il sito “${title}”${anchor.target === '_blank' ? ' in una nuova scheda' : ''}.`;
		}

		if (titleKey === 'precedente')
			return 'Torna alla pagina precedente dell’elenco mantenendo i filtri attivi.';
		if (titleKey === 'successiva')
			return 'Mostra la pagina successiva dell’elenco mantenendo i filtri attivi.';
		if (titleKey === 'annulla' || titleKey.startsWith('← ') || titleKey.startsWith('torna a ')) {
			return 'Torna alla pagina di provenienza senza avviare o confermare una nuova operazione.';
		}
		if (titleKey === 'tessere attive') {
			return 'Mostra le tessere attualmente utilizzabili e quelle temporaneamente disabilitate.';
		}
		if (titleKey === 'storico cancellate') {
			return 'Mostra le tessere rimosse dal sistema, utili se devi cancellarle fisicamente o recuperarle.';
		}
		if (['nome', 'email', 'ore ultimo corso', 'ultimo ingresso', 'tessera'].includes(titleKey)) {
			return `Riordina l’elenco degli iscritti in base a “${title}”. Un secondo clic inverte l’ordine.`;
		}

		const path = url.pathname.replace(/\/$/, '') || '/';

		if (/^\/subscribers\/[^/]+\/write-card$/.test(path)) {
			return 'Avvia la procedura guidata per programmare una tessera RFID e associarla a questo iscritto.';
		}
		if (/^\/admin\/users\/[^/]+\/write-card$/.test(path)) {
			return 'Avvia la procedura guidata per programmare una tessera RFID e associarla a questo collaboratore.';
		}
		if (/^\/cards\/[^/]+\/erase$/.test(path)) {
			return 'Avvia la rimozione della tessera dal sistema e, se scegli la formattazione, anche la cancellazione dei dati dalla card fisica.';
		}
		if (/^\/subscribers\/[^/]+\/attendance-anomalies\/[^/]+$/.test(path)) {
			return 'Apre le presenze incomplete del corso per abbinare le uscite mancanti e ottenere un conteggio ore corretto.';
		}
		if (/^\/subscribers\/[^/]+$/.test(path)) {
			return `Apre la scheda di ${title}, con dati personali, corsi, tessere associate e presenze recenti.`;
		}
		if (/^\/admin\/users\/[^/]+$/.test(path)) {
			return `Apre la scheda di ${title}, con riepilogo ore, strisciate e tessere RFID associate.`;
		}

		if (
			path === '/my-attendance' &&
			(titleKey.includes('riepilogo') || titleKey.startsWith('vedi tutte'))
		) {
			return 'Apre il riepilogo completo delle tue strisciate e delle ore lavorate.';
		}
		if (path === '/attendance' && titleKey.startsWith('vedi tutte')) {
			return 'Mostra l’intera cronologia delle presenze di questo iscritto, già filtrata per persona.';
		}
		if (path === '/courses' && titleKey.startsWith('vedi nei corsi')) {
			return 'Mostra nei corsi le iscrizioni appartenenti a questa persona.';
		}

		return (
			pageDescriptions[path] ??
			`Apre “${title}” per continuare da una pagina dedicata senza modificare i dati attuali.`
		);
	}

	function currentPageTitle(): string {
		return compact(document.querySelector<HTMLElement>('main h1')?.innerText) || 'questa pagina';
	}

	function dialogTitle(element: HTMLElement): string {
		return compact(
			element
				.closest<HTMLElement>('[role="dialog"], [data-slot="dialog-content"]')
				?.querySelector<HTMLElement>('[data-slot="dialog-title"], h2, h3')?.innerText
		);
	}

	function actionDescription(element: HTMLElement, title: string): string | null {
		const key = normalized(title);
		const pageTitle = currentPageTitle();
		const modalTitle = dialogTitle(element);

		const descriptions: Record<string, string> = {
			ingressi: 'Mostra o nasconde le pagine dedicate alle presenze di corsisti e collaboratori.',
			amministrazione:
				'Mostra o nasconde gli strumenti riservati alla gestione tecnica e agli account dello staff.',
			'apri menu di navigazione':
				'Apre il menu principale per raggiungere le altre sezioni della webapp.',
			'chiudi menu di navigazione': 'Chiude il menu principale e torna al contenuto della pagina.',
			'connetti dispositivo usb':
				'Chiede al browser di scegliere il Writer Station collegato via USB, necessario per leggere, scrivere o formattare una tessera.',
			'disconnetti dispositivo usb':
				'Interrompe in modo sicuro il collegamento con il Writer Station. Potrai riconnetterlo quando servirà.',
			esci: 'Termina la sessione e torna alla schermata di accesso. Le modifiche già salvate restano memorizzate.',
			'+ nuovo iscritto':
				'Apre il modulo per aggiungere una nuova persona con i suoi contatti e lo stato di iscrizione.',
			'aggiungi utente':
				'Crea un account per un amministratore, un operatore o un collaboratore e ne definisce i permessi.',
			'esporta csv':
				'Apre le opzioni per scaricare le presenze come foglio CSV, scegliendo un periodo oppure una persona.',
			esporta: 'Scarica il file CSV usando il periodo o la persona che hai selezionato.',
			'inserisci evento':
				'Apre il modulo per registrare manualmente un ingresso o un’uscita, anche con una data e un’ora passate.',
			inserisci:
				'Registra l’ingresso o l’uscita con la persona, la data e l’ora indicate nel modulo.',
			'leggi carta':
				'Legge la tessera appoggiata al Writer Station e mostra UID, stato e persona a cui è associata, senza modificarla.',
			'apri diagnostica':
				'Apre gli strumenti completi per controllare una tessera e osservare la comunicazione con il Writer Station.',
			'apri diagnostica completa':
				'Apre gli strumenti completi per controllare una tessera e osservare la comunicazione con il Writer Station.',
			'pulisci log':
				'Svuota soltanto i messaggi tecnici mostrati a schermo; non modifica tessere o dati salvati.',
			'aggiorna corsi':
				'Importa dal servizio esterno le iscrizioni più recenti e aggiorna i corsi già presenti.',
			'registra dispositivo':
				'Apre il modulo per autorizzare un nuovo reader o writer e generare le credenziali necessarie.',
			'registrane uno ora':
				'Apre il modulo per autorizzare il primo dispositivo e generare le sue credenziali.',
			'configurazione automatica via usb':
				'Collega il reader via USB e gli invia automaticamente ID, token e indirizzo del server.',
			'invia ora':
				'Invia subito al dispositivo collegato i dati di configurazione mostrati in questa finestra.',
			'test connessione':
				'Controlla che URL e chiave API permettano davvero di raggiungere il servizio iscrizioni, senza salvare modifiche.',
			'salva impostazioni':
				'Salva tutte le modifiche effettuate in questa pagina e le rende operative per NZBadge.',
			'rigenera chiavi':
				'Crea nuove chiavi MIFARE globali. Le tessere scritte con le chiavi precedenti potrebbero dover essere riprogrammate.',
			'genera secret':
				'Crea il codice segreto che il servizio esterno dovrà inviare per autenticare i webhook.',
			'rigenera secret':
				'Sostituisce il secret del webhook: quello precedente smetterà subito di funzionare e andrà aggiornato sul servizio esterno.',
			copia: 'Copia negli appunti il valore mostrato accanto, così puoi incollarlo dove serve.',
			copiato: 'Il valore mostrato accanto è già stato copiato negli appunti.',
			mostra: 'Rende temporaneamente visibile il valore protetto per poterlo controllare.',
			nascondi: 'Nasconde nuovamente il valore protetto da sguardi accidentali.',
			carica:
				'Carica il file firmware sul server. Non verrà distribuito ai dispositivi finché non lo attivi.',
			attiva:
				'Rende questa release l’aggiornamento disponibile per i reader; eventuali altre release attive vengono sostituite.',
			ritira:
				'Interrompe la distribuzione di questa release ai dispositivi che non l’hanno ancora scaricata.',
			'scrivi tessera':
				'Programma la tessera appoggiata al Writer Station e la associa alla persona indicata. Mantienila ferma fino alla conferma.',
			'forza cancellazione':
				'Tenta di ripulire una tessera sconosciuta usando le chiavi MIFARE più comuni. I dati presenti sulla card verranno cancellati.',
			'cancella e riscrivi':
				'Cancella i vecchi dati dalla tessera e la programma di nuovo per la persona indicata.',
			continua: 'Conferma l’operazione descritta nel messaggio e passa al passaggio successivo.',
			'cancella e formatta':
				'Rimuove l’associazione dal sistema e cancella anche i dati presenti sulla tessera fisica tramite il Writer Station.',
			cancella:
				'Rimuove l’associazione della tessera dal database senza modificare i dati presenti sulla card fisica.',
			'cancella fisicamente':
				'Apre la procedura per rimuovere dalla tessera fisica i dati ancora presenti dopo la cancellazione dal sistema.',
			disabilita:
				'Blocca l’uso della tessera senza cancellarla: resterà registrata e potrà essere riabilitata in seguito.',
			abilita: 'Rende nuovamente utilizzabile la tessera per registrare ingressi e uscite.',
			riabilita: 'Rende nuovamente utilizzabile la tessera per registrare ingressi e uscite.',
			ripristina:
				'Recupera la tessera dallo storico come disabilitata, così potrai cancellarla fisicamente o riutilizzarla.',
			erase:
				'Apre la procedura per rimuovere questa tessera dal sistema e, se necessario, formattare la card fisica.',
			'disattiva utente':
				'Blocca l’accesso di questo utente conservandone account, strisciate e storico per eventuali verifiche.',
			'riattiva utente':
				'Ripristina l’accesso dell’utente. Le tessere associate restano disabilitate e vanno riabilitate separatamente.',
			'modifica utente':
				'Apre il modulo per aggiornare nome, email, ruolo o password di questo account.',
			'modifica orario':
				'Apre una finestra per correggere la data e l’ora di questa presenza senza cambiarne persona o tipo.',
			'seleziona tutti nella pagina':
				'Seleziona tutte le presenze visibili in questa pagina per poterle eliminare insieme.',
			'seleziona record':
				'Aggiunge o rimuove questa presenza dalla selezione per le operazioni di gruppo.',
			'annulla selezione': 'Deseleziona tutte le presenze e non modifica alcun dato.',
			precedente: 'Torna alla pagina precedente dell’elenco mantenendo i filtri attivi.',
			successiva: 'Mostra la pagina successiva dell’elenco mantenendo i filtri attivi.',
			indietro: 'Torna alla scelta precedente della procedura senza eseguire l’operazione finale.',
			'torna indietro': 'Torna al passaggio o alla pagina precedente senza ripetere l’operazione.',
			annulla: modalTitle
				? `Chiude “${modalTitle}” senza confermare l’operazione o salvare le modifiche.`
				: 'Interrompe questa operazione e torna alla pagina precedente senza applicare modifiche.',
			close: modalTitle
				? `Chiude la finestra “${modalTitle}” senza confermare l’operazione.`
				: 'Chiude questa finestra senza applicare modifiche.',
			chiudi: 'Chiude questa finestra dopo che hai copiato o annotato le informazioni necessarie.',
			fatto: 'Chiude la procedura di configurazione completata e torna all’elenco dei dispositivi.',
			'ho capito, annulla':
				'Lascia disattivata la modalità a chiave unica e mantiene invariate le tessere esistenti.'
		};

		if (descriptions[key]) return descriptions[key];

		if (/^registra (ingresso|uscita)$/.test(key)) {
			return 'Registra adesso la tua prossima entrata o uscita, come se avessi avvicinato la tessera al lettore.';
		}
		if (/^elimina \d+$/.test(key)) {
			return 'Elimina definitivamente tutte le presenze selezionate. Usa questa azione solo per registrazioni errate.';
		}
		if (/^seleziona tutti i \d+ record filtrati$/.test(key)) {
			return 'Estende la selezione a tutti i risultati dei filtri, comprese le presenze nelle altre pagine.';
		}
		if (/^torna a /.test(key) || key.startsWith('← ')) {
			return 'Torna alla pagina di provenienza senza avviare una nuova operazione.';
		}
		if (/^\d+$/.test(key)) {
			return `Mostra la pagina ${title} dell’elenco mantenendo i filtri attivi.`;
		}

		if (key === 'filtra') {
			return `Aggiorna “${pageTitle}” mostrando soltanto i risultati che corrispondono ai criteri inseriti.`;
		}
		if (key === 'azzera') {
			return `Rimuove tutti i filtri da “${pageTitle}” e ripristina l’elenco completo.`;
		}
		if (key === 'modifica') {
			if (window.location.pathname === '/devices') {
				return 'Apre il modulo per cambiare la posizione o lo stato operativo di questo dispositivo.';
			}
			return `Apre il modulo per correggere o completare i dati della persona visualizzata in “${pageTitle}”.`;
		}
		if (key === 'elimina') {
			if (/^\/cards\/[^/]+\/erase\/?$/.test(window.location.pathname)) {
				return 'Rimuove la tessera dal database senza cancellare i dati presenti sulla card fisica.';
			}
			if (modalTitle) {
				return `Conferma “${modalTitle}”. L’azione può essere irreversibile: controlla il messaggio nella finestra prima di procedere.`;
			}
			return `Apre la richiesta di conferma per eliminare l’elemento da “${pageTitle}”, senza agire immediatamente.`;
		}
		if (key === 'salva' || key === 'salva modifiche' || key === 'aggiorna' || key === 'crea') {
			return modalTitle
				? `Controlla i dati inseriti e li salva in “${modalTitle}”. Se manca qualcosa, il modulo indica cosa correggere.`
				: 'Controlla i dati inseriti e salva le modifiche. Se manca qualcosa, il modulo indica cosa correggere.';
		}

		return null;
	}

	function fieldDescription(
		element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
		title: string
	) {
		const key = normalized(title);
		const fieldDescriptions: Record<string, string> = {
			dal: 'Imposta il primo giorno del periodo da consultare o esportare.',
			al: 'Imposta l’ultimo giorno del periodo da consultare o esportare.',
			'data e ora': 'Indica quando è avvenuto l’ingresso o l’uscita, usando l’ora italiana.',
			iscritto: 'Cerca per nome o email per vedere soltanto le presenze di una persona.',
			utente: 'Cerca per nome o email per vedere soltanto le presenze di un collaboratore.',
			dispositivo:
				'Inserisci l’ID di un reader per vedere soltanto gli eventi registrati da quel dispositivo.',
			sorgente:
				'Scegli se mostrare eventi letti da una card, inseriti a mano o registrati dalla Home.',
			tipo: 'Scegli se l’evento da registrare è un ingresso oppure un’uscita.',
			'nota (facoltativa)':
				'Aggiungi un breve motivo o promemoria utile a riconoscere questo inserimento manuale.',
			'data fine corso':
				'Indica l’ultimo giorno del corso: serve per attribuire correttamente le presenze e calcolare le ore.',
			'file .bin': 'Scegli dal computer il file firmware .bin compilato per il reader.',
			'note di rilascio (opzionale)':
				'Riassumi le novità di questa versione per riconoscerla facilmente in futuro.'
		};

		if (fieldDescriptions[key]) return fieldDescriptions[key];

		if (element instanceof HTMLInputElement) {
			if (element.type === 'checkbox' || element.type === 'radio') {
				return `Scegli questa opzione per includere “${title}” nella ricerca o nell’operazione.`;
			}
			if (element.type === 'file') {
				return `Scegli dal dispositivo il file richiesto per “${title}”. Prima di continuare, controlla formato e versione.`;
			}
			if (element.type === 'date') return `Scegli la data da usare per “${title}”.`;
			if (element.type === 'datetime-local') return `Scegli data e ora da usare per “${title}”.`;
			if (element.type === 'email')
				return `Inserisci un indirizzo email valido nel campo “${title}”.`;
			if (element.type === 'password') {
				return `Inserisci il valore riservato richiesto da “${title}”. I caratteri restano nascosti mentre scrivi.`;
			}
			if (
				element.type === 'search' ||
				element.placeholder?.toLocaleLowerCase('it-IT').includes('cerca')
			) {
				return `Scrivi una o più parole per cercare in “${title}”; poi applica il filtro per aggiornare i risultati.`;
			}
		}

		if (element instanceof HTMLSelectElement) {
			return `Scegli il valore più adatto per “${title}”. La selezione verrà applicata quando salvi o filtri.`;
		}
		if (element instanceof HTMLTextAreaElement) {
			return `Aggiungi in “${title}” le informazioni che possono essere utili a chi consulterà questi dati.`;
		}

		return `Inserisci il dato richiesto in “${title}”. Il valore verrà usato quando confermi il modulo.`;
	}

	function tutorialCopy(element: HTMLElement): TutorialCopy {
		const title = elementLabel(element);
		const descriptionOwner = element.closest<HTMLElement>('[data-tutorial-description]');
		const explicitDescription = compact(descriptionOwner?.dataset.tutorialDescription);
		if (explicitDescription) return { title, description: explicitDescription };

		const anchor = element.closest<HTMLAnchorElement>('a[href]');
		if (anchor) return { title, description: anchorDescription(anchor, title) };

		if (
			element instanceof HTMLInputElement ||
			element instanceof HTMLSelectElement ||
			element instanceof HTMLTextAreaElement
		) {
			return { title, description: fieldDescription(element, title) };
		}

		if (element.getAttribute('role') === 'switch') {
			return {
				title,
				description: `Decide se usare “${title}”. La scelta diventa effettiva quando salvi le impostazioni.`
			};
		}

		const contextualDescription = actionDescription(element, title);
		if (contextualDescription) return { title, description: contextualDescription };

		const button = element.closest('button');
		return {
			title,
			description:
				button?.type === 'submit'
					? `Controlla i dati inseriti e conferma “${title}”. Se qualcosa non è valido, resterai nella pagina con le indicazioni da correggere.`
					: `Avvia “${title}”. Prima di modificare dati importanti, la webapp mostra una conferma o il risultato dell’operazione.`
		};
	}

	function updateRect() {
		if (!activeElement || !document.body.contains(activeElement)) {
			closeExplanation();
			return;
		}

		const rect = activeElement.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) {
			closeExplanation();
			return;
		}

		activeRect = {
			top: Math.max(4, rect.top - 4),
			left: Math.max(4, rect.left - 4),
			width: Math.min(window.innerWidth - 8, rect.width + 8),
			height: Math.min(window.innerHeight - 8, rect.height + 8)
		};
	}

	function openExplanation(element: HTMLElement) {
		activeElement?.classList.remove('tutorial-active');
		activeElement = element;
		activeElement.classList.add('tutorial-active');
		copy = tutorialCopy(element);
		updateRect();
	}

	function closeExplanation() {
		activeElement?.classList.remove('tutorial-active');
		activeElement = null;
		activeRect = null;
		copy = null;
	}

	function handleDocumentClick(event: MouseEvent) {
		if (!enabled) return;
		const target = event.target;
		if (!(target instanceof Element) || target.closest('[data-tutorial-ignore]')) return;

		const interactive = target.closest<HTMLElement>(interactiveSelector);
		if (!interactive || interactive.getAttribute('aria-hidden') === 'true') return;

		event.preventDefault();
		event.stopImmediatePropagation();
		openExplanation(interactive);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && activeElement) {
			event.preventDefault();
			closeExplanation();
		}
	}

	function disableTutorial() {
		closeExplanation();
		onDisable();
	}

	function tooltipStyle(rect: Rect): string {
		const margin = 14;
		const width = Math.min(336, window.innerWidth - 24);
		let left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
		let top = rect.top + rect.height + margin;

		if (top + 190 > window.innerHeight) {
			top = Math.max(12, rect.top - 190 - margin);
		}

		return `left:${left}px;top:${top}px;width:${width}px`;
	}

	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.classList.toggle('tutorial-mode', enabled);
		if (!enabled) closeExplanation();
	});

	onMount(() => {
		document.addEventListener('click', handleDocumentClick, true);
		window.addEventListener('keydown', handleKeydown, true);
		window.addEventListener('resize', updateRect);
		window.addEventListener('scroll', updateRect, true);

		return () => {
			document.documentElement.classList.remove('tutorial-mode');
			document.removeEventListener('click', handleDocumentClick, true);
			window.removeEventListener('keydown', handleKeydown, true);
			window.removeEventListener('resize', updateRect);
			window.removeEventListener('scroll', updateRect, true);
			activeElement?.classList.remove('tutorial-active');
		};
	});
</script>

{#if enabled && activeRect && copy}
	<div
		class="pointer-events-none fixed z-[60] rounded-md ring-4 ring-amber-400 ring-offset-2 ring-offset-transparent transition-all duration-150"
		style:top="{activeRect.top}px"
		style:left="{activeRect.left}px"
		style:width="{activeRect.width}px"
		style:height="{activeRect.height}px"
		style:box-shadow="0 0 0 9999px rgb(15 23 42 / 0.72)"
		aria-hidden="true"
	></div>

	<div
		class="fixed z-[70] rounded-xl border border-amber-200 bg-white p-4 text-slate-900 shadow-2xl"
		style={tooltipStyle(activeRect)}
		role="dialog"
		aria-modal="true"
		aria-labelledby="tutorial-title"
		data-tutorial-ignore
	>
		<div class="flex items-start gap-3">
			<div class="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-700">
				<CircleHelp size={19} aria-hidden="true" />
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-xs font-semibold uppercase tracking-wide text-amber-700">Guida Tutorial</p>
				<h2 id="tutorial-title" class="mt-1 text-base font-semibold">{copy.title}</h2>
				<p class="mt-2 text-sm leading-6 text-slate-600">{copy.description}</p>
			</div>
			<button
				type="button"
				class="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
				onclick={closeExplanation}
				aria-label="Chiudi spiegazione"
				data-tutorial-ignore
			>
				<X size={18} />
			</button>
		</div>
		<div class="mt-4 flex items-center justify-between border-t pt-3">
			<span class="text-xs text-slate-500">Clicca un altro elemento evidenziato per scoprirlo.</span
			>
			<button
				type="button"
				class="ml-3 shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800"
				onclick={disableTutorial}
				data-tutorial-ignore
			>
				Termina
			</button>
		</div>
	</div>
{/if}
