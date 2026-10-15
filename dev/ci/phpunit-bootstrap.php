<?php
/**
 * PHPUnit bootstrap for the unit suite (phpunit.xml.dist). Repository-only, not shipped.
 *
 * Needs a Magento install that has Hyvä (hyva-themes/magento2-theme-module) for the autoloader, found in this
 * order: the XAB_AUTOLOAD environment variable (e.g. /var/www/html/vendor/autoload.php), the store's
 * vendor/autoload.php when the module sits in app/code/Xumulus/AdvanceBundlesHyva, or when it is installed in
 * vendor/xumulus/. The module's namespace is then mapped onto this checkout, so the tests run against these files.
 */
declare(strict_types=1);

use Composer\Autoload\ClassLoader;

$moduleRoot = dirname(__DIR__, 2);
$candidates = [
    (string)getenv('XAB_AUTOLOAD'),
    $moduleRoot . '/../../../../vendor/autoload.php',
    $moduleRoot . '/../../autoload.php',
];

$loader = null;
foreach ($candidates as $candidate) {
    if ($candidate !== '' && is_file($candidate)) {
        $loader = require $candidate;
        break;
    }
}

if (!$loader instanceof ClassLoader) {
    fwrite(STDERR, "No Composer autoloader with Magento and Hyvä found. Set XAB_AUTOLOAD to a Magento install's"
        . " vendor/autoload.php.\n");
    exit(1);
}

$loader->addPsr4('Xumulus\\AdvanceBundlesHyva\\', $moduleRoot . '/', true);

error_reporting(E_ALL);
