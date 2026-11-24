<img src="public/brand/pronta-logo.svg" alt="Pronta" height="40">

# Pronta — versione 1

**Ogni casa pronta, ogni proprietario informato.**

Web app per uso interno che gestisce **pulizie** e **rendiconti mensili ai proprietari** per 8–10 appartamenti in affitto breve, senza channel manager.

- Le prenotazioni arrivano dai **calendari iCal** di Airbnb e Booking (letti ogni 15 minuti).
- Per ogni prenotazione l'app ti chiede su WhatsApp **quanti ospiti**, crea l'intervento di pulizia e lo invia all'addetta con i pulsanti **Confermo / Non posso**, poi **Fatto**.
- Modifiche e cancellazioni partono da sole (**MODIFICA** con prima e dopo, **ANNULLATA**); i **cambi in giornata** sono evidenziati; la sera prima parte un **promemoria**; se nessuno risponde ricevi un **avviso**.
- Il costo di ogni pulizia si calcola dal **listino** dell'addetta (base, ospiti extra, biancheria, festivi).
- A fine mese generi il **rendiconto** per appartamento: bozza → verificato → inviato, con PDF e email ai proprietari. Le correzioni dopo l'invio diventano **rettifiche**.

Senza nessuna configurazione funziona tutto in locale: database nella cartella `data`, messaggi WhatsApp ed email **simulati** (li vedi nella pagina Messaggi e puoi simulare le risposte).

---

## 1. Requisiti (Windows)

- **Node.js 22 LTS** o più recente: scaricalo da nodejs.org e installalo con le opzioni predefinite.
- Un terminale: PowerShell va benissimo. Consigliato Visual Studio Code per aprire il progetto.

Verifica l'installazione:

```powershell
node -v
npm -v
```

## 2. Avvio rapido con i dati demo

```powershell
cd C:\Dev\backoffice-affitti
npm install
npm run demo
npm run dev
```

Apri **http://localhost:3000**. La demo crea 8 appartamenti inventati con calendari finti in `data\demo-ical`.

In un **secondo terminale** avvia l'attività pianificata (letture calendari, invii, promemoria, escalation ogni 5 minuti):

```powershell
cd C:\Dev\backoffice-affitti
npm run worker
```

> `npm run demo` va lanciato con l'app **ferma**: il database locale può essere aperto da un solo programma alla volta. In alternativa usa il pulsante "Carica dati demo" in Impostazioni.

### Cosa provare

1. **Messaggi**: tocca *Confermo*, *Non posso* o *Fatto* sotto i messaggi simulati e guarda cambiare lo stato in **Pulizie** e in **Dashboard**.
2. **Domanda ospiti**: sotto un messaggio "Domanda ospiti" rispondi con codice e numero (es. `4821 3`).
3. **Modifica dal portale**: apri `data\demo-ical\APP2-airbnb.ics`, cambia una data `DTEND` di una prenotazione futura (o cancella un blocco `BEGIN:VEVENT … END:VEVENT`), salva e premi **Sincronizza ora**: parte il messaggio MODIFICA o ANNULLATA.
4. **Rendiconti**: scegli il mese, *Genera bozza*, aggiungi una spesa, *Verifica*, *Genera e invia*, poi scarica il PDF.

## 3. Usare i tuoi dati

1. Ferma l'app e **cancella la cartella `data`** (contiene solo la demo).
2. Copia `config\configurazione.example.json` in `config\configurazione.json` e compilalo:
   - **gestore**: i tuoi dati e il tuo numero WhatsApp (riceve domande e avvisi);
   - **addette**: nome e numero WhatsApp;
   - **proprietari**: nome ed email (dove arriva il rendiconto);
   - **appartamenti**: orari, set di biancheria standard, **link iCal di esportazione** di Airbnb e Booking, proprietari con quota %, addette (principale e riserva), listini, contratti.
3. Avvia l'app, vai in **Impostazioni → Importa configurazione**.

Il link iCal di esportazione si trova nelle impostazioni di sincronizzazione del calendario di ogni annuncio, su Airbnb e sull'extranet di Booking (voce "Esporta calendario"). Va copiato per ogni appartamento.

