# Abundance — pages familiales

| Version | Page | Description |
| ------- | ---- | ----------- |
| **2.0** | [`index.html`](index.html) · <https://bernatferragut.github.io/abundance/> | Permanent + tactique, régime 200 jours, disjoncteurs de crédit et de taux. |
| **3.0** | [`v3/`](v3) · <https://bernatferragut.github.io/abundance/v3/> | Calculatrice d'achat simple (100 %). |
| **4.0 (P3)** | [`v4/`](v4) · <https://bernatferragut.github.io/abundance/v4/> | Plan du point de contrôle : régime BULL/NEUTRAL/BEARISH, score composite, matrices, calculatrice, suivi. |

---

# Abundance 2.0 — page familiale

Une page qui dit une seule chose : **ne rien faire**, ou **voici ce qui a changé**.
Toi seul la modifies. Les autres ne font que la lire.

---

## Les trois couches

- **🟦 POSSÉDER — Permanent, 60 % (CELI)** : VT 40, GLDM 35, IBIT 15, SMH 10
  (de la partie). On ne vend presque jamais : l'ARC tolère quelques transactions
  par année (2–10) — c'est du rééquilibrage, pas du négoce actif. Rééquilibrage
  par bandes d'environ ±5 points de la partie, d'abord avec de l'argent neuf.
  **Aucun signal** — sa protection vient de la diversification, de la possession
  à long terme et du refus des sorties émotionnelles. Honnêtement : une baisse de
  35 à 45 % est possible dans un marché baissier sévère.
- **🟧 S'ADAPTER — Tactique, 40 % (REER)** : un budget de risque, pas des pourcentages fixes.
- **🟩 MUNITIONS — SGOV et cotisations neuves** : on attend, et les règles de déploiement
  selon la baisse décident quand accélérer.

## Le signal

- **Le 200 jours de VT est le patron.** VT au-dessus du 200 jours ET momentum sain
  (VT > 50 jours) → RISK ON. VT < 200 jours → RISK OFF. Autour de la ligne ou momentum
  perdu → NEUTRAL.
- **Le cadran satellite SMH** contrôle le couple SMH/AIPO dans le tactique :
  SMH > 50 jours → 100 % ; entre 50 et 200 jours → 50 % ; SMH < 200 jours → 0 %.
  La part non utilisée va en SGOV.
- **Disjoncteur de crédit** : écart de crédit à plus de 50 % au-dessus de sa moyenne
  200 jours pendant deux fermetures → RISK OFF forcé, sans attendre le samedi.
  Réarmement sous 1,20 fois. Il ne peut qu'aller vers la sécurité.
- **Disjoncteur de taux** : le 10 ans américain au-dessus de 5,00 % pendant deux
  fermetures → le régime est plafonné à NEUTRAL, sans attendre le samedi. Réarmement
  sous 4,75 %. Dans un régime de déficits permanents, l'accident typique est une crise
  des taux longs pendant que les actions sont encore au-dessus de leur 200 jours — là
  où VT est aveugle. Lui non plus ne peut qu'aller vers la sécurité.

## Les trois régimes (cibles de base, en % du portefeuille entier)

| Placement | 🟢 RISK ON | 🟡 NEUTRAL | 🔴 RISK OFF |
| --------- | ---------: | ---------: | ----------: |
| SGOV      |          0 |         10 |          25 |
| VT        |         10 |         10 |           0 |
| SMH       |         15 |          5 |           0 |
| GLDM      |          5 |         10 |          10 |
| BCI       |          5 |          5 |           5 |
| AIPO      |          5 |          0 |           0 |
| **Total** |      **40** |      **40** |       **40** |

La cible **effective** (régime + cadran satellite) est calculée par le robot et écrite
dans `state.json` (`tactiqueCible`).

## Système d'exploitation du portefeuille (onglet Suivi)

La page ne « donne pas d'ordres » : elle calcule **Cible → Réel → Écart → Action**.

- **Réel** et **Cible** en % du portefeuille entier.
- **Écart** en points du portefeuille entier.
- **Action** : GARDER si l'écart reste dans la marge (±5 pts pour le tactique,
  ±3 pts pour le permanent ≈ ±5 pts de la partie), RÉÉQUILIBRER sinon.
- Le permanent ne se rééquilibre qu'avec de l'argent neuf — jamais en vendant.

## Le fichier `state.json`

```json
{
  "regime": "ON",
  "actionRequise": false,
  "changeLe": "2026-08-14",
  "verifieLe": "2026-08-14",
  "note": "",
  "prix": { "VT": 162.16, "GLDM": 86.55, "SMH": 586.61,
            "IBIT": 35.62, "SGOV": 100.56, "AIPO": 30.93, "BCI": 24.57 },
  "prixDate": "2026-08-14",
  "regimeSignal": {
    "vtClose": 162.16, "vtMa200": 147.1, "vtMa50": 156.6,
    "vtVs200Pct": 10.2, "vtVs50Pct": 3.6
  },
  "satellite": {
    "facteur": 0.5, "smhClose": 586.61, "smhMa200": 461.82, "smhMa50": 591.46,
    "smhVs200Pct": 27, "smhVs50Pct": -0.8
  },
  "cibles": { "ON": { }, "NEUTRAL": { }, "OFF": { } },
  "tactiqueCible": { "SGOV": 10, "VT": 10, "SMH": 7.5, "GLDM": 5, "BCI": 5, "AIPO": 2.5 },
  "disjoncteur": { "actif": false, "ratio": 0.94, "date": "2026-08-13", "indisponible": false },
  "disjoncteurTaux": { "actif": false, "taux": 4.74, "date": "2026-08-21", "indisponible": false }
}
```

