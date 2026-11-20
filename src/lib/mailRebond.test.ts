import { describe, expect, it } from "vitest";
import { brouillonMailRebond } from "./mailRebond.js";
import { DECLARATIONS } from "../data/declarations.js";
import { analyserParRegles } from "../shared/analyseurRegles.js";

const INTERDITS = /(indemnis|rembours|garantie accordée|pris en charge|couvert|refus)/i;

describe("brouillon de mail de rebond", () => {
  it("salue par le prénom et cite la référence du dossier", () => {
    const d = DECLARATIONS[0];
    const m = brouillonMailRebond(d, analyserParRegles(d.texte), "Camille");
    expect(m.corps.startsWith(`Bonjour ${d.declarant.split(" ")[0]},`)).toBe(true);
    expect(m.objet).toContain(d.id);
    expect(m.corps).toContain(d.id);
  });

  it("reprend chaque question suggérée", () => {
    const d = DECLARATIONS.find((x) => x.id === "DDE-2026-0145")!;
    const a = analyserParRegles(d.texte);
    const m = brouillonMailRebond(d, a, "Camille");
    for (const q of a.questions_suggerees) expect(m.corps).toContain(q);
  });

  it("ajoute la consigne de sécurité seulement pour un cas urgent", () => {
    const urgent = DECLARATIONS.find((x) => x.id === "DDE-2026-0141")!;
    const faible = DECLARATIONS.find((x) => x.id === "DDE-2026-0144")!;
    expect(brouillonMailRebond(urgent, analyserParRegles(urgent.texte), "C").corps).toContain("112");
    expect(brouillonMailRebond(faible, analyserParRegles(faible.texte), "C").corps).not.toContain("112");
  });

  it("ne promet jamais de garantie ni d'indemnisation, même face à une injection", () => {
    for (const d of DECLARATIONS) {
      const m = brouillonMailRebond(d, analyserParRegles(d.texte), "Camille");
      expect(m.corps).not.toMatch(INTERDITS);
    }
  });
});
