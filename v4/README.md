# Abundance 4.0 — P3 : deux comptes, un moteur (Canada)

Une page qui applique l'architecture finale **P3 / V1.0** (2026–2030) : deux comptes
enregistrés canadiens, un moteur de régime. Elle affiche le **régime en cours**
(BULL / NEUTRAL / BEARISH), le **score composite** P3, la **matrice du REER**, le
**cœur TFSA permanent**, une **calculatrice d'achat** et un **suivi
cible → réel → écart → action** pour les deux comptes.

Page publiée : <https://bernatferragut.github.io/abundance/v4/>

---

## L'architecture (conforme à l'ARC)

| Compte | Part | Rôle | Règle |
| ------ | ---- | ---- | ----- |
| **TFSA** | 60 % | Cœur **permanent** | Achats d'abord avec de l'argent neuf. Ventes rares et planifiées permises : 2–10 transactions/an restent du rééquilibrage aux yeux de l'ARC, pas du négoce actif. |
| **REER** | 40 % | Manche **tactique** | Moteur P3 hebdomadaire. Transactions illimitées (impôt payé au retrait). |

> **Pourquoi ce découpage ?** L'ARC considère le « négoce actif » dans un TFSA comme
> une activité d'entreprise : les gains seraient imposés à 100 %. Le TFSA achète donc
> la fondation et ne la vend presque jamais — quelques transactions par année (2–10)
> restent du simple rééquilibrage, parfaitement permis — quitte à subir 15 % de retenue
> américaine sur les dividendes. Le REER autorise le négoce actif et profite d'une
> retenue américaine de 0 % grâce au traité fiscal.

## 🟦 TFSA — Cœur permanent (60 % du portefeuille)

| Placement | % de la partie | % du total | Bande |
| --------- | -------------: | ---------: | :--- |
| VT        |             40 |         24 | 35–45 |
| GLDM      |             35 |         21 | 30–40 |
| IBIT      |             15 |          9 | 10–20 |
| SMH       |             10 |          6 | 7,5–12,5 |
| **Total** |        **100** |      **60** | |

Bandes vérifiées au trimestre (janv., avr., juil., oct.). Hors bande → **acheter**
le sous-pondéré avec de l'argent neuf ; sans argent neuf, ne rien faire. Maximum
**4 transactions par année**.

> **Retouche d'août 2026** : MCHI est retiré du cœur — **vendu une seule fois,
> délibérément** (une transaction planifiée par année reste du rééquilibrage, pas du
> négoce actif) — et le produit passe à GLDM (35). Dans le scénario du détroit de
> Taïwan, la Chine tombe la première et l'or est l'actif qui monte exactement quand
> ça arrive ; dans le régime Bessent (tarifs, fragmentation, déficits), MCHI était
> le maillon faible du permanent.

## 🟧 REER — Manche tactique (40 % du portefeuille)

Matrices par régime, en % de la manche (somme = 100 %).

| Placement | 🟢 BULL | 🟡 NEUTRAL | 🔴 BEARISH |
| --------- | ------: | ---------: | ---------: |
| VT        |      35 |         30 |         15 |
| GLDM      |      25 |         20 |         30 |
| SMH       |      15 |         10 |          0 |
| BCI       |      10 |         10 |         15 |
| AIPO      |      15 |         15 |          0 |
| SGOV      |       0 |         15 |         40 |
| **Total** |  **100** |      **100** |      **100** |

Contraintes dures :
- **TFSA : ventes rares** — rééquilibrage planifié seulement (2–10 transactions/an
  maximum), jamais de négoce actif.
- **REER : automatique** — aucune dérogation manuelle sauf le disjoncteur ATR.
- **Zéro SPCX (SpaceX) et zéro BSOL (Solana)** — liquidité d'ETF pure.
- **Reset annuel** : le 1er janvier, retour forcé de la manche au Neutral.
- **Repli** : données VPOC/VAL manquantes → Neutral + alerte.

## Comment entrer sur le marché

Personne ne peut prédire le marché — on entre donc **par étapes**, sans tout miser d'un coup :
**25 % maintenant, 25 % plus tard, 50 % d'ici janvier 2027**.

