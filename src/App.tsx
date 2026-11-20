import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DECLARATIONS, type Declaration } from "./data/declarations";
import { analyser } from "./lib/analyser";
import { journal, type Correction } from "./lib/journal";
import { localiserSource } from "./shared/guardrails";
import { LIBELLES_CHAMPS, type Champ, type Fait, type NiveauUrgence, type ResultatAnalyse } from "./shared/schema";

type EtatAnalyse = ResultatAnalyse | "chargement";
type Vue = { ecran: "accueil" } | { ecran: "boite" } | { ecran: "dossier"; id: string; onglet: Onglet } | { ecran: "journal" };
type Onglet = "detail" | "validation" | "synthese";
type Decision = { statut: "accepte" | "corrige"; valeur: string };

const ORDRE_URGENCE: Record<NiveauUrgence, number> = { urgent: 0, normal: 1, faible: 2 };
const LIBELLE_URGENCE: Record<NiveauUrgence, string> = { urgent: "Urgent", normal: "Normal", faible: "Faible" };

function formaterDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [analyses, setAnalyses] = useState<Record<string, EtatAnalyse>>({});
  const [vue, setVue] = useState<Vue>({ ecran: "accueil" });
  const [guide, setGuide] = useState(false);
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
  }, [vue]);

  const declaration = vue.ecran === "dossier" ? DECLARATIONS.find((d) => d.id === vue.id) : undefined;

  const allerBoite = () => {
    setGuide(false);
    setVue({ ecran: "boite" });
  };
  const demarrerGuide = () => {
    // Cas le plus parlant : le premier dossier proposé en urgent (à défaut, le premier reçu).
    const urgent = DECLARATIONS.find((d) => {
      const e = analyses[d.id];
      return e && e !== "chargement" && e.analyse.urgence.niveau === "urgent";
    });
    setGuide(true);
    setVue({ ecran: "dossier", id: (urgent ?? DECLARATIONS[0]).id, onglet: "detail" });
  };

  return (
    <div className="app">
      <header className="entete">
        <button className="marque" onClick={() => { setGuide(false); setVue({ ecran: "accueil" }); }} aria-label="Sinistra, retour à l'accueil">
          <span className="logo" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5c-3.6 4.4-6 7.6-6 10.6a6 6 0 0 0 12 0c0-3-2.4-6.2-6-10.6z" />
              <path d="M9.2 14.5a2.8 2.8 0 0 0 2.8 2.7" />
            </svg>
          </span>
          <span>
            <strong>Sinistra</strong>
            <small>Tri dégât des eaux</small>
          </span>
        </button>
        <span className="demo-pill" role="note" title="Aucune décision de garantie, de refus ou d'indemnisation n'est prise par l'outil.">
          Démo, données fictives
        </span>
        <div className="entete-droite">
          {moteur && (
            <span className={`moteur moteur-${moteur}`} title={moteur === "ia" ? "Analyse par le modèle Claude, via la fonction serveur" : "Aucune clé API configurée : analyse locale par règles, sans IA"}>
              {moteur === "ia" ? "Analyse IA (Claude)" : "Mode hors ligne : règles, sans IA"}
            </span>
          )}
          <button className="rond" onClick={() => setVue({ ecran: "journal" })} aria-label="Journal des corrections" title="Journal des corrections">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="5" y="3.5" width="14" height="17" rx="3" />
              <path d="M9 8h6M9 12h6M9 16h3" />
            </svg>
          </button>
        </div>
      </header>

      <main className="contenu">
        {vue.ecran === "accueil" && (
          <Accueil analyses={analyses} valides={valides.map((v) => v.dossier)} ouvrirBoite={allerBoite} demarrerGuide={demarrerGuide} />
        )}
        {vue.ecran === "boite" && (
          <BoiteReception
            analyses={analyses}
            valides={new Set(valides.map((v) => v.dossier))}
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
            surValidation={() => setValides(journal.valides())}
          />
        )}
        {vue.ecran === "journal" && <Journal surReinitialisation={() => setValides([])} />}
      </main>

      <footer className="pied">
        Aucune décision de garantie, de refus ou d'indemnisation n'est prise par l'outil. Projet personnel d'Ernestine Matjabo. Cadrage, garde-fous et évaluation : Ernestine Matjabo. Code généré avec Claude Code.
      </footer>
    </div>
  );
}

/* ---------- Accueil du gestionnaire ---------- */

/** Prénom fictif du gestionnaire de la démo. */
const PRENOM_GESTIONNAIRE = "Camille";

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
        <p className="etape">{jour.charAt(0).toUpperCase() + jour.slice(1)} · données de démonstration</p>
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

