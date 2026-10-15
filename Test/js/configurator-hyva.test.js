'use strict';

/**
 * The Hyvä adapter's pure parts (node --test Test/js). The browser behaviour is covered by the main module's
 * Playwright suite in Hyvä mode (XAB_E2E_STORE=hyva).
 *
 * With XAB_CORE_DIR pointing at the main module's view/frontend/web/js/configurator (default: a checkout of
 * xumulus-advanced-bundles next to this one), the price event is also checked against the real core's totals.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const adapter = require('../../view/frontend/web/js/configurator-hyva.js');
const CORE_DIR = process.env.XAB_CORE_DIR ||
    path.resolve(__dirname, '../../../xumulus-advanced-bundles/view/frontend/web/js/configurator');

function totals(final, base, old) {
    return {
        totals: {
            finalPrice: {amount: final, adjustments: {}, final: final},
            basePrice: {amount: base, adjustments: {}, final: base},
            oldPrice: {amount: old, adjustments: {}, final: old}
        }
    };
}

test('exports the adapter API', () => {
    ['format', 'priceEventDetail', 'start', 'component'].forEach((name) => {
        assert.equal(typeof adapter[name], 'function', name);
    });
    assert.equal(adapter.PRICE_EVENT, 'update-bundle-option-prices');
});

test('format() fills %1, %2 and keeps unknown placeholders', () => {
    assert.equal(adapter.format('Remove %1', ['Alpha']), 'Remove Alpha');
    assert.equal(adapter.format('%2 of %1 %3', [30, 'max']), 'max of 30 %3');
    assert.equal(adapter.format(undefined, []), '');
});

test('dynamic price: the detail is the configured total (Hyvä starts at 0)', () => {
    assert.deepEqual(adapter.priceEventDetail(totals(100, 100, 100), {oldPrice: 0, finalPrice: 0, basePrice: 0}),
        {oldPrice: 100, finalPrice: 100, basePrice: 100});
    assert.deepEqual(adapter.priceEventDetail(totals(40, 40, 40), null), {oldPrice: 40, finalPrice: 40, basePrice: 40});
});

test('fixed price: the detail is the total minus the price Hyvä starts from, without float noise', () => {
    assert.deepEqual(adapter.priceEventDetail(totals(78.21, 71.1, 99), {oldPrice: 99, finalPrice: 78.21, basePrice: 71.1}),
        {oldPrice: 0, finalPrice: 0, basePrice: 0});
    // 0.1 + 0.2 style noise is rounded away.
    assert.equal(adapter.priceEventDetail(totals(0.3, 0, 0), {finalPrice: 0.1}).finalPrice, 0.2);
});

test('the configured price code goes into finalPrice, the code Hyvä displays', () => {
    assert.equal(adapter.priceEventDetail(totals(121, 100, 121), {}, 'basePrice').finalPrice, 100);
});

test('Hyvä price box shows exactly the core total, for every store fixture', {skip: !fs.existsSync(CORE_DIR) &&
    'set XAB_CORE_DIR to the main module\'s js/configurator to run this'}, () => {
    const core = require(path.join(CORE_DIR, 'index.js'));
    const fixtures = path.join(CORE_DIR, '../../../../../Test/js/fixtures');
    const cases = [
        ['dynamic.config.json', 'dynamic.price-config.json', 0],
        ['fixed.config.json', 'fixed.price-config.json', 78.21]
    ];

    cases.forEach(([configFile, priceFile, start]) => {
        const config = JSON.parse(fs.readFileSync(path.join(fixtures, configFile), 'utf8'));

        config.priceConfig = JSON.parse(fs.readFileSync(path.join(fixtures, priceFile), 'utf8'));
        const instance = core.create(null, config);
        const price = instance.getPrice();
        const detail = adapter.priceEventDetail(price, {oldPrice: 0, finalPrice: start, basePrice: start});

        // What Hyvä's price.phtml shows: its start plus the detail.
        assert.equal(Math.round((start + detail.finalPrice) * 100) / 100,
            Math.round(price.totals.finalPrice.final * 100) / 100, configFile);
    });
});

/**
 * A minimal DOM for the config lookup: elements with attributes, a document and a root that only know the
 * selectors findConfigElement() uses.
 */
function fakeElement(attrs) {
    return {
        getAttribute: (name) => (Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null),
        hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrs, name),
    };
}

function fakePage(rootId, inRoot, elsewhere) {
    const doc = {
        querySelectorAll: (selector) => {
            assert.equal(selector, 'script[data-xab-config-for]');

            return inRoot.concat(elsewhere).filter((el) => el.hasAttribute('data-xab-config-for'));
        },
        defaultView: {console: {warn: (message) => warnings.push(message)}},
    };
    const warnings = [];
    const root = Object.assign(fakeElement(rootId ? {id: rootId} : {}), {
        ownerDocument: doc,
        querySelector: (selector) => {
            assert.equal(selector, 'script[data-xab-config]');

            return inRoot[0] || null;
        },
    });

    return {root, warnings};
}

