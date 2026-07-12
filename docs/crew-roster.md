# Crew roster — per-person labor cost

**Branch:** `cursor/crew-roster-labor-ef1d`  
**Date:** July 12, 2026

## Problem

Setup wizard Step 3 asked for a single **crew pay rate ($/hr · per installer)**. Real crews rarely pay everyone the same, and employer **workers' compensation** is a material burden on labor cost that the flat model ignored.

## Model

```
DATA.config.crew = {
  members: [
    {
      id, name, role, avatar,   // avatar = data URL (on-device)
      hourlyRate,               // wage $/hr
      workersCompPct,           // employer WC premium as % of wages
      active                    // include in quote crew
    }
  ],
  defaultWorkersCompPct: 10     // suggested for new rows
}
```

**Loaded rate** = `hourlyRate × (1 + workersCompPct / 100)`  

**Crew cost / hr** =
- If ≥1 **active** member → `Σ loaded rates` (roster mode)
- Else → legacy `crewSize × crewPayRatePerHr` (flat mode)

Labor quote line unchanged: `crew-hours × crewCostPerHr`, then job markup.

## Surfaces

| Surface | Behavior |
|---------|----------|
| **Settings → Rates → Crew** | **Simple crew pay** (size × $/hr) + optional **roster** (name, role, photo, wage, WC %) |
| **Settings → Rates → Labor** | Install speed, setup/travel time, high-rise efficiency only — no pay fields |
| **Setup wizard Step 3** | Mini list (name + $/hr); WC/photos deferred to Settings |
| **Labor Detail card** | Shows loaded $/hr + per-person lines in roster mode; Adjust → Crew |

When the roster has ≥1 active member, simple crew pay is disabled (banner on the Crew tab).

## Out of scope (later)

- Per-job crew assignment (subset of roster on a specific job)
- Additional burden (FICA, PTO accrual, vehicle) beyond WC
- Cloud-synced crew photos in Storage (today: local settings blob, same as company logo)
- Linking to the separate job-tracker `crew_members` schema

## Verify

1. Empty roster → Labor Detail still shows `2 × $30 = $60/hr`
2. Add two people at different wages + WC → loaded sum drives quote
3. Uncheck “Include in quote crew” → falls out of the sum
4. Setup wizard: add two names → complete → Settings → Crew populated with default WC %
5. Restore Defaults clears roster
