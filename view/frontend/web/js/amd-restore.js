/**
 * Copyright © Xumulus. All rights reserved.
 * See LICENSE.txt for license details.
 *
 * Loaded right after the configurator core of Xumulus_AdvanceBundles: puts back the `define.amd` that amd-hide.js
 * hid while the core created window.XabConfigurator.
 */
(function (win) {
    'use strict';

    var hidden = win.XabHyvaHiddenAmd;

    if (hidden) {
        hidden.define.amd = hidden.amd;
        win.XabHyvaHiddenAmd = undefined;
    }
}(typeof self !== 'undefined' ? self : this));