function BoiteReception({
  analyses,
  valides,
  ouvrir,
}: {
  analyses: Record<string, EtatAnalyse>;
  valides: Set<string>;
  ouvrir: (id: string) => void;
}) {
  const lignes = [...DECLARATIONS].sort((a, b) => {
    const ea = analyses[a.id];
    const eb = analyses[b.id];
    const ua = ea && ea !== "chargement" ? ORDRE_URGENCE[ea.analyse.urgence.niveau] : 9;
    const ub = eb && eb !== "chargement" ? ORDRE_URGENCE[eb.analyse.urgence.niveau] : 9;
    return ua - ub || a.recueLe.localeCompare(b.recueLe);
  });
  const nbUrgents = lignes.filter((d) => {
    const e = analyses[d.id];
    return e && e !== "chargement" && e.analyse.urgence.niveau === "urgent";
  }).length;

  return (
    <section>
      <div className="titre-ecran">
        <div>
          <p className="etape">Écran 1 sur 4</p>
          <h1>Boîte de réception</h1>
          <p className="sous-titre">
            {DECLARATIONS.length} déclarations reçues, {nbUrgents} proposées en urgent. L'urgence est une proposition à valider.
          </p>
        </div>
      </div>
      <ul className="liste">
        {lignes.map((d) => {
          const e = analyses[d.id];
          return (
            <li key={d.id}>
              <button className="ligne" onClick={() => ouvrir(d.id)}>
                <span className="ligne-urgence">
                  {!e || e === "chargement" ? <span className="badge badge-attente">Analyse…</span> : <BadgeUrgence niveau={e.analyse.urgence.niveau} />}
                </span>
                <span className="ligne-corps">
                  <span className="ligne-meta">
                    <strong>{d.id}</strong> · {d.canal} · {formaterDate(d.recueLe)}
                  </span>
                  <span className="ligne-extrait">{d.texte}</span>
                </span>
                <span className="ligne-statut">
                  {valides.has(d.id) ? <span className="statut statut-ok">Validé</span> : <span className="statut">À valider</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
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
  surValidation: () => void;
}) {
  const onglets: { id: Onglet; libelle: string; etape: number }[] = [
    { id: "detail", libelle: "Détail et sources", etape: 2 },
    { id: "validation", libelle: "Validation", etape: 3 },
    { id: "synthese", libelle: "Synthèse et questions", etape: 4 },
  ];

  return (
    <section>
      <button className="btn-lien retour" onClick={retour}>
        ← Boîte de réception
      </button>
      <div className="titre-ecran">
        <div>
          <p className="etape">
            Écran {onglets.find((o) => o.id === onglet)!.etape} sur 4 · {declaration.canal} · {formaterDate(declaration.recueLe)}
          </p>
          <h1>
            {declaration.id} {estValide && <span className="statut statut-ok">Validé</span>}
          </h1>
          <p className="sous-titre">{declaration.declarant} · {declaration.ville}</p>
        </div>
        {etat && etat !== "chargement" && <BadgeUrgence niveau={etat.analyse.urgence.niveau} />}
      </div>

      <nav className="onglets" aria-label="Étapes du dossier">
        {onglets.map((o) => (
          <button key={o.id} className={o.id === onglet ? "actif" : ""} onClick={() => changerOnglet(o.id)}>
            <span className="num">{o.etape}</span> {o.libelle}
          </button>
        ))}
      </nav>

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

function TexteSurligne({ texte, faits, actif }: { texte: string; faits: Fait[]; actif: Champ | null }) {
  const plages = faits
    .map((f) => ({ champ: f.champ, pos: localiserSource(f.source, texte) }))
    .filter((p): p is { champ: Champ; pos: { debut: number; fin: number } } => p.pos !== null)
    .sort((a, b) => a.pos.debut - b.pos.debut);

  const morceaux: ReactNode[] = [];
  let curseur = 0;
  for (const p of plages) {
    if (p.pos.debut < curseur) continue; // chevauchement : on garde le premier
    if (p.pos.debut > curseur) morceaux.push(texte.slice(curseur, p.pos.debut));
    morceaux.push(
      <mark key={p.champ} className={actif === p.champ ? "actif" : ""} title={LIBELLES_CHAMPS[p.champ]}>
        {texte.slice(p.pos.debut, p.pos.fin)}
      </mark>,
    );
    curseur = p.pos.fin;
  }
  morceaux.push(texte.slice(curseur));
  return <p className="texte-declaration">{morceaux}</p>;
}

function Detail({ declaration, resultat }: { declaration: Declaration; resultat: ResultatAnalyse }) {
  const [actif, setActif] = useState<Champ | null>(null);
  const { analyse } = resultat;
  return (
    <div className="deux-colonnes">
      <article className="carte">
        <h2>Déclaration (texte d'origine)</h2>
        <TexteSurligne texte={declaration.texte} faits={analyse.faits} actif={actif} />
        <p className="aide">Les passages surlignés sont les sources des faits extraits. Survolez un fait pour le retrouver.</p>
      </article>
      <article className="carte">
        <h2>Faits extraits ({analyse.faits.length})</h2>
        {analyse.faits.length === 0 && <p className="vide">Aucun fait sourcé n'a pu être extrait.</p>}
        <ul className="faits">
          {analyse.faits.map((f) => (
            <li key={f.champ} onMouseEnter={() => setActif(f.champ)} onMouseLeave={() => setActif(null)} onFocus={() => setActif(f.champ)} tabIndex={0}>
              <div className="fait-tete">
                <span className="fait-champ">{LIBELLES_CHAMPS[f.champ]}</span>
                <span className={`confiance confiance-${f.confiance}`}>Confiance {f.confiance}</span>
              </div>
              <div className="fait-valeur">{f.valeur}</div>
              <blockquote>« {f.source} »</blockquote>
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
                  <td>{c.dossier}</td>
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
