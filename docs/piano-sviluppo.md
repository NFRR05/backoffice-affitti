# Piano di sviluppo di Pronta

Aggiornato al 25 novembre 2026. Mappa concettuale (lavagna): https://claude.ai/artifact/TG2vEURyxdzdR25qHjxkys

## Obiettivo

Trasformare Pronta da strumento interno a gestionale da vendere ad altri property manager: channel manager, prenotazioni, pulizie, rendiconti e comunicazioni tra tutti i soggetti, in un solo prodotto e automatizzati su WhatsApp e sugli altri canali.

Il cliente paga solo Pronta. I servizi esterni (connessione ai portali, WhatsApp, email) li paghiamo noi e sono inclusi nel prezzo dell'abbonamento.

## Come funziona

### Un solo motore di eventi

Ogni fatto diventa un evento: prenotazione nuova, modificata o cancellata; pulizia confermata o completata; guasto segnalato; rendiconto pronto. Delle regole, configurabili per ogni cliente, decidono chi avvisare, con quale messaggio e su quale canale. La versione 1 lo fa già per le pulizie (`src/services/tick.ts`, `src/services/incoming.ts`, `src/domain/messages.ts`): va esteso a tutti i soggetti.

### Da dove arrivano le prenotazioni

| Fonte | Cosa porta | Stato |
| --- | --- | --- |
| Channex (Airbnb, Booking e altri portali) | Prenotazioni in tempo reale con ospiti e importi; in uscita disponibilità e prezzi | Da fare |
| Prenotazioni dirette | Inserite in Pronta, chiudono le date sui portali tramite Channex | In parte (si inseriscono, non chiudono le date) |
| Calendari iCal | Solo le date, letti ogni 15 minuti | Oggi; da sostituire con Channex |

### Chi riceve e risponde

| Soggetto | Cosa riceve o fa | Canale |
| --- | --- | --- |
| Property manager | Avvisi, approvazioni, riepiloghi | WhatsApp e app web |
| Addette e manutentori | Incarichi, modifiche, promemoria, conferme, foto, segnalazione guasti | WhatsApp, senza installare app |
| Proprietari | Rendiconti, occupazione, spese da approvare | Email, WhatsApp, area riservata |
| Ospiti | Istruzioni di arrivo, numero di ospiti, check-in online | Chat dei portali (via Channex); WhatsApp per le dirette |

Con gli ospiti Airbnb conviene restare nella chat del portale. I documenti degli ospiti non si raccolgono via WhatsApp ma con un modulo di check-in online (vedi Adempimenti).

### Moduli

1. **Channel manager** (Channex): prenotazioni, disponibilità e prezzi, prenotazioni dirette.
2. **Operatività**: pulizie (fatte), manutenzioni e guasti, biancheria e scorte.
3. **Comunicazioni**: il motore di eventi, con modelli WhatsApp e risposte a pulsante.
4. **Amministrazione**: rendiconti ai proprietari (fatti), compensi delle addette, fattura elettronica, imposta di soggiorno.
5. **Adempimenti italiani**: vedi sotto.
6. **Piattaforma**: login, separazione dei clienti (`tenant_id` è già in tutte le tabelle), configurazione dall'interfaccia, abbonamenti.

## Connessione ai portali: Channex

### Perché non le API dirette di Airbnb e Booking

- **Airbnb**: nessun accesso self-service; si entra solo su invito come partner software e al momento non accettano nuove richieste.
- **Booking.com**: le Connectivity API sono documentate, ma per usarle bisogna diventare Connectivity Partner (verifica tecnica, conformità sui dati personali, manutenzione continua). Fonti di terzi riportano periodi di chiusura delle candidature.

Per un prodotto nuovo la strada è un channel manager "white label": Channex vende solo ad aziende software, non ai gestori.

### Cosa fornisce Channex e cosa facciamo noi

