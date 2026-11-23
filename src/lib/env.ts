// Configurazione da variabili d'ambiente. Tutto è facoltativo in locale.

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export const env = {
  get databaseUrl() {
    return read("DATABASE_URL");
  },
  get cronSecret() {
    return read("CRON_SECRET");
  },
  whatsapp: {
    get token() {
      return read("WHATSAPP_TOKEN");
    },
    get phoneNumberId() {
      return read("WHATSAPP_PHONE_NUMBER_ID");
    },
    get appSecret() {
      return read("WHATSAPP_APP_SECRET");
    },
    get verifyToken() {
      return read("WHATSAPP_VERIFY_TOKEN");
    },
    get graphVersion() {
      return read("WHATSAPP_GRAPH_VERSION") ?? "v23.0";
    },
    get templateLanguage() {
      return read("WHATSAPP_TEMPLATE_LANGUAGE") ?? "it";
    },
    get enabled() {
      return Boolean(read("WHATSAPP_TOKEN") && read("WHATSAPP_PHONE_NUMBER_ID"));
    },
  },
  smtp: {
    get host() {
      return read("SMTP_HOST");
    },
    get port() {
      return Number(read("SMTP_PORT") ?? "587");
    },
    get user() {
      return read("SMTP_USER");
    },
    get password() {
      return read("SMTP_PASSWORD");
    },
    get from() {
      return read("SMTP_FROM") ?? "Rendiconti <rendiconti@example.com>";
    },
    get enabled() {
      return Boolean(read("SMTP_HOST"));
    },
  },
};
