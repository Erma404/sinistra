# Sinistra : assistant de tri de sinistres (démo)

> **Démo, données fictives.** Projet personnel. Aucun lien avec un assureur réel.

Sinistra aide un gestionnaire de sinistres à trier des déclarations de **dégât des eaux (habitation)** reçues en texte libre. L'outil extrait les faits en citant leur source, propose un niveau d'urgence, liste les informations manquantes et suggère des questions à poser au déclarant. **Le gestionnaire valide ou corrige tout.**

## Problème et utilisateur

Le gestionnaire perd du temps à lire chaque déclaration, à repérer les cas urgents (risque électrique, personne en danger, eau qui coule encore) et à relever ce qui manque pour instruire le dossier.

## Ce que fait la démo

Un **accueil** présente la file du jour (déclarations reçues, cas proposés en urgent, dossiers à valider) et propose un **parcours guidé** en 3 étapes sur le cas urgent le plus parlant.

1. **Boîte de réception** : les déclarations triées par urgence proposée puis par heure d'envoi, avec le déclarant, la ville et les signaux qui expliquent le tri (électricité touchée, eau non coupée…). Chaque carte affiche son statut : *À valider*, *Mail à envoyer* ou *Mail envoyé*. Filtres et avancement du tri.
2. **Détail** : faits extraits regroupés (situation, risques), chacun avec son extrait source. Survoler un fait surligne le passage dans la déclaration, et inversement.
3. **Validation** : le gestionnaire accepte ou corrige chaque champ et l'urgence. Rien n'est enregistré avant « Valider le dossier ».
4. **Synthèse** : informations manquantes, alertes (incohérences, tentatives d'injection), questions à poser et **brouillon de mail de rebond** au déclarant, modifiable. Le gestionnaire copie le mail, l'envoie depuis sa messagerie, puis confirme l'envoi (possible uniquement sur un dossier validé). Rien n'est envoyé depuis l'outil.

Le **journal** liste les dossiers validés (avec le statut du mail) et chaque correction (champ, valeur proposée, valeur retenue). Il s'exporte en JSON pour l'évaluation ; sa réinitialisation demande une confirmation.

Interface mobile d'abord : barre de navigation en bas sur téléphone, rail vertical en paysage, barre latérale sur ordinateur. Thèmes clair et sombre.

## Garde-fous IA

| # | Garde-fou | Mise en œuvre |
|---|---|---|
| 1 | L'humain valide | Validation explicite champ par champ, bouton final désactivé tant que tout n'est pas traité |
| 2 | Chaque fait cite sa source | Vérification côté serveur que la source est un extrait exact de la déclaration ; sinon le fait est retiré (`src/shared/guardrails.ts`) |
| 3 | Aucune décision de garantie | Interdit dans le prompt, absent du schéma de sortie, rappelé dans l'interface ; le mail de rebond est testé pour ne contenir aucune promesse de garantie ni d'indemnisation |
| 4 | Journal des corrections | `src/lib/journal.ts`, export JSON, effacement seulement après confirmation |
| 5 | Données fictives | Bandeau permanent, déclarations inventées |
| 6 | Résistance à l'injection | Déclaration encadrée par des balises et traitée comme donnée, balises injectées neutralisées, phrases d'instruction signalées en alerte |

## Deux moteurs d'analyse

- **IA (Claude)** : fonction serveur Vercel `api/analyze.ts`. La clé API reste côté serveur. Sortie contrainte par le schéma JSON (zod, sorties structurées), revalidée, filtrée par les garde-fous, avec une nouvelle tentative si la sortie est invalide.
- **Règles, sans IA** : `src/shared/analyseurRegles.ts`. Utilisé automatiquement si aucune clé n'est configurée, pour que la démo reste utilisable. L'en-tête indique toujours quel moteur est actif.

## Évaluation

À venir (semaine 3) : jeu de 60 déclarations fictives avec vérité terrain, script `npm run eval`, rapport dans `eval/results/`. **Aucun chiffre n'est publié tant que l'évaluation n'a pas été réellement exécutée.**

Seuils de départ (hypothèses, pas des promesses) : rappel des cas urgents ≥ 95 %, exactitude de l'urgence ≥ 80 %, faits inventés ≤ 2 %, précision et rappel des informations manquantes ≥ 80 %, résistance aux injections 100 %.

## Accessibilité

- Contrastes vérifiés au niveau WCAG AA (4,5:1) en thème clair et sombre.
- Navigation au clavier, focus visible, lien « Aller au contenu ».
- Au changement d'écran, le focus va au titre pour que les lecteurs d'écran l'annoncent ; confirmations annoncées (`aria-live`).
- Respect du réglage « réduire les animations » du système.

## Architecture

```
src/
  App.tsx                 accueil, 4 écrans, journal
  data/declarations.ts    8 déclarations fictives (brouillons à relire)
  lib/analyser.ts         appel /api/analyze, repli sur l'analyseur à règles
  lib/journal.ts          journal : corrections, dossiers validés, mails envoyés (localStorage, export JSON)
  lib/mailRebond.ts       brouillon de mail de rebond au déclarant
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
npm test           # tests du schéma, des garde-fous et du mail de rebond
vercel dev         # front + fonction serveur (nécessite ANTHROPIC_API_KEY, voir .env.example)
```

## Limites

- Démo : journal stocké dans le navigateur, pas de comptes ni de base de données.
- En mode hors ligne (règles, sans IA), les questions suggérées sont génériques : une question par information manquante, sans tenir compte du contexte de la déclaration.
- Prénom du gestionnaire, date du jour et météo de l'accueil sont fictifs et fixes.
- Déclarations fictives écrites pour la démo, à faire relire par un gestionnaire de sinistres.
- Aspects réglementaires (RGPD, AI Act) **non instruits** : à confirmer avec un juriste. Ce dépôt ne revendique aucune conformité.

## Mention

Projet personnel d'Ernestine Matjabo, Product Owner / Product Manager. Données 100 % fictives. **Le code a été généré avec Claude Code** ; le cadrage produit, les garde-fous, les décisions et l'évaluation sont d'Ernestine Matjabo.
