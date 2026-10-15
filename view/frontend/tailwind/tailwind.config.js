/**
 * Copyright © Xumulus. All rights reserved.
 * See LICENSE.txt for license details.
 *
 * Tailwind v3 themes (Hyvä before 1.4): mergeTailwindConfig() merges this into the theme's config, so the theme's
 * build scans this module's templates; postcssImportHyvaModules() imports tailwind-source.css.
 * Tailwind v4 themes (Hyvä 1.4 and later) do not read this file: `npx hyva-sources` adds the module as a @source
 * and imports tailwind-source.css.
 *
 * safelist: Tailwind v3 drops a rule of tailwind-source.css (all in @layer components) unless one of its classes is
 * in the scanned content, and most of the configurator's markup is the main module's templates (installed in
 * vendor/ or app/code/, so no fixed path to scan here), some of its classes built in PHP (xab--layout-*,
 * xab--gallery-*, xab--images-*). Every .xab* class is kept instead; the file only styles .xab* classes.
 */
module.exports = {
    content: [
        '../templates/**/*.phtml',
        '../layout/*.xml'
    ],
    safelist: [
        {pattern: /^xab/}
    ]
};
