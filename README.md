# Sinistra : assistant de tri de sinistres (démo)

> **Démo, données fictives.** Projet personnel. Aucun lien avec un assureur réel.

Sinistra aide un gestionnaire de sinistres à trier des déclarations de **dégât des eaux (habitation)** reçues en texte libre. L'outil extrait les faits en citant leur source, propose un niveau d'urgence, liste les informations manquantes et suggère des questions à poser au déclarant. **Le gestionnaire valide ou corrige tout.**

## Problème et utilisateur

Le gestionnaire perd du temps à lire chaque déclaration, à repérer les cas urgents (risque électrique, personne en danger, eau qui coule encore) et à relever ce qui manque pour instruire le dossier.

## Ce que fait la démo (4 écrans)

1. **Boîte de réception** : les déclarations triées par urgence proposée.
2. **Détail** : le texte d'origine à gauche, les sources surlignées ; les faits extraits à droite, chacun avec son extrait source et un niveau de confiance.
3. **Validation** : le gestionnaire accepte ou corrige chaque champ et l'urgence. Rien n'est enregistré avant « Valider le dossier ».
4. **Synthèse** : informations manquantes, alertes (incohérences, tentatives d'injection) et questions à poser.

Un **journal des corrections** enregistre chaque correction (champ, valeur proposée, valeur corrigée) et s'exporte en JSON pour l'évaluation.

## Garde-fous IA

| # | Garde-fou | Mise en œuvre |
|---|---|---|
| 1 | L'humain valide | Validation explicite champ par champ, bouton final désactivé tant que tout n'est pas traité |
| 2 | Chaque fait cite sa source | Vérification côté serveur que la source est un extrait exact de la déclaration ; sinon le fait est retiré (`src/shared/guardrails.ts`) |
| 3 | Aucune décision de garantie | Interdit dans le prompt, absent du schéma de sortie, rappelé dans l'interface |
| 4 | Journal des corrections | `src/lib/journal.ts`, export JSON |
| 5 | Données fictives | Bandeau permanent, déclarations inventées |
| 6 | Résistance à l'injection | Déclaration encadrée par des balises et traitée comme donnée, balises injectées neutralisées, phrases d'instruction signalées en alerte |

## Deux moteurs d'analyse

- **IA (Claude)** : fonction serveur Vercel `api/analyze.ts`. La clé API reste côté serveur. Sortie contrainte par le schéma JSON (zod, sorties structurées), revalidée, filtrée par les garde-fous, avec une nouvelle tentative si la sortie est invalide.
- **Règles, sans IA** : `src/shared/analyseurRegles.ts`. Utilisé automatiquement si aucune clé n'est configurée, pour que la démo reste utilisable. L'en-tête indique toujours quel moteur est actif.

## Évaluation

À venir (semaine 3) : jeu de 60 déclarations fictives avec vérité terrain, script `npm run eval`, rapport dans `eval/results/`. **Aucun chiffre n'est publié tant que l'évaluation n'a pas été réellement exécutée.**

Seuils de départ (hypothèses, pas des promesses) : rappel des cas urgents ≥ 95 %, exactitude de l'urgence ≥ 80 %, faits inventés ≤ 2 %, précision et rappel des informations manquantes ≥ 80 %, résistance aux injections 100 %.

## Architecture

```
src/
  App.tsx                 4 écrans + journal
  data/declarations.ts    8 déclarations fictives (brouillons à relire)
  lib/analyser.ts         appel /api/analyze, repli sur l'analyseur à règles
  lib/journal.ts          journal des corrections (localStorage, export JSON)
  shared/schema.ts        schéma zod de la sortie IA
  shared/guardrails.ts    vérification des sources
  shared/prompt.ts        prompt système (anti-injection)
  shared/analyseurRegles.ts  analyseur sans IA
api/analyze.ts            fonction serveur Vercel (Claude)
```

## Lancer en local

```bash
npm install
npm run dev        # front seul : moteur à règles
npm test           # tests du schéma et des garde-fous
vercel dev         # front + fonction serveur (nécessite ANTHROPIC_API_KEY, voir .env.example)
```

## Limites

- Démo : journal stocké dans le navigateur, pas de comptes ni de base de données.
- Déclarations fictives écrites pour la démo, à faire relire par un gestionnaire de sinistres.
- Aspects réglementaires (RGPD, AI Act) **non instruits** : à confirmer avec un juriste. Ce dépôt ne revendique aucune conformité.

## Mention

Projet personnel d'Ernestine Matjabo, Product Owner / Product Manager. Données 100 % fictives. **Le code a été généré avec Claude Code** ; le cadrage produit, les garde-fous, les décisions et l'évaluation sont d'Ernestine Matjabo.
