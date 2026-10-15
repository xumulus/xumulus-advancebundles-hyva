# Xumulus Advanced Bundles for Hyvä

Hyvä Themes compatibility module for Xumulus Advanced Bundles
(`xumulus/xumulus-advancebundles` 2.0). It runs the extension's bundle
configurator on [Hyvä](https://www.hyva.io/) storefronts: the same options,
summary, validation and cart data as on Luma, started by Alpine.js instead of
RequireJS and styled through the Hyvä theme's Tailwind build.

Package `xumulus/advancebundles-hyva`, module `Xumulus_AdvanceBundlesHyva`.

---

## Requirements

| | |
|---|---|
| Adobe Commerce / Magento Open Source | 2.4.7, 2.4.8, 2.4.9 |
| PHP | 8.1 to 8.5 (as the main module; check your Hyvä version's own PHP support) |
| Xumulus Advanced Bundles | `xumulus/xumulus-advancebundles` 2.0 |
| Hyvä | `hyva-themes/magento2-theme-module` 1.3.11 or later and `hyva-themes/magento2-compat-module-fallback` 1.1 or later, with a theme based on `hyva-themes/magento2-default-theme` |

**Tested with** Hyvä 1.5.3 (theme module and default theme 1.5.3,
compat-module-fallback 1.1.4, Tailwind CSS 4.3.1) on Magento 2.4.9 with
PHP 8.5, in both bundle layouts, at 1280 px and 390 px. Earlier Hyvä versions
(1.3.11 to 1.4.x) and Tailwind v3 themes have not been tested on a store. For
Tailwind v3 only the style sheet build was checked: with this module's
`tailwind.config.js` (which safelists every `.xab*` class), Tailwind 3.4.17
keeps every rule of `tailwind-source.css`.

---

## Installation

```bash
composer require xumulus/advancebundles-hyva
bin/magento module:enable Xumulus_AdvanceBundlesHyva
bin/magento setup:upgrade
bin/magento hyva:config:generate
```

Then rebuild the styles of every Hyvä theme (the module adds its CSS to the
theme's build):

```bash
cd app/design/frontend/<Vendor>/<theme>/web/tailwind
npm run build
```

In production mode, deploy static content and flush the cache as usual
(`bin/magento setup:static-content:deploy`, `bin/magento cache:flush`).

Run `hyva:config:generate` and the theme build again after each update of this
package. On a store with both Luma and Hyvä store views, install it anyway: it
changes nothing on Luma themes.

---

## What is supported

- Both bundle layouts of the main module ("Magento Bundle Layout" and "Xumulus
  Advanced Bundle Layout"), including the Xumulus layout's collapsible options,
  error dialog and phone bar ("Show Summary in Mobile View" off).
- Every option type: drop-down (with its search box), radio buttons,
  checkboxes, multiple select, image gallery (single or multiple choice) and
  hidden options; option and per-selection quantities; fixed quantities.
- Text custom options of bundle items (engraving text): required fields,
  maximum characters with a counter, posted as `bundle_custom_option`.
- The summary with remove buttons; the details dialogs (native `<dialog>`).
- **Price.** The configurator is the only bundle price source. It drives
  Hyvä's own bundle price box through Hyvä's `update-bundle-option-prices`
  event, so the price above Add to Cart is always the configurator's total.
- **Add to cart.** It is blocked while the configuration is incomplete, with
  the messages beside the options, in the summary and (Xumulus layout, when
  configured) in a dialog. The form posts the same field names as on Luma, so
  the cart, the cart's Edit page (prefilled, "Update item") and every server
  check are unchanged.
- **Add to Wish List** (Magento layout) keeps the selections, quantities and
  engraving text.
- **Content Security Policy.** The module adds no inline script and no inline
  event handler: the configurator scripts are static files, and the config is
  JSON data. It works under a strict `script-src 'self'` policy without hashes
  or nonces. Its Alpine component is registered with `Alpine.data()` and the
  markup has no Alpine expressions, as the Alpine CSP build requires (tested
  with Hyvä's default theme and the standard Alpine build; the `default-csp`
  theme variant has not been tested).

Hyvä's own bundle option component (`initBundleOptions`) and summary are not
rendered on bundle pages the extension handles.

---

## How it works

This is a Hyvä compatibility module registered with
`Hyva\CompatModuleFallback\Model\CompatModuleRegistry` (`etc/frontend/di.xml`).
On a Hyvä theme it replaces three templates of the main module and shares all
the others, so the option markup is the main module's
(`templates/configurator/*`):

| Main module template | Replaced on Hyvä by |
|---|---|
| `configurator/init.phtml` (Luma: x-magento-init) | `templates/Xumulus_AdvanceBundles/configurator/init.phtml`: the config as `<script type="application/json">` data |
| `configurator/summary.phtml` | `templates/Xumulus_AdvanceBundles/configurator/summary.phtml`: summary lines, Hyvä's bundle price box, qty and Add to Cart |
| `product/view/details.phtml` (Luma tabs) | `templates/Xumulus_AdvanceBundles/product/view/details.phtml`: Hyvä's product sections |

- **Layout** (`hyva_` handles, added by Hyvä on Hyvä themes only):
  `hyva_xumulus_advancebundles_configurator.xml` places the product form inside
  the Alpine component `xabConfigurator` (`templates/hyva/configurator.phtml`)
  and the options and summary inside the form, below Hyvä's product info.
  `hyva_catalog_product_view_type_bundle_xumulus.xml` adapts the Xumulus layout.
- **Scripts.** The main module's configurator core
  (`Xumulus_AdvanceBundles::js/configurator/*.js`) and this module's adapter
  (`js/configurator-hyva.js`) load as deferred plain scripts. The adapter
  registers the Alpine component and starts one configurator per bundle.
  If another module puts an AMD loader (`define.amd`, e.g. RequireJS) on Hyvä
  pages, `js/amd-hide.js` and `js/amd-restore.js` hide it while the core loads,
  so the core (UMD files) still creates `window.XabConfigurator`.
- **Config.** The config is a `<script type="application/json"
  data-xab-config>` element inside the options. With Magento's "Move JS code to
  the bottom of the page" (`dev/js/move_script_to_bottom`) on, Magento moves it
  to the end of the page; the adapter finds it there by the options' id
  (`data-xab-config-for`).
- **Styles.** `view/frontend/tailwind/tailwind-source.css`, merged into the
  theme's `styles.css` by `hyva-sources` (Tailwind v4) or
  `postcssImportHyvaModules` with `tailwind.config.js` (Tailwind v3).

The main module's `docs/configurator-contract.md` (§9) describes the adapter in
detail.

---

## Customising

- **Colours and sizes.** Everything is under `.xab` and uses the same CSS
  custom properties as on Luma (`--xab-accent`, `--xab-text`, `--xab-border`,
  `--xab-selected`, `--xab-error`, `--xab-radius`, `--xab-touch`,
  `--xab-gallery-columns`, …). On Hyvä they default to the theme's design
  tokens (`--color-primary`, `--color-fg`, …), so most themes need nothing.
  Override them in the theme's CSS, for example
  `.xab { --xab-accent: var(--color-secondary); }`.
- **Templates.** Override any configurator template in the Hyvä theme under
  `Xumulus_AdvanceBundles/templates/…`, as for Luma. A theme template wins over
  this module's replacements.

---

## Differences from Luma and known limitations

- **Xumulus layout page frame.** On Luma the Xumulus layout replaces the
  product's gallery and title with its own product info box above the
  options. On Hyvä the theme's gallery and product info card stay, and the
  options and summary follow below them; the info box is not used. The static
  price of the info card is left out (the summary's price box follows the
  configuration), and, as on Luma, Wish List and Compare are hidden.
- **No total announcement of its own.** Hyvä's price box announces the new
  price to screen readers itself, so the summary has no extra status region.
- **Hyvä's price box extras.** Hyvä's bundle price box also applies the
  bundle product's own tier price (a percentage for the product qty) and the
  prices of the bundle product's own custom options (fixed-price bundles).
  The configurator's total includes neither, so with those the box can show
  a different amount than the summary's total. The cart charges what Magento
  calculates in both cases.
- **Wish list and multiple selects.** A visible multiple-select option with
  more than one choice keeps only one of them in Hyvä's wish list post (the
  checkbox and gallery options keep all).
- **Back/forward navigation.** When the browser does not keep the page in its
  back/forward cache, the configurator starts at the page's load event, after
  the browser has put the form's values back.

---

## Development

Repository-only files (`dev/`, `Test/`, `phpunit.xml.dist`) are not part of
the package (`.gitattributes`).

```bash
# PHP unit tests, with a Magento install that has Hyvä
XAB_AUTOLOAD=/path/to/magento/vendor/autoload.php /path/to/magento/vendor/bin/phpunit -c phpunit.xml.dist

# Adapter tests (Node 20+). With the main module checked out next to this
# repository (or XAB_CORE_DIR=<main module>/view/frontend/web/js/configurator)
# they also check the price event against the real core.
node --test 'Test/js/*.test.js'
```

The storefront end-to-end tests live in the main module's Playwright suite:
run it against a Hyvä store view with `XAB_E2E_STORE=<store view code>`
(see the main module's `docs/DEVELOPMENT.md`).

---

## Licence

See `LICENSE.txt`.
