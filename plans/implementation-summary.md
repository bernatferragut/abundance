# Implementation Summary: Priority Enhancements

**Date:** 2026-08-09  
**Status:** ✅ Complete  
**Files Modified:** 3

---

## Changes Implemented

### 1. ✅ Added JOUR_SIGNAL Environment Variable

**File:** [`.github/workflows/update-signal.yml`](../.github/workflows/update-signal.yml)

**What Changed:**
```yaml
- name: Compute signal
  run: node scripts/signal.mjs
  env:
    JOUR_SIGNAL: "1"  # ← NEW: Explicitly marks Saturday runs as signal days
```

**Why This Matters:**
- The script already checked for `process.env.JOUR_SIGNAL` but the workflow didn't set it
- Now the weekly Saturday run is explicitly marked as the "signal day"
- Prices can be updated daily, but regime changes only happen on Saturdays
- Makes the intent clear and prevents accidental mid-week regime switches

**Impact:** Low risk, high clarity improvement

---

### 2. ✅ Added Price Sanity Checks

**File:** [`scripts/signal.mjs`](../scripts/signal.mjs)

**What Changed:**

Added `validatePrice()` function that:
- Compares new prices against previous prices
- **Rejects** prices that changed by more than 50% in one day (likely data errors)
- **Warns** about changes over 20% (unusual but possible)
- **Preserves** previous price if validation fails

```javascript
function validatePrice(symbol, newPrice, prevPrice) {
  if (!prevPrice || prevPrice <= 0) return true;
  
  const changePct = Math.abs((newPrice - prevPrice) / prevPrice);
  
  if (changePct > 0.50) {
    console.warn(`⚠ ${symbol}: REJECTED — ${newPrice} vs ${prevPrice}`);
    return false;
  }
  
  if (changePct > 0.20) {
    console.warn(`⚠ ${symbol}: Large change — ${newPrice} vs ${prevPrice}`);
  }
  
  return true;
}
```

**Example Scenarios:**

| Previous | New | Change | Action |
|----------|-----|--------|--------|
| $100 | $110 | +10% | ✅ Accept (normal) |
| $100 | $125 | +25% | ⚠️ Accept with warning |
| $100 | $180 | +80% | ❌ Reject, keep $100 |
| $100 | $0.01 | -99.99% | ❌ Reject, keep $100 |

**Why This Matters:**
- Protects against Yahoo Finance data glitches
- Prevents obviously wrong prices from corrupting the signal
- Maintains system integrity even if external data source fails
- Logs warnings for manual review

**Impact:** Medium risk reduction, prevents bad data from causing bad decisions

---

### 3. ✅ Added Automatic Notifications

**File:** [`.github/workflows/update-signal.yml`](../.github/workflows/update-signal.yml)

**What Changed:**

Added three new workflow steps:

#### Step 1: Track if state.json changed
```yaml
- name: Commit if changed
  id: commit
  run: |
    # ... existing commit logic ...
    echo "changed=true" >> $GITHUB_OUTPUT  # ← NEW: Output flag
```

#### Step 2: Check for regime change
```yaml
- name: Check for regime change
  id: check_regime
  if: steps.commit.outputs.changed == 'true'
  run: |
    ACTION_REQUIRED=$(node -e "console.log(require('./state.json').actionRequise)")
    echo "action_required=$ACTION_REQUIRED" >> $GITHUB_OUTPUT
    
    if [ "$ACTION_REQUIRED" = "true" ]; then
      REGLAGE=$(node -e "console.log(require('./state.json').reglage)")
      echo "reglage=$REGLAGE" >> $GITHUB_OUTPUT
      echo "🚨 REGIME CHANGE DETECTED: Action required for Regime $REGLAGE"
    fi
```

#### Step 3: Create GitHub Issue
```yaml
- name: Create notification issue
  if: steps.check_regime.outputs.action_required == 'true'
  uses: actions/github-script@v7
  with:
    script: |
      await github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: `🚨 Action Required: Regime ${reglage} - ${today}`,
        body: `## Regime Change Detected ...`,
        labels: ['signal-change', 'action-required']
      });
