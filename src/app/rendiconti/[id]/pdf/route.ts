import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apartmentOwners, apartments, owners, statements } from "@/db/schema";
import { requireTenant } from "@/services/common";
import { renderStatementPdf } from "@/services/pdf";
import { pdfFileName } from "@/services/statements";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** PDF archiviato per i rendiconti inviati; anteprima generata al volo per bozze e verificati. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await getDb();
  const [st] = await db.select().from(statements).where(eq(statements.id, id));
  if (!st) return new Response("Rendiconto non trovato", { status: 404 });
  const [apt] = await db.select().from(apartments).where(eq(apartments.id, st.apartmentId));
  const fileName = pdfFileName(apt.code, st.period, st.version);

  let pdf: Buffer | null = null;
  if (st.pdfPath) {
    pdf = await fs.readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), st.pdfPath)).catch(() => null);
  }
  if (!pdf) {
    const tenant = await requireTenant(db);
    const ownerRows = await db
      .select({ name: owners.name })
      .from(apartmentOwners)
      .innerJoin(owners, eq(owners.id, apartmentOwners.ownerId))
      .where(eq(apartmentOwners.apartmentId, st.apartmentId));
    const correctionOf = st.correctsId
      ? ((await db.select().from(statements).where(eq(statements.id, st.correctsId)))[0] ?? null)
      : null;
    pdf = await renderStatementPdf({ tenant, apartment: apt, ownerNames: ownerRows.map((o) => o.name), statement: st, correctionOf });
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${st.status === "inviato" ? fileName : `ANTEPRIMA-${fileName}`}"`,
    },
  });
}
