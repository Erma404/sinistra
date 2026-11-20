import type { Analyse, Champ, Fait, NiveauUrgence } from "./schema.js";
import { LIBELLES_CHAMPS } from "./schema.js";

/**
 * Analyseur local à règles, SANS IA.
 * Sert de mode hors ligne quand aucune clé API n'est configurée, et de base de comparaison
 * pour l'évaluation. Il cite toujours une phrase exacte de la déclaration comme source.
 */

type Regle = {
  motif: RegExp;
  valeur: (phrase: string) => string;
  confiance?: Fait["confiance"];
};

const NEGATION = /\b(pas|jamais|aucun|aucune|ni|impossible|n'ai pas|n'arrive pas|sans)\b/i;

function ouiNon(phrase: string): string {
  return NEGATION.test(phrase) ? "non" : "oui";
}

function premier(phrase: string, motif: RegExp): string {
  const m = phrase.match(motif);
  return m ? m[0] : phrase;
}

const MOIS = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
const DATE = new RegExp(
  `\\b(\\d{1,2}(er)?\\s+(${MOIS})(\\s+\\d{4})?|\\d{1,2}/\\d{1,2}(/\\d{2,4})?|hier|avant-hier|ce matin|cette nuit|aujourd'hui|(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)( dernier)?)\\b`,
  "i",
);
const PIECES =
  /\b(cuisine|salle de bains?|salle d'eau|chambre|salon|séjour|couloir|entrée|cellier|buanderie|garage|cave|wc|toilettes|grenier|combles)\b/i;
const CAUSES =
  /\b(fuite|canalisation|tuyau|joint|chauffe-eau|ballon d'eau chaude|machine à laver|lave-vaisselle|infiltration|toiture|débordement|baignoire|flexible|radiateur|siphon)\b[^.,;]*/i;

const REGLES: Record<Champ, Regle[]> = {
  date_sinistre: [{ motif: DATE, valeur: (p) => premier(p, DATE), confiance: "moyenne" }],
  lieu: [{ motif: PIECES, valeur: (p) => premier(p, PIECES), confiance: "haute" }],
  cause_apparente: [{ motif: CAUSES, valeur: (p) => premier(p, CAUSES).trim(), confiance: "moyenne" }],
  etendue_degats: [
    {
      motif: /\b(inond|gondol|abîm|abim|tache|trempé|moisissure|parquet|plinthe|meuble|peinture|cm d'eau|centimètres|dégâts|décoll)/i,
      valeur: (p) => p.replace(/\s+/g, " ").trim(),
      confiance: "moyenne",
    },
  ],
  personnes_en_danger: [
    {
      motif: /\b(glissé|tombé|blessé|blessée|personne âgée|bébé|enfant en bas âge|danger|malaise|hospitalis)/i,
      valeur: () => "oui",
      confiance: "moyenne",
    },
  ],
  coupure_eau: [
    {
      motif: /\b(coupé l'eau|couper l'eau|fermé le robinet|vanne|robinet d'arrêt|compteur d'eau|arrivée d'eau|coule toujours|coule encore)/i,
      valeur: (p) => (/coule (toujours|encore)/i.test(p) ? "non" : ouiNon(p)),
      confiance: "haute",
    },
  ],
  electricite_touchee: [
    {
      motif: /\b(électri|electri|disjonct|tableau|prise|courant|plafonnier|luminaire|court-circuit|étincel)/i,
      valeur: ouiNon,
      confiance: "haute",
    },
  ],
  tiers_implique: [
    {
      motif: /\b(voisin|voisine|du dessus|au-dessus|copropriété|syndic|locataire du)/i,
      valeur: () => "oui",
      confiance: "moyenne",
    },
  ],
  photos_mentionnees: [{ motif: /\b(photo|photos|vidéo|pris en photo)/i, valeur: ouiNon, confiance: "haute" }],
};

const QUESTIONS: Record<Champ, string> = {
  date_sinistre: "À quelle date et vers quelle heure avez-vous constaté le dégât ?",
  lieu: "Dans quelles pièces du logement se trouvent les dégâts ?",
  cause_apparente: "Savez-vous d'où provient l'eau : canalisation, appareil, toiture ou logement voisin ?",
  etendue_degats: "Pouvez-vous décrire les dégâts visibles sur les murs, sols, plafonds ou meubles ?",
  personnes_en_danger: "Quelqu'un a-t-il été blessé ou est-il en danger ?",
  coupure_eau: "Avez-vous pu couper l'arrivée d'eau ?",
  electricite_touchee: "L'eau a-t-elle touché des prises, des luminaires ou le tableau électrique ?",
  tiers_implique: "Le dégât touche-t-il aussi un logement voisin ou les parties communes ?",
  photos_mentionnees: "Pouvez-vous nous envoyer quelques photos des dégâts ?",
};

const INJECTION =
  /(ignore[rz]?\s+(tes|vos|les)\s+(instructions|consignes|règles)|tu es (maintenant|désormais)|classe[rz]? (ce|le) (dossier|sinistre)|indique[rz]? que|nouvelles instructions|prompt|system|en tant qu'ia|réponds? uniquement)/i;

export function decouperPhrases(texte: string): string[] {
  return texte
    .split(/(?<=[.!?])\s+|\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function analyserParRegles(declaration: string): Analyse {
  const phrases = decouperPhrases(declaration);
  const alertes: string[] = [];
  const phrasesInjection = phrases.filter((p) => INJECTION.test(p));
  if (phrasesInjection.length > 0) {
    alertes.push(
      "La déclaration contient des consignes adressées au système. Elles sont traitées comme du texte et ignorées.",
    );
  }
  // Les phrases d'injection ne servent jamais de source à un fait.
  const phrasesUtiles = phrases.filter((p) => !phrasesInjection.includes(p));

  const faits: Fait[] = [];
  for (const champ of Object.keys(REGLES) as Champ[]) {
    for (const regle of REGLES[champ]) {
      const phrase = phrasesUtiles.find((p) => regle.motif.test(p));
      if (phrase) {
        faits.push({
          champ,
          valeur: regle.valeur(phrase),
          source: phrase,
          confiance: regle.confiance ?? "moyenne",
        });
        break;
      }
    }
  }

  const get = (c: Champ) => faits.find((f) => f.champ === c);
  const elec = get("electricite_touchee");
  const danger = get("personnes_en_danger");
  const coupure = get("coupure_eau");
  const etendue = get("etendue_degats");

  let niveau: NiveauUrgence = "normal";
  const raisons: string[] = [];
  const sources: string[] = [];
  if (elec?.valeur === "oui") {
    niveau = "urgent";
    raisons.push("risque électrique mentionné");
    sources.push(elec.source);
  }
  if (danger?.valeur === "oui") {
    niveau = "urgent";
    raisons.push("personne potentiellement en danger");
    sources.push(danger.source);
  }
  if (coupure?.valeur === "non") {
    niveau = "urgent";
    raisons.push("l'eau n'est pas coupée");
    sources.push(coupure.source);
  }
  if (niveau !== "urgent" && etendue && /\b(petite|légère|legere|tache|ancienne|sèche|seche)\b/i.test(etendue.source)) {
    niveau = "faible";
    raisons.push("dégât décrit comme limité");
    sources.push(etendue.source);
  }
  if (raisons.length === 0) raisons.push("aucun signal d'urgence ni de dégât minime détecté");

  const manquants = (Object.keys(REGLES) as Champ[]).filter((c) => !get(c));
  if (phrasesUtiles.join(" ").length < 120) {
    alertes.push("Déclaration très courte : la plupart des informations sont à compléter.");
  }

  return {
    faits,
    urgence: {
      niveau,
      justification: `Proposition à règles : ${raisons.join(", ")}.`,
      sources: [...new Set(sources)],
    },
    informations_manquantes: manquants.map((c) => LIBELLES_CHAMPS[c]),
    questions_suggerees: manquants.map((c) => QUESTIONS[c]),
    alertes,
  };
}
