// Backup / restore / CSV / reset product flows over the Stage 1 coordinator and Stage 2 contract.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import type { FileResult, PickedTextDocument } from '../../src/backup/fileGateway.ts';
import { FileOperationCoordinator } from '../../src/backup/fileOperationCoordinator.ts';
import { serializeBackup, type BackupEnvelope } from '../../src/domain/backup.ts';
import { PendingNavigation } from '../../src/navigation/pendingNavigation.ts';
import { BACKUP_MESSAGES, BackupController, restoreDoneMessage } from '../../src/state/backupController.ts';
import { deferred, FakeFileGateway } from '../support/fakes.ts';
import { financeHarness, goalRecord, ready } from '../support/financeHarness.ts';

class RecordingGateway extends FakeFileGateway {
  readonly mimes: (string | undefined)[] = [];
  override async shareJson(fileName: string, text: string, mimeType?: string): Promise<FileResult<void>> {
    this.mimes.push(mimeType);
    return super.shareJson(fileName, text);
  }
}

async function setup(entries: Record<string, string> = {}) {
  const h = await financeHarness(entries);
  await h.finance.load();
  const gateway = new RecordingGateway();
  const navigation = new PendingNavigation();
  const files = new FileOperationCoordinator(gateway, navigation);
  const backup = new BackupController({ files, finance: h.finance, repository: h.repository, clock: () => h.clock.now });
  return { h, gateway, navigation, files, backup };
}

const pick = (text: string): FileResult<PickedTextDocument> => ({ status: 'ok', value: { name: 'b.json', text, byteLength: text.length } });

test('export: the schemaVersion-2 envelope with family_finance_* only, one activity line, honest message', async () => {
  const { h, gateway, backup } = await setup({
    family_finance_data: '[{"id":1,"type":"income","title":"x","amount":5}]',
    family_finance_settings: '{"pinHash":"legacy-inert"}',
    ff_security_marker_v1: '{"v":1,"lockConfigured":true}',
    ff_goals_reminder_v1: '{"enabled":true}',
  });
  await backup.exportBackup('share');
  assert.equal(gateway.shared.length, 1);
  assert.equal(gateway.shared[0]?.fileName, 'familyfinance-backup-2026-09-14.json');
  assert.deepEqual(gateway.mimes, ['application/json']);
  const text = gateway.shared[0]?.text as string;
  const env = JSON.parse(text) as BackupEnvelope;
  assert.equal(env.schemaVersion, 2);
  assert.equal(env.exportedAt, '2026-09-14 10:00');
  assert.deepEqual(Object.keys(env.data).sort(), ['family_finance_data', 'family_finance_goals', 'family_finance_settings']);
  assert.equal(env.data.family_finance_goals, '[]', 'absent goals export as a valid empty list');
  assert.equal(env.data.family_finance_settings, '{"pinHash":"legacy-inert"}', 'raw string, legacy pinHash inert');
  assert.equal(text, serializeBackup(env), 'byte-identical to the Web serialisation');
  assert.deepEqual(backup.state.get().message, { tone: 'success', text: BACKUP_MESSAGES.shareDone });
  const log = JSON.parse((await h.kv.get('family_finance_activity_log')) as string) as { action: string; detail: string }[];
  assert.deepEqual(log.map((e) => [e.action, e.detail]), [['backup', 'גיבוי יוצא (3 מפתחות)']]);
});

test('export is refused while local goals are corrupt; a cancelled folder export logs nothing', async () => {
  const bad = await setup({ family_finance_goals: 'corrupt' });
  await bad.backup.exportBackup('share');
  assert.equal(bad.gateway.shared.length, 0);
  assert.deepEqual(bad.backup.state.get().message, { tone: 'error', text: BACKUP_MESSAGES.goalsCorruptExport });
  const c = await setup();
  c.gateway.folderResult = { status: 'cancelled' };
  await c.backup.exportBackup('folder');
  assert.deepEqual(c.backup.state.get().message, { tone: 'info', text: BACKUP_MESSAGES.exportCancelled });
  assert.equal(await c.h.kv.get('family_finance_activity_log'), null);
});

test('import: cancel and malformed files change nothing', async () => {
  const { h, gateway, backup } = await setup({ family_finance_data: '[]' });
  gateway.pickResult = { status: 'cancelled' };
  await backup.startImport();
  assert.deepEqual(backup.state.get().message, { tone: 'info', text: BACKUP_MESSAGES.importCancelled });
  for (const text of ['{not json', '{"data":{}}', '{"data":{"other_key":"1"}}', '{"schemaVersion":2,"data":{"family_finance_data":"[]"}}']) {
    gateway.pickResult = pick(text);
    await backup.startImport();
    assert.equal(backup.state.get().preview, null, text);
    assert.deepEqual(backup.state.get().message, { tone: 'error', text: BACKUP_MESSAGES.invalidBackup }, text);
  }
  assert.equal(await h.kv.get('family_finance_data'), '[]');
});