- **Channex**: connessione a 78 canali (Airbnb e Booking compresi), API e webhook (in uscita disponibilità, prezzi e restrizioni; in entrata prenotazioni, modifiche e cancellazioni), API e widget per abbinare appartamenti e annunci, chat e recensioni dei portali (extra), log, ambiente di prova gratuito (staging.channex.io), assistenza tecnica.
- **Noi**: tutta l'app con il nostro marchio, pulizie, WhatsApp, rendiconti, regole, adempimenti, prezzo e assistenza ai clienti.

### Limiti

- Non crea annunci e non modifica foto, servizi e descrizioni: il cliente li gestisce dal pannello dei portali (previsto per il 2027, senza garanzia).
- Non permette di cambiare date o cancellare prenotazioni dei portali.
- Funzioni diverse da portale a portale (tipi di prezzo, restrizioni, chat).
- Per andare in produzione Channex deve certificare la nostra integrazione, e ogni cliente autorizza i propri account sui portali.
- Da verificare: se nel collegamento ad Airbnb il cliente vede il nome Channex, e cosa copre esattamente il widget.

### Costi (piano WhiteLabel, dollari, IVA esclusa)

130 $ al mese fissi per tutto l'account, più 0,50 $ al mese per appartamento collegato ad almeno un portale (1 $ con chat e recensioni). Nessun costo di attivazione, nessun minimo, disdetta con 30 giorni di preavviso.

| Appartamenti collegati in totale | Solo channel manager | Con chat e recensioni |
| --- | --- | --- |
| 10 | 135 $/mese | 140 $/mese |
| 100 | 180 $/mese | 230 $/mese |
| 500 | 380 $/mese | 630 $/mese |
| 1.000 | 630 $/mese | 1.130 $/mese |

Extra possibili: 1 $ al mese per un collegamento doppio allo stesso portale, 0,02 $ a transazione per le carte inviate a Stripe, 0,05 $ per ogni tariffa oltre le 10 per tipo di alloggio.

## WhatsApp per più clienti

Ogni cliente collega il proprio numero WhatsApp Business. Per farlo dobbiamo diventare Tech Provider di Meta (verifica dell'azienda e revisione dell'app), oppure passare da Twilio o 360dialog. Con Twilio, Meta fattura Twilio e Twilio fattura noi: le tariffe Meta senza ricarico, più circa 0,005 $ a messaggio. Il cliente non paga nulla a Meta.

Il costo dipende da quanti messaggi manda ogni appartamento e va calcolato sul listino Meta per l'Italia: potrebbe pesare più di Channex.

## Adempimenti italiani, in ordine di priorità

Le regole sono cambiate più volte tra 2024 e 2026: vanno fatte validare da un commercialista e da un legale prima di venderle come funzioni.

