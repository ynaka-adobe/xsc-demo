# XSC Demo — Adobe Analytics Tagging Spec

**Site:** `xsc-demo.ynaka-adobe.com` (future: `xsc-demo.adobe.com`)
**Blocks repo:** `github.com/ynaka-adobe/xsc-demo` (Edge Delivery Services / Document Authoring)
**Collection method:** Direct AppMeasurement (no Launch/Tags)
**Prepared for:** Yuji Nakagawa — review draft, code to follow on approval

> This is a design/spec document. No code is committed yet. Once you approve the
> variable contract, trigger rules, and data-layer design below, I'll produce the
> EDS script/block files ready to drop into the repo.

---

## 0. Open items to confirm before coding

1. **Report Suite ID(s)** — not yet provided. Need the production RSID (and ideally a
   dev/QA RSID for a staged rollout). Everything below is RSID-agnostic until you supply it.
2. **Tracking server** — AppMeasurement needs `s.trackingServer` (and
   `s.trackingServerSecure`). Recommend a first-party CNAME (e.g. `metrics.adobe.com`
   or a `smetrics.*` collection domain tied to the RSID) so cookies survive the
   `ynaka-adobe.com` → `adobe.com` domain move. Confirm what your Analytics admin set up.
3. **"Attribution/credit" meaning (Section 7)** — I've assumed marketing-channel/campaign
   attribution via a tracking code so Experience League traffic is credited back to the
   demo program. Confirm that's what "claim credit through attribution" means, vs.
   contributor credit on Experience League itself (a different, editorial process).
4. **Access eVars (Section 6)** — confirmed you want them; confirm the two values you'd
   use for the tier dimension ("employee" / "customer-guest") and whether the demo access
   code can be stored as-is or should be hashed/aliased for privacy.

---

## 1. Variable contract (the shared spec)

This is the single source of truth every demo reuses, so all report suites line up with
the Workspace in your build guide. **Do not renumber these per demo** — consistency here is
what makes cross-demo reporting work.

### 1.1 Success events

| Event | Name | Fires when | Type / polarity |
|-------|------|-----------|-----------------|
| event1 | Component Impression | A tracked block scrolls ≥50% into viewport (once per instance per page) | Counter, Up |
| event2 | CTA Click | User clicks a CTA/button inside a tracked block | Counter, Up |
| event3 | Download | User clicks a link to a downloadable asset (pdf, zip, doc(x), ppt(x), xls(x), mp4, …) | Counter, Up |
| event4 | Form Start | First field interaction (focus) on a form | Counter, Up |
| event5 | Form Submit | Form submit succeeds | Counter, Up |
| event6 | Scroll Milestone | User crosses a scroll-depth threshold (25/50/75/100) | Counter, Up |

### 1.2 Conversion variables (eVars) — allocation Most Recent (Last)

| eVar | Name | Expiration | Set on |
|------|------|-----------|--------|
| eVar1 | Template | Visit | Every page (from metadata `template`) |
| eVar2 | Locale | Visit | Every page (from `<html lang>` / path) |
| eVar3 | Component ID | Hit | Impression & click events |
| eVar4 | Block Name | Hit | Impression & click events |
| eVar5 | Position | Hit | Impression & click events |
| eVar6 | Section Index | Hit | Impression & click events |
| eVar10 | Link Text | Hit | CTA click / download |
| eVar11 | Link URL | Hit | CTA click / download |
| eVar12 | Download File | Hit | Download event |
| eVar13 | Scroll Depth | Hit | Scroll milestone event |
| eVar14 | Form Name | Hit | Form start / submit |
| **eVar15** | **Access Tier** *(new, Section 6)* | Visit | Every page |
| **eVar16** | **Demo Access Code** *(new, Section 6)* | Visit | Pages entered with a code |
| **eVar17** | **Demo / Use-Case ID** *(new, recommended)* | Visit | Every page |

> eVar15–17 are additions beyond your build guide. If your RSID doesn't have free eVar
> slots, say so and I'll fold Access Tier into an existing dimension or a classification.

### 1.3 Traffic variables (props)

| prop | Name | Set on |
|------|------|--------|
| prop1 | Page Path | Every page |
| prop3 | Component ID | Impression & click events (pathing/flow on components) |
| prop4 | Block Name | Impression & click events |
| prop10 | Region : Link Type | CTA click / download (e.g. `hero:cta`, `cards:download`) |

---

## 2. EDS integration architecture (direct AppMeasurement)

Edge Delivery loads in three phases: **eager** (LCP), **lazy**, **delayed**. Analytics is
non-critical to render, so it loads in the **delayed** phase to protect Core Web Vitals.

