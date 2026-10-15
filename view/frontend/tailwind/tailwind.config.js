/**
 * Copyright © Xumulus. All rights reserved.
 * See LICENSE.txt for license details.
 *
 * Tailwind v3 themes (Hyvä before 1.4): mergeTailwindConfig() merges this into the theme's config, so the theme's
 * build scans this module's templates; postcssImportHyvaModules() imports tailwind-source.css.
 * Tailwind v4 themes (Hyvä 1.4 and later) do not read this file: `npx hyva-sources` adds the module as a @source
 * and imports tailwind-source.css.
 */
module.exports = {
    content: [
        '../templates/**/*.phtml',
        '../layout/*.xml'
    ]
};
