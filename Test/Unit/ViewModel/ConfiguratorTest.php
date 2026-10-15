<?php
/**
 * Copyright © Xumulus. All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace Xumulus\AdvanceBundlesHyva\Test\Unit\ViewModel;

use Hyva\Theme\ViewModel\ProductPrice;
use Magento\Catalog\Model\Product;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Xumulus\AdvanceBundlesHyva\ViewModel\Configurator;

/**
 * @covers \Xumulus\AdvanceBundlesHyva\ViewModel\Configurator
 */
class ConfiguratorTest extends TestCase
{
    /**
     * @var AssetRepository&Stub
     */
    private $assetRepository;

    /**
     * @var ProductPrice&Stub
     */
    private $productPrice;

    /**
     * @var Configurator
     */
    private Configurator $viewModel;

    protected function setUp(): void
    {
        $this->assetRepository = $this->createStub(AssetRepository::class);
        $this->productPrice = $this->createStub(ProductPrice::class);
        $this->viewModel = new Configurator($this->assetRepository, $this->productPrice, new Json());
    }

    public function testScriptsAreTheCoreInContractOrderThenTheAdapter(): void
    {
        $this->assetRepository->method('getUrl')->willReturnCallback(static function (string $fileId): string {
            return 'https://example.test/static/' . str_replace('::', '/', $fileId);
        });

        self::assertSame([
            'https://example.test/static/Xumulus_AdvanceBundles/js/configurator/state.js',
            'https://example.test/static/Xumulus_AdvanceBundles/js/configurator/price.js',
            'https://example.test/static/Xumulus_AdvanceBundles/js/configurator/validate.js',
            'https://example.test/static/Xumulus_AdvanceBundles/js/configurator/summary.js',
            'https://example.test/static/Xumulus_AdvanceBundles/js/configurator/dom.js',
            'https://example.test/static/Xumulus_AdvanceBundles/js/configurator/index.js',
            'https://example.test/static/Xumulus_AdvanceBundlesHyva/js/configurator-hyva.js',
        ], $this->viewModel->getScriptUrls());
    }

    /**
     * A dynamic-price bundle starts Hyvä's price box at 0, whatever the bundle's own price says.
     *
     * @dataProvider dynamicPriceTypes
     * @param mixed $priceType
     */
    #[DataProvider('dynamicPriceTypes')]
    public function testDynamicPriceBundleStartsAtZero($priceType): void
    {
        $productPrice = $this->createMock(ProductPrice::class);
        $productPrice->expects(self::never())->method('getPriceValue');
        $productPrice->expects(self::never())->method('getPriceValueExclTax');
        $viewModel = new Configurator($this->assetRepository, $productPrice, new Json());

        self::assertSame(
            ['oldPrice' => 0.0, 'finalPrice' => 0.0, 'basePrice' => 0.0],
            $viewModel->getStartPrices($this->product($priceType))
        );
    }

    /**
     * @return array<string, array{mixed}>
     */
    public static function dynamicPriceTypes(): array
    {
        return [
            'string 0' => ['0'],
            'int 0' => [0],
            'not set' => [null],
        ];
    }

    /**
     * A fixed-price bundle starts at its own price, as Hyvä's price.phtml computes it.
     *
     * @dataProvider fixedPriceTypes
     * @param mixed $priceType
     */
    #[DataProvider('fixedPriceTypes')]
    public function testFixedPriceBundleStartsAtItsFinalPrice($priceType): void
    {
        $product = $this->product($priceType);
        $this->productPrice->method('getPriceValue')->willReturnMap([
            ['regular_price', $product, 99.0],
            ['final_price', $product, 78.21],
        ]);
        $this->productPrice->method('getPriceValueExclTax')->willReturnMap([
            ['final_price', $product, 71.1],
        ]);

        self::assertSame(
            ['oldPrice' => 99.0, 'finalPrice' => 78.21, 'basePrice' => 71.1],
            $this->viewModel->getStartPrices($product)
        );
        self::assertSame(
            '{"oldPrice":99,"finalPrice":78.21,"basePrice":71.1}',
            $this->viewModel->getStartPricesJson($product)
        );
    }

    /**
     * @return array<string, array{mixed}>
     */
    public static function fixedPriceTypes(): array
    {
        return [
            'string 1' => ['1'],
            'int 1' => [1],
        ];
    }

    /**
     * @param mixed $priceType
     * @return Product&Stub
     */
    private function product($priceType): Product
    {
        $product = $this->createStub(Product::class);
        $product->method('getData')->willReturnMap([['price_type', null, $priceType]]);

        return $product;
    }
}
