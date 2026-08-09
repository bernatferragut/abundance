# Notre plan — page familiale

Une page qui dit une seule chose : **ne rien faire**, ou **voici ce qui a changé**.
Toi seul la modifies. Les autres ne font que la lire.

---

## Pourquoi GitHub Pages et pas Google

« Google Pages » n'existe pas. **Google Sites** place le HTML dans un iframe
restreint : le `fetch()` de `state.json` ne fonctionne pas, et Sites ne peut pas
exécuter un calcul hebdomadaire. **Firebase Hosting** servirait bien la page,
mais il faudrait quand même un endroit pour calculer le signal, et Cloud
Scheduler exige un compte de facturation.

GitHub fait les deux gratuitement : l'hébergement **et** le calcul automatique.

---

## Mise en ligne (5 minutes)

1. Créer un dépôt **public**, par exemple `notre-plan`.
2. Téléverser `index.html`, `state.json`, `scripts/` et `.github/`.
3. **Settings → Pages →** Deploy from a branch → `main` → `/ (root)` → Save.
4. **Settings → Actions → General →** Workflow permissions →
   **Read and write permissions** → Save.
5. **Actions → Update signal → Run workflow** une fois à la main, puis lire le
   journal pour valider.

Adresse : `https://<ton-nom>.github.io/notre-plan/`

> Le dépôt doit être public. Aucune donnée privée n'y figure : ni montants, ni
> soldes, ni numéros de compte. Seulement des symboles et des pourcentages.
> **Garde-le ainsi.**

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
| `changeLe` | Date du dernier changement de réglage. Affichage seulement. |
| `verifieLe` | Mis à jour automatiquement. Déclenche l'avertissement après 14 jours. |
| `note` | Message optionnel. `""` cache la boîte. |
| `tactique` | Position tactique manuelle. Voir plus bas. |

Le robot met à jour `reglage`, `actionRequise`, `changeLe` et `verifieLe`.
**Il ne touche jamais à `tactique`** — cette décision reste entièrement humaine.

Après avoir fait les transactions, remets `actionRequise` à `false`. C'est la
seule étape manuelle du fonctionnement normal.

---

## La position tactique (SH / PSQ)

Cachée par défaut. Elle apparaît seulement quand `active` vaut `true`.

```json
"tactique": {
  "active": true,
  "titre": "SH",
  "pourcentage": 5,
  "ouvertLe": "2026-08-09",
  "raison": "Couverture pendant la baisse."
}
```

- **SH** = inverse du S&P 500. **PSQ** = inverse du Nasdaq 100. **Sans levier.**
  Jamais SQQQ, SDS ou SOXS : la décote quotidienne transforme une bonne
  intuition en perte.
- **Maximum 5 % du total**, payé à même le SGOV du REER, jamais en vendant les
  autres placements.
- **Maximum 8 semaines.** La page compte les jours et affiche
  « ⚠ DÉPASSÉ » après 56 jours.
- **REER seulement.** Une perte dans un CELI est irrécupérable et détruit des
  droits de cotisation.
- **Seulement en Réglage Y.** On ne vend jamais à découvert dans une tendance
  haussière.

Pour fermer : remettre `active` à `false`.

---

## Le calcul automatique

`.github/workflows/update-signal.yml` s'exécute chaque **samedi 02 h 00 UTC**
(vendredi ~22 h HE, après la fermeture), récupère SMH et GLD depuis Yahoo
Finance, calcule le signal et publie `state.json`.

**Pourquoi pas dans le navigateur ?** Yahoo n'envoie pas d'en-têtes CORS : une
page web ne peut pas l'appeler directement. Le contournement habituel est un
proxy CORS externe — donc la page familiale casse (ou affiche un mauvais
verdict) dès que ce proxy tombe. Le calcul côté serveur évite tout ça.

### Sécurités intégrées

- Prix de plus de 7 jours → **refuse d'écrire**. Une donnée périmée ne devient
  jamais un verdict.
- **3 tentatives** avec délai croissant avant d'abandonner.
- **Cours ajustés** : un fractionnement d'actions ne peut pas fausser la moyenne
  200 jours ni fabriquer un faux signal.
- `actionRequise` ne redevient jamais `false` tout seul. Le robot lève le
  drapeau ; seul un humain le baisse.
- Échec bruyant : `state.json` reste intact, un X rouge apparaît dans l'onglet
  Actions, et l'avertissement de la page apparaît après 14 jours.

---

## Aperçu local

Ouvrir `index.html` directement affiche une bannière **« Aperçu seulement »**
avec des données d'exemple : les navigateurs bloquent `fetch()` sur `file://`.
C'est normal. Pour tester avec les vraies données :

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
