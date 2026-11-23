import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConfig } from "@/services/config";

describe("Configurazione di esempio", () => {
  it("è valida e converte euro e percentuali", () => {
    const config = parseConfig(JSON.parse(fs.readFileSync("config/configurazione.example.json", "utf8")));
    expect(config.appartamenti).toHaveLength(2);
    expect(config.appartamenti[0].listini[0].base).toBe(45);
  });

  it("spiega cosa non va in una configurazione sbagliata", () => {
    expect(() => parseConfig({ gestore: { nome: "x" } })).toThrow(/Configurazione non valida/);
  });
});
