import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DECLARATIONS, type Declaration } from "./data/declarations";
import { analyser } from "./lib/analyser";
import { journal, type Correction } from "./lib/journal";
import { localiserSource } from "./shared/guardrails";
import { LIBELLES_CHAMPS, type Champ, type Fait, type NiveauUrgence, type ResultatAnalyse } from "./shared/schema";

type EtatAnalyse = ResultatAnalyse | "chargement";
type Vue = { ecran: "boite" } | { ecran: "dossier"; id: string; onglet: Onglet } | { ecran: "journal" };
type Onglet = "detail" | "validation" | "synthese";
type Decision = { statut: "accepte" | "corrige"; valeur: string };

const ORDRE_URGENCE: Record<NiveauUrgence, number> = { urgent: 0, normal: 1, faible: 2 };
const LIBELLE_URGENCE: Record<NiveauUrgence, string> = { urgent: "Urgent", normal: "Normal", faible: "Faible" };

function formaterDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [analyses, setAnalyses] = useState<Record<string, EtatAnalyse>>({});
  const [vue, setVue] = useState<Vue>({ ecran: "boite" });
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

  const declaration = vue.ecran === "dossier" ? DECLARATIONS.find((d) => d.id === vue.id) : undefined;

  return (
    <div className="app">
      <div className="bandeau" role="note">
        Démo, données fictives. Aucune décision de garantie, de refus ou d'indemnisation n'est prise par l'outil.
      </div>
      <header className="entete">
        <button className="marque" onClick={() => setVue({ ecran: "boite" })}>
          <span className="logo" aria-hidden>S</span>
          <span>
            <strong>Sinistra</strong>
            <small>Assistant de tri, dégât des eaux</small>
          </span>
        </button>
        <div className="entete-droite">
          {moteur && (
            <span className={`moteur moteur-${moteur}`} title={moteur === "ia" ? "Analyse par le modèle Claude, via la fonction serveur" : "Aucune clé API configurée : analyse locale par règles, sans IA"}>
              {moteur === "ia" ? "Analyse IA (Claude)" : "Mode hors ligne : règles, sans IA"}
            </span>
          )}
          <button className="btn-lien" onClick={() => setVue({ ecran: "journal" })}>
            Journal des corrections
          </button>
        </div>
      </header>

      <main className="contenu">
        {vue.ecran === "boite" && (
          <BoiteReception
            analyses={analyses}
            valides={new Set(valides.map((v) => v.dossier))}
            ouvrir={(id) => setVue({ ecran: "dossier", id, onglet: "detail" })}
          />
        )}
        {vue.ecran === "dossier" && declaration && (
          <Dossier
            key={declaration.id}
            declaration={declaration}
            etat={analyses[declaration.id]}
            onglet={vue.onglet}
            changerOnglet={(onglet) => setVue({ ecran: "dossier", id: declaration.id, onglet })}
            retour={() => setVue({ ecran: "boite" })}
            estValide={valides.some((v) => v.dossier === declaration.id)}
            surValidation={() => setValides(journal.valides())}
          />
        )}
        {vue.ecran === "journal" && <Journal surReinitialisation={() => setValides([])} />}
      </main>

      <footer className="pied">
        Projet personnel d'Ernestine Matjabo. Cadrage, garde-fous et évaluation : Ernestine Matjabo. Code généré avec Claude Code.
      </footer>
    </div>
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
  estValide,
  surValidation,
}: {
  declaration: Declaration;
  etat: EtatAnalyse | undefined;
  onglet: Onglet;
  changerOnglet: (o: Onglet) => void;
  retour: () => void;
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