```
scripts/
  scripts.js          # existing — call initAnalytics() from loadDelayed()
  delayed.js          # existing (or created) — delayed-phase entry point
  analytics.js        # NEW — AppMeasurement loader + s object config + tracking API
blocks/
  <block>/<block>.js  # push component context to the data layer on decorate
```

### 2.1 Load model

- `analytics.js` dynamically injects AppMeasurement (self-hosted copy in the repo, e.g.
  `/scripts/appmeasurement.min.js`, pinned version — do **not** hotlink Adobe CDN) in the
  delayed phase.
- On load it builds the `s` object, applies global config (Section 2.2), reads the data
  layer collected during decoration, fires the **page-view** `s.t()`, then drains any
  queued interaction events as `s.tl()` link calls.
- All block code only ever **pushes to a data layer** (`window.xscDataLayer`); it never
  touches `s` directly. This keeps blocks decoupled and makes the same contract portable
  to external pages (Section 7).

### 2.2 Global `s` configuration (RSID-agnostic)

```js
s.account              = '<RSID>';            // from open item #1
s.trackingServer       = '<first-party CNAME>';     // open item #2
s.trackingServerSecure = '<first-party CNAME>';
s.trackDownloadLinks   = true;
s.trackExternalLinks   = true;
s.linkDownloadFileTypes= 'pdf,zip,doc,docx,ppt,pptx,xls,xlsx,mp4';
s.visitorNamespace     = 'adobe';             // stable across domain move
// Context data layer -> variables mapped in a processing-rule-free, explicit way
```

> **Domain-move safety:** because tracking server and visitor namespace are set explicitly
> (not derived from `document.domain`), moving from `ynaka-adobe.com` to `adobe.com` needs
> **zero tag changes** — only the DNS/CNAME for the first-party collection domain and (if
> cross-domain visitor stitching matters) a one-time Analytics cross-domain setting.

---

## 3. Data layer contract

A single global array other code pushes typed events to. AppMeasurement consumes it.

```js
window.xscDataLayer = window.xscDataLayer || [];

// page context (set once, early, from scripts.js)
xscDataLayer.push({ event: 'page', page: {
  path: location.pathname,
  template: '<meta template>',
  locale: document.documentElement.lang,
  demoId: '<meta demo-id>',
  accessTier: '<employee|customer-guest>',
  accessCode: '<code or empty>'
}});

// component impression
xscDataLayer.push({ event: 'componentImpression', component: {
  id, blockName, position, sectionIndex }});

// CTA click
xscDataLayer.push({ event: 'ctaClick', component: { id, blockName, position, sectionIndex },
  link: { text, url, regionLinkType }});

// download
xscDataLayer.push({ event: 'download', link: { text, url, regionLinkType }, file: '<filename>' });

// form lifecycle
xscDataLayer.push({ event: 'formStart',  form: { name }});
xscDataLayer.push({ event: 'formSubmit', form: { name }});

// scroll milestone
xscDataLayer.push({ event: 'scrollMilestone', scroll: { depth: 25|50|75|100 }});
```

---

## 4. Trigger rules — event → variable mapping

Each row is exactly what the tracking layer sets. `s.tl()` = link call (non-page-view), with
link type `o` (custom) unless noted.

| DL event | AA call | events | eVars set | props set |
|----------|---------|--------|-----------|-----------|
| `page` | `s.t()` page view | — | eVar1 Template, eVar2 Locale, eVar15 Tier, eVar16 Code, eVar17 DemoId | prop1 Page Path |
| `componentImpression` | `s.tl()` | event1 | eVar3 ID, eVar4 Block, eVar5 Position, eVar6 Section | prop3 ID, prop4 Block |
| `ctaClick` | `s.tl()` | event2 | eVar3, eVar4, eVar5, eVar6, eVar10 Text, eVar11 URL | prop3, prop4, prop10 Region:LinkType |
| `download` | `s.tl()` (type `d`) | event3 | eVar10, eVar11, eVar12 File | prop10 |
| `formStart` | `s.tl()` | event4 | eVar14 Form Name | — |
| `formSubmit` | `s.tl()` | event5 | eVar14 Form Name | — |
| `scrollMilestone` | `s.tl()` | event6 | eVar13 Scroll Depth | — |

**Hit discipline:** clear hit-scoped variables after each `s.tl()` (use `s.linkTrackVars` /
`s.linkTrackEvents` per call, or `s.clearVars()`) so component context from one click never
bleeds into the next hit.

---

## 5. Trigger implementation notes (per signal)

- **Impression (event1):** one `IntersectionObserver` (threshold 0.5) created in
  `analytics.js`, observing elements that carry a `data-component-id`. Fire **once** per
  element (unobserve after first intersection) — this satisfies the build guide's caveat
  that event1 must fire once per component instance per page, so impression ratios don't skew.
