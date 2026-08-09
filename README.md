# Our Plan — family status page

A one-page site that tells the family exactly one thing: **do nothing**, or
**here is what changed**.

Only you ever edit it. They only ever read it.

---

## Put it online (5 minutes, free)

1. Create a **public** GitHub repo, e.g. `our-plan`.
2. Upload `index.html` and `state.json` to the root.
3. Repo → **Settings** → **Pages** → Source: **Deploy from a branch** →
   Branch `main`, folder `/ (root)` → **Save**.
4. Wait ~1 minute. It's live at
   `https://<your-username>.github.io/our-plan/`
5. Send them the link. Tell them to bookmark it / add to home screen.

> The repo must be public for free GitHub Pages. Nothing private is on the
> page — no balances, no dollar amounts, no account numbers, no names. Only
> percentages and tickers. **Keep it that way.**

---

## Updating it — the only file you touch

`state.json`:

```json
{
  "setting": "X",
  "actionNeeded": false,
  "changedOn": "2026-07-15",
  "checkedOn": "2026-08-09",
  "note": ""
}
```

| Field | What it does |
|---|---|
| `setting` | `"X"` or `"Y"`. Highlights that column in the RRSP table. |
| `actionNeeded` | `true` → page says **"Something changed"**. `false` → **"Do nothing"**. |
| `changedOn` | Date the setting last flipped. Display only. |
| `checkedOn` | **Update this every time you check.** Drives the stale warning. |
| `note` | Optional message. Leave `""` to hide the box. |

The page also carries the full strategy in a collapsible **"How the whole plan works"**
section, so the reasoning travels with the instructions. Nobody has to find the PDF.

You can edit it on your phone: open the file on github.com, tap the pencil,
change the value, commit. Live in about a minute.

### Weekly routine

- **Nothing changed:** update `checkedOn` to today. Commit. Done.
- **Signal flipped:** set `setting`, set `actionNeeded` to `true`, update both
  dates. Commit.
- **They've done the trades:** set `actionNeeded` back to `false`.

---

## Automatic updates (recommended)

`.github/workflows/update-signal.yml` runs every **Saturday 02:00 UTC**
(Friday ~22:00 ET, after the US close), fetches SMH and GLD from Yahoo Finance,
computes the signal, and commits `state.json`. You do nothing.

**Why not compute it in the browser?** Yahoo does not send CORS headers, so a
page cannot fetch it directly. The usual workaround is a third-party CORS proxy
— which means the family page breaks (or shows a wrong verdict) whenever that
proxy is down, rate-limited, or compromised. A GitHub Action runs server-side:
no CORS, no key, no third party.

### Turn it on

1. Repo → **Settings** → **Actions** → **General** → Workflow permissions →
   **Read and write permissions** → Save.
2. Repo → **Actions** → **Update signal** → **Run workflow** (test it by hand
   the first time and read the log).
3. After that it runs itself, weekly.

The log prints the setting, the distance to the moving average, whether SMH is
above its own average, and any pending flip.

### Safety behaviour

- **Prices older than 7 days → refuses to write.** Stale data never becomes a
  verdict.
- **Retries 3× with backoff** before failing.
- **Uses adjusted closes**, so a stock split cannot corrupt the 200-day average
  and manufacture a false flip.
- **`actionNeeded` stays `true` until a human clears it.** The bot can raise the
  flag; only you can lower it — after the trades are actually done.
- **Fails loudly.** A broken run leaves the old `state.json` untouched and shows
  a red X in the Actions tab. The page's stale warning appears after 14 days.

### Clearing the flag

Once you've made the trades, edit `state.json` and set `"actionNeeded": false`.
That's the only manual step.

### Changing the signal

Edit the `CFG` block at the top of `scripts/signal.mjs`. Change it in the PDF too.

---

## Local preview

Opening `index.html` directly shows a **"Preview only"** banner with sample data
— browsers block `fetch()` on `file://`. This is expected and not a bug. To
preview with real data, run a local server:

```bash
python3 -m http.server 8000    # then open http://localhost:8000
```

On the live GitHub Pages site it always reads the real `state.json`.

---

## Safety behaviour built in

- **Stale guard** — if `checkedOn` is more than 14 days old, a red banner
  appears: *"This page hasn't been checked in N days. Ask before acting."*
  So if you're ill, travelling, or gone, the page says so instead of quietly
  showing an old answer.
- **Fail loud** — if `state.json` can't be read, it shows an error and says
  *"Do nothing until you can ask."* It never renders a blank or a guess.
- **Safe default** — an invalid `setting` value falls back to X rather than
  breaking.
- **Cache-busted fetch** — they always see the current file, not a stale copy.

---

## Changing the numbers

The two tables are plain HTML in `index.html`. Search for `TFSA account` or
`RRSP account` and edit the rows.

**If you change a percentage, change it in the PDF too.** Two sources of truth
that disagree is worse than either one alone.

---

Not professional financial advice.