| Étape | Quand | Combien | Où | Condition |
| ----- | ----- | ------: | -- | --------- |
| 1 | Maintenant | 25 % | CELI (cœur) | Immédiat |
| 2 | Oct – Nov | 25 % | REER (tactique) | Baisse ≥ 10 % ou peur faible |
| 3 | Déc – Janv. | 50 % | Les deux comptes | Au plus tard le 1er janvier |

**Frein d'urgence :** si le disjoncteur ATR se déclenche (volatilité de VT > 25 %), on met le
déploiement en pause jusqu'à ce que la volatilité redescende sous 20 %.

## Le moteur de signal (`gate_engine`)

Le rulebook décrit un moteur Python (`gate_engine.py`) sur un cluster local de
Mac mini M4. Ce dépôt contient un **port Node sans dépendance**
([`v4/scripts/gate_engine.mjs`](scripts/gate_engine.mjs)) qui tourne dans GitHub
Actions et publie [`v4/state.json`](state.json) pour la page.

Séquence (évaluation hebdomadaire, clôture du vendredi) :

1. **A · Gate macro** : ROC 4 semaines de Cuivre/Or et HYG/IEF → `Macro_Score` 0–30.
2. **B · Hull** : HMA hebdomadaire sur VT, pente hausse/baisse → biais +10 / −10.
3. **C · Volume Profile** : VPOC / VAL sur les barres hebdo de VT → +15 / 0 / −15.
4. **D · Ajustements** : VIX (−15/0/+5) et courbe 10Y−3M (−10/0/+5).

Score brut (min −50, max +65) → **normalisé 0–100**. Machine d'état :
- score ≥ 70 → **BULL**
- 40 ≤ score < 70 → **NEUTRAL**
- score < 40 → **BEARISH**

**Disjoncteur ATR** (14 j annualisé sur VT) : > 25 % → force **NEUTRAL** ;
> 40 % → force **BEARISH**. Il s'applique immédiatement, sans attendre le vendredi.

**Disjoncteur de taux** : le 10 ans US au-dessus de **5,00 %** pendant deux
fermetures → le régime est plafonné à **NEUTRAL** (jamais BULL). Réarmement sous
4,75 %. Défensif seulement : dans un régime de déficits permanents, la crise des
taux longs survient souvent pendant que les actions sont encore au-dessus de leur
tendance — là où le score composite est aveugle.

> **Note de conception** : le rulebook annonce un score « 0–100 » mais ses plages de
> composantes donnent un brut entre −50 et +65. Pour respecter les seuils 70 / 40,
> le port normalise : `score = (brut + 50) / 115 × 100`.

## Données utilisées (gratuites, sans clé)

| Donnée | Source |
| ------ | ------ |
| OHLCV des ETF (VT, GLDM, IBIT, SMH, AIPO, BCI, SGOV) | Yahoo Finance |
| Cuivre (`HG=F`), Or (`GC=F`), HYG, IEF | Yahoo Finance |
| VIX (`^VIX`), 10Y (`^TNX`), 3M (`^IRX`) | Yahoo Finance |

## Le fichier `state.json`

```json
{
  "regime": "BULL",
  "actionRequise": true,
  "prix": { "VT": 162.25, "GLDM": 86.58, "IBIT": 35.63,
            "SMH": 587.82, "AIPO": 30.93, "BCI": 24.55, "SGOV": 100.56 },
  "composite": {
    "score": 82, "brut": 44,
    "macroScore": 9.2, "hullBias": 10, "vpocScore": 15,
    "vixAdjust": 5, "yieldAdjust": 5,
    "macro": { "copperGold": 0.001, "hygIef": 0.857, "cuivreOrRoc4s": -8.7,
               "hygIefRoc4s": 0.93, "cuOrScore": 0, "hygIefScore": 9.2 },
    "hull": { "hma": 159.33, "hmaAvant4s": 159.29, "pente": "hausse", "hullBias": 10 },
    "vpoc": { "vpoc": 142.62, "val": 125.62, "vah": 158.59, "prix": 162.25,
              "position": "risqueON", "vpocScore": 15 },
    "vix": 15.78,
    "courbe": { "t10": 4.74, "t3": 3.71, "ecartPct": 1.02 }
  },
  "atr": { "pctAnnualise": 15.89, "actif": false, "force": null },
  "disjoncteurTaux": { "actif": false, "taux": 4.74, "date": "2026-08-21", "indisponible": false },
  "cibles": { "BULL": { }, "NEUTRAL": { }, "BEARISH": { } },
  "comptes": {
    "tfse": {
      "pct": 60,
      "cible": { "VT": 40, "GLDM": 35, "IBIT": 15, "SMH": 10 },
      "bandes": { "VT": [35, 45], "GLDM": [30, 40], "IBIT": [10, 20],
                  "SMH": [7.5, 12.5] }
    },
    "reer": { "pct": 40, "cibles": { "BULL": { }, "NEUTRAL": { }, "BEARISH": { } } }
  },
  "fallback": false,
  "resetAnnuel": false
}
```

