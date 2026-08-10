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

## Le disjoncteur de crédit

Une **troisième règle** qui passe avant les deux autres.

Le robot récupère l'écart de crédit haut rendement (ICE BofA US High Yield OAS,
série FRED `BAMLH0A0HYM2` — quotidien, gratuit, sans clé). Si l'écart dépasse sa
moyenne 200 jours de **plus de 50 %** pendant **deux fermetures**, le plan bascule
en **Réglage Y immédiatement**, sans attendre le samedi. Réarmement sous **1,20 fois**.

Une bannière rouge apparaît alors en haut de la page.

**Pourquoi cette exception à la règle hebdomadaire ?** Parce que le disjoncteur ne
peut faire qu'une chose : mettre à l'abri. Il ne peut jamais forcer le Réglage X.
Une exception qui ne va que vers la sécurité ne peut pas augmenter le risque.

**Pourquoi la moyenne 200 et pas 100 ou 150 ?** Testé sur quatre scénarios :

| Scénario | MM50 | MM100 | MM150 | MM200 |
|---|---|---|---|---|
| Choc soudain | +6 j | +6 j | +6 j | +6 j |
| Détérioration lente | jamais | jamais | jamais | +121 j |
| Accumulation puis explosion | +16 j | +9 j | +4 j | **−47 j** |

Lors d'un choc soudain, la longueur de la moyenne ne change **rien** : l'écart
traverse n'importe quelle moyenne instantanément. Lors d'une détérioration lente,
une moyenne courte **suit l'écart vers le haut** et ne se déclenche jamais. Les
écarts de crédit reviennent vers leur moyenne au lieu de suivre une tendance —
c'est l'inverse des actions, d'où l'intuition trompeuse.

Le levier utile est le **seuil**, pas la longueur : à +30 % une fausse alerte
passagère déclenche l'alarme ; à +50 % aucune fausse alerte, et le choc soudain
est quand même attrapé.

Si FRED est injoignable, l'état précédent du disjoncteur est conservé et un
avertissement apparaît dans le journal.

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
- **Validation des prix** : rejette les variations de plus de 50 % en une
  journée (probablement une erreur de données) et prévient au-delà de 20 %.
  Conserve l'ancien prix si la validation échoue.
- `actionRequise` ne redevient jamais `false` tout seul. Le robot lève le
  drapeau ; seul un humain le baisse.
- Échec bruyant : `state.json` reste intact, un X rouge apparaît dans l'onglet
  Actions, et l'avertissement de la page apparaît après 14 jours.

### Notifications automatiques

Quand le réglage change et que `actionRequise` devient `true`, le workflow crée
automatiquement une **issue GitHub** avec :
- Le nouveau réglage (X ou Y)
- La date du changement
- Les étapes à suivre pour ajuster le REER
- Les rappels importants (ne jamais négocier dans le CELI, etc.)

**Pour recevoir les notifications :**
1. **Settings → Notifications** dans ton profil GitHub
2. Activer les notifications pour **Issues** sur ce dépôt
3. Choisir ton mode préféré : email, mobile, ou web

Tu peux aussi consulter l'onglet **Issues** du dépôt à tout moment pour voir
s'il y a une action en attente. Ferme l'issue une fois les transactions
complétées et `actionRequise` remis à `false`.

---

## Calculatrice et onglet Suivi

**Calculatrice d'achat** (onglet Plan) — entrer le montant disponible dans chaque
compte ; deux colonnes apparaissent avec le montant en dollars et le nombre
d'actions à acheter. Les actions sont arrondies **vers le bas** et le reste non
investi est affiché.

**Onglet Suivi** — entrer le nombre d'actions détenues pour voir la valeur du
portefeuille, la répartition réelle contre la cible, et l'écart. Un écart de plus
de 25 % s'affiche en rouge.

> **Tout reste dans le navigateur** (`localStorage`). Aucun montant, aucun solde
> et aucune donnée personnelle n'est publié dans le dépôt. Le bouton
> « Tout effacer » vide ces données.

Les prix viennent de `state.json`, rafraîchis **chaque jour** par le robot. Le
**réglage**, lui, ne peut changer que le **samedi** : les prix quotidiens servent
au suivi, jamais à devancer la règle du vendredi. Si les prix datent de plus de
10 jours, un avertissement apparaît au-dessus des tableaux.

**Pourquoi pas du temps réel ?** Yahoo bloque les appels directs depuis un
navigateur, donc les prix passent forcément par le robot. Et c'est tant mieux :
regarder son portefeuille tous les jours pousse à réagir, et réagir coûte cher.

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
