// Config plugin (CNG): no Android Auto Backup and no device-to-device
// transfer of ANY app-private data.
//
// android:allowBackup="false" alone is not enough: for apps targeting
// Android 12+ (API 31+) it disables cloud backup only — device-to-device
// migration (Google / Samsung Smart Switch) still copies app data unless
// android:dataExtractionRules excludes it. expo-secure-store's own rules
// exclude only its SharedPreferences, which would still let the financial
// SQLite database (including the non-secret security marker) move to a new
// device while ff_pin_v1 (Keystore-bound) does not.
//
// The only supported way to move data between devices is the explicit
// financial backup (Settings ▸ Data, schemaVersion 2), which never carries
// ff_pin_v1 or other device-local secrets.
//
// app.json must set expo-secure-store's configureAndroidBackup to false so
// the two plugins do not compete for the same manifest attributes.

const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const TOOLS_NS = 'http://schemas.android.com/tools';
const BACKUP_RULES = 'ff_backup_rules';
const EXTRACTION_RULES = 'ff_data_extraction_rules';

// Every domain the Android backup schemes accept.
const DOMAINS = [
  'root',
  'file',
  'database',
  'sharedpref',
  'external',
  'device_root',
  'device_file',
  'device_database',
  'device_sharedpref',
];

const excludeAll = (indent) => DOMAINS.map((d) => `${indent}<exclude domain="${d}" path="." />`).join('\n');

// API 23–30 (android:fullBackupContent).
function backupRulesXml() {
  return `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n${excludeAll('  ')}\n</full-backup-content>\n`;
}

// API 31+ (android:dataExtractionRules): cloud backup AND device transfer.
function dataExtractionRulesXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<data-extraction-rules>',
    '  <cloud-backup>',
    excludeAll('    '),
    '  </cloud-backup>',
    '  <device-transfer>',
    excludeAll('    '),
    '  </device-transfer>',
    '</data-extraction-rules>',
    '',
  ].join('\n');
}

const REPLACED = ['android:allowBackup', 'android:fullBackupContent', 'android:dataExtractionRules'];

function applyNoBackupManifest(manifest) {
  const root = manifest.manifest;
  root.$ = root.$ || {};
  root.$['xmlns:tools'] = TOOLS_NS;
  const application = Array.isArray(root.application) ? root.application[0] : undefined;
  if (!application) throw new Error('withNoAndroidBackup: AndroidManifest has no <application>');
  application.$ = application.$ || {};
  application.$['android:allowBackup'] = 'false';
  application.$['android:fullBackupContent'] = `@xml/${BACKUP_RULES}`;
  application.$['android:dataExtractionRules'] = `@xml/${EXTRACTION_RULES}`;
  const replace = new Set((application.$['tools:replace'] || '').split(',').map((s) => s.trim()).filter(Boolean));
  for (const attr of REPLACED) replace.add(attr);
  application.$['tools:replace'] = [...replace].join(',');
  return manifest;
}

function withNoAndroidBackup(config) {
  config = withAndroidManifest(config, (c) => {
    c.modResults = applyNoBackupManifest(c.modResults);
    return c;
  });
  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${BACKUP_RULES}.xml`), backupRulesXml());
      fs.writeFileSync(path.join(dir, `${EXTRACTION_RULES}.xml`), dataExtractionRulesXml());
      return c;
    },
  ]);
  return config;
}

module.exports = withNoAndroidBackup;
module.exports.DOMAINS = DOMAINS;
module.exports.backupRulesXml = backupRulesXml;
module.exports.dataExtractionRulesXml = dataExtractionRulesXml;
module.exports.applyNoBackupManifest = applyNoBackupManifest;
