import { analyserParRegles } from "../shared/analyseurRegles.js";
import { appliquerGardeFous } from "../shared/guardrails.js";
import type { ResultatAnalyse } from "../shared/schema.js";

/**
 * Appelle la fonction serveur /api/analyze (modèle Claude, clé côté serveur).
 * Si elle est indisponible (pas de clé, dev local sans fonctions), bascule sur
 * l'analyseur local à règles, sans IA. Les garde-fous s'appliquent dans les deux cas.
 */
export async function analyser(declaration: string): Promise<ResultatAnalyse> {
  try {
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declaration }),
    });
    if (r.ok && r.headers.get("content-type")?.includes("application/json")) {
      return (await r.json()) as ResultatAnalyse;
    }
  } catch {
    /* repli ci-dessous */
  }
  const { analyse, faits_rejetes } = appliquerGardeFous(analyserParRegles(declaration), declaration);
  return { analyse, moteur: "regles", faits_rejetes };
}
