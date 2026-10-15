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