| Champ | Rôle |
|---|---|
| `regime` | `"ON"`, `"NEUTRAL"` ou `"OFF"`. Surligne la colonne tactique à suivre. |
| `actionRequise` | `true` → « Quelque chose a changé ». `false` → « Ne rien faire ». |
| `changeLe` / `verifieLe` | Dates. `verifieLe` déclenche l'avertissement après 14 jours. |
| `note` | Message optionnel. `""` cache la boîte. |
| `prix` / `prixDate` | Prix de clôture quotidiens pour la calculatrice et le suivi. |
| `regimeSignal` | Lecture du régime : VT vs 200/50 jours. |
| `satellite` | Cadran SMH : facteur (1 / 0,5 / 0) et moyennes. |
| `cibles` | Cibles de base des trois régimes. |
| `tactiqueCible` | Cible effective du régime en cours (cadran appliqué). |
| `disjoncteur` | État du disjoncteur de crédit. |
| `disjoncteurTaux` | État du disjoncteur de taux (10 ans US, plafond NEUTRAL). |

Le robot met à jour toutes ces valeurs sauf `note`. Après avoir fait les transactions,
remets `actionRequise` à `false` — la seule étape manuelle du fonctionnement normal.

## Le calcul automatique

`.github/workflows/update-signal.yml` s'exécute chaque **jour à 02 h 00 UTC** (prix
quotidiens). Le **régime** et le **cadran satellite** ne changent que le **samedi** :
le 200 jours bouge lentement, on évite le va-et-vient. Quand le régime change, le
workflow crée une **issue GitHub** avec les étapes à suivre (la seule partie qui
change est le tactique 40 %).

**Pour recevoir les notifications :** Settings → Notifications, activer les
notifications pour Issues, choisir son mode. Ferme l'issue une fois les transactions
faites et `actionRequise` remis à `false`.

## Sécurités intégrées

- Prix de plus de 7 jours → **refuse d'écrire**.
- **3 tentatives** avec délai croissant.
- **Cours ajustés** : un fractionnement ne fabrique pas un faux signal.
- **Validation des prix** : variations > 50 % en une journée rejetées.
- `actionRequise` ne redevient jamais `false` tout seul.
- Échec bruyant : `state.json` reste intact, X rouge dans l'onglet Actions.

## Calculatrice

Entrer le montant de chaque partie (permanent 60 % / tactique 40 %) → colonnes
Montant et Actions, arrondies vers le bas. Tout reste dans le navigateur
(`localStorage`), rien n'est publié.

## Aperçu local

Ouvrir `index.html` directement affiche des données d'exemple (les navigateurs
bloquent `fetch()` sur `file://`). Pour tester avec les vraies données :

```bash
python3 -m http.server 8000    # puis http://localhost:8000
```

## Modifier les pourcentages

Les tableaux sont du HTML ordinaire dans `index.html` (chercher `Permanent` ou
`Tactique`). Les cibles de base du tactique sont aussi dans `scripts/signal.mjs`
(`CIBLES_BASE`). Le site est la seule source de vérité (plus de PDF à synchroniser).

---

## Pourquoi on aime ce projet

Un regard extérieur, août 2026 — ce qui rend ce plan solide pour 2026-2030 :

- **Zéro risque de taux longs.** Aucune obligation à long terme nulle part. Les munitions
  en SGOV rapportent pendant qu'on attend — pas de mauvaise surprise si les taux montent.
- **Un seul patron.** Le 200 jours de VT, confirmé deux fermetures de suite, changé le
  samedi seulement. Pas de va-et-vient, pas de décision prise à chaud.
- **Le disjoncteur de crédit.** Le crédit lâche avant les actions dans chaque vraie
  crise. Lui, il ne peut que mettre à l'abri — jamais l'inverse.
- **Or et bitcoin au cœur du permanent.** Deux réponses directes à la dévaluation
  monétaire et à un monde qui se fragmente. Pas un pari : une assurance.
- **La discipline est dans la structure, pas dans la volonté.** On ne vend le permanent
  que rarement et délibérément, on rééquilibre d'abord avec de l'argent neuf, et le
  CELI reste à l'abri des allers-retours.
- **Le robot échoue du bon bord.** Données périmées ? Il refuse d'écrire. Un prix
  manque ? Il garde l'ancien. Quelque chose brise ? Le plan reste intact.
- **Rien de superflu.** Chaque ligne a une job, chaque règle bloque une erreur humaine.
  C'est simple en surface parce que c'est sérieux en dessous.

La retouche d'août 2026 fait deux choses. D'abord, elle termine le commerce de
Taïwan commencé avec MCHI 10 → 7,5 : les derniers 7,5 points de MCHI passent à GLDM
(35) — MCHI est **vendu une seule fois, délibérément** : quelques transactions par
année dans le CELI restent du rééquilibrage aux yeux de l'ARC, pas du négoce actif.
Dans le scénario du détroit, la Chine tombe le plus fort, les semi-conducteurs
et une bonne partie de VT suivent — et l'or est l'actif qui, historiquement, monte
exactement quand ça arrive. Ensuite, elle ajoute le disjoncteur de taux : dans le
régime Bessent (rachats de dette longue doublés, émissions en bons du Trésor,
déficits permanents), l'accident signature est une crise de prime de terme pendant
que les actions sont encore au-dessus de leur 200 jours. Le patron VT y est aveugle ;
le 10 ans américain, lui, le voit. Plafond NEUTRAL au-dessus de 5,00 %, réarmement
sous 4,75 %, et — comme toujours — il ne peut qu'aller vers la sécurité.

— K3

---

Plan familial personnel. Ce n'est pas un conseil financier professionnel.
