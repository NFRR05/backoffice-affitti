import fs from "node:fs";
import path from "node:path";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { StatementResult, SummaryLine } from "@/domain/statement";
import { formatDate, formatPeriod } from "@/lib/dates";
import { formatBps, formatEuro } from "@/lib/money";
import type { Tenant } from "@/services/common";
import type { apartments, statements } from "@/db/schema";

type Apartment = typeof apartments.$inferSelect;
type Statement = typeof statements.$inferSelect;

export interface PdfInput {
  tenant: Tenant;
  apartment: Apartment;
  ownerNames: string[];
  statement: Statement;
  correctionOf: Statement | null;
}

// Il font standard Helvetica copre € e le lettere accentate; niente frecce o simboli speciali.
function euro(cents: number): string {
  return formatEuro(cents).replace(/ /g, " ");
}

function makeStyles(color: string) {
  return StyleSheet.create({
    page: { padding: 40, fontSize: 9.5, fontFamily: "Helvetica", color: "#1a1a1a" },
    band: { height: 6, backgroundColor: color, marginBottom: 16 },
    header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
    brand: { fontSize: 14, fontFamily: "Helvetica-Bold", color },
    muted: { color: "#666666" },
    title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
    subtitle: { fontSize: 11, marginBottom: 14 },
    section: { marginTop: 14 },
    sectionTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color, marginBottom: 6 },
    row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#dddddd" },
    head: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: color },
    bold: { fontFamily: "Helvetica-Bold" },
    total: {
      flexDirection: "row",
      paddingVertical: 6,
      marginTop: 2,
      backgroundColor: "#f2f5f9",
      borderTopWidth: 1,
      borderTopColor: color,
    },
    note: { marginTop: 4, fontSize: 8.5, color: "#666666" },
    footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 7.5, color: "#888888" },
    logo: { width: 90, height: 40, objectFit: "contain" },
  });
}

function SummaryRow({ line, styles }: { line: SummaryLine; styles: ReturnType<typeof makeStyles> }) {
  const strong = line.kind === "subtotale" || line.kind === "totale";
  const style = line.kind === "totale" ? styles.total : styles.row;
  return (
    <View style={style}>
      <Text style={[{ flex: 1 }, strong ? styles.bold : {}, line.kind === "info" ? styles.muted : {}]}>{line.label}</Text>
      <Text style={[{ width: 90, textAlign: "right" }, strong ? styles.bold : {}, line.kind === "info" ? styles.muted : {}]}>
        {euro(line.cents)}
      </Text>
    </View>
  );
}

function StatementDocument({ tenant, apartment, ownerNames, statement, correctionOf }: PdfInput) {
  const styles = makeStyles(tenant.brandColor || "#1F4E79");
  const r = statement.result as StatementResult;
  const logoPath = path.join(process.cwd(), "config", "logo.png");
  const hasLogo = fs.existsSync(logoPath);
  const params = statement.contractParams;

  return (
    <Document title={`Rendiconto ${apartment.name} ${statement.period}`} author={tenant.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.band} />
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{tenant.name}</Text>
            {tenant.address ? <Text style={styles.muted}>{tenant.address}</Text> : null}
            {tenant.vatNumber ? <Text style={styles.muted}>P. IVA {tenant.vatNumber}</Text> : null}
            <Text style={styles.muted}>{tenant.managerEmail}</Text>
          </View>
          {hasLogo ? <Image src={logoPath} style={styles.logo} /> : null}
        </View>

        <Text style={styles.title}>Rendiconto di {formatPeriod(statement.period)}</Text>
        <Text style={styles.subtitle}>
          {apartment.name}
          {apartment.address ? ` · ${apartment.address}` : ""} · Proprietà: {ownerNames.join(", ")}
        </Text>
        {correctionOf ? (
          <Text style={[styles.note, { marginBottom: 8 }]}>
            Rettifica (versione {statement.version}) del rendiconto inviato il{" "}
            {correctionOf.sentAt ? formatDate(correctionOf.sentAt.toISOString().slice(0, 10)) : "-"}
            {statement.correctionNote ? `: ${statement.correctionNote}` : ""}
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Riepilogo</Text>
          {r.summary.map((line, i) => (
            <SummaryRow key={i} line={line} styles={styles} />
          ))}
          {r.ownerSplit.length > 1
            ? r.ownerSplit.map((o) => (
                <View key={o.ownerId} style={styles.row}>
                  <Text style={{ flex: 1 }}>
                    di cui a {o.name} ({formatBps(o.shareBps)})
                  </Text>
                  <Text style={{ width: 90, textAlign: "right" }}>{euro(o.amountCents)}</Text>
                </View>
              ))
            : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prenotazioni del mese</Text>
          <View style={styles.head}>
            <Text style={[{ flex: 1 }, styles.bold]}>Prenotazione</Text>
            <Text style={[{ width: 40, textAlign: "right" }, styles.bold]}>Notti</Text>
            <Text style={[{ width: 75, textAlign: "right" }, styles.bold]}>Lordo</Text>
            <Text style={[{ width: 75, textAlign: "right" }, styles.bold]}>Comm. portale</Text>
            <Text style={[{ width: 75, textAlign: "right" }, styles.bold]}>Netto</Text>
          </View>
          {r.reservationLines.length === 0 ? <Text style={styles.note}>Nessuna prenotazione nel periodo.</Text> : null}
          {r.reservationLines.map((l) => (
            <View key={l.id} style={styles.row}>
              <Text style={{ flex: 1 }}>{l.label}</Text>
              <Text style={{ width: 40, textAlign: "right" }}>
                {l.nightsInPeriod === l.nights ? l.nights : `${l.nightsInPeriod}/${l.nights}`}
              </Text>
              <Text style={{ width: 75, textAlign: "right" }}>{euro(l.grossCents)}</Text>
              <Text style={{ width: 75, textAlign: "right" }}>{euro(-l.otaCommissionCents)}</Text>
              <Text style={{ width: 75, textAlign: "right" }}>{euro(l.netCents)}</Text>
            </View>
          ))}
        </View>

        {r.cleanings.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pulizie</Text>
            {r.cleanings.map((c) => (
              <View key={c.id} style={styles.row}>
                <Text style={{ flex: 1 }}>Pulizia del {formatDate(c.date)}</Text>
                <Text style={{ width: 90, textAlign: "right" }}>{euro(c.costCents)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {r.expenses.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Spese aggiuntive</Text>
            {r.expenses.map((e) => (
              <View key={e.id} style={styles.row}>
                <Text style={{ flex: 1 }}>
                  {formatDate(e.date)} · {e.description}
                </Text>
                <Text style={{ width: 90, textAlign: "right" }}>{euro(e.amountCents)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[styles.note, { marginTop: 16 }]}>
          Commissione di gestione da fatturare: imponibile {euro(r.totals.commissionCents)}
          {params.vatRateBps > 0 ? `, IVA ${formatBps(params.vatRateBps)} ${euro(r.totals.vatCents)}` : " (operazione senza IVA)"}, totale{" "}
          {euro(r.totals.managerInvoiceCents)}.
        </Text>

        <Text style={styles.footer} fixed>
          {tenant.name} · Rendiconto {apartment.code} {statement.period}
          {statement.version > 1 ? ` v${statement.version}` : ""} · generato il {formatDate(new Date().toISOString().slice(0, 10))}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderStatementPdf(input: PdfInput): Promise<Buffer> {
  return renderToBuffer(<StatementDocument {...input} />);
}