test('import: a valid backup waits for explicit confirmation; cancel writes nothing; confirm restores atomically', async () => {
  const { h, gateway, backup } = await setup({ family_finance_data: '[]' });
  const env = {
    schemaVersion: 2,
    exportedAt: '2026-01-01 10:00',
    data: { family_finance_data: '[{"id":1,"type":"income","title":"X","amount":5,"day":"1","isArchived":false}]', family_finance_goals: '[]' },
  };
  gateway.pickResult = pick(JSON.stringify(env));
  await backup.startImport();
  assert.deepEqual(backup.state.get().preview, {
    goalsAware: true,
    itemCount: 1,
    categoryCount: 0,
    hasSettings: false,
    activityCount: 0,
    backupGoalsCount: 0,
    localGoalsValid: true,
    localGoalsCount: 0,
    localGoalsRawPresent: false,
  });
  assert.equal(await h.kv.get('family_finance_data'), '[]', 'nothing written before confirmation');
  backup.cancelRestore();
  assert.equal(backup.state.get().preview, null);
  assert.equal(await h.kv.get('family_finance_data'), '[]');
  await backup.startImport();
  await backup.confirmRestore();
  assert.equal(await h.kv.get('family_finance_data'), env.data.family_finance_data);
  assert.deepEqual(backup.state.get().message, { tone: 'success', text: restoreDoneMessage(2) });
  assert.equal(ready(h.finance).data.items.length, 1, 'data refreshed after success');
});

test('a pre-goals (v1) backup keeps local goals unless the user explicitly opts in to delete them', async () => {
  const goals = JSON.stringify([goalRecord()]);
  const keep = await setup({ family_finance_goals: goals });
  // A v1 backup that happens to carry a goals key: never restored (app.js confirmRestoreBackup()).
  keep.gateway.pickResult = pick('{"data":{"family_finance_data":"[]","family_finance_goals":"[]"}}');
  await keep.backup.startImport();
  assert.equal(keep.backup.state.get().preview?.goalsAware, false);
  assert.equal(keep.backup.state.get().preview?.localGoalsCount, 1);
  await keep.backup.confirmRestore();
  assert.equal(await keep.h.kv.get('family_finance_goals'), goals);
  const del = await setup({ family_finance_goals: goals });
  del.gateway.pickResult = pick('{"data":{"family_finance_data":"[]"}}');
  await del.backup.startImport();
  del.backup.setDeleteExistingGoals(true);
  await del.backup.confirmRestore();
  assert.equal(await del.h.kv.get('family_finance_goals'), '[]');
});

test('a picked file survives the lock: the preview lands on the controller and Settings is offered', async () => {
  const { gateway, navigation, backup } = await setup();
  const picker = deferred<FileResult<PickedTextDocument>>();
  gateway.pickResult = picker;
  const started = backup.startImport();
  assert.equal(backup.state.get().busy, 'import');
  // The picker backgrounds the app, the lock unmounts every screen; the controller is not a screen.
  picker.resolve(pick('{"schemaVersion":2,"data":{"family_finance_goals":"[]"}}'));
  await started;
  assert.ok(backup.state.get().preview);
  assert.equal(navigation.take(false), null, 'nothing navigates while locked');
  assert.deepEqual(navigation.take(true), { screen: 'settings', source: 'fileOperation' });
});

test('CSV export uses text/csv, a BOM and the Web file name', async () => {
  const { gateway, backup } = await setup({ family_finance_data: '[{"id":1,"type":"fixed","title":"a,b","amount":5}]' });
  await backup.exportCsv('share');
  assert.deepEqual(gateway.mimes, ['text/csv']);
  assert.equal(gateway.shared[0]?.fileName, 'familyfinance-transactions-2026-09-14.csv');
  assert.equal(gateway.shared[0]?.text.charCodeAt(0), 0xfeff);
});

test('reset needs the exact typed word; then every family_finance_* key is removed', async () => {
  const { h, backup } = await setup({ family_finance_data: '[]', ff_security_marker_v1: '{"v":1,"lockConfigured":true}' });
  assert.equal(await backup.resetAllData('אפס'), false);
  assert.equal(await h.kv.get('family_finance_data'), '[]');
  assert.deepEqual(backup.state.get().message, { tone: 'error', text: BACKUP_MESSAGES.resetWord });
  assert.equal(await backup.resetAllData(' איפוס '), true);
  assert.deepEqual(await h.kv.entriesWithPrefix('family_finance_'), []);
  assert.equal(await h.kv.get('ff_security_marker_v1'), '{"v":1,"lockConfigured":true}');
});