test('findConfigElement(): the config inside the root (the page as rendered)', () => {
    const config = fakeElement({'data-xab-config': '', 'data-xab-config-for': 'xab-root-2046'});
    const {root} = fakePage('xab-root-2046', [config], []);

    assert.equal(adapter.findConfigElement(root), config);
});

test('findConfigElement(): the config moved to the end of <body> (dev/js/move_script_to_bottom)', () => {
    const other = fakeElement({'data-xab-config': '', 'data-xab-config-for': 'xab-root-46'});
    const config = fakeElement({'data-xab-config': '', 'data-xab-config-for': 'xab-root-2046'});
    const {root} = fakePage('xab-root-2046', [], [other, config]);

    assert.equal(adapter.findConfigElement(root), config, 'the config of this root, not another bundle\'s');
});

test('findConfigElement(): a theme template without data-xab-config-for still works inside the root', () => {
    const config = fakeElement({'data-xab-config': ''});

    assert.equal(adapter.findConfigElement(fakePage('xab-root-2046', [config], []).root), config);
    assert.equal(adapter.findConfigElement(fakePage(null, [config], []).root), config);
});

test('start() warns and does nothing when there is no config', () => {
    const {root, warnings} = fakePage('xab-root-2046', [], []);

    assert.equal(adapter.start(root, {core: {create: () => assert.fail('must not start')}}), null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /no configurator config found for #xab-root-2046/);
});

test('amd-hide.js / amd-restore.js: the core creates window.XabConfigurator although an AMD loader is on the page',
    {skip: !fs.existsSync(CORE_DIR) && 'set XAB_CORE_DIR to the main module\'s js/configurator to run this'}, () => {
        const vm = require('vm');
        const js = path.resolve(__dirname, '../../view/frontend/web/js');
        const anonymousDefines = [];
        // RequireJS-like: an anonymous define() from a plain script is an error there.
        const define = function () {
            anonymousDefines.push(arguments);
        };
        const amd = {jQuery: true};

        define.amd = amd;
        const sandbox = {define};

        sandbox.self = sandbox;
        vm.createContext(sandbox);
        const run = (file) => vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, {filename: file});

        run(path.join(js, 'amd-hide.js'));
        assert.equal(define.amd, undefined, 'hidden while the core runs');
        ['state', 'price', 'validate', 'summary', 'dom', 'index'].forEach((name) => {
            run(path.join(CORE_DIR, name + '.js'));
        });
        run(path.join(js, 'amd-restore.js'));

        assert.equal(anonymousDefines.length, 0, 'no anonymous define()');
        assert.equal(typeof sandbox.XabConfigurator.create, 'function');
        assert.equal(define.amd, amd, 'define.amd is back');
        assert.equal(sandbox.XabHyvaHiddenAmd, undefined);
    });

test('amd-hide.js / amd-restore.js do nothing without an AMD loader', () => {
    const vm = require('vm');
    const js = path.resolve(__dirname, '../../view/frontend/web/js');
    const sandbox = {};

    sandbox.self = sandbox;
    vm.createContext(sandbox);
    ['amd-hide.js', 'amd-restore.js'].forEach((file) => {
        vm.runInContext(fs.readFileSync(path.join(js, file), 'utf8'), sandbox);
    });
    assert.deepEqual(Object.keys(sandbox).sort(), ['self']);
});

test('tailwind.config.js keeps every rule of tailwind-source.css in a Tailwind v3 build (safelist)', () => {
    // Tailwind v3 drops @layer components rules whose classes are not in the scanned content, and the configurator's
    // markup is the main module's templates, some classes built in PHP. Each class the style sheet uses has to be
    // safelisted.
    const dir = path.resolve(__dirname, '../../view/frontend/tailwind');
    const config = require(path.join(dir, 'tailwind.config.js'));
    const css = fs.readFileSync(path.join(dir, 'tailwind-source.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const classes = new Set((css.match(/\.-?[A-Za-z_][\w-]*/g) || []).map((s) => s.slice(1)));
    const patterns = (config.safelist || []).map((entry) => (entry instanceof RegExp ? entry : entry.pattern));
    const kept = (name) => patterns.some((pattern) => pattern instanceof RegExp && pattern.test(name)) ||
        (config.safelist || []).includes(name);

    // The classes the main module builds in PHP (ViewModel\Configurator) and its header template.
    ['xab--layout-xumulus', 'xab--gallery-3', 'xab--images-right', 'xab-header__title'].forEach((name) => {
        assert.ok(kept(name), name);
    });
    assert.ok(classes.size > 50, 'the style sheet was read');
    const missing = [...classes].filter((name) => /^xab/.test(name) && !kept(name));

    assert.deepEqual(missing, []);
});
