# Abundance 4.0 — P3 : le plan du point de contrôle

Une page qui applique le **rulebook P3** (2026–2030) : elle affiche le **régime en
cours** (BULL / NEUTRAL / BEARISH), le **score composite** du moteur, la **matrice
d'allocation** du régime, une **calculatrice d'achat** et un **suivi
cible → réel → écart → action**.

Page publiée : <https://bernatferragut.github.io/abundance/v4/>

---

## Les trois régimes (règle d'or : le point de contrôle)

Le **Neutral (POC)** est le centre structurel. Les déviations Bull / Bearish sont
tactiques, temporaires et moyenne-réversives. Chaque **1er janvier**, retour forcé
au Neutral.

| Placement | 🟢 BULL | 🟡 NEUTRAL | 🔴 BEARISH |
| --------- | ------: | ---------: | ---------: |
| VT        |      35 |         30 |         20 |
| GLDM      |      10 |         15 |         30 |
| IBIT      |      15 |         10 |          5 |
| SMH       |      15 |         10 |          0 |
| BSOL      |      10 |          5 |          0 |
| MCHI      |      10 |         10 |          5 |
| BCI       |       5 |          5 |         10 |
| SGOV      |       0 |         15 |         30 |
| **Total** |  **100** |      **100** |      **100** |

Contraintes dures (rulebook §7) :
- **Zéro SPCX** (SpaceX) — explicitement exclu.
- **BSOL plafonné** : 10 % max (Bull), 5 % (Neutral), 0 % (Bearish).
- **SGOV plafonné à 30 %** en Bearish.
- **SMH et BSOL à 0** en Bearish (circuit coupé).
- Repli : données VPOC/VAL manquantes → **Neutral** + alerte.

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

> **Note de conception** : le rulebook annonce un score « 0–100 » mais ses plages de
> composantes donnent un brut entre −50 et +65. Pour respecter les seuils 70 / 40,
> le port normalise : `score = (brut + 50) / 115 × 100`.

## Données utilisées (gratuites, sans clé)

| Donnée | Source |
| ------ | ------ |
| OHLCV des ETF (VT, GLDM, IBIT, SMH, BSOL, MCHI, BCI, SGOV) | Yahoo Finance |
| Cuivre (`HG=F`), Or (`GC=F`), HYG, IEF | Yahoo Finance |
| VIX (`^VIX`), 10Y (`^TNX`), 3M (`^IRX`) | Yahoo Finance |

## Le fichier `state.json`

```json
{
  "regime": "BULL",
  "actionRequise": true,
  "prix": { "VT": 162.25, "GLDM": 86.58, "IBIT": 35.63, "SMH": 587.82,
            "BSOL": 10.24, "MCHI": 54.63, "BCI": 24.55, "SGOV": 100.56 },
  "composite": {
    "score": 82, "brut": 44,
    "macroScore": 9, "hullBias": 10, "vpocScore": 15,
    "vixAdjust": 5, "yieldAdjust": 5,
    "macro": { "copperGold": 0.001, "hygIef": 0.857, "cuivreOrRoc4s": -8.62,
               "hygIefRoc4s": 0.8, "cuOrScore": 0, "hygIefScore": 9 },
    "hull": { "hma": 159.33, "hmaAvant4s": 159.29, "pente": "hausse", "hullBias": 10 },
    "vpoc": { "vpoc": 142.62, "val": 125.62, "vah": 158.59, "prix": 162.25,
              "position": "risqueON", "vpocScore": 15 },
    "vix": 15.74,
    "courbe": { "t10": 4.74, "t3": 3.71, "ecartPct": 1.02 }
  },
  "atr": { "pctAnnualise": 15.89, "actif": false, "force": null },
  "cibles": { "BULL": { }, "NEUTRAL": { }, "BEARISH": { } },
  "fallback": false,
  "resetAnnuel": false
}
```

| Champ | Rôle |
| ----- | ---- |
| `regime` | `"BULL"`, `"NEUTRAL"` ou `"BEARISH"`. Surligne la colonne à suivre. |
| `actionRequise` | `true` → « Quelque chose a changé ». `false` → « Ne rien faire ». |
| `prix` / `prixDate` | Prix de clôture pour la calculatrice et le suivi. |
| `composite` | Sous-scores (macro, hull, VPOC, VIX, courbe) + score normalisé. |
| `atr` | Disjoncteur ATR : % annualisé et éventuel forçage (`force`). |
| `cibles` | Les trois matrices d'allocation P3. |
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
- **Execution Routing** : TradFi via IBKR (VT, GLDM, MCHI, SMH, BCI, SGOV) ;
  crypto via TypeScript + Jupiter (IBIT spot-check, BSOL avec profondeur 1 %
  contrôlée — commande > 30 % de la profondeur → 3 swaps espacés d'une heure).
- **Surveillance** : logs vers un serveur MCP, LLM local qui alerte sur whipsaw
  (BULL ↔ BEARISH > 3 fois en 6 semaines), glissement cumulé > 0,50 %,
  échec de swap BSOL.

---

Plan familial personnel. Ce n'est pas un conseil financier professionnel.
