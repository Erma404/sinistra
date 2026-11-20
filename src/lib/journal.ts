/**
 * Journal des corrections (garde-fou n°4) et dossiers validés (garde-fou n°1).
 * Stockage simple pour la démo : localStorage du navigateur, exportable en JSON.
 */

export type Correction = {
  dossier: string;
  champ: string;
  valeur_proposee: string;
  valeur_corrigee: string;
  moteur: "ia" | "regles";
  horodatage: string;
};

export type DossierValide = {
  dossier: string;
  urgence: string;
  faits: Record<string, string>;
  nb_corrections: number;
  valide_le: string;
};

const CLE_JOURNAL = "sinistra.journal.v1";
const CLE_VALIDES = "sinistra.valides.v1";
const CLE_MAILS = "sinistra.mails.v1";

/** Confirmation, par le gestionnaire, que le mail de rebond a été envoyé depuis sa messagerie. */
export type MailEnvoye = { dossier: string; envoye_le: string };

function lire<T>(cle: string): T[] {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T[]) : [];
  } catch {
    return [];
  }
}

function ecrire<T>(cle: string, valeurs: T[]) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeurs));
  } catch {
    /* stockage indisponible : la démo reste utilisable sans persistance */
  }
}

export const journal = {
  corrections: () => lire<Correction>(CLE_JOURNAL),
  valides: () => lire<DossierValide>(CLE_VALIDES),
  mails: () => lire<MailEnvoye>(CLE_MAILS),

  marquerMailEnvoye(dossier: string): MailEnvoye {
    const m = { dossier, envoye_le: new Date().toISOString() };
    ecrire(CLE_MAILS, [...lire<MailEnvoye>(CLE_MAILS).filter((x) => x.dossier !== dossier), m]);
    return m;
  },

  annulerMailEnvoye(dossier: string) {
    ecrire(CLE_MAILS, lire<MailEnvoye>(CLE_MAILS).filter((x) => x.dossier !== dossier));
  },

  /** Enregistre la validation explicite du gestionnaire et ses corrections. */
  enregistrerValidation(dossier: DossierValide, corrections: Correction[]) {
    ecrire(CLE_JOURNAL, [...lire<Correction>(CLE_JOURNAL), ...corrections]);
    ecrire(CLE_VALIDES, [
      ...lire<DossierValide>(CLE_VALIDES).filter((d) => d.dossier !== dossier.dossier),
      dossier,
    ]);
  },

  reinitialiser() {
    ecrire(CLE_JOURNAL, []);
    ecrire(CLE_VALIDES, []);
    ecrire(CLE_MAILS, []);
  },

  exporter(): string {
    return JSON.stringify(
      {
        corrections: lire<Correction>(CLE_JOURNAL),
        dossiers_valides: lire<DossierValide>(CLE_VALIDES),
        mails_envoyes: lire<MailEnvoye>(CLE_MAILS),
      },
      null,
      2,
    );
  },
};
