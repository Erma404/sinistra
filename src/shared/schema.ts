import { z } from "zod";

/** Champs de faits que Sinistra sait extraire (cf. CLAUDE.md). */
export const CHAMPS = [
  "date_sinistre",
  "lieu",
  "cause_apparente",
  "etendue_degats",
  "personnes_en_danger",
  "coupure_eau",
  "electricite_touchee",
  "tiers_implique",
  "photos_mentionnees",
] as const;

export type Champ = (typeof CHAMPS)[number];

export const LIBELLES_CHAMPS: Record<Champ, string> = {
  date_sinistre: "Date du sinistre",
  lieu: "Lieu dans le logement",
  cause_apparente: "Cause apparente",
  etendue_degats: "Étendue des dégâts",
  personnes_en_danger: "Personnes en danger",
  coupure_eau: "Coupure d'eau effectuée",
  electricite_touchee: "Électricité touchée",
  tiers_implique: "Tiers impliqué (voisin)",
  photos_mentionnees: "Photos mentionnées",
};

export const NiveauConfiance = z.enum(["haute", "moyenne", "basse"]);
export const NiveauUrgence = z.enum(["urgent", "normal", "faible"]);
export type NiveauUrgence = z.infer<typeof NiveauUrgence>;

export const FaitSchema = z.object({
  champ: z.enum(CHAMPS),
  valeur: z.string(),
  source: z.string(),
  confiance: NiveauConfiance,
});
export type Fait = z.infer<typeof FaitSchema>;

/** Sortie IA attendue : JSON strict, validé côté serveur. */
export const AnalyseSchema = z.object({
  faits: z.array(FaitSchema),
  urgence: z.object({
    niveau: NiveauUrgence,
    justification: z.string(),
    sources: z.array(z.string()),
  }),
  informations_manquantes: z.array(z.string()),
  questions_suggerees: z.array(z.string()),
  alertes: z.array(z.string()),
});
export type Analyse = z.infer<typeof AnalyseSchema>;

/** Réponse de l'API /api/analyze (et de l'analyseur local). */
export type ResultatAnalyse = {
  analyse: Analyse;
  /** "ia" = modèle Claude via la fonction serveur ; "regles" = analyseur local sans IA. */
  moteur: "ia" | "regles";
  /** Faits retirés par le garde-fou parce que leur source est introuvable dans la déclaration. */
  faits_rejetes: Fait[];
};
