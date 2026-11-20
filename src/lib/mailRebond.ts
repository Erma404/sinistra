import type { Declaration } from "../data/declarations.js";
import type { Analyse } from "../shared/schema.js";

/**
 * Brouillon de mail de rebond au déclarant.
 * Garde-fous : aucune décision ni promesse de garantie, de refus ou d'indemnisation ;
 * aucun envoi automatique (le gestionnaire relit, modifie et copie).
 */
export function brouillonMailRebond(
  declaration: Declaration,
  analyse: Analyse,
  signataire: string,
): { objet: string; corps: string } {
  const prenom = declaration.declarant.split(/\s+/)[0] || "Madame, Monsieur";
  const d = new Date(declaration.recueLe);
  const jour = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const lignes: string[] = [
    `Bonjour ${prenom},`,
    "",
    `Nous avons bien reçu votre déclaration du ${jour} à ${heure} concernant un dégât des eaux à ${declaration.ville}. ` +
      `Votre dossier est enregistré sous la référence ${declaration.id}.`,
  ];

  if (analyse.urgence.niveau === "urgent") {
    lignes.push("", "Votre situation nous semble nécessiter une attention rapide. En cas de danger immédiat, contactez les secours (112).");
  }

  if (analyse.questions_suggerees.length > 0) {
    lignes.push("", "Afin de compléter votre dossier, pourriez-vous nous apporter les précisions suivantes :");
    for (const q of analyse.questions_suggerees) lignes.push(`- ${q}`);
  } else {
    lignes.push("", "Votre déclaration est complète à ce stade. Nous revenons vers vous dès que possible.");
  }

  lignes.push("", "Vous pouvez répondre directement à ce message.", "", "Bien cordialement,", signataire, "Service sinistres");

  return {
    objet: `Votre déclaration de dégât des eaux, dossier ${declaration.id}`,
    corps: lignes.join("\n"),
  };
}
