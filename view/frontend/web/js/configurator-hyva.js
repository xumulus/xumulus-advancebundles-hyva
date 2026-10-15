/**
 * Copyright © Xumulus. All rights reserved.
 * See LICENSE.txt for license details.
 *
 * Xumulus Advanced Bundles: Hyvä adapter for the configurator core (window.XabConfigurator, the six files of
 * Xumulus_AdvanceBundles::js/configurator/, loaded as plain scripts before this one).
 *
 * Registers the Alpine component "xabConfigurator" (used by templates/hyva/configurator.phtml). The component sits on
 * a wrapper around the product form; on init it starts one adapter for every [data-xab-root] inside it, with the
 * config the root carries in <script type="application/json" data-xab-config> (docs/configurator-contract.md §3 of
 * the main module). Each adapter:
 *   - creates the core instance, which owns the inputs (dom.js);
 *   - drives Hyvä's bundle price box: it sends Hyvä's own `update-bundle-option-prices` window event, which the
 *     theme's Magento_Bundle::catalog/product/view/price.phtml adds to the bundle's starting price. The detail is
 *     the configured total minus that starting price, so the box shows exactly the configurator's total;
 *   - renders the summary into [data-xab-role="summary"] with DOM methods (no HTML strings);
 *   - blocks the add-to-cart submit while the configuration is incomplete, with the errors beside the options,
 *     listed in the summary and, when configured, in a native <dialog>;
 *   - runs the extras of the Luma adapter: details dialogs, the drop-down filter and the character counters.
 *
 * Alpine CSP build safe: the component is registered with Alpine.data() and the templates use no expressions.
 * No inline scripts or handlers, no HTML strings, no eval: under a strict script-src 'self' policy nothing of the
 * configurator needs a hash or a nonce.
 */