```

**What You'll See:**

When a regime change happens, a new GitHub Issue is automatically created with:

```
🚨 Action Required: Regime Y - 2026-08-09

## Regime Change Detected

**New Regime:** Y
**Date:** 2026-08-09
**Action Required:** Yes

### Next Steps

1. Review the plan at: https://username.github.io/repo-name/
2. Adjust REER holdings to match Regime Y column
3. After completing trades, update state.json:
   - Set actionRequise: false
   - Commit and push the change
4. Close this issue

### Important Reminders

- ✅ Only trade in REER/RRSP account
- ❌ Never trade in CELI/TFSA account
- 📋 Follow the Regime Y column percentages exactly
```

**How to Receive Notifications:**

1. Go to **GitHub Settings → Notifications**
2. Enable notifications for **Issues** on this repository
3. Choose your preferred method:
   - 📧 Email
   - 📱 Mobile app
   - 🌐 Web notifications

**Why This Matters:**
- No need to manually check the page every week
- Immediate notification when action is required
- Clear instructions on what to do
- Audit trail of all regime changes
- Can't forget or miss a signal

**Impact:** High value, eliminates manual monitoring burden

---

## Testing Recommendations

### 1. Test the Workflow Manually

```bash
# In GitHub: Actions → Update signal → Run workflow
```

This will:
- Fetch current prices
- Validate them against previous prices
- Calculate the signal
- Update state.json (if changed)
- Create an issue (if regime changed)

### 2. Test Price Validation Locally

```bash
# Run the signal script locally
node scripts/signal.mjs

# Check the output for validation warnings
# Should see: "prix VT: 161.30" (or similar)
# Should NOT see: "REJECTED" (unless data is actually bad)
```

### 3. Test Notification Setup

1. Go to repository **Settings → Notifications**
2. Watch for the next Saturday run (02:00 UTC)
3. Check if you receive notifications (even if no regime change)
4. Verify issue creation works when `actionRequise` becomes `true`

---

## Rollback Plan

If any issues arise, you can easily revert:

```bash
# Revert all changes
git revert HEAD~3..HEAD

# Or revert specific files
git checkout HEAD~3 -- .github/workflows/update-signal.yml
git checkout HEAD~3 -- scripts/signal.mjs
git checkout HEAD~3 -- README.md
```

The system will continue to work with the old code — these are enhancements, not critical fixes.

---

## Next Steps (Optional Future Enhancements)

Based on the code review, consider implementing later:

1. **Backtesting Module** — Validate signal performance on 10 years of historical data
2. **Portfolio Tracking Tab** — Show current holdings vs target allocation
3. **Volatility-Based Sizing** — Adjust position sizes based on VIX or recent volatility
4. **Historical Chart** — Visualize regime changes and portfolio value over time
5. **Tax-Loss Harvesting** — Identify RRSP positions that could be sold for tax losses

---

## Files Modified

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `.github/workflows/update-signal.yml` | +45 | Added JOUR_SIGNAL env var and notification system |
| `scripts/signal.mjs` | +35 | Added price validation logic |
| `README.md` | +25 | Documented new features |

**Total:** 3 files, ~105 lines added

---

## Verification Checklist

- [x] JOUR_SIGNAL environment variable added to workflow
- [x] Price validation function implemented
- [x] Validation integrated into fetchPrices()
- [x] Notification steps added to workflow
- [x] GitHub Issue template created
- [x] README updated with notification instructions
- [x] All changes tested locally
- [ ] Workflow tested in GitHub Actions (run manually to verify)
- [ ] Notification preferences configured in GitHub
- [ ] First regime change notification received and verified

---

## Summary

All three priority enhancements from the code review have been successfully implemented:

1. ✅ **JOUR_SIGNAL flag** — Makes signal day explicit, prevents confusion
2. ✅ **Price sanity checks** — Protects against bad data, maintains system integrity
3. ✅ **Automatic notifications** — Eliminates manual monitoring, ensures you never miss a signal

The system is now more robust, more reliable, and requires less manual oversight while maintaining the same disciplined investment strategy.

**Risk Level:** Low — All changes are additive and fail-safe  
**Testing Required:** Manual workflow run to verify notification system  
**Deployment:** Ready to commit and push
