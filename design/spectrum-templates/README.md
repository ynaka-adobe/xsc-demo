# Spectrum 2 templates (on hold until the Paper MCP limit resets in December)

Paper file: https://app.paper.design/file/01M85M1H0CPD8JAQDDNPYDF2NG, page "Templates — Spectrum 2"

| Template | Status |
|---|---|
| L1 Portfolio hub | Done in Paper (artboard BP-0) |
| L2 Core demo (101/201) | Done in Paper (DW-0) |
| L3 Feature demo ("try it") | HTML mockup: l3.html / l3.png. Paper artboard G3-0 has nav and header only |
| Solution | HTML mockup: solution.html / .png. Paper artboard G6-0 has nav only |
| Workshop (keeps red hero, Spectrum type fixes) | HTML mockup: workshop.html / .png. Paper artboard G4-0 has nav only |
| Customer (gated) | HTML mockup: customer.html / .png. Paper artboard G5-0 has nav only |

In the Paper clones, the active nav item still reads "Brand Visibility". Change it to Solutions, Workshops or Customers per artboard.

Design rules:
- Adobe Clean throughout.
- Headings weight 800, line-height 1.1–1.2, letter-spacing 0.
- Body line-height 1.5.
- One accent colour (#3B63FB); red #EB1000 is used only for the workshop hero.
- Hairline #E1E1E1 dividers; pill buttons.
- Shared stylesheet: s2.css.

## Next steps
1. Port the four mockups into Paper and get approval.
2. Implement templates and blocks in EDS.
3. Taxonomy facets (Portfolio, Product, Level, Type):
   - Draft code is in facet-metadata-code.patch, not applied.
   - DA tagging was partially run, so some pages may already have facet metadata. None were previewed or published.
4. Restructure the nav and clean up duplicate pages.
