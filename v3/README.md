# Abundance 3.0 — Calculatrice d'achat

Une page très simple : on entre l'argent à investir, elle calcule le nombre
d'actions à acheter pour chaque placement. **Pas de REER, pas de CELI, pas de
signal** — juste la calculatrice.

## Le plan (100 %)

| Placement | %  | Ce que c'est |
| --------- | -- | ------------ |
| IBIT      | 25 | Bitcoin — iShares Bitcoin Trust |
| GLDM      | 25 | Or — SPDR Gold MiniShares |
| SPCX      | 25 | SpaceX — Space Exploration Technologies |
| MCHI      | 10 | Chine — iShares MSCI China |
| BSOL      | 5  | Solana — Bitwise Solana Staking ETF |
| BCI       | 10 | Matières premières — abrdn All Commodity |
| **Total** | **100** | |

## Comment ça marche

- Le montant total est réparti selon les pourcentages ci-dessus.
- Les prix viennent de `state.json` (mis à jour par le robot) et peuvent être
  corrigés à la main dans la page.
- Actions arrondies **vers le bas** ; le reste non investi est affiché.

## Le fichier `state.json`

```json
{
  "prix": { "IBIT": 36.42, "GLDM": 87.45, "SPCX": 146.23, "MCHI": 55.06, "BSOL": 10.37, "BCI": 24.94 },
  "prixDate": "2026-08-17",
  "verifieLe": "2026-08-17"
}
```

## Mise à jour des prix

Le workflow `.github/workflows/deploy-v3.yml` :
- s'exécute chaque **jour à 02:10 UTC** (et à chaque poussée sur la branche `v.3.0`) ;
- lance `node v3/scripts/fetch-prices.mjs` (Yahoo Finance, sans dépendance) ;
- synchronise le dossier `v3/` vers `main`, ce qui publie la page :
  `https://bernatferragut.github.io/abundance/v3/`

## Développement

La source vit sur la branche **`v.3.0`** (dossier `v3/`). Ouvrir `v3/index.html`
localement affiche des prix d'exemple (le navigateur bloque `fetch()` sur
`file://`). Pour tester avec les vraies données :

```bash
python3 -m http.server 8000    # puis http://localhost:8000/v3/
```

## Modifier les pourcentages

Les pourcentages sont dans `v3/index.html` (constante `CIBLE`, lignes du
tableau). Si un pourcentage change, changer les deux.

---

Plan familial personnel. Ce n'est pas un conseil financier professionnel.