- **CTA click (event2) / download (event3):** one delegated `click` listener on `main`.
  Classify by target: a link whose `href` extension is in `linkDownloadFileTypes` → download;
  otherwise a CTA inside a tracked block → CTA click. `prop10` = `<blockName>:<linkType>`.
- **Form start (event4):** `focusin` on a form, de-duplicated to first interaction per form.
- **Form submit (event5):** on successful submit only (after validation / server 200). If a
  form posts to an external handler, hook the success callback, not the raw submit.
- **Scroll (event6 / eVar13):** throttled scroll handler, fire once per crossed threshold
  (25/50/75/100). eVar13 carries the depth so the Panel 5 scroll-depth table populates.

---

## 6. Access-context tracking (confirmed)

Captures who's viewing and under what grant, so you can segment internal vs. customer traffic.

| Variable | Value | Source |
|----------|-------|--------|
| eVar15 Access Tier | `employee` or `customer-guest` | Auth/session state at page load |
| eVar16 Demo Access Code | the code the customer redeemed | URL param / session on guest entry |
| eVar17 Demo / Use-Case ID | stable demo identifier | page metadata |

- Set all three on the **page** event so they're hit-persistent for the visit.
- Suggested segments to add to your Workspace: *Internal Traffic* (eVar15 = employee),
  *Customer Guest Traffic* (eVar15 = customer-guest), and per-code segments (eVar16 = X)
  so each customer's engagement with their demo is isolatable.
- **Privacy:** confirm whether the raw access code may be stored. If codes map to a named
  customer, prefer storing an opaque alias in eVar16 and keeping the lookup off-platform.

### Implementation (as built)

Per-page metadata the code reads (set in the bulk `/metadata` sheet or on the page):

| Metadata | Feeds | Notes |
|----------|-------|-------|
| `template` | eVar1 | Bulk sheet sets it per folder (`home`, `demo`, `customer-demo`, `workshop`, …) |
| `demo-id` | eVar17 | Set per demo page in the bulk sheet; falls back to the path slug |
| `access-tier` | eVar15 | Optional (`/internal/**` = `employee`). Otherwise from the signed-in session, then a redeemed code (`customer-guest`), else `unknown` |
| `analytics` = `off` | — | Disables tracking on that page |

- **Access code:** read from `?code=` or the access-code form, kept in sessionStorage, and sent
  in eVar16 as a SHA-256 alias (`ac-` + first 10 hex chars of the upper-cased code). The raw
  code is never sent. The alias → customer lookup is kept off-platform.
- **Tracking Code** (`s.campaign` / `v0`) carries `?cid=` attribution.

---

## 7. Reuse on external / Experience League pages

The data-layer-first design means the **same `analytics.js` and contract** work anywhere you
can inject a script. For published Experience League collateral:

- Ship a small embeddable build of `analytics.js` that pages load; the variable contract is
  identical, so external-page data lands in the same report suite and the same Workspace.
- **Attribution/credit (needs your confirmation, open item #3):** to credit the demo program
  for externally-published content, append a tracking code to outbound/published links
  (e.g. `?cid=xsc-demo:<demoId>`) and capture it into the campaign/tracking-code dimension
  on entry. That attributes downstream engagement back to the source demo. This is standard
  marketing attribution — it is **not** the same as editorial contributor credit on
  Experience League, which is handled through Adobe's content process, not analytics tags.
- Constraint to flag: Experience League templates may restrict custom script injection.
  Confirm you (or the publishing path) can inject a `<script>`; if not, external tracking may
  be limited to link-level tracking codes only.

---

## 8. Governance & rollout

1. **Spec is canonical.** This variable contract lives in the repo (e.g.
   `/docs/analytics-spec.md`) so every new demo reuses the same numbering.
2. **Stage on a QA RSID first,** validate each panel in the build guide populates (use the
   AppMeasurement debugger / Adobe Experience Platform Debugger), then point to prod RSID.
3. **Validation matrix:** one check per event/eVar/prop confirming it fires with the right
   value — maps 1:1 to the "Validate each table" step in your build guide.
4. **Domain move:** no tag change needed; swap the collection-domain CNAME and re-validate
   cookies/visitor continuity once `xsc-demo.adobe.com` goes live.

---

## 9. What I'll deliver on approval (code phase)

- `scripts/analytics.js` — AppMeasurement loader, `s` config, data-layer consumer, trigger
  wiring (impression observer, click/download delegation, form + scroll handlers).
- Self-hosted pinned `appmeasurement.min.js`.
- Minimal edits to `scripts/scripts.js` / `delayed.js` to boot analytics in the delayed phase
  and push the `page` context.
- Per-block decoration snippets that stamp `data-component-id` / block / position / section
  and push impression + CTA context.
- `docs/analytics-spec.md` (this contract) committed as the shared source of truth.
- A validation checklist mapped to the build guide's six panels.
