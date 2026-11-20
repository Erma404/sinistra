import type { Analyse, Fait } from "./schema.js";

/** Normalise les espaces et les apostrophes pour comparer source et déclaration. */
export function normaliser(texte: string): string {
  return texte
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Vrai si la source est un extrait exact (aux espaces près) de la déclaration. */
export function sourceValide(source: string, declaration: string): boolean {
  const s = normaliser(source);
  if (s.length < 3) return false;
  return normaliser(declaration).includes(s);
}

/**
 * Garde-fou n°2 : un fait sans source vérifiable dans la déclaration n'est pas affiché.
 * Les sources d'urgence invalides sont aussi retirées.
 */
export function appliquerGardeFous(
  analyse: Analyse,
  declaration: string,
): { analyse: Analyse; faits_rejetes: Fait[] } {
  const faits: Fait[] = [];
  const faits_rejetes: Fait[] = [];
  const dejaVus = new Set<string>();

  for (const fait of analyse.faits) {
    if (!sourceValide(fait.source, declaration) || dejaVus.has(fait.champ)) {
      faits_rejetes.push(fait);
      continue;
    }
    dejaVus.add(fait.champ);
    faits.push(fait);
  }

  return {
    analyse: {
      ...analyse,
      faits,
      urgence: {
        ...analyse.urgence,
        sources: analyse.urgence.sources.filter((s) => sourceValide(s, declaration)),
      },
    },
    faits_rejetes,
  };
}

/** Positions d'une source dans le texte original (pour le surlignage). */
export function localiserSource(
  source: string,
  declaration: string,
): { debut: number; fin: number } | null {
  const idx = declaration.indexOf(source);
  if (idx >= 0) return { debut: idx, fin: idx + source.length };
  // Repli insensible à la casse
  const idx2 = declaration.toLowerCase().indexOf(source.toLowerCase());
  if (idx2 >= 0) return { debut: idx2, fin: idx2 + source.length };
  return null;
}
