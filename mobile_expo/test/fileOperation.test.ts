import assert from 'node:assert/strict';
import test from 'node:test';

import { decodePickedBytes, MAX_IMPORT_BYTES, type FileResult, type PickedTextDocument } from '../src/backup/fileGateway.ts';
import { FileOperationCoordinator } from '../src/backup/fileOperationCoordinator.ts';
import { PendingNavigation } from '../src/navigation/pendingNavigation.ts';
import { deferred, FakeFileGateway } from './support/fakes.ts';

const SYNTHETIC = '{"foundationSynthetic":true,"text":"שלום ₪ 123"}';
const BOM = String.fromCharCode(0xfeff);

function setup() {
  const gateway = new FakeFileGateway();
  const navigation = new PendingNavigation();
  return { gateway, navigation, files: new FileOperationCoordinator(gateway, navigation) };
}

test('import result survives the lock: parked in memory until the user decides, then handed over once', async () => {
  const { gateway, navigation, files } = setup();
  const picker = deferred<FileResult<PickedTextDocument>>();
  gateway.pickResult = picker;
  const started = files.startImport();
  assert.deepEqual(files.state.get(), { phase: 'working', operation: 'import' });

  // The picker backgrounds the app -> lock -> every screen unmounts. The
  // coordinator is not a screen: the pending await is unaffected.
  picker.resolve({ status: 'ok', value: { name: 'b.json', text: SYNTHETIC, byteLength: 60 } });
  await started;

  assert.deepEqual(files.state.get(), { phase: 'awaitingDecision', name: 'b.json', byteLength: 60 });
  assert.equal(navigation.take(false), null, 'still locked: no navigation');
  assert.deepEqual(navigation.take(true), { screen: 'settings', source: 'fileOperation' }, 'after unlock: back to Settings');
  assert.equal(files.takePendingDocument(), SYNTHETIC);
  assert.equal(files.takePendingDocument(), null, 'never replayable');
  assert.deepEqual(files.state.get(), { phase: 'finished', operation: 'import', outcome: 'succeeded', failureKind: null });
});

test('while a decision is pending, new operations are refused', async () => {
  const { gateway, files } = setup();
  gateway.pickResult = { status: 'ok', value: { name: 'a', text: 'x', byteLength: 1 } };
  await files.startImport();
  await files.startExport('share', 'f.json', '{}');
  assert.equal(gateway.shared.length, 0);
  assert.equal(files.state.get().phase, 'awaitingDecision');
});

test('declining drops the document; zero writes by construction', async () => {
  const { gateway, files } = setup();
  gateway.pickResult = { status: 'ok', value: { name: 'a', text: 'x', byteLength: 1 } };
  await files.startImport();
  files.discardPendingDocument();
  assert.deepEqual(files.state.get(), { phase: 'finished', operation: 'import', outcome: 'cancelled', failureKind: null });
  assert.equal(files.takePendingDocument(), null);
});

test('cancellation is not an error, and still returns the user to Settings', async () => {
  const { gateway, navigation, files } = setup();
  gateway.pickResult = { status: 'cancelled' };
  await files.startImport();
  assert.deepEqual(files.state.get(), { phase: 'finished', operation: 'import', outcome: 'cancelled', failureKind: null });
  assert.deepEqual(navigation.take(true), { screen: 'settings', source: 'fileOperation' });
  files.acknowledge();
  assert.deepEqual(files.state.get(), { phase: 'idle' });
});

test('typed failures pass through; an unexpected throw becomes a secret-free read failure', async () => {
  const { gateway, files } = setup();
  gateway.pickResult = { status: 'failed', failure: { kind: 'decode' } };
  await files.startImport();
  assert.deepEqual(files.state.get(), { phase: 'finished', operation: 'import', outcome: 'failed', failureKind: 'decode' });
  files.acknowledge();
  gateway.throwOnPick = true;
  await files.startImport();
  const s = files.state.get();
  assert.deepEqual(s, { phase: 'finished', operation: 'import', outcome: 'failed', failureKind: 'read' });
  assert.doesNotMatch(JSON.stringify(s), /private|user-data/);
});

test('export via share sheet and via folder report their outcome', async () => {
  const { gateway, files } = setup();
  await files.startExport('share', 'f.json', SYNTHETIC);
  assert.deepEqual(gateway.shared, [{ fileName: 'f.json', text: SYNTHETIC }]);
  assert.deepEqual(files.state.get(), { phase: 'finished', operation: 'exportShare', outcome: 'succeeded', failureKind: null });
  files.acknowledge();
  gateway.folderResult = { status: 'cancelled' };
  await files.startExport('folder', 'f.json', SYNTHETIC);
  assert.deepEqual(files.state.get(), { phase: 'finished', operation: 'exportFolder', outcome: 'cancelled', failureKind: null });
});

test('decodePickedBytes: strict UTF-8, one BOM stripped, empty and oversize refused', () => {
  const enc = new TextEncoder();
  assert.deepEqual(decodePickedBytes(enc.encode(SYNTHETIC)), { ok: true, value: SYNTHETIC });
  assert.deepEqual(decodePickedBytes(enc.encode(`${BOM}${BOM}{}`)), { ok: true, value: `${BOM}{}` });
  assert.deepEqual(decodePickedBytes(new Uint8Array([0x7b, 0xc0, 0x80, 0x7d])), { ok: false, error: { kind: 'decode' } });
  assert.deepEqual(decodePickedBytes(new Uint8Array([])), { ok: false, error: { kind: 'empty' } });
  assert.deepEqual(decodePickedBytes(new Uint8Array(11), 10), { ok: false, error: { kind: 'tooLarge' } });
  assert.equal(MAX_IMPORT_BYTES, 32 * 1024 * 1024);
});
