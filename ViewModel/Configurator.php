<?php
/**
 * Copyright © Xumulus. All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace Xumulus\AdvanceBundlesHyva\ViewModel;

use Hyva\Theme\ViewModel\ProductPrice;
use Magento\Bundle\Model\Product\Price as BundlePrice;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Pricing\Price\FinalPrice;
use Magento\Catalog\Pricing\Price\RegularPrice;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Framework\View\Element\Block\ArgumentInterface;

/**
 * What the Hyvä adapter needs beside the main module's configurator config: the scripts to load, in order, and the
 * price Hyvä's bundle price box starts from.
 */
class Configurator implements ArgumentInterface
{
    /**
     * The configurator core of Xumulus_AdvanceBundles, in load order (docs/configurator-contract.md §1), then the
     * Hyvä adapter.
     */
    public const SCRIPTS = [
        'Xumulus_AdvanceBundles::js/configurator/state.js',
        'Xumulus_AdvanceBundles::js/configurator/price.js',
        'Xumulus_AdvanceBundles::js/configurator/validate.js',
        'Xumulus_AdvanceBundles::js/configurator/summary.js',
        'Xumulus_AdvanceBundles::js/configurator/dom.js',
        'Xumulus_AdvanceBundles::js/configurator/index.js',
        'Xumulus_AdvanceBundlesHyva::js/configurator-hyva.js',
    ];

    /**
     * @var AssetRepository
     */
    private AssetRepository $assetRepository;

    /**
     * @var ProductPrice
     */
    private ProductPrice $productPrice;

    /**
     * @var Json
     */
    private Json $json;

    /**
     * @param AssetRepository $assetRepository
     * @param ProductPrice $productPrice
     * @param Json $json
     */
    public function __construct(AssetRepository $assetRepository, ProductPrice $productPrice, Json $json)
    {
        $this->assetRepository = $assetRepository;
        $this->productPrice = $productPrice;
        $this->json = $json;
    }

    /**
     * URLs of the scripts to load with plain script elements, in order.
     *
     * @return string[]
     */
    public function getScriptUrls(): array
    {
        return array_map(function (string $fileId): string {
            return $this->assetRepository->getUrl($fileId);
        }, self::SCRIPTS);
    }

    /**
     * The price Hyvä's bundle price box starts from, per price code.
     *
     * Mirrors Hyvä's Magento_Bundle::catalog/product/view/price.phtml (initialFinalPrice, initialBasePrice): the
     * bundle's final price for a fixed-price bundle and 0 for a dynamic one. The adapter sends the configured total
     * minus this, so the box shows the configurator's total.
     *
     * @param Product $product
     * @return array{oldPrice: float, finalPrice: float, basePrice: float}
     */
    public function getStartPrices(Product $product): array
    {
        // The attribute is a string ('1'), the constant an int.
        if ((string)$product->getData('price_type') !== (string)BundlePrice::PRICE_TYPE_FIXED) {
            return ['oldPrice' => 0.0, 'finalPrice' => 0.0, 'basePrice' => 0.0];
        }

        return [
            'oldPrice' => $this->productPrice->getPriceValue(RegularPrice::PRICE_CODE, $product),
            'finalPrice' => $this->productPrice->getPriceValue(FinalPrice::PRICE_CODE, $product),
            'basePrice' => $this->productPrice->getPriceValueExclTax(FinalPrice::PRICE_CODE, $product),
        ];
    }

    /**
     * getStartPrices() as JSON, for a data attribute.
     *
     * @param Product $product
     * @return string
     */
    public function getStartPricesJson(Product $product): string
    {
        return (string)$this->json->serialize($this->getStartPrices($product));
    }
}
