// plugin/index.js
// Expo Config Plugin — generates all native Android widget code during `npx expo prebuild`.
//
// This file is CommonJS (not TS) because config plugins run in Node at build time.
// It orchestrates three transformers:
//   1. withAndroidManifest — registers receiver, config activity, intent filters
//   2. withDangerousMod    — copies Kotlin + resource files into android/
//   3. withMainApplication — registers WidgetBridgePackage with React Native
//
// Usage in app.json:
//   "plugins": ["./plugin"]

const { withAndroidManifest, withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

// ─── 1. AndroidManifest.xml modifications ────────────────────────────────────

function modifyManifest(config) {
  const manifest = config.modResults;
  const app = manifest.manifest.application[0];

  // ── Widget Receiver ──────────────────────────────────────────────────────
  if (!app.receiver) app.receiver = [];
  const receiverExists = app.receiver.some(
    (r) => r.$?.['android:name'] === 'com.ledger.financeOS.LedgerWidget'
  );
  if (!receiverExists) {
    app.receiver.push({
      $: {
        'android:name': 'com.ledger.financeOS.LedgerWidget',
        'android:label': '@string/ledger_widget_name',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
          ],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/ledger_widget_info',
          },
        },
      ],
    });
  }

  // ── Widget Config Activity ────────────────────────────────────────────────
  if (!app.activity) app.activity = [];
  const configActivityExists = app.activity.some(
    (a) => a.$?.['android:name'] === 'com.ledger.financeOS.WidgetConfigActivity'
  );
  if (!configActivityExists) {
    app.activity.push({
      $: {
        'android:name': 'com.ledger.financeOS.WidgetConfigActivity',
        'android:label': 'Ledger Widget Setup',
        'android:exported': 'true',
        'android:theme': '@style/Theme.AppCompat',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.appwidget.action.APPWIDGET_CONFIGURE' } },
          ],
        },
      ],
    });
  }

  // ── Deep-link intent filter on MainActivity ───────────────────────────────
  // expo-router already adds the `ledger` scheme via the built-in linking
  // config. We just need to make sure it covers path segments like
  // /widget-income, /widget-expense, /widget-transfer.
  // expo-router registers a broad data scheme="ledger" filter automatically,
  // so no extra filter is strictly needed here — but we add a targeted one
  // that lists every path we use so the intent can be explicit.
  const mainActivity = app.activity.find(
    (a) => a.$?.['android:name'] === '.MainActivity' ||
            a.$?.['android:name'] === 'com.ledger.financeOS.MainActivity'
  );
  if (mainActivity) {
    if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];
    const hasWidgetFilter = mainActivity['intent-filter'].some(
      (f) => f.data && f.data.some((d) => d.$?.['android:host'] === 'widget-income')
    );
    if (!hasWidgetFilter) {
      mainActivity['intent-filter'].push({
        action:   [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
          { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
        ],
        data: [
          { $: { 'android:scheme': 'ledger', 'android:host': 'widget-income' } },
          { $: { 'android:scheme': 'ledger', 'android:host': 'widget-expense' } },
          { $: { 'android:scheme': 'ledger', 'android:host': 'widget-transfer' } },
        ],
      });
    }
  }

  return config;
}

// ─── 2. Copy native files ─────────────────────────────────────────────────────

function copyNativeFiles(config) {
  const projectRoot    = config.modRequest.projectRoot;
  const pluginDir      = path.join(projectRoot, 'plugin', 'android');
  const androidSrc     = path.join(projectRoot, 'android', 'app', 'src', 'main');
  const kotlinPkg      = path.join(androidSrc, 'java', 'com', 'ledger', 'financeOS');
  const resDir         = path.join(androidSrc, 'res');

  // Helper: copy a file, creating destination directory if needed
  function copyFile(src, dst) {
    const dstDir = path.dirname(dst);
    if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
    fs.copyFileSync(src, dst);
    console.log(`[LedgerWidget] Copied ${path.relative(projectRoot, dst)}`);
  }

  // ── Kotlin source files ──────────────────────────────────────────────────
  const kotlinSrcDir = path.join(pluginDir, 'kotlin', 'com', 'ledger', 'financeOS');
  for (const file of [
    'LedgerWidget.kt',
    'WidgetConfigActivity.kt',
    'WidgetBridgeModule.kt',
    'WidgetBridgePackage.kt',
  ]) {
    const src = path.join(kotlinSrcDir, file);
    const dst = path.join(kotlinPkg, file);
    if (fs.existsSync(src)) copyFile(src, dst);
    else console.warn(`[LedgerWidget] WARNING: Source not found: ${src}`);
  }

  // ── Resource files ───────────────────────────────────────────────────────
  const resSrc = path.join(pluginDir, 'res');
  function copyRes(subdir, file) {
    const src = path.join(resSrc, subdir, file);
    const dst = path.join(resDir, subdir, file);
    if (fs.existsSync(src)) copyFile(src, dst);
    else console.warn(`[LedgerWidget] WARNING: Resource not found: ${src}`);
  }

  copyRes('layout',   'ledger_widget.xml');
  copyRes('xml',      'ledger_widget_info.xml');
  copyRes('drawable', 'widget_background.xml');
  copyRes('drawable', 'widget_btn_green.xml');
  copyRes('drawable', 'widget_btn_red.xml');
  copyRes('drawable', 'widget_btn_blue.xml');
  copyRes('values',   'widget_strings.xml');

  return config;
}

// ─── 3. Register WidgetBridgePackage in MainApplication ──────────────────────

function addWidgetPackage(config) {
  const contents = config.modResults.contents;

  // Guard — don't add twice
  if (contents.includes('WidgetBridgePackage')) {
    return config;
  }

  // Add import after the last existing expo import
  let modified = contents.replace(
    /(import expo\.modules\.ReactNativeHostWrapper)/,
    'import com.ledger.financeOS.WidgetBridgePackage\n$1'
  );

  // Add package to getPackages()
  modified = modified.replace(
    /PackageList\(this\)\.packages\.apply \{/,
    'PackageList(this).packages.apply {\n            // Widget bridge — registered by plugin/index.js\n            add(WidgetBridgePackage())'
  );

  config.modResults.contents = modified;
  return config;
}

// ─── Export combined plugin ───────────────────────────────────────────────────

module.exports = function withLedgerWidget(config) {
  config = withAndroidManifest(config, modifyManifest);
  config = withDangerousMod(config, ['android', copyNativeFiles]);
  config = withMainApplication(config, addWidgetPackage);
  return config;
};
