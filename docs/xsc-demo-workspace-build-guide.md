# XSC Demo — Analysis Workspace Build Guide

**Report suite:** `acsmarketingxsc-demo` · **Project name:** `XSC Demo — Engagement Insights`

Complete `docs/analytics-setup.md` section 1 first (events, eVars and props must exist and be named as below), and load some test traffic so the components appear in the left rail.

## Step 0 — Create calculated metrics (Components > Create Calculated Metric)

| Name | Definition | Format |
|---|---|---|
| Component CTR | CTA Click (event2) ÷ Component Impression (event1) | Percent |
| Form Completion Rate | Form Submit (event5) ÷ Form Start (event4) | Percent |
| Download Rate | Download (event3) ÷ Visits | Percent |
| Engagement Rate | Visits where event2 ≥ 1 ÷ Visits (build as: Visits metric with a segment "Engaged Visit", ÷ Visits) | Percent |
| Deep Scroll Rate | Scroll Milestone (event6) restricted by segment/filter `Scroll Depth = 100%` ÷ Page Views | Percent |

## Step 1 — Create segments (Components > Create Segment)

| Segment | Definition (Visit container) |
|---|---|
| Internal Traffic | Access Tier (eVar15) equals `employee` |
| Customer Guest Traffic | Access Tier (eVar15) equals `customer-guest` |
| Exclude Internal | Access Tier (eVar15) does not equal `employee` |
| Engaged Visit | CTA Click (event2) ≥ 1 **or** Scroll Depth (eVar13) equals `50%`/`75%`/`100%` |
| Per customer (one each) | Demo Access Code (eVar16) equals `<alias>` |

Apply **Exclude Internal** at the project level when you want customer-only views.

## Step 2 — Build the project

Create a **blank project**, set the date range to *Last 30 days*, and add one **panel** per section below. Use a **Freeform Panel** unless noted.

### Panel 1 — Overview
- Summary cards (Visualization > Summary Number): Visits, Unique Visitors, Page Views, Component Impressions, CTA Clicks, Form Submit.
- Line chart: Visits and Component Impressions by Day.
- Table: rows = **Demo / Use-Case ID (eVar17)**; columns = Visits, Page Views, Engagement Rate, Deep Scroll Rate. *Answers: which demos get traffic and engagement?*

### Panel 2 — Component performance
- Table: rows = **Block Name (eVar4)**; columns = Component Impression, CTA Click, Component CTR.
- Drill any row by **Component ID (eVar3)** to compare variants (e.g. `cards|products`).
- Add a second table: rows = **Position (eVar5)**, columns = Component Impression, CTA Click, Component CTR. *Answers: do blocks lower on the page still earn clicks? Sort by CTR to find underperformers.*
- Bar chart on the first table, sorted by Component CTR.

### Panel 3 — CTAs and downloads
- Table: rows = **Link Text (eVar10)**; columns = CTA Click; breakdown by **Block Name (eVar4)**.
- Table: rows = **Download File (eVar12)**; columns = Download, Download Rate.
- Table: rows = **Region : Link Type (prop10)**; columns = CTA Click, Download. *Answers: which links and assets drive action, and where do they live?*

### Panel 4 — Forms
- Fallout visualization: touchpoints = Form Start (event4) → Form Submit (event5), by Visit.
- Table: rows = **Form Name (eVar14)**; columns = Form Start, Form Submit, Form Completion Rate. *Answers: where do visitors abandon?*

### Panel 5 — Scroll depth
- Table: rows = **Scroll Depth (eVar13)**; columns = Scroll Milestone; breakdown by **Page Path (prop1)** or **Template (eVar1)**.
- Bar chart of the first table. *Answers: how far do visitors read, per template?*

### Panel 6 — Audience and access
- Table: rows = **Access Tier (eVar15)**; columns = Visits, Unique Visitors, CTA Click, Engagement Rate.
- Table: rows = **Demo Access Code (eVar16)**; columns = Visits, Component Impression, CTA Click, Download, Form Submit. Use this for per-customer engagement reviews.
- Flow visualization: start from **Component ID (prop3)** to see the path between blocks.
- Table: rows = **Tracking Code**; columns = Visits, CTA Click, Form Submit. *Answers: which published link (`?cid=xsc-demo:<demoId>`) credited the traffic?*

## Step 3 — Validate

Per the checklist in `analytics-setup.md`: run each test action once, then confirm each table above populates with the expected row values (for example, Scroll Depth rows `25%`, `50%`, `75%`, `100%`). Fix any empty table by checking the matching eVar/prop name and expiration.

## Step 4 — Share

Save the project, then **Share** it with the XSC team (or tag it `XSC Demo`). To compare against other demos, copy the project and swap the report suite.

## Notes

- Hit-expiring eVars (3–6, 10–14) report accurately only against the events fired on the same hit, which is how the code sends them. Do not use them with page views.
- Allow up to ~30 minutes for new data to appear in Workspace.
- Component CTR is a ratio of events, so a block with several CTAs can exceed 100%. Read it as clicks per impression.
