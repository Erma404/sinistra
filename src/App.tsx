import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DECLARATIONS, type Declaration } from "./data/declarations";
import { analyser } from "./lib/analyser";
import { journal, type Correction, type DossierValide } from "./lib/journal";
import { localiserSource } from "./shared/guardrails";
import { LIBELLES_CHAMPS, type Champ, type Fait, type NiveauUrgence, type ResultatAnalyse } from "./shared/schema";

type EtatAnalyse = ResultatAnalyse | "chargement";
type Vue = { ecran: "accueil" } | { ecran: "boite" } | { ecran: "dossier"; id: string; onglet: Onglet } | { ecran: "journal" };
type Onglet = "detail" | "validation" | "synthese";
type Decision = { statut: "accepte" | "corrige"; valeur: string };

const ORDRE_URGENCE: Record<NiveauUrgence, number> = { urgent: 0, normal: 1, faible: 2 };
const LIBELLE_URGENCE: Record<NiveauUrgence, string> = { urgent: "Urgent", normal: "Normal", faible: "Faible" };

function formaterHorodatage(iso: string) {
  const d = new Date(iso);
  const jour = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour} à ${heure}`;
}

function IconeCoche() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </svg>
  );
}

/** « Envoyée le mer. 18 nov. à 07:42 » (ou « Appel le … » pour un appel retranscrit). */
function Envoi({ declaration }: { declaration: Declaration }) {
  const d = new Date(declaration.recueLe);
  const jour = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const verbe = declaration.canal === "Appel retranscrit" ? "Appel le" : "Envoyée le";
  return (
    <span className="envoi">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
      <span>
        {verbe} <strong>{jour}</strong> à <strong>{heure}</strong>
      </span>
    </span>
  );
}


export default function App() {
  const [analyses, setAnalyses] = useState<Record<string, EtatAnalyse>>({});
  const [vue, setVue] = useState<Vue>({ ecran: "accueil" });
  const [guide, setGuide] = useState(false);
  const [dernierDossier, setDernierDossier] = useState<string | null>(null);
  const [valides, setValides] = useState(() => journal.valides());

  useEffect(() => {
    let annule = false;
    setAnalyses(Object.fromEntries(DECLARATIONS.map((d) => [d.id, "chargement" as const])));
    // 3 analyses en parallèle au maximum
    const file = [...DECLARATIONS];
    const travailleur = async () => {
      while (file.length && !annule) {
        const d = file.shift()!;
        const r = await analyser(d.texte);
        if (!annule) setAnalyses((a) => ({ ...a, [d.id]: r }));
      }
    };
    void Promise.all([travailleur(), travailleur(), travailleur()]);
    return () => {
      annule = true;
    };
  }, []);

  const moteur = useMemo(() => {
    const prets = Object.values(analyses).filter((a): a is ResultatAnalyse => a !== "chargement");
    if (prets.length === 0) return null;
    return prets.some((a) => a.moteur === "ia") ? "ia" : "regles";
  }, [analyses]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (vue.ecran === "dossier") setDernierDossier(vue.id);
  }, [vue]);

  const declaration = vue.ecran === "dossier" ? DECLARATIONS.find((d) => d.id === vue.id) : undefined;

  const allerBoite = () => {
    setGuide(false);
    setVue({ ecran: "boite" });
  };
  const demarrerGuide = () => {
    // Cas le plus parlant : le premier dossier proposé en urgent (à défaut, le premier reçu).
    const estUrgent = (id: string) => {
      const e = analyses[id];
      return !!e && e !== "chargement" && e.analyse.urgence.niveau === "urgent";
    };
    const dejaValide = (id: string) => valides.some((v) => v.dossier === id);
    const urgent =
      DECLARATIONS.find((d) => estUrgent(d.id) && !dejaValide(d.id)) ??
      DECLARATIONS.find((d) => !dejaValide(d.id)) ??
      DECLARATIONS.find((d) => estUrgent(d.id));
    setGuide(true);
    setVue({ ecran: "dossier", id: (urgent ?? DECLARATIONS[0]).id, onglet: "detail" });
  };

  const allerAccueil = () => {
    setGuide(false);
    setVue({ ecran: "accueil" });
  };
  const allerJournal = () => {
    setGuide(false);
    setVue({ ecran: "journal" });
  };
  const ouvrirDossier = (id: string, onglet: Onglet) => setVue({ ecran: "dossier", id, onglet });
  const idCourant = vue.ecran === "dossier" ? vue.id : dernierDossier;

  return (
    <div className="app">
      <Navigation
        vue={vue}
        idCourant={idCourant}
        allerAccueil={allerAccueil}
        allerBoite={allerBoite}
        allerJournal={allerJournal}
        ouvrirDossier={ouvrirDossier}
      />

      <div className="colonne">
        <header className="entete">
          <button className="marque" onClick={allerAccueil} aria-label="Sinistra, retour à l'accueil">
            <LogoSinistra />
            <span>
              <strong>Sinistra</strong>
              <small>Tri dégât des eaux</small>
            </span>
          </button>
          <span className="demo-pill" role="note" title="Aucune décision de garantie, de refus ou d'indemnisation n'est prise par l'outil.">
            Démo, données fictives
          </span>
          {moteur && (
            <span className={`moteur moteur-${moteur}`} title={moteur === "ia" ? "Analyse par le modèle Claude, via la fonction serveur" : "Aucune clé API configurée : analyse locale par règles, sans IA"}>
              {moteur === "ia" ? "Analyse IA (Claude)" : "Mode hors ligne : règles, sans IA"}
            </span>
          )}
        </header>

        <main className="contenu" id="contenu">
          {vue.ecran === "accueil" && (
            <Accueil analyses={analyses} valides={valides.map((v) => v.dossier)} ouvrirBoite={allerBoite} demarrerGuide={demarrerGuide} />
          )}
          {vue.ecran === "boite" && (
            <BoiteReception
              analyses={analyses}
              validations={valides}
              ouvrir={(id) => {
                setGuide(false);
                setVue({ ecran: "dossier", id, onglet: "detail" });
              }}
            />
          )}
          {vue.ecran === "dossier" && declaration && (
            <Dossier
              key={declaration.id}
              declaration={declaration}
              etat={analyses[declaration.id]}
              onglet={vue.onglet}
              changerOnglet={(onglet) => setVue({ ecran: "dossier", id: declaration.id, onglet })}
              retour={allerBoite}
              guide={guide}
              quitterGuide={() => setGuide(false)}
              estValide={valides.some((v) => v.dossier === declaration.id)}
              validation={valides.find((v) => v.dossier === declaration.id)}
              surValidation={() => setValides(journal.valides())}
            />
          )}
          {vue.ecran === "journal" && <Journal surReinitialisation={() => setValides([])} />}
        </main>

        <footer className="pied">
          Aucune décision de garantie, de refus ou d'indemnisation n'est prise par l'outil. Projet personnel d'Ernestine Matjabo. Cadrage, garde-fous et évaluation : Ernestine Matjabo. Code généré avec Claude Code.
        </footer>
      </div>
    </div>
  );
}

/* ---------- Navigation : barre latérale (web) et barre en bas (mobile) ---------- */

const traits = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ICONES = {
  accueil: (
    <svg {...traits}><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z" /></svg>
  ),
  boite: (
    <svg {...traits}><rect x="4" y="4" width="6.5" height="6.5" rx="2.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="2.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="2.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2.2" /></svg>
  ),
  dossier: (
    <svg {...traits}><path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5z" /><path d="M14 3.5V8h4M9 12.5h6M9 16h4" /></svg>
  ),
  synthese: (
    <svg {...traits}><path d="M10 4.5c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5z" /><path d="M17.5 14c.3 1.7.8 2.2 2.5 2.5-1.7.3-2.2.8-2.5 2.5-.3-1.7-.8-2.2-2.5-2.5 1.7-.3 2.2-.8 2.5-2.5z" /></svg>
  ),
  journal: (
    <svg {...traits}><rect x="5" y="3.5" width="14" height="17" rx="3" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
  ),
};

function LogoSinistra() {
  return (
    <span className="logo" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.5c-3.6 4.4-6 7.6-6 10.6a6 6 0 0 0 12 0c0-3-2.4-6.2-6-10.6z" />
        <path d="M9.2 14.5a2.8 2.8 0 0 0 2.8 2.7" />
      </svg>
    </span>
  );
}

function Navigation({
  vue,
  idCourant,
  allerAccueil,
  allerBoite,
  allerJournal,
  ouvrirDossier,
}: {
  vue: Vue;
  idCourant: string | null;
  allerAccueil: () => void;
  allerBoite: () => void;
  allerJournal: () => void;
  ouvrirDossier: (id: string, onglet: Onglet) => void;
}) {
  const onglet = vue.ecran === "dossier" ? vue.onglet : null;
  const items: { cle: keyof typeof ICONES; libelle: string; actif: boolean; inactif?: boolean; action: () => void }[] = [
    { cle: "accueil", libelle: "Accueil", actif: vue.ecran === "accueil", action: allerAccueil },
    { cle: "boite", libelle: "Boîte", actif: vue.ecran === "boite", action: allerBoite },
    {
      cle: "dossier",
      libelle: "Dossier",
      actif: onglet === "detail" || onglet === "validation",
      inactif: !idCourant,
      action: () => idCourant && ouvrirDossier(idCourant, onglet === "validation" ? "validation" : "detail"),
    },
    {
      cle: "synthese",
      libelle: "Synthèse",
      actif: onglet === "synthese",
      inactif: !idCourant,
      action: () => idCourant && ouvrirDossier(idCourant, "synthese"),
    },
    { cle: "journal", libelle: "Journal", actif: vue.ecran === "journal", action: allerJournal },
  ];

  return (
    <nav className="nav" aria-label="Navigation principale">
      <div className="nav-marque">
        <LogoSinistra />
        <span>
          <strong>Sinistra</strong>
          <small>Tri dégât des eaux</small>
        </span>
      </div>
      <ul className="nav-liste">
        {items.map((it) => (
          <li key={it.cle}>
            <button
              className={`nav-item ${it.actif ? "actif" : ""}`}
              onClick={it.action}
              disabled={it.inactif}
              aria-current={it.actif ? "page" : undefined}
              title={it.inactif ? "Ouvrez d'abord une déclaration" : undefined}
            >
              <span className="nav-icone">{ICONES[it.cle]}</span>
              <span className="nav-libelle">{it.libelle}</span>
            </button>
          </li>
        ))}
      </ul>
      {idCourant && <p className="nav-courant">Dossier ouvert : <strong className="num-dossier">{idCourant}</strong></p>}
    </nav>
  );
}

/* ---------- Accueil du gestionnaire ---------- */

/** Prénom fictif du gestionnaire de la démo. */
const PRENOM_GESTIONNAIRE = "Camille";
/** Lieu et météo fictifs du jour de la démo (18 novembre). */
const METEO_DEMO = { ville: "Angers", ciel: "Pluie", temperature: 9 };

function Accueil({
  analyses,
  valides,
  ouvrirBoite,
  demarrerGuide,
}: {
  analyses: Record<string, EtatAnalyse>;
  valides: string[];
  ouvrirBoite: () => void;
  demarrerGuide: () => void;
}) {
  const prets = DECLARATIONS.map((d) => analyses[d.id]).filter((a): a is ResultatAnalyse => !!a && a !== "chargement");
  const enCours = prets.length < DECLARATIONS.length;
  const urgents = prets.filter((a) => a.analyse.urgence.niveau === "urgent").length;
  const aValider = DECLARATIONS.filter((d) => !valides.includes(d.id)).length;
  const heure = new Date().getHours();
  const salut = heure < 18 ? "Bonjour" : "Bonsoir";
  const jour = new Date("2026-11-18T08:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="accueil">
      <section className="accueil-hero">
        <p className="etape contexte-jour">
          <span>{jour.charAt(0).toUpperCase() + jour.slice(1)}</span>
          <span aria-hidden>·</span>
          <span>{METEO_DEMO.ville}</span>
          <span aria-hidden>·</span>
          <span className="meteo" title="Météo fictive de la démo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7.5 15.5h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7.5 15.5z" />
              <path d="M9 18.5l-.8 1.8M12.5 18.5l-.8 1.8M16 18.5l-.8 1.8" />
            </svg>
            {METEO_DEMO.ciel}, {METEO_DEMO.temperature} °C
          </span>
        </p>
        <h1>{salut} {PRENOM_GESTIONNAIRE}, voici votre file du jour</h1>
        <p className="sous-titre">
          Sinistra a lu les déclarations de dégât des eaux reçues. Il a relevé les faits, repéré les cas à traiter en priorité et préparé les questions à poser.
          Vous validez ou corrigez tout.
        </p>
      </section>

      <section className="carte file-du-jour" aria-live="polite">
        <h2>Votre file du jour</h2>
        <div className="compteurs">
          <div>
            <span className="compteur-valeur">{DECLARATIONS.length}</span>
            <span className="compteur-libelle">déclarations reçues</span>
          </div>
          <div>
            <span className="compteur-valeur compteur-urgent">{enCours ? "…" : urgents}</span>
            <span className="compteur-libelle">proposées en urgent</span>
          </div>
          <div>
            <span className="compteur-valeur">{aValider}</span>
            <span className="compteur-libelle">à valider</span>
          </div>
        </div>
        <div className="cta">
          <button className="btn btn-principal" onClick={demarrerGuide} disabled={enCours}>
            {enCours ? "Analyse en cours…" : "Commencer par le cas urgent"}
          </button>
          <button className="btn btn-secondaire" onClick={ouvrirBoite}>
            Ouvrir la boîte de réception
          </button>
        </div>
        <p className="aide">Le parcours guidé vous accompagne sur un dossier en 3 étapes, environ 2 minutes.</p>
      </section>

      <section className="carte">
        <h2>Comment Sinistra vous aide</h2>
        <ol className="etapes-aide">
          <li>
            <span className="etape-num">1</span>
            <div>
              <strong>Lire plus vite</strong>
              <p>Les faits utiles sont extraits de la déclaration, chacun avec le passage exact d'où il vient.</p>
            </div>
          </li>
          <li>
            <span className="etape-num">2</span>
            <div>
              <strong>Ne rater aucun cas urgent</strong>
              <p>Un niveau d'urgence est proposé et justifié : risque électrique, personne en danger, eau qui coule encore.</p>
            </div>
          </li>
          <li>
            <span className="etape-num">3</span>
            <div>
              <strong>Compléter le dossier</strong>
              <p>Les informations manquantes sont listées, avec les questions à poser au déclarant.</p>
            </div>
          </li>
        </ol>
      </section>

    </div>
  );
}

/* ---------- Parcours guidé ---------- */

const ETAPES_GUIDE: Record<Onglet, { num: number; titre: string; texte: string; suivant?: Onglet }> = {
  detail: {
    num: 1,
    titre: "Vérifiez les faits et leurs sources",
    texte: "Chaque fait renvoie au passage surligné de la déclaration. Repérez ce qui justifie l'urgence proposée.",
    suivant: "validation",
  },
  validation: {
    num: 2,
    titre: "Acceptez ou corrigez chaque proposition",
    texte: "Corrigez au moins un champ pour voir le journal des corrections, puis validez le dossier.",
    suivant: "synthese",
  },
  synthese: {
    num: 3,
    titre: "Préparez votre rappel",
    texte: "Retrouvez les informations manquantes et les questions à poser au déclarant.",
  },
};

function BandeauGuide({
  onglet,
  changerOnglet,
  terminer,
  quitter,
}: {
  onglet: Onglet;
  changerOnglet: (o: Onglet) => void;
  terminer: () => void;
  quitter: () => void;
}) {
  const e = ETAPES_GUIDE[onglet];
  return (
    <aside className="guide" aria-label="Parcours guidé">
      <div className="guide-texte">
        <p className="guide-etape">Parcours guidé · étape {e.num} sur 3</p>
        <strong>{e.titre}</strong>
        <p>{e.texte}</p>
      </div>
      <div className="guide-actions">
        <button className="btn-lien" onClick={quitter}>Quitter le guide</button>
        {e.suivant ? (
          <button className="btn btn-principal" onClick={() => changerOnglet(e.suivant!)}>Étape suivante</button>
        ) : (
          <button className="btn btn-principal" onClick={terminer}>Terminer</button>
        )}
      </div>
    </aside>
  );
}

/* ---------- Écran 1 : boîte de réception ---------- */

function BadgeUrgence({ niveau }: { niveau: NiveauUrgence }) {
  return <span className={`badge badge-${niveau}`}>{LIBELLE_URGENCE[niveau]}</span>;
}

type Filtre = "toutes" | "urgentes" | "a_valider" | "validees";

type Signal = { libelle: string; grave: boolean };

/** Signaux lisibles qui expliquent le tri, tirés des faits sourcés et des alertes. */
function signauxDe(r: ResultatAnalyse): Signal[] {
  const valeur = (c: Champ) => r.analyse.faits.find((f) => f.champ === c)?.valeur.toLowerCase();
  const s: Signal[] = [];
  if (valeur("electricite_touchee") === "oui") s.push({ libelle: "Électricité touchée", grave: true });
  if (valeur("personnes_en_danger") === "oui") s.push({ libelle: "Personne en danger", grave: true });
  if (valeur("coupure_eau") === "non") s.push({ libelle: "Eau non coupée", grave: true });
  if (valeur("tiers_implique") === "oui") s.push({ libelle: "Voisin concerné", grave: false });
  if (r.analyse.alertes.some((a) => /consigne|instruction/i.test(a))) s.push({ libelle: "Consignes suspectes ignorées", grave: false });
  if (r.analyse.informations_manquantes.length >= 6) s.push({ libelle: "Très incomplète", grave: false });
  return s;
}

function BarresProgression({ fait, total }: { fait: number; total: number }) {
  const N = 40;
  const pleins = total === 0 ? 0 : Math.round((fait / total) * N);
  return (
    <div className="progression">
      <div className="progression-legende">
        <span>Validés</span>
        <span>À valider</span>
      </div>
      <div className="barres" aria-hidden>
        {Array.from({ length: N }, (_, i) => (
          <span key={i} className={i < pleins ? "plein" : ""} />
        ))}
      </div>
      <div className="progression-legende progression-chiffres">
        <span>{fait}</span>
        <span>{total - fait}</span>
      </div>
    </div>
  );
}

function BoiteReception({
  analyses,
  validations,
  ouvrir,
}: {
  analyses: Record<string, EtatAnalyse>;
  validations: DossierValide[];
  ouvrir: (id: string) => void;
}) {
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const resultat = (id: string) => {
    const e = analyses[id];
    return e && e !== "chargement" ? e : null;
  };
  const niveau = (id: string) => resultat(id)?.analyse.urgence.niveau ?? null;
  const valides = new Set(validations.map((v) => v.dossier));
  const validationDe = (id: string) => validations.find((v) => v.dossier === id);

  // À traiter d'abord (par urgence puis heure d'envoi), dossiers validés en bas.
  const triees = [...DECLARATIONS].sort((a, b) => {
    const va = valides.has(a.id) ? 1 : 0;
    const vb = valides.has(b.id) ? 1 : 0;
    if (va !== vb) return va - vb;
    const na = niveau(a.id);
    const nb = niveau(b.id);
    return (na ? ORDRE_URGENCE[na] : 9) - (nb ? ORDRE_URGENCE[nb] : 9) || a.recueLe.localeCompare(b.recueLe);
  });
  const correspond = (id: string, f: Filtre) =>
    f === "toutes" ||
    (f === "urgentes" && niveau(id) === "urgent") ||
    (f === "a_valider" && !valides.has(id)) ||
    (f === "validees" && valides.has(id));
  const compte = (f: Filtre) => DECLARATIONS.filter((d) => correspond(d.id, f)).length;
  const lignes = triees.filter((d) => correspond(d.id, filtre));

  const parNiveau = (n: NiveauUrgence) => DECLARATIONS.filter((d) => niveau(d.id) === n).length;
  const nbValides = compte("validees");
  const taux = Math.round((nbValides / DECLARATIONS.length) * 100);

  const filtres: { id: Filtre; libelle: string }[] = [
    { id: "toutes", libelle: "Toutes" },
    { id: "urgentes", libelle: "Urgentes" },
    { id: "a_valider", libelle: "À valider" },
    { id: "validees", libelle: "Validées" },
  ];

  return (
    <div className="boite">
      <section className="boite-tete">
        <p className="etape">Tri des déclarations dégât des eaux</p>
        <h1>Boîte de réception</h1>
        <div className="chips">
          <span className="chip"><span className="chip-cle">Reçues</span> {DECLARATIONS.length}</span>
          <span className="chip"><span className="chip-cle">Urgentes</span> {parNiveau("urgent")}</span>
          <span className="chip"><span className="chip-cle">À valider</span> {compte("a_valider")}</span>
        </div>
      </section>

      <section className="boite-liste" aria-label="Déclarations">
        <div className="filtres" role="group" aria-label="Filtrer les déclarations">
          {filtres.map((f) => (
            <button key={f.id} className={`filtre ${filtre === f.id ? "actif" : ""}`} aria-pressed={filtre === f.id} onClick={() => setFiltre(f.id)}>
              {f.libelle} <span className="filtre-compte">{compte(f.id)}</span>
            </button>
          ))}
        </div>

        {lignes.length === 0 ? (
          <p className="carte vide">Aucune déclaration dans ce filtre.</p>
        ) : (
          <ul className="liste">
            {lignes.map((d) => {
              const r = resultat(d.id);
              const n = r?.analyse.urgence.niveau;
              const signaux = r ? signauxDe(r) : [];
              const validation = validationDe(d.id);
              const classe = validation ? "declaration-validee" : n === "urgent" ? "declaration-urgente" : "";
              return (
                <li key={d.id}>
                  <button
                    className={`declaration ${classe}`}
                    onClick={() => ouvrir(d.id)}
                    aria-label={`Ouvrir ${d.id}${validation ? ", dossier validé" : ", à valider"}`}
                  >
                    {validation && (
                      <span className="bandeau-valide">
                        <IconeCoche /> Validé le <strong>{formaterHorodatage(validation.valide_le)}</strong>
                      </span>
                    )}
                    <span className="declaration-haut">
                      {n ? <BadgeUrgence niveau={n} /> : <span className="badge badge-attente">Analyse…</span>}
                      {!validation && <span className="statut">À valider</span>}
                      <span className="rond-fleche" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 16 16 8M9.5 8H16v6.5" /></svg>
                      </span>
                    </span>
                    <span className="declaration-meta">
                      <strong className="num-dossier">{d.id}</strong> · {d.canal}
                    </span>
                    <span className="declaration-meta declarant">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="8" r="3.5" />
                        <path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" />
                      </svg>
                      <span><strong>{d.declarant}</strong> · {d.ville}</span>
                    </span>
                    <span className="declaration-meta">
                      <Envoi declaration={d} />
                    </span>
                    <span className="declaration-extrait">{d.texte}</span>
                    {signaux.length > 0 && (
                      <span className="signaux">
                        {signaux.map((sg) => (
                          <span key={sg.libelle} className={`signal ${sg.grave ? "signal-grave" : ""}`}>{sg.libelle}</span>
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="carte avancement" aria-label="Avancement du tri">
        <h2>Avancement du tri</h2>
        <p className="petit">Dossiers validés par le gestionnaire</p>
        <p className="grand-chiffre">{taux}<span>%</span></p>
        <BarresProgression fait={nbValides} total={DECLARATIONS.length} />
        <div className="indicateurs">
          <div><strong>{parNiveau("urgent")} <span className="point point-urgent" aria-hidden /></strong><span>Urgents</span></div>
          <div><strong>{parNiveau("normal")} <span className="point point-normal" aria-hidden /></strong><span>Normaux</span></div>
          <div><strong>{parNiveau("faible")} <span className="point point-faible" aria-hidden /></strong><span>Faibles</span></div>
        </div>
        <p className="aide">L'urgence est une proposition de Sinistra. Vous la confirmez ou la corrigez à la validation.</p>
      </aside>
    </div>
  );
}

/* ---------- Dossier : écrans 2, 3, 4 ---------- */

function Dossier({
  declaration,
  etat,
  onglet,
  changerOnglet,
  retour,
  guide,
  quitterGuide,
  estValide,
  validation,
  surValidation,
}: {
  declaration: Declaration;
  etat: EtatAnalyse | undefined;
  onglet: Onglet;
  changerOnglet: (o: Onglet) => void;
  retour: () => void;
  guide: boolean;
  quitterGuide: () => void;
  estValide: boolean;
  validation?: DossierValide;
  surValidation: () => void;
}) {
  const onglets: { id: Onglet; libelle: string; etape: number }[] = [
    { id: "detail", libelle: "Détail", etape: 1 },
    { id: "validation", libelle: "Validation", etape: 2 },
    { id: "synthese", libelle: "Synthèse", etape: 3 },
  ];

  return (
    <section>
      <button className="btn-lien retour" onClick={retour}>
        ← Boîte de réception
      </button>
      <div className="titre-ecran">
        <div>
          <p className="etape">
            {declaration.canal} · <Envoi declaration={declaration} />
          </p>
          <h1>
            {declaration.id}
          </h1>
          <div className="chips chips-dossier">
            <span className="chip"><span className="chip-cle">Déclarant</span> {declaration.declarant}</span>
            <span className="chip"><span className="chip-cle">Ville</span> {declaration.ville}</span>
            <span className="chip"><span className="chip-cle">Logement</span> {declaration.logement}</span>
            <span className="chip"><span className="chip-cle">Statut</span> {declaration.occupation}</span>
          </div>
        </div>
        {etat && etat !== "chargement" && <BadgeUrgence niveau={etat.analyse.urgence.niveau} />}
      </div>

      {validation && (
        <p className="dossier-valide" role="status">
          <IconeCoche />
          <span className="insecable">Dossier validé le <strong>{formaterHorodatage(validation.valide_le)}</strong></span>
          <span aria-hidden>·</span>
          <span className="insecable"><strong>{validation.nb_corrections}</strong> correction{validation.nb_corrections > 1 ? "s" : ""}</span>
        </p>
      )}

      <div className="onglets" role="group" aria-label="Étapes du dossier">
        {onglets.map((o) => (
          <button
            key={o.id}
            className={o.id === onglet ? "actif" : ""}
            aria-pressed={o.id === onglet}
            onClick={() => changerOnglet(o.id)}
          >
            <span className="num" aria-hidden>{o.etape}</span> {o.libelle}
          </button>
        ))}
      </div>

      {guide && <BandeauGuide onglet={onglet} changerOnglet={changerOnglet} terminer={retour} quitter={quitterGuide} />}

      {!etat || etat === "chargement" ? (
        <p className="chargement">Analyse de la déclaration en cours…</p>
      ) : (
        <>
          {onglet === "detail" && <Detail declaration={declaration} resultat={etat} />}
          {onglet === "validation" && (
            <Validation
              declaration={declaration}
              resultat={etat}
              estValide={estValide}
              surValidation={() => {
                surValidation();
                changerOnglet("synthese");
              }}
            />
          )}
          {onglet === "synthese" && <Synthese resultat={etat} />}
        </>
      )}
    </section>
  );
}

function TexteSurligne({
  texte,
  faits,
  actif,
  survoler,
}: {
  texte: string;
  faits: Fait[];
  actif: Champ | null;
  survoler: (c: Champ | null) => void;
}) {
  // Plages sources (elles peuvent se chevaucher : plusieurs faits citent parfois la même phrase).
  const plages = faits
    .map((f) => ({ champ: f.champ, pos: localiserSource(f.source, texte) }))
    .filter((p): p is { champ: Champ; pos: { debut: number; fin: number } } => p.pos !== null);

  // Mot exact de la valeur active, s'il figure dans sa source (ex. « cuisine »).
  let motActif: { debut: number; fin: number } | null = null;
  const faitActif = faits.find((f) => f.champ === actif);
  const plageActive = plages.find((p) => p.champ === actif);
  if (faitActif && plageActive && faitActif.valeur.length > 2) {
    const extrait = texte.slice(plageActive.pos.debut, plageActive.pos.fin).toLowerCase();
    const i = extrait.indexOf(faitActif.valeur.toLowerCase());
    if (i >= 0) motActif = { debut: plageActive.pos.debut + i, fin: plageActive.pos.debut + i + faitActif.valeur.length };
  }

  // Découpage du texte en segments homogènes.
  const bornes = new Set<number>([0, texte.length]);
  for (const p of plages) {
    bornes.add(p.pos.debut);
    bornes.add(p.pos.fin);
  }
  if (motActif) {
    bornes.add(motActif.debut);
    bornes.add(motActif.fin);
  }
  const points = [...bornes].sort((x, y) => x - y);

  const morceaux: ReactNode[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const debut = points[k];
    const fin = points[k + 1];
    const morceau = texte.slice(debut, fin);
    const champs = plages.filter((p) => p.pos.debut <= debut && p.pos.fin >= fin).map((p) => p.champ);
    if (champs.length === 0) {
      morceaux.push(morceau);
      continue;
    }
    const estActif = actif !== null && champs.includes(actif);
    const estMot = motActif !== null && debut >= motActif.debut && fin <= motActif.fin;
    morceaux.push(
      <mark
        key={debut}
        className={`${estActif ? "actif" : ""} ${estMot ? "mot" : ""}`}
        title={champs.map((c) => LIBELLES_CHAMPS[c]).join(", ")}
        onMouseEnter={() => survoler(champs[0])}
        onMouseLeave={() => survoler(null)}
      >
        {morceau}
      </mark>,
    );
  }
  return <p className="texte-declaration">{morceaux}</p>;
}

function Detail({ declaration, resultat }: { declaration: Declaration; resultat: ResultatAnalyse }) {
  const [actif, setActif] = useState<Champ | null>(null);
  const { analyse } = resultat;
  return (
    <div className="deux-colonnes">
      <article className="carte">
        <h2>Déclaration (texte d'origine)</h2>
        <TexteSurligne texte={declaration.texte} faits={analyse.faits} actif={actif} survoler={setActif} />
        <p className="aide">Les passages surlignés sont les sources des faits extraits. Survolez ou touchez un fait pour le retrouver dans le texte.</p>
      </article>
      <article className="carte">
        <h2>Faits extraits ({analyse.faits.length})</h2>
        {analyse.faits.length === 0 && <p className="vide">Aucun fait sourcé n'a pu être extrait.</p>}
        <ul className="faits">
          {analyse.faits.map((f) => (
            <li key={f.champ}>
              <button
                className={`fait ${actif === f.champ ? "actif" : ""}`}
                aria-pressed={actif === f.champ}
                onMouseEnter={() => setActif(f.champ)}
                onMouseLeave={() => setActif(null)}
                onFocus={() => setActif(f.champ)}
                onBlur={() => setActif(null)}
                onClick={() => setActif(actif === f.champ ? null : f.champ)}
              >
                <span className="fait-tete">
                  <span className="fait-champ">{LIBELLES_CHAMPS[f.champ]}</span>
                  <span className={`confiance confiance-${f.confiance}`}>Confiance {f.confiance}</span>
                </span>
                <span className="fait-valeur">{f.valeur}</span>
                <span className="fait-source">« {f.source} »</span>
              </button>
            </li>
          ))}
        </ul>
        {resultat.faits_rejetes.length > 0 && (
          <p className="aide">
            {resultat.faits_rejetes.length} fait(s) retiré(s) par le garde-fou : source introuvable dans la déclaration.
          </p>
        )}
        <div className="urgence-bloc">
          <h3>Urgence proposée : {LIBELLE_URGENCE[analyse.urgence.niveau]}</h3>
          <p>{analyse.urgence.justification}</p>
        </div>
      </article>
    </div>
  );
}

function Validation({
  declaration,
  resultat,
  estValide,
  surValidation,
}: {
  declaration: Declaration;
  resultat: ResultatAnalyse;
  estValide: boolean;
  surValidation: () => void;
}) {
  const { analyse } = resultat;
  const [decisions, setDecisions] = useState<Record<string, Decision | undefined>>({});
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");

  const lignes = [
    { cle: "urgence", libelle: "Niveau d'urgence", propose: analyse.urgence.niveau, source: analyse.urgence.sources[0] },
    ...analyse.faits.map((f) => ({ cle: f.champ as string, libelle: LIBELLES_CHAMPS[f.champ], propose: f.valeur, source: f.source })),
  ];
  const restantes = lignes.filter((l) => !decisions[l.cle]).length;

  const valider = () => {
    const horodatage = new Date().toISOString();
    const corrections: Correction[] = lignes
      .filter((l) => decisions[l.cle]?.statut === "corrige")
      .map((l) => ({
        dossier: declaration.id,
        champ: l.cle,
        valeur_proposee: l.propose,
        valeur_corrigee: decisions[l.cle]!.valeur,
        moteur: resultat.moteur,
        horodatage,
      }));
    journal.enregistrerValidation(
      {
        dossier: declaration.id,
        urgence: decisions.urgence!.valeur,
        faits: Object.fromEntries(lignes.filter((l) => l.cle !== "urgence").map((l) => [l.cle, decisions[l.cle]!.valeur])),
        nb_corrections: corrections.length,
        valide_le: horodatage,
      },
      corrections,
    );
    surValidation();
  };

  return (
    <article className="carte">
      <h2>Accepter ou corriger chaque proposition</h2>
      <p className="aide">
        Rien n'est enregistré tant que vous n'avez pas cliqué sur « Valider le dossier ». Chaque correction alimente le journal utilisé pour l'évaluation.
      </p>
      {estValide && <p className="info">Ce dossier a déjà été validé. Une nouvelle validation remplace la précédente.</p>}
      <table className="table-validation">
        <thead>
          <tr>
            <th>Champ</th>
            <th>Proposition</th>
            <th>Décision</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => {
            const d = decisions[l.cle];
            return (
              <tr key={l.cle} className={d ? `decide-${d.statut}` : ""}>
                <td>
                  <strong>{l.libelle}</strong>
                  {l.source && <small className="source-mini">« {l.source} »</small>}
                </td>
                <td>
                  {d?.statut === "corrige" ? (
                    <>
                      <s>{l.propose}</s> → <strong>{d.valeur}</strong>
                    </>
                  ) : (
                    l.propose
                  )}
                </td>
                <td className="actions">
                  {enEdition === l.cle ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!brouillon.trim() || brouillon.trim() === l.propose) return;
                        setDecisions((x) => ({ ...x, [l.cle]: { statut: "corrige", valeur: brouillon.trim() } }));
                        setEnEdition(null);
                      }}
                    >
                      {l.cle === "urgence" ? (
                        <select value={brouillon} onChange={(e) => setBrouillon(e.target.value)} autoFocus>
                          <option value="urgent">urgent</option>
                          <option value="normal">normal</option>
                          <option value="faible">faible</option>
                        </select>
                      ) : (
                        <input value={brouillon} onChange={(e) => setBrouillon(e.target.value)} autoFocus aria-label={`Valeur corrigée : ${l.libelle}`} />
                      )}
                      <button type="submit" className="btn">Enregistrer</button>
                      <button type="button" className="btn-lien" onClick={() => setEnEdition(null)}>Annuler</button>
                    </form>
                  ) : (
                    <>
                      <button
                        className={`btn ${d?.statut === "accepte" ? "btn-plein" : ""}`}
                        onClick={() => setDecisions((x) => ({ ...x, [l.cle]: { statut: "accepte", valeur: l.propose } }))}
                      >
                        Accepter
                      </button>
                      <button
                        className={`btn ${d?.statut === "corrige" ? "btn-plein" : ""}`}
                        onClick={() => {
                          setEnEdition(l.cle);
                          setBrouillon(d?.valeur ?? l.propose);
                        }}
                      >
                        Corriger
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="pied-validation">
        <span>{restantes === 0 ? "Toutes les propositions ont été traitées." : `${restantes} proposition(s) à traiter.`}</span>
        <button className="btn btn-principal" disabled={restantes > 0} onClick={valider}>
          Valider le dossier
        </button>
      </div>
    </article>
  );
}

function Synthese({ resultat }: { resultat: ResultatAnalyse }) {
  const { analyse } = resultat;
  const [copie, setCopie] = useState(false);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(analyse.questions_suggerees.map((q) => `- ${q}`).join("\n"));
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  };
  return (
    <div className="deux-colonnes">
      <article className="carte">
        <h2>Informations manquantes</h2>
        {analyse.informations_manquantes.length === 0 ? (
          <p className="vide">Aucune information manquante détectée.</p>
        ) : (
          <ul className="puces">{analyse.informations_manquantes.map((i) => <li key={i}>{i}</li>)}</ul>
        )}
        {analyse.alertes.length > 0 && (
          <>
            <h3>Alertes</h3>
            <ul className="alertes">{analyse.alertes.map((a) => <li key={a}>{a}</li>)}</ul>
          </>
        )}
      </article>
      <article className="carte">
        <div className="carte-tete">
          <h2>Questions à poser au déclarant</h2>
          {analyse.questions_suggerees.length > 0 && (
            <button className="btn" onClick={copier}>{copie ? "Copié" : "Copier"}</button>
          )}
        </div>
        {analyse.questions_suggerees.length === 0 ? (
          <p className="vide">Aucune question suggérée.</p>
        ) : (
          <ol className="questions">{analyse.questions_suggerees.map((q) => <li key={q}>{q}</li>)}</ol>
        )}
        <p className="aide">Suggestions à reformuler librement. La décision sur le dossier reste celle du gestionnaire.</p>
      </article>
    </div>
  );
}

/* ---------- Journal ---------- */

function Journal({ surReinitialisation }: { surReinitialisation: () => void }) {
  const [corrections, setCorrections] = useState(() => journal.corrections());
  const valides = journal.valides();
  const telecharger = () => {
    const blob = new Blob([journal.exporter()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sinistra-journal-corrections.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section>
      <div className="titre-ecran">
        <div>
          <p className="etape">Garde-fou n°4</p>
          <h1>Journal des corrections</h1>
          <p className="sous-titre">
            {valides.length} dossier(s) validé(s), {corrections.length} correction(s). Stocké dans ce navigateur pour la démo.
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={telecharger}>Exporter en JSON</button>
          <button
            className="btn-lien"
            onClick={() => {
              journal.reinitialiser();
              setCorrections([]);
              surReinitialisation();
            }}
          >
            Réinitialiser
          </button>
        </div>
      </div>
      <article className="carte">
        {corrections.length === 0 ? (
          <p className="vide">Aucune correction pour l'instant. Validez un dossier en corrigeant au moins un champ.</p>
        ) : (
          <table className="table-validation">
            <thead>
              <tr>
                <th>Dossier</th>
                <th>Champ</th>
                <th>Proposé</th>
                <th>Corrigé</th>
                <th>Moteur</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((c, i) => (
                <tr key={i}>
                  <td><strong className="num-dossier">{c.dossier}</strong></td>
                  <td>{c.champ === "urgence" ? "Niveau d'urgence" : LIBELLES_CHAMPS[c.champ as Champ] ?? c.champ}</td>
                  <td><s>{c.valeur_proposee}</s></td>
                  <td><strong>{c.valeur_corrigee}</strong></td>
                  <td>{c.moteur === "ia" ? "IA" : "Règles"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}
