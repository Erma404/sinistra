import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AnalyseSchema, type ResultatAnalyse } from "../src/shared/schema.js";
import { appliquerGardeFous } from "../src/shared/guardrails.js";
import { PROMPT_SYSTEME, messageUtilisateur } from "../src/shared/prompt.js";

const MODELE = process.env.SINISTRA_MODEL || "claude-opus-5-5";
const MAX_TENTATIVES = 2;
const TAILLE_MAX = 8000;

/**
 * Fonction serveur Vercel : la clé API reste ici, jamais dans le navigateur.
 * Sortie contrainte par le schéma zod, validée, puis filtrée par les garde-fous.
 * En cas de sortie invalide : nouvelle tentative (une fois).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ erreur: "Méthode non autorisée" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    // Le front bascule alors sur l'analyseur local à règles.
    return res.status(503).json({ erreur: "cle_absente" });
  }

  const declaration = typeof req.body?.declaration === "string" ? req.body.declaration : "";
  if (!declaration.trim() || declaration.length > TAILLE_MAX) {
    return res.status(400).json({ erreur: "Déclaration vide ou trop longue" });
  }

  const client = new Anthropic();
  let derniereErreur = "inconnue";

  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative++) {
    try {
      const reponse = await client.beta.messages.parse({
        model: MODELE,
        max_tokens: 8000,
        system: PROMPT_SYSTEME,
        output_config: { effort: "low", format: betaZodOutputFormat(AnalyseSchema) },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [{ role: "user", content: messageUtilisateur(declaration) }],
      });

      if (reponse.stop_reason === "refusal") {
        derniereErreur = "refus du modèle";
        continue;
      }
      // Double validation : le SDK parse, on revalide avec zod côté serveur.
      const valide = AnalyseSchema.safeParse(reponse.parsed_output);
      if (!valide.success) {
        derniereErreur = "sortie non conforme au schéma";
        continue;
      }

      const { analyse, faits_rejetes } = appliquerGardeFous(valide.data, declaration);
      const resultat: ResultatAnalyse = { analyse, moteur: "ia", faits_rejetes };
      return res.status(200).json(resultat);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) derniereErreur = "limite de débit atteinte";
      else if (e instanceof Anthropic.APIError) derniereErreur = `erreur API ${e.status ?? ""}`.trim();
      else derniereErreur = "erreur de traitement";
    }
  }

  return res.status(502).json({ erreur: `Analyse impossible : ${derniereErreur}` });
}
