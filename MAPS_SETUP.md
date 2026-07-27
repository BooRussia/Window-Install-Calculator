# Google Maps — Address Picker Setup

The Job Address **Map** picker (Save Job, Job Details, Customers) uses the
**Google Maps JavaScript API** with Hybrid satellite + landmarks by default —
the same look as Google Maps on phone/desktop.

**Why Google (not Apple Maps)?** This app is a web PWA. Apple MapKit JS needs
an Apple Developer token endpoint and is weaker in non-Safari browsers. Google
Maps JavaScript API is the premium web standard; **Hybrid** mode gives the
Apple-like satellite + road/landmark labels contractors expect on job sites.

**Estimated time:** ~15 minutes once you have a Google Cloud billing account
(Maps has a monthly free credit; light picker usage is typically well under it).

---

## 1. Create / open a Google Cloud project

1. Go to <https://console.cloud.google.com/>
2. Create a project (or pick an existing one) — e.g. **Anchor Quoting**
3. Link a billing account (*APIs & Services* will prompt you if needed)

## 2. Enable the APIs

In **APIs & Services → Library**, enable:

| API | Why |
|-----|-----|
| **Maps JavaScript API** | Renders the interactive map |
| **Geocoding API** | Reverse-geocode pin → street address |

## 3. Create a browser API key

1. **APIs & Services → Credentials → Create credentials → API key**
2. Restrict the key:

**Application restrictions → HTTP referrers**

```
https://anchorquoting.com/*
https://www.anchorquoting.com/*
https://*.netlify.app/*
http://localhost/*
http://127.0.0.1/*
```

**API restrictions → Restrict key** to:

- Maps JavaScript API
- Geocoding API

3. Save. Copy the key (`AIza…`).

## 4. Give the app the key (pick one)

### Option A — Supabase secret (recommended)

Keeps the key out of git. The public `maps-config` edge function returns it to
the browser (safe **only** because of the referrer restrictions above).

```bash
supabase secrets set GOOGLE_MAPS_API_KEY=AIza...
supabase functions deploy maps-config
```

### Option B — Hard-code in `index.html`

Find:

```js
const GOOGLE_MAPS_API_KEY = "";
```

Paste the key between the quotes. Still keep Google Cloud referrer restrictions.

### Option C — Local override (dev)

In the browser console before opening the picker:

```js
window.__ANCHOR_GOOGLE_MAPS_KEY = "AIza...";
```

## 5. Smoke test

1. Open the app → **Save Job** (or Job Details / Customers) → **Map**
2. You should see Google **Hybrid** imagery with roads/landmarks
3. Toggle **Map** ↔ **Satellite**
4. Pan the gold pin → address preview updates → **Use this address** fills the field

If you see *“Google Maps isn’t configured yet”*, the key isn’t reaching the
client — re-check Option A/B and that `maps-config` is deployed.

---

## Cost notes

- Google Maps Platform bills per map load / geocode; new accounts get a monthly
  credit that covers typical quoting usage.
- Set a **budget alert** in Google Cloud → Billing.
- Do **not** ship an unrestricted key. Referrer + API restrictions are required.
