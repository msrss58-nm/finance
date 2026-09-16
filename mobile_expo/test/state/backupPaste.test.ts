// "📋 הדבק גיבוי" (app.js checkPastedRestoreBackup): the pasted text uses the same
// parse / validate / preview / confirm pipeline as a picked file.
process.env.TZ = 'Asia/Jerusalem';

import assert from 'node:assert/strict';
import test from 'node:test';

import { FileOperationCoordinator } from '../../src/backup/fileOperationCoordinator.ts';
import { serializeBackup } from '../../src/domain/backup.ts';
import { PendingNavigation } from '../../src/navigation/pendingNavigation.ts';
import { BACKUP_MESSAGES, BackupController } from '../../src/state/backupController.ts';
import { FakeFileGateway } from '../support/fakes.ts';
import { financeHarness } from '../support/financeHarness.ts';

async function setup(entries: Record<string, string> = {}) {
  const h = await financeHarness(entries);
  await h.finance.load();
  const files = new FileOperationCoordinator(new FakeFileGateway(), new PendingNavigation());
  const backup = new BackupController({ files, finance: h.finance, repository: h.repository, clock: () => h.clock.now });
  return { h, files, backup };
}

test('paste: empty text shows the Web hint and changes nothing', async () => {
  const { h, backup } = await setup({ family_finance_data: '[]' });
  assert.equal(await backup.checkPastedBackup('   \n '), false);
  assert.deepEqual(backup.state.get().message, { tone: 'info', text: BACKUP_MESSAGES.pasteEmpty });
  assert.equal(BACKUP_MESSAGES.pasteEmpty, 'לא הודבק תוכן גיבוי.');
  assert.equal(backup.state.get().preview, null);
  assert.equal(await h.kv.get('family_finance_data'), '[]');
});

test('paste: malformed text is rejected with the invalid-backup message and writes nothing', async () => {
  const { h, backup } = await setup({ family_finance_data: '[]' });
  for (const text of ['{not json', '{"data":{}}', '{"schemaVersion":2,"data":{"family_finance_data":"[]"}}']) {
    assert.equal(await backup.checkPastedBackup(text), false, text);
    assert.equal(backup.state.get().preview, null, text);
    assert.deepEqual(backup.state.get().message, { tone: 'error', text: BACKUP_MESSAGES.invalidBackup }, text);
  }
  assert.equal(await h.kv.get('family_finance_data'), '[]');
});

test('paste: a valid Web backup opens the same preview; nothing is written before the explicit confirm', async () => {
  const { h, backup, files } = await setup({ family_finance_data: '[]' });
  const body = serializeBackup({
    schemaVersion: 2,
    exportedAt: '2026-09-01 09:00',
    data: {
      family_finance_data: '[{"id":1,"type":"income","title":"משכורת","amount":9000,"day":"10","isArchived":false}]',
      family_finance_goals: '[]',
    },
  });
  assert.equal(await backup.checkPastedBackup(body), true);
  const preview = backup.state.get().preview;
  assert.ok(preview);
  assert.equal(preview.itemCount, 1);
  assert.equal(files.busy, false, 'the file coordinator is not involved in a paste');
  assert.equal(await h.kv.get('family_finance_data'), '[]', 'no write before confirmation');
  await backup.confirmRestore();
  assert.equal(await h.kv.get('family_finance_data'), '[{"id":1,"type":"income","title":"משכורת","amount":9000,"day":"10","isArchived":false}]');
  assert.equal(backup.state.get().preview, null);
});