Puoi reimportare il file quando vuoi: aggiorna la configurazione senza toccare prenotazioni e pulizie.

### Parametri del contratto

| Campo | Valori | Significato |
| --- | --- | --- |
| `attribuzione` | `checkin`, `checkout`, `notti` | A quale mese appartiene una prenotazione |
| `baseCommissione` | `lordo`, `netto_ota`, `netto_ota_pulizie` | Su cosa si calcola la tua percentuale |
| `tipoCommissione` | `percentuale`, `fissa`, `percentuale_con_minimo` | Con `quotaFissa` e `minimo` in euro |
| `pulizieACarico` | `proprietario`, `gestore` | Chi paga le pulizie |
| `quotaPulizieOspite` | `ricavo_proprietario`, `rimborso_gestore` | Dove va la quota pulizie pagata dall'ospite |
| `iva` | es. `22`, oppure `0` in regime forfettario | IVA sulla tua commissione |
| `ritenuta` | `attiva`, `percentuale`, `base` | Ritenuta 21% se incassi tu i canoni |

La tassa di soggiorno è sempre esclusa dal calcolo. **Le regole fiscali (ritenuta, IVA) vanno fatte verificare dal tuo commercialista** prima di usare i rendiconti con i proprietari.

### Incassi

In questa versione gli importi si inseriscono in **Prenotazioni → Modifica importi e note** (lordo, commissione del portale, quota pulizie, tassa di soggiorno). L'import automatico dei report di pagamento di Airbnb e Booking è il prossimo passo: serve un tuo file CSV reale per costruirlo sul formato giusto.

## 4. WhatsApp reale (Meta Cloud API)

Finché le variabili `WHATSAPP_*` sono vuote, i messaggi sono simulati. Per l'invio reale servono:

1. Un account **Meta Business** verificato e un **numero di telefono dedicato** (non quello che usi su WhatsApp personale).
2. Un'app su Meta for Developers con il prodotto WhatsApp: da lì prendi **token permanente** e **Phone number ID**.
3. I **modelli di messaggio** (categoria Utility, lingua italiano), con questi nomi e i parametri nell'ordine indicato:

| Nome | Testo suggerito | Pulsanti (risposta rapida, in quest'ordine) |
| --- | --- | --- |
| `pulizia_nuova` | Nuova pulizia — {{1}} · {{2}} · {{3}} · {{4}} | Confermo, Non posso |
| `pulizia_modifica` | MODIFICA — {{1}}: {{2}}. Ti chiediamo di riconfermare. | Confermo, Non posso |
| `pulizia_annullata` | ANNULLATA — {{1}}: la pulizia di {{2}} non è più necessaria. | — |
| `pulizia_promemoria` | Promemoria — {{1}}: domani {{2}} · {{3}}. Quando hai finito tocca Fatto. | Fatto |
| `gestore_richiesta_ospiti` | Nuova prenotazione {{2}} — {{1}}: {{3}}. Quanti ospiti? Rispondi ad esempio "{{4}} 3". | — |
| `gestore_avviso` | Attenzione — {{1}}: {{2}} | — |

4. Il **webhook** in Meta: URL `https://TUO-DOMINIO/api/whatsapp/webhook`, token di verifica uguale a `WHATSAPP_VERIFY_TOKEN`. Meta deve raggiungere l'app da internet: in locale serve un tunnel (ad esempio Cloudflare Tunnel o ngrok), oppure l'app pubblicata online.
5. Copia `.env.example` in `.env.local` e compila `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. Riavvia l'app.

## 5. Email dei rendiconti

Compila `SMTP_*` in `.env.local` (il server SMTP del tuo dominio o un servizio come Brevo/Postmark). Senza SMTP l'invio è simulato, ma il PDF viene comunque generato e archiviato in `data\rendiconti`.

## 6. Passare a Supabase

Lo schema è PostgreSQL standard: per passare dal database locale a Supabase

1. crea un progetto Supabase nella regione **Frankfurt (eu-central-1)**;
2. metti la stringa di connessione in `DATABASE_URL` e una password lunga in `CRON_SECRET`;
3. lancia `npm run db:migrate`;
4. reimporta la configurazione.

Prima di pubblicare l'app online servono ancora: login (Supabase Auth), archivio dei PDF su Supabase Storage invece della cartella `data`, e un cron che chiami `/api/cron/tick` con l'intestazione `Authorization: Bearer CRON_SECRET`.

## 7. Comandi

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | Avvia l'app in sviluppo su http://localhost:3000 |
| `npm run worker` | Chiama l'attività pianificata ogni 5 minuti |
| `npm run demo` | Cancella il database locale e carica la demo (app ferma) |
| `npm test` | Esegue i test (calcoli, calendari, flusso completo con PDF) |
| `npm run typecheck` | Controllo dei tipi TypeScript |
| `npm run build` / `npm start` | Versione ottimizzata |
| `npm run db:generate` | Genera una migrazione dopo una modifica a `src/db/schema.ts` |
| `npm run db:migrate` | Applica le migrazioni a Supabase/PostgreSQL |

## 8. Struttura

```
src/
  domain/      logica pura e testata: calendari iCal, confronto prenotazioni,
               piano pulizie e cambi in giornata, costi e festivi, rendiconto, messaggi
  services/    sincronizzazione, ciclo di vita delle pulizie, WhatsApp, rendiconti, PDF, email
  db/          schema del database (tutte le tabelle hanno tenant_id) e connessione
  app/         pagine (Dashboard, Pulizie, Prenotazioni, Messaggi, Rendiconti, Appartamenti, Impostazioni)
               e API (/api/cron/tick, /api/whatsapp/webhook)
public/brand/  logo, icona e immagini del marchio Pronta
config/        configurazione.example.json, logo.png facoltativo per i PDF
drizzle/       migrazioni SQL
data/          database locale, calendari demo, PDF archiviati (escluso da Git)
tests/         test automatici
```

Per mettere il tuo logo nei PDF salva un file `config\logo.png`.

## Marchio

L'app si chiama **Pronta**. Il simbolo è una porta aperta con una spunta: l'appartamento pronto per il prossimo ospite.

- **Colori**: inchiostro `#171717`, carta `#FAFAFA`, pietra `#E8E4DC`, accento terracotta `#C2562B` (solo nel logo e nel materiale di marca, mai per gli stati dell'app).
- **Carattere**: Geist, con Geist Mono per i codici.
- **Tono**: "tu" con te e con le addette, "Lei" con i proprietari; niente emoji o punti esclamativi nei messaggi.
- **Rendiconti**: i PDF ai proprietari portano il tuo logo e il tuo colore; Pronta compare solo in piccolo nel piè di pagina ("generato con Pronta").
- **File** in `public/brand`: `pronta-logo.svg` (e versione bianca), `pronta-simbolo.svg`, `pronta-icona.svg`, `pronta-whatsapp-640.png` da usare come foto profilo del numero WhatsApp Business, `pronta-anteprima-social.png` per l'anteprima del repository su GitHub (Settings → Social preview).

## 9. Limiti noti e prossimi passi

- Import CSV dei pagamenti Airbnb/Booking (serve un file reale di esempio).
- Alla prima importazione dei calendari reali controlla che nessuna prenotazione compaia due volte: le date che Airbnb importa da Booking vengono già scartate, ma il comportamento dell'esportazione di Booking va verificato sui tuoi annunci.
- Le foto inviate su WhatsApp vengono collegate all'intervento come identificativo Meta: il download delle immagini è da aggiungere.
- Login, archivio PDF su Supabase Storage e pubblicazione online.
- Fattura elettronica della commissione (Fatture in Cloud) e area proprietari in sola lettura.

## Privacy

La cartella `data` contiene dati personali (prenotazioni, numeri di telefono, rendiconti): non condividerla e fanne un backup regolare. Alle addette arrivano solo appartamento, date, orari, numero di ospiti e note operative: mai nomi o contatti degli ospiti.