| Champ | Rôle |
| ----- | ---- |
| `regime` | `"BULL"`, `"NEUTRAL"` ou `"BEARISH"`. Surligne la colonne du REER à suivre. |
| `actionRequise` | `true` → « Quelque chose a changé ». `false` → « Ne rien faire ». |
| `prix` / `prixDate` | Prix de clôture pour la calculatrice et le suivi. |
| `composite` | Sous-scores (macro, hull, VPOC, VIX, courbe) + score normalisé. |
| `atr` | Disjoncteur ATR : % annualisé et éventuel forçage (`force`). |
| `disjoncteurTaux` | Disjoncteur de taux : 10 ans US > 5,00 % → plafond NEUTRAL. |
| `comptes.tfse` | Cœur permanent : cible fixe + bandes, % de la partie (60 %). |
| `comptes.reer` | Manche tactique : matrices par régime, % de la manche (40 %). |
| `fallback` / `resetAnnuel` | Drapeaux d'alerte (repli de sécurité / reset du 1er janvier). |

Le moteur met à jour toutes ces valeurs sauf `note`. Après avoir fait les
transactions, remets `actionRequise` à `false` — la seule étape manuelle du
fonctionnement normal.

## Publication (GitHub Pages)

Le site est servi depuis la branche `main` (dossier `v4/`). Le workflow
[`.github/workflows/deploy-v4.yml`](../.github/workflows/deploy-v4.yml) :

- s'exécute **chaque jour à 02:30 UTC** (prix quotidiens) et à chaque poussée sur
  la branche **`v.4.0`** (source de vérité du dossier `v4/`) ;
- lance `node v4/scripts/gate_engine.mjs` — le **régime ne change que le samedi**
  (clôture du vendredi), sauf disjoncteur ATR ;
- synchronise `v4/` vers `main`, ce qui publie la page :
  <https://bernatferragut.github.io/abundance/v4/>.

### Mise en place initiale (une seule fois)

1. Pousser ce dépôt (le workflow doit exister sur `main` pour le déclencheur
   `schedule`).
2. Créer la branche source depuis le même état :

   ```bash
   git checkout -b v.4.0
   git push origin v.4.0
   ```

3. Vérifier que **GitHub Pages** est activé sur le dépôt : Settings → Pages →
   Source : **Deploy from a branch** → branche **`main`** → `/ (root)`.

## Exécution locale

Ouvrir `v4/index.html` directement affiche des données d'exemple (les navigateurs
bloquent `fetch()` sur `file://`). Pour tester avec les vraies données :

```bash
python3 -m http.server 8000    # puis http://localhost:8000/v4/
```

Pour recalculer le signal localement (Node 20+) :

```bash
JOUR_SIGNAL=1 node v4/scripts/gate_engine.mjs
```

## Architecture cible (rulebook P3, cluster local)

Le portail GitHub Pages est la version publique. L'exécution réelle du rulebook
s'appuie sur un cluster local de Mac mini M4 :

- **Data Ingestion** (Python) : OHLCV, ratios macro, VIX.
- **Signal Engine** (`gate_engine.py`) : le même calcul, en Python.
- **Execution Routing** : **TFSA** = ordres manuels/planifiés (2–10/an, ventes
  rares et délibérées) ; **REER** = ordres delta automatisés via IBKR (illimité).
- **Surveillance** : logs vers un serveur MCP, LLM local qui alerte sur whipsaw
  (BULL ↔ BEARISH > 3 fois en 6 semaines), glissement cumulé du REER > 0,50 %,
  tentative de vente TFSA (ne devrait jamais arriver).

---

Plan familial personnel. Ce n'est pas un conseil financier professionnel.
