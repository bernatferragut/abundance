# Abundance 2.0 — page familiale

Une page qui dit une seule chose : **ne rien faire**, ou **voici ce qui a changé**.
Toi seul la modifies. Les autres ne font que la lire.

---

## La structure

- **Permanent — 60 %** : VT 40, GLDM 25, IBIT 15, MCHI 10, SMH 10. On ne vend jamais.
  Rééquilibrage par **bandes** d'environ ±5 points, uniquement avec de l'argent neuf.
- **Tactique — 40 %** : un **budget de risque** qui suit le régime, pas des pourcentages fixes.

## Les trois régimes

| Placement | 🟢 RISK ON | 🟡 NEUTRAL | 🔴 RISK OFF |
| --------- | ---------: | ---------: | ----------: |
| SGOV      |          0 |         10 |          25 |
| VT        |         10 |         10 |           0 |
| SMH       |         15 |          5 |           0 |
| GLDM      |          5 |         10 |          10 |
| BCI       |          5 |          5 |           5 |
| AIPO      |          5 |          0 |           0 |
| **Total** |      **40** |      **40** |       **40** |

L'idée n'est pas « un krach s'en vient » — c'est « le marché a cessé de
récompenser le risque, je garde de l'option ».

## Le signal

- Le **200 jours est le patron** : au-dessus = risque autorisé, en dessous = risque réduit.
- **Confirmation à 50 jours** (momentum) et **force relative SMH vs GLDM**.
- **Disjoncteur de crédit** : écart de crédit à plus de 50 % au-dessus de sa moyenne
  200 jours pendant deux fermetures → RISK OFF forcé, sans attendre le samedi.
  Réarmement sous 1,20 fois. Il ne peut qu'aller vers la sécurité.

## Le fichier `state.json`

```json
{
  "regime": "ON",
  "actionRequise": false,
  "changeLe": "2026-08-13",
  "verifieLe": "2026-08-13",
  "note": "",
  "prix": { "VT": 161.3, "GLDM": 85.95, "MCHI": 56.57, "SMH": 582.7,
            "IBIT": 36.8, "SGOV": 100.48, "AIPO": 30.14, "BCI": 23.83 },
  "prixDate": "2026-08-12",
  "signal": {
    "smhClose": 582.7, "smhMa200": 445.0, "smhMa50": 510.0,
    "smhVs200Pct": 30.9, "smhVs50Pct": 14.3,
    "ratioSmhGld": 0.52, "ratioMa200": 0.48, "ratioVs200Pct": 8.3
  },
  "disjoncteur": { "actif": false, "ratio": null, "date": "", "indisponible": true }
}
```

| Champ | Rôle |
|---|---|
| `regime` | `"ON"`, `"NEUTRAL"` ou `"OFF"`. Surligne la colonne tactique à suivre. |
| `actionRequise` | `true` → « Quelque chose a changé ». `false` → « Ne rien faire ». |
| `changeLe` / `verifieLe` | Dates. `verifieLe` déclenche l'avertissement après 14 jours. |
| `note` | Message optionnel. `""` cache la boîte. |
| `prix` / `prixDate` | Prix de clôture quotidiens pour la calculatrice et le suivi. |
| `signal` | Lecture du signal (SMH vs 200/50 jours, rapport SMH/GLDM). |
| `disjoncteur` | État du disjoncteur de crédit. |

Le robot met à jour `regime`, `actionRequise`, `changeLe`, `verifieLe`, `prix`,
`prixDate`, `signal` et `disjoncteur`. Après avoir fait les transactions, remets
`actionRequise` à `false` — la seule étape manuelle du fonctionnement normal.

## Le calcul automatique

`.github/workflows/update-signal.yml` s'exécute chaque **jour à 02 h 00 UTC**
(prix quotidiens). Le **régime**, lui, ne change que le **samedi** : le 200 jours
bouge lentement, on évite le va-et-vient. Quand le régime change et que
`actionRequise` devient `true`, le workflow crée une **issue GitHub** avec les
étapes à suivre (la seule partie qui change est le tactique 40 %).

**Pour recevoir les notifications :** Settings → Notifications, activer les
notifications pour Issues, choisir son mode. Ferme l'issue une fois les
transactions faites et `actionRequise` remis à `false`.

## Sécurités intégrées

- Prix de plus de 7 jours → **refuse d'écrire**.
- **3 tentatives** avec délai croissant.
- **Cours ajustés** : un fractionnement ne fabrique pas un faux signal.
- **Validation des prix** : variations > 50 % en une journée rejetées.
- `actionRequise` ne redevient jamais `false` tout seul.
- Échec bruyant : `state.json` reste intact, X rouge dans l'onglet Actions.

## Calculatrice et onglet Suivi

- **Calculatrice (Plan)** : entre le montant de chaque partie (permanent 60 % /
  tactique 40 %) → colonnes Montant et Actions, arrondies vers le bas.
- **Suivi** : entre le nombre d'actions détenues → valeur du portefeuille,
  répartition réelle contre cible (en % du portefeuille entier : permanent 60 %,
  tactique 40 %), écart. Un écart de plus de 25 % s'affiche en rouge.
- Tout reste dans le navigateur (`localStorage`), rien n'est publié.

## Aperçu local

Ouvrir `index.html` directement affiche des données d'exemple (les navigateurs
bloquent `fetch()` sur `file://`). Pour tester avec les vraies données :

```bash
python3 -m http.server 8000    # puis http://localhost:8000
```

## Modifier les pourcentages

Les tableaux sont du HTML ordinaire dans `index.html`. Chercher `Permanent` ou
`Tactique`. **Si un pourcentage change ici, il doit changer dans le PDF aussi.**

---

Plan familial personnel. Ce n'est pas un conseil financier professionnel.
