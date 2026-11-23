// Chiama l'attività pianificata dell'app in esecuzione (npm run dev / npm start)
// ogni 5 minuti. In locale il database è dentro l'app, quindi il worker passa da HTTP.
//
//   npm run worker
//   npm run worker -- --url http://localhost:3000 --minuti 5

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const baseUrl = arg("url", process.env.APP_URL ?? "http://localhost:3000");
const minutes = Number(arg("minuti", "5"));
const secret = process.env.CRON_SECRET;

async function tick() {
  const started = new Date();
  try {
    const response = await fetch(`${baseUrl}/api/cron/tick`, {
      method: "POST",
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(data.error ?? response.status));
    console.log(
      `[${started.toLocaleTimeString("it-IT")}] calendari letti: ${(data.feeds as { status: string }[]).filter((f) => f.status !== "saltato").length}, ` +
        `domande ospiti: ${data.guestQuestions}, pulizie inviate: ${data.jobsSent}, escalation: ${data.escalations}, promemoria: ${data.reminders}`,
    );
  } catch (e) {
    console.error(`[${started.toLocaleTimeString("it-IT")}] errore: ${e instanceof Error ? e.message : e}`);
  }
}

console.log(`Worker avviato: ${baseUrl}/api/cron/tick ogni ${minutes} minuti. Ctrl+C per fermarlo.`);
void tick();
setInterval(tick, minutes * 60_000);

export {};