(function (root, factory) {
    'use strict';

    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.XabHyva = factory(root);
    }
}(typeof self !== 'undefined' ? self : this, function (global) {
    'use strict';

    var VERSION = '2.0.0',
        PRICE_EVENT = 'update-bundle-option-prices',
        STATUS_DELAY = 1000,
        PRICE_CODES = ['oldPrice', 'finalPrice', 'basePrice'];

    /**
     * Replace %1, %2… in a translated message.
     *
     * @param {string} message
     * @param {Array} params
     * @returns {string}
     */
    function format(message, params) {
        return String(message || '').replace(/%(\d+)/g, function (match, index) {
            var value = params[Number(index) - 1];

            return value === undefined ? match : String(value);
        });
    }

    function closest(el, selector) {
        while (el && el.nodeType === 1) {
            if (el.matches(selector)) {
                return el;
            }
            el = el.parentNode;
        }

        return null;
    }

    function make(doc, tag, className, text) {
        var el = doc.createElement(tag);

        if (className) {
            el.className = className;
        }
        if (text !== undefined) {
            el.textContent = text;
        }

        return el;
    }

    /**
     * Round away floating point noise (the price box formats to the store's precision itself).
     *
     * @param {number} value
     * @returns {number}
     */
    function round(value) {
        return Math.round((Number(value) || 0) * 10000) / 10000;
    }

    /**
     * Parse a JSON attribute or element text; null when it is missing or broken.
     *
     * @param {string|null} text
     * @returns {*}
     */
    function parse(text) {
        if (!text) {
            return null;
        }
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    /**
     * The `update-bundle-option-prices` detail for a price result (price.compute()).
     *
     * Hyvä's bundle price box shows its starting price (`start`: the fixed price of a fixed-price bundle, 0 for a
     * dynamic one, as the theme computes it) plus the detail, so the detail is the configured total minus that
     * start, per price code. `priceCode` is the code the configurator shows as the total (contract §3
     * presentation.priceCode) and goes into finalPrice, the code Hyvä displays.
     *
     * @param {{totals: Object}} price
     * @param {{oldPrice: number, finalPrice: number, basePrice: number}} start
     * @param {string} [priceCode]
     * @returns {{oldPrice: number, finalPrice: number, basePrice: number}}
     */
    function priceEventDetail(price, start, priceCode) {
        var totals = (price && price.totals) || {},
            base = start || {},
            detail = {};

        function total(code) {
            var entry = totals[code];

            return entry ? Number(entry.final !== undefined ? entry.final : entry.amount) || 0 : 0;
        }

        PRICE_CODES.forEach(function (code) {
            var source = code === 'finalPrice' ? (priceCode || 'finalPrice') : code;

            detail[code] = round(total(source) - (Number(base[code]) || 0));
        });

        return detail;
    }

    /**
     * The config element of a configurator root: <script type="application/json" data-xab-config> (init.phtml).
     *
     * It is rendered inside the root, but Magento's "Move JS code to the bottom of the page"
     * (dev/js/move_script_to_bottom, Magento\Theme\Controller\Result\JsFooterPlugin, which Hyvä keeps on product
     * pages) moves every <script> element to the end of <body>, this one too. So it is looked up by the root's id
     * (data-xab-config-for) anywhere in the document first, then inside the root.
     *
     * @param {Element} root the [data-xab-root] element
     * @returns {Element|null}
     */
    function findConfigElement(root) {
        var doc = root.ownerDocument,
            id = root.getAttribute('id'),
            candidates = id ? doc.querySelectorAll('script[data-xab-config-for]') : [],
            i;

        for (i = 0; i < candidates.length; i++) {
            if (candidates[i].getAttribute('data-xab-config-for') === id) {
                return candidates[i];
            }
        }

        return root.querySelector('script[data-xab-config]');
    }

    /**
     * Start the adapter on one configurator root.
     *
     * @param {Element} root the [data-xab-root] element
     * @param {Object} [options] {config, start, dispatchEvent}: overrides for tests
     * @returns {{instance: Object, dispatchPrice: Function, check: Function, destroy: Function}|null}
     */
    function start(root, options) {
        var opts = options || {},
            doc = root.ownerDocument,
            win = doc.defaultView || global,
            core = opts.core || win.XabConfigurator,
            configEl = findConfigElement(root),
            config = opts.config || parse(configEl ? configEl.textContent : null),
            priceStart = opts.start || parse(configEl ? configEl.getAttribute('data-xab-hyva-prices') : null) || {},
            form,
            summary,
            summaryMount,
            summaryStatus,
            errorBox,
            errorDialog,
            messages,
            presentation,
            lastDetail = null,
            lastValidation = null,
            announcedTotal = null,
            statusTimer = null,
            listeners = [],
            instance;

        if (!config) {
            if (win.console) {
                win.console.warn('Xumulus Advanced Bundles: no configurator config found for #' +
                    (root.getAttribute('id') || '[data-xab-root]') + '; the bundle configurator is not started.');
            }

            return null;
        }
        if (!core || typeof core.create !== 'function') {
            // The core scripts did not load (a theme removed them?): leave the server-rendered form as it is.
            if (win.console) {
                win.console.warn('Xumulus Advanced Bundles: window.XabConfigurator is missing; the bundle ' +
                    'configurator is not started.');
            }

            return null;
        }

        form = closest(root, 'form');
        summary = doc.querySelector('[data-xab-summary="' + String(config.productId) + '"]') ||
            doc.querySelector('[data-xab-summary]');
        summaryMount = summary ? summary.querySelector('[data-xab-role="summary"]') : null;
        summaryStatus = summary ? summary.querySelector('[data-xab-role="summary-status"]') : null;
        errorBox = summary ? summary.querySelector('[data-xab-summary-errors]') : null;
        errorDialog = summary ? summary.querySelector('[data-xab-error-dialog]') : null;
        messages = config.messages || {};
        presentation = config.presentation || {};

        function listen(target, type, handler, capture) {
            target.addEventListener(type, handler, !!capture);
            listeners.push([target, type, handler, !!capture]);
        }

        /* ---------------------------------------------------------------- price box */

        function dispatchPrice(detail) {
            var current = detail || lastDetail,
                send = opts.dispatchEvent || function (name, payload) {
                    win.dispatchEvent(new win.CustomEvent(name, {detail: payload}));
                };

            if (current) {
                send(PRICE_EVENT, priceEventDetail(current.price, priceStart, presentation.priceCode));
            }
        }

        /* ---------------------------------------------------------------- summary */

        function isRemovable(model, state, line) {
            var opt = model.optionsById[line.optionId],
                chosen = state.selected[line.optionId] || [];

            return !!opt && opt.visible && (!opt.required || chosen.length > 1);
        }

        function renderSummary(detail) {
            var model = instance ? instance.getModel() : core.state.normalize(config),
                data = detail.summary,
                groups = {},
                list,
                total;

            if (!summaryMount) {
                return;
            }
            summaryMount.textContent = '';
            if (!data.lines.length) {
                summaryMount.appendChild(make(doc, 'p', 'xab-summary__empty', messages.empty || ''));
            } else {
                list = make(doc, 'ul', 'xab-summary__list');
                data.lines.forEach(function (line) {
                    var group = groups[line.optionId],
                        item,
                        remove,
                        label;

                    if (!group) {
                        group = make(doc, 'li', 'xab-summary__group');
                        group.setAttribute('data-xab-summary-option', line.optionId);
                        group.appendChild(make(doc, 'span', 'xab-summary__option', line.optionTitle + ':'));
                        group.appendChild(make(doc, 'ul', 'xab-summary__items'));
                        groups[line.optionId] = group;
                        list.appendChild(group);
                    }
                    item = make(doc, 'li', 'xab-summary__line');
                    item.appendChild(make(doc, 'span', 'xab-summary__name', line.qty + ' x ' + line.name));
                    item.appendChild(make(doc, 'span', 'xab-summary__price', line.rowFormatted));
                    if (isRemovable(model, detail.state, line)) {
                        label = format(messages.remove, [line.name]);
                        remove = make(doc, 'button', 'xab-summary__remove');
                        remove.type = 'button';
                        remove.setAttribute('data-xab-remove', line.optionId + '/' + line.selectionId);
                        remove.setAttribute('title', label);
                        remove.appendChild(make(doc, 'span', 'xab-visually-hidden', label));
                        item.appendChild(remove);
                    }
                    line.customOptions.forEach(function (co) {
                        item.appendChild(make(doc, 'span', 'xab-summary__custom', co.title + ': ' + co.value));
                    });
                    group.lastChild.appendChild(item);
                });
                summaryMount.appendChild(list);
            }
            total = make(doc, 'p', 'xab-summary__total');
            total.appendChild(make(doc, 'span', 'xab-summary__total-label', messages.total || ''));
            total.appendChild(make(doc, 'span', 'xab-summary__total-amount', data.total.formatted));
            total.setAttribute('data-xab-summary-total', String(data.total.amount));
            summaryMount.appendChild(total);
        }

        /**
         * Announce the total once it has settled, when the summary has a status element. Hyvä's own price box
         * announces its price already (aria-live), so the Hyvä summary template leaves the status out.
         */
        function announceTotal(detail) {
            var total = detail.summary.total;

            if (!summaryStatus) {
                return;
            }
            if (announcedTotal === null) {
                announcedTotal = total.formatted;

                return;
            }
            win.clearTimeout(statusTimer);
            statusTimer = win.setTimeout(function () {
                if (total.formatted !== announcedTotal) {
                    announcedTotal = total.formatted;
                    summaryStatus.textContent = (messages.total || '') + ' ' + total.formatted;
                }
            }, STATUS_DELAY);
        }

        function onSummaryClick(event) {
            var button = closest(event.target, '[data-xab-remove]'),
                buttons,
                index,
                next,
                ids;

            if (!button || !instance) {
                return;
            }
            buttons = Array.prototype.slice.call(summaryMount.querySelectorAll('[data-xab-remove]'));
            index = buttons.indexOf(button);
            ids = button.getAttribute('data-xab-remove').split('/');
            instance.dispatch({type: 'deselect', optionId: ids[0], selectionId: ids[1]});
            // The summary was rebuilt: keep focus in it.
            buttons = summaryMount.querySelectorAll('[data-xab-remove]');
            next = buttons[Math.min(index, buttons.length - 1)] || null;
            if (!next) {
                summaryMount.setAttribute('tabindex', '-1');
                next = summaryMount;
            }
            next.focus();
        }

        /* ---------------------------------------------------------------- validation */

        function errorText(err, model) {
            var opt = model.optionsById[err.optionId],
                sel = opt && err.selectionId !== undefined ? opt.selectionsById[err.selectionId] : null,
                co = sel && err.customOptionId !== undefined ? sel.customOptionsById[err.customOptionId] : null,
                parts = [];

            if (!sel) {
                return err.message;
            }
            parts.push(opt.title, sel.name);
            if (co) {
                parts.push(co.title);
            }

            return parts.join(' – ') + ': ' + err.message;
        }

        function renderErrors(validation) {
            var model = instance.getModel(),
                list;

            lastValidation = validation;
            if (!errorBox) {
                return;
            }
            errorBox.textContent = '';
            if (validation && !validation.valid) {
                errorBox.appendChild(make(doc, 'p', 'xab-summary__errors-title', messages.fixErrors || ''));
                list = make(doc, 'ul', 'xab-summary__errors-list');
                validation.errors.forEach(function (err) {
                    list.appendChild(make(doc, 'li', '', errorText(err, model)));
                });
                errorBox.appendChild(list);
            }
            errorBox.hidden = !(validation && !validation.valid);
        }

        function expandInvalid() {
            Array.prototype.forEach.call(root.querySelectorAll('[data-xab-option][data-xab-invalid="true"]'),
                function (optionEl) {
                    Array.prototype.forEach.call(
                        optionEl.querySelectorAll('[data-xab-role="details"][aria-expanded="false"]'),
                        function (toggle) {
                            var target = doc.getElementById(toggle.getAttribute('aria-controls'));

                            if (target && target.contains(optionEl.querySelector('[data-xab-role="error"]'))) {
                                toggle.setAttribute('aria-expanded', 'true');
                                target.hidden = false;
                            }
                        }
                    );
                });
        }

        function focusFirstInvalid() {
            var optionEl = root.querySelector('[data-xab-option][data-xab-invalid="true"]'),
                target = null;

            if (optionEl) {
                target = optionEl.querySelector('[data-xab-role="custom"][aria-invalid="true"]:not([disabled])') ||
                    optionEl.querySelector('[data-xab-role="toggle"]:not([disabled])');
            }
            if (target && typeof target.focus === 'function') {
                target.focus();
            }
        }

        function focusAfterErrors() {
            if (errorDialog && errorDialog.open) {
                errorDialog.addEventListener('close', function () {
                    win.setTimeout(focusFirstInvalid, 0);
                }, {once: true});
            } else {
                focusFirstInvalid();
            }
        }

        function showErrorDialog(validation) {
            var list = errorDialog ? errorDialog.querySelector('[data-xab-error-list]') : null,
                model = instance.getModel();

            if (!list) {
                return;
            }
            list.textContent = '';
            validation.errors.forEach(function (err) {
                list.appendChild(make(doc, 'li', '', errorText(err, model)));
            });
            openDialog(errorDialog);
        }

        /**
         * Run the core validation; returns whether the configuration can be added to the cart.
         */
        function check() {
            var validation = instance.validate();

            renderErrors(validation);
            if (!validation.valid) {
                expandInvalid();
            }

            return validation.valid;
        }

        /**
         * Capture-phase submit guard on the product form: Hyvä posts the form natively (no mage/validation).
         */
        function onSubmit(event) {
            if (!check()) {
                event.preventDefault();
                event.stopImmediatePropagation();
                showErrorDialog(lastValidation);
                focusAfterErrors();
            }
        }

        /* ---------------------------------------------------------------- dialogs */

        function openDialog(dialog) {
            if (!dialog) {
                return;
            }
            if (typeof dialog.showModal === 'function') {
                if (!dialog.open) {
                    dialog.showModal();
                }
            } else {
                dialog.setAttribute('open', '');
            }
        }

        function closeDialog(dialog) {
            if (!dialog) {
                return;
            }
            if (typeof dialog.close === 'function') {
                dialog.close();
            } else {
                dialog.removeAttribute('open');
            }
        }

        function onKeydown(event) {
            var dialog;

            if (event.key === 'Escape' || event.key === 'Esc') {
                dialog = closest(event.target, 'dialog');
                if (dialog && dialog.open) {
                    event.stopPropagation();
                    event.preventDefault();
                    closeDialog(dialog);
                }
            } else if (event.key === 'Enter' && event.target.hasAttribute &&
                event.target.hasAttribute('data-xab-filter')) {
                // The filter is inside the product form: Enter would submit it (add to cart).
                event.preventDefault();
                chooseOnlyMatch(event.target);
            }
        }

        function onClick(event) {
            var target = event.target,
                opener = closest(target, '[data-xab-dialog-open]'),
                closer = closest(target, '[data-xab-dialog-close]'),
                select = closest(target, '[data-xab-action="select"]'),
                optionEl,
                selectionEl;

            if (opener) {
                openDialog(doc.getElementById(opener.getAttribute('data-xab-dialog-open')));
            } else if (closer) {
                closeDialog(closest(closer, 'dialog'));
            } else if (select) {
                optionEl = closest(select, '[data-xab-option]');
                selectionEl = closest(select, '[data-xab-selection]');
                if (optionEl && selectionEl && instance) {
                    instance.dispatch({
                        type: 'select',
                        optionId: optionEl.getAttribute('data-xab-option'),
                        selectionId: selectionEl.getAttribute('data-xab-selection')
                    });
                }
                closeDialog(closest(select, 'dialog'));
            } else if (target.tagName === 'DIALOG') {
                // A click on the backdrop lands on the dialog element itself.
                closeDialog(target);
            }
        }

        /* ---------------------------------------------------------------- filter and counters */

        function onFilter(input) {
            var select = doc.getElementById(input.getAttribute('data-xab-filter')),
                term = String(input.value || '').trim().toLowerCase();

            if (!select) {
                return;
            }
            Array.prototype.forEach.call(select.options, function (option) {
                option.hidden = option.value !== '' && term !== '' &&
                    option.text.toLowerCase().indexOf(term) === -1;
            });
        }

        function chooseOnlyMatch(input) {
            var select = doc.getElementById(input.getAttribute('data-xab-filter')),
                matches;

            if (!select || String(input.value || '').trim() === '') {
                return;
            }
            matches = Array.prototype.filter.call(select.options, function (option) {
                return option.value !== '' && !option.hidden && !option.disabled;
            });
            if (matches.length === 1 && select.value !== matches[0].value) {
                select.value = matches[0].value;
                select.dispatchEvent(new win.Event('change', {bubbles: true}));
            }
        }

        function updateCounter(input) {
            var max = Number(input.getAttribute('maxlength')),
                holder = closest(input, '.xab-custom'),
                counter = holder ? holder.querySelector('[data-xab-counter]') : null,
                length = Array.from(String(input.value || '')).length;

            if (!counter || !max) {
                return;
            }
            counter.textContent = length ? format(messages.charactersRemaining, [Math.max(0, max - length)]) : '';
        }

        function onInput(event) {
            var target = event.target;

            if (target.hasAttribute && target.hasAttribute('data-xab-filter')) {
                onFilter(target);
            } else if (target.getAttribute && target.getAttribute('data-xab-role') === 'custom') {
                updateCounter(target);
            }
        }

        /* ---------------------------------------------------------------- wish list */

        /**
         * Hyvä's "Add to Wish List" button copies the product form into URLSearchParams with set(), which keeps one
         * value per name, so of `bundle_option[7][]` only the last checkbox would reach the wish list. For that one
         * click the multi-select names get their selection id as key (`bundle_option[7][19]`, which the server
         * reads the same way) and are put back on the next task. Runs in the capture phase, before Hyvä's handler
         * builds its request.
         */
        function onWishlistClick(event) {
            var renamed = [];

            if (!closest(event.target, '[data-addto="wishlist"]') || !form) {
                return;
            }
            Array.prototype.forEach.call(root.querySelectorAll('input[name$="[]"]'), function (input) {
                var name = input.getAttribute('name');

                if (input.value !== '' && /^bundle_option\[[^\]]+\]\[\]$/.test(name)) {
                    input.setAttribute('name', name.slice(0, -2) + '[' + input.value + ']');
                    renamed.push([input, name]);
                }
            });
            if (renamed.length) {
                win.setTimeout(function () {
                    renamed.forEach(function (entry) {
                        entry[0].setAttribute('name', entry[1]);
                    });
                }, 0);
            }
        }

        /* ---------------------------------------------------------------- start */

        function onChange(detail) {
            lastDetail = detail;
            dispatchPrice(detail);
            renderSummary(detail);
            announceTotal(detail);
            if (detail.validation !== null && lastValidation !== null) {
                renderErrors(detail.validation);
            }
            Array.prototype.forEach.call(root.querySelectorAll('[data-xab-role="custom"][maxlength]'), updateCounter);
        }

        instance = core.create(root, config, {onChange: onChange});

        listen(root, 'click', onClick);
        listen(root, 'input', onInput);
        listen(root, 'keydown', onKeydown);
        if (summary) {
            listen(summary, 'click', onClick);
            listen(summary, 'keydown', onKeydown);
        }
        if (summaryMount) {
            listen(summaryMount, 'click', onSummaryClick);
        }
        if (form) {
            listen(form, 'submit', onSubmit, true);
            listen(doc, 'click', onWishlistClick, true);
        }
        root.setAttribute('data-xab-started', 'hyva');

        return {
            instance: instance,
            check: check,
            dispatchPrice: function () {
                dispatchPrice(null);
            },
            destroy: function () {
                listeners.forEach(function (entry) {
                    entry[0].removeEventListener(entry[1], entry[2], entry[3]);
                });
                listeners = [];
                win.clearTimeout(statusTimer);
                instance.destroy();
                root.removeAttribute('data-xab-started');
            }
        };
    }

    /**
     * Whether this page load is a back/forward navigation (the browser restores form values).
     *
     * @param {Window} win
     * @returns {boolean}
     */
    function isHistoryRestore(win) {
        var entries = win.performance && typeof win.performance.getEntriesByType === 'function'
            ? win.performance.getEntriesByType('navigation') : [];

        return !!(entries && entries[0] && entries[0].type === 'back_forward');
    }

    /**
     * The Alpine component ("xabConfigurator", see register()) on the wrapper around the product
     * form. The adapters live in this closure, not in the component's reactive data.
     *
     * @returns {{init: Function, destroy: Function}}
     */
    function component() {
        var adapters = [];

        return {
            init: function () {
                var el = this.$el,
                    win = el.ownerDocument.defaultView || global,
                    startAll = function () {
                        Array.prototype.forEach.call(el.querySelectorAll('[data-xab-root]'), function (root) {
                            var adapter = root.hasAttribute('data-xab-started') ? null : start(root);

                            if (adapter) {
                                adapters.push(adapter);
                            }
                        });
                    },
                    sendPrices = function () {
                        adapters.forEach(function (adapter) {
                            adapter.dispatchPrice();
                        });
                    };

                if (isHistoryRestore(win) && el.ownerDocument.readyState !== 'complete') {
                    // Back or forward without the back/forward cache: the browser puts the form's values back only
                    // after this runs (Alpine starts before DOMContentLoaded), and never into a qty input the core
                    // has disabled meanwhile. Start once it has, at load, so the shopper's choices are read.
                    win.addEventListener('load', function () {
                        win.setTimeout(function () {
                            startAll();
                            sendPrices();
                        }, 0);
                    }, {once: true});

                    return;
                }
                startAll();
                // Hyvä's price box is a component nested in this one: Alpine initialises it after this init(),
                // so it can only hear the price event on the next tick (as with Hyvä's own initBundleOptions).
                this.$nextTick(sendPrices);
            },
            destroy: function () {
                adapters.forEach(function (adapter) {
                    adapter.destroy();
                });
                adapters = [];
            }
        };
    }

    /**
     * Register the component with Alpine, from this file rather than an inline script: the page then needs no CSP
     * hash or nonce for the configurator at all. Hyvä loads Alpine as a module script at the end of the page, so
     * this deferred script runs before Alpine starts and fires alpine:init.
     */
    function register(win) {
        var add = function () {
            if (win.Alpine && typeof win.Alpine.data === 'function') {
                win.Alpine.data('xabConfigurator', component);
            }
        };

        if (!win || !win.document) {
            return;
        }
        win.document.addEventListener('alpine:init', add, {once: true});
        if (win.Alpine) {
            // Alpine is already there (a theme that loads it earlier): register now as well.
            add();
        }
    }

    register(global);

    return {
        VERSION: VERSION,
        PRICE_EVENT: PRICE_EVENT,
        format: format,
        priceEventDetail: priceEventDetail,
        findConfigElement: findConfigElement,
        start: start,
        component: component
    };
}));