1. **Identificazione degli ospiti e Alloggiati Web**. I dati vanno comunicati alla Questura entro 24 ore dall'arrivo. Con la sentenza 9101 del 21 novembre 2025 il Consiglio di Stato ha ribaltato il TAR Lazio: l'identificazione resta obbligatoria ma può avvenire anche in videocollegamento; le tecnologie ammesse sono da definire con il Viminale. *Automatico*: link al check-in online, raccolta dati, invio delle schedine con il servizio web ufficiale di Alloggiati Web, archivio delle ricevute. *A mano*: la verifica dell'identità.
2. **Imposta di soggiorno**. Il gestore è responsabile del pagamento (art. 4, c. 1-ter, D.Lgs. 23/2011) e presenta la dichiarazione annuale entro il 30 giugno dell'anno dopo. *Automatico*: calcolo per prenotazione con tariffe ed esenzioni del Comune, riepiloghi periodici, dati per la dichiarazione. *A mano*: l'invio sui portali dei Comuni.
3. **Fattura elettronica della commissione**. *Automatico*: quando parte il rendiconto, Pronta crea la fattura al proprietario tramite l'API di un servizio come Fatture in Cloud, che la trasmette all'Agenzia delle Entrate.
4. **Statistiche turistiche (ISTAT e regioni)**. Ogni regione ha il suo sistema: Ross1000 (Veneto, Piemonte, Emilia-Romagna, Lazio, Molise, Calabria), Turismo5 (Lombardia). Molte accettano un servizio web o un file dal gestionale. *Automatico*: arrivi, presenze e nazionalità dalle prenotazioni. Da costruire una regione alla volta, partendo da quelle dei primi clienti.
5. **Fisco dei proprietari**. Dal 2026: cedolare secca al 21% su un solo appartamento e al 26% sul secondo; oltre due appartamenti si è imprenditori, con partita IVA e senza cedolare (legge 199/2025). Chi incassa i canoni per conto del proprietario applica la ritenuta del 21%. *Automatico*: calcolo della ritenuta (il parametro c'è già nei contratti), riepilogo annuale per proprietario e per CIN, avviso oltre i due appartamenti gestiti. *A mano*: scelte fiscali e dichiarazioni, con il commercialista.
6. **CIN**. Codice identificativo nazionale di ogni appartamento, da esporre fuori dall'edificio e negli annunci. *Automatico*: nella scheda dell'appartamento, su rendiconti e riepiloghi, avviso se manca. *A mano*: indicarlo negli annunci (Channex non modifica i contenuti).

L'invio automatico ad Alloggiati Web lo offrono già Chekin e Lodgify (Lodgify solo nel piano più caro): incluso e fatto bene è un argomento di vendita.

## Fasi

1. **Pronta in produzione sui nostri appartamenti**: login, WhatsApp reale, app online. Valida il flusso operativo con dati veri. *Siamo qui*: la versione 1 funziona in locale con dati demo.
2. **Channex, ricezione**: prenotazioni con ospiti e importi al posto dei calendari iCal. Spariscono la domanda "quanti ospiti?" e l'inserimento a mano degli importi.
3. **Channex, invio**: disponibilità e prezzi verso i portali. È la parte delicata (overbooking): solo quando la ricezione è stabile.
4. **Più clienti**: configurazione dall'interfaccia, WhatsApp via Twilio per ogni cliente, abbonamenti. Da qui si vende.
5. **Ospiti e adempimenti**: chat dei portali, check-in online, Alloggiati Web e gli altri adempimenti in ordine di priorità.

## Cosa è simulato nella versione 1

- WhatsApp ed email: finché `WHATSAPP_*` e `SMTP_*` sono vuote non parte nessun messaggio.
- Dati demo: 8 appartamenti, proprietari e addette inventati; calendari finti in `data/demo-ical`.
- Incassi: si inseriscono a mano; l'import CSV dei pagamenti è da fare.

## Prossimi passi

- Creare un account gratuito su staging.channex.io e un prototipo che legge le prenotazioni da Channex accanto al modulo iCal.
- Stimare il costo per appartamento con WhatsApp incluso, come base per il prezzo di vendita.
- Far validare gli adempimenti da commercialista e legale.

## Fonti

- Airbnb, pagina partner: https://airbnb.com/partner
- Booking.com Connectivity, documentazione: https://developers.booking.com/connectivity/docs
- Channex, prezzi: https://channex.io/pricing
- Channex, funzionalità: https://channex.io/features
- Meta, diventare Tech Provider: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers
- Twilio, Tech Provider Program FAQ: https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/faq
- Alloggiati Web, manuale: https://alloggiatiweb.poliziadistato.it/PortaleAlloggiati/Download/Manuali/MANUALE.pdf
- Consiglio di Stato sull'identificazione degli ospiti: https://www.uppi.fvg.it/ribaltone-del-consiglio-di-stato-torna-in-vigore-la-circolare-anti-identificazione-da-remoto-negli-affitti-brevi/
- Imposta di soggiorno, guida per i gestori: https://fiscomania.com/imposta-di-soggiorno-la-guida-per-i-gestori
- Regione Veneto, Ross1000: https://www.regione.veneto.it/web/turismo/rilevazione-flussi-turistici-ross1000
- Affitti brevi 2026: https://fiscomania.com/affitti-brevi-restrizioni/
- Cedolare 21% su un solo CIN: https://beneggiassociati.com/affitti-brevi-cedolare-secca-21-un-solo-cin/
