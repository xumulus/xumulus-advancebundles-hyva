/**
 * Copyright © Xumulus. All rights reserved.
 * See LICENSE.txt for license details.
 *
 * Loaded right before the configurator core of Xumulus_AdvanceBundles (ViewModel\Configurator::SCRIPTS).
 *
 * The core files are UMD: with an AMD loader on the page (`define.amd`, e.g. RequireJS that a third-party module
 * adds to a Hyvä page) they call an anonymous define() instead of creating window.XabConfigurator, which a plain
 * script cannot do (RequireJS: "Mismatched anonymous define()"), and the configurator would not start. This hides
 * `define.amd` while the core runs; amd-restore.js, loaded right after it, puts it back. Modules that the loader
 * itself loads meanwhile call define() directly and are not affected.
 */
(function (win) {
    'use strict';

    var define = win.define;

    if (typeof define === 'function' && define.amd && !win.XabHyvaHiddenAmd) {
        win.XabHyvaHiddenAmd = {define: define, amd: define.amd};
        define.amd = undefined;
    }
}(typeof self !== 'undefined' ? self : this));
