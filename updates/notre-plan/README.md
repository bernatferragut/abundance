# Notre plan — page familiale

Une page qui dit une seule chose : **ne rien faire**, ou **voici ce qui a changé**.
Toi seul la modifies. Les autres ne font que la lire.

---

## Mise en ligne (5 minutes)

1. Créer un dépôt **public**, par exemple `notre-plan`.
2. Téléverser `index.html`, `state.json`, `scripts/` et `.github/`.
3. **Settings → Pages →** Deploy from a branch → `main` → `/ (root)` → Save.
4. **Settings → Actions → General →** Workflow permissions →
   **Read and write permissions** → Save.
5. **Actions → Update signal → Run workflow** une fois, puis valider le journal.

Adresse : `https://<ton-nom>.github.io/notre-plan/`

> Dépôt public uniquement. Aucune donnée privée : ni montants, ni soldes, ni
> numéros de compte. Seulement des symboles et des pourcentages. **Garde-le ainsi.**

Pourquoi GitHub : Google Sites place le HTML dans un iframe qui bloque le
`fetch()` de `state.json`, et Firebase exigerait un compte de facturation.
GitHub héberge **et** calcule, gratuitement.

---

## Le fichier `state.json`

```json
{
  "reglage": "X",
  "actionRequise": false,
  "changeLe": "2026-07-15",
  "verifieLe": "2026-08-09",
  "note": "",
  "tactique": {
    "active": false,
    "titre": "SH",
    "pourcentage": 5,
    "ouvertLe": "",
    "raison": ""
  }
}
```

| Champ | Rôle |
|---|---|
| `reglage` | `"X"` ou `"Y"`. Surligne la bonne colonne du REER. |
| `actionRequise` | `true` → « Quelque chose a changé ». `false` → « Ne rien faire ». |
| `changeLe` | Date du dernier changement de réglage. |
| `verifieLe` | Mis à jour automatiquement. Alerte après 14 jours. |
| `note` | Message optionnel. `""` cache la boîte. |
| `tactique` | Position tactique manuelle (voir plus bas). |

Le robot met à jour `reglage`, `actionRequise`, `changeLe` et `verifieLe`. Il ne
touche jamais à `tactique`. Après les transactions, remets `actionRequise` à
`false` — la seule étape manuelle du fonctionnement normal.

---

## La position tactique (SH / PSQ)

Cachée par défaut ; visible seulement quand `active` vaut `true`.

```json
"tactique": {
  "active": true,
  "titre": "SH",
  "pourcentage": 5,
  "ouvertLe": "2026-08-09",
  "raison": "Couverture pendant la baisse."
}
```

- **SH** = inverse du S&P 500. **PSQ** = inverse du Nasdaq 100. **Sans levier** —
  jamais SQQQ, SDS ou SOXS.
- **Maximum 5 %** du total, payé à même le SGOV du REER.
- **Maximum 8 semaines** — la page affiche « ⚠ DÉPASSÉ » après 56 jours.
- **REER seulement**, et **seulement en Réglage Y**.

Pour fermer : remettre `active` à `false`.

---

## Le disjoncteur de crédit

Une règle qui passe avant les deux autres, et qui ne peut aller que vers la
sécurité. Le robot suit l'écart de crédit haut rendement (FRED
`BAMLH0A0HYM2`). Si l'écart dépasse sa moyenne 200 jours de plus de 50 % pendant
**deux fermetures**, passage immédiat en **Réglage Y**, sans attendre le samedi.
Réarmement sous **1,20 fois**. Une bannière rouge apparaît alors.

---

## Le calcul automatique

`.github/workflows/update-signal.yml` tourne chaque **samedi 02 h 00 UTC**
(vendredi ~22 h HE), lit SMH et GLD sur Yahoo Finance, calcule le signal et
publie `state.json`.

Sécurités intégrées : prix de plus de 7 jours refusés, 3 tentatives, cours
ajustés, variations de plus de 50 % rejetées, `actionRequise` ne redevient
jamais `false` tout seul, échec bruyant (l'état précédent est conservé).

Quand le réglage change, le workflow crée une **issue GitHub** avec les étapes à
suivre. Active **Settings → Notifications → Issues** pour les recevoir, ou
consulte l'onglet Issues. Ferme l'issue après avoir transigé et remis
`actionRequise` à `false`.

---

## Calculatrice et onglet Suivi

- **Plan** : entre le montant disponible → deux colonnes (montant en dollars,
  nombre d'actions, arrondi vers le bas, reste affiché).
- **Suivi** : entre les actions détenues → valeur du portefeuille, répartition
  réelle contre cible, écart (rouge au-delà de 25 %).
- Tout reste dans le navigateur (`localStorage`) ; rien n'est publié. Le bouton
  « Tout effacer » vide ces données.
- Prix rafraîchis **chaque jour** par le robot ; le **réglage**, lui, ne change
  que le **samedi**.

---

## Aperçu local

Ouvrir `index.html` directement affiche une bannière **« Aperçu seulement »**
avec des données d'exemple — les navigateurs bloquent `fetch()` sur `file://`.
Pour tester avec les vraies données :

```bash
python3 -m http.server 8000    # puis http://localhost:8000
```

---

## Modifier les pourcentages

Les tableaux sont du HTML ordinaire dans `index.html`. Chercher `Compte CELI`
ou `Compte REER`. **Si un pourcentage change ici, il doit changer dans le PDF
aussi.** Deux sources de vérité qui se contredisent, c'est pire qu'une seule.

---

Plan familial personnel. Ce n'est pas un conseil financier professionnel.
