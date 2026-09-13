// Stage 0 file probe: native export (Android SAF directory tree, or the share
// sheet), native import (document picker), cancellation, UTF-8 JSON round
// trip. The flow state lives in fileFlowStore (outside React) so a picker that
// backgrounds the app — and therefore locks it — cannot lose the result.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { allowsSensitiveContent } from './lockMachine';
import { note, record } from './log';
import { fileFlowStore, lockStore, type FileFlowPhase } from './stores';
import { RAW_FIXTURES, buildProbeEnvelope, dateKey, type ProbeBackupEnvelope } from './synthetic';

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function probeEnvelopeText(): string {
  return JSON.stringify(buildProbeEnvelope(RAW_FIXTURES, new Date().toISOString()), null, 2);
}

function fileName(): string {
  return `familyfinance-probe-${dateKey(new Date())}.json`;
}

function finish(phase: FileFlowPhase, message: string): void {
  // If the result arrives while the shell is locked (picker backgrounded the
  // app), ask the shell to reopen Settings after unlock — same as Flutter M10.
  const shellGone = !allowsSensitiveContent(lockStore.get());
  note('file', `finish phase=${phase} lock=${lockStore.get().kind} returnToSettings=${shellGone}`);
  fileFlowStore.set({ phase, message, returnToSettings: shellGone });
}

function isCancel(e: unknown): boolean {
  return /cancel/i.test(String(e));
}

/** Android: SAF directory picker (no storage permission) + create + write + read back. */
export async function exportViaSafDirectory(): Promise<void> {
  fileFlowStore.set({ phase: 'picking', message: 'בחירת תיקייה…', returnToSettings: false });
  const text = probeEnvelopeText();
  try {
    const dir = await Directory.pickDirectoryAsync();
    const file = dir.createFile(fileName(), 'application/json');
    file.write(text);
    const back = await file.text();
    const ok = back === text;
    record('file', 'saf-export-roundtrip', ok, `bytes=${utf8Length(text)} scheme=${file.uri.split(':')[0]}`);
    finish(ok ? 'done' : 'failed', ok ? 'הקובץ נשמר ונקרא בחזרה זהה' : 'אי-התאמה בקריאה חוזרת');
  } catch (e) {
    if (isCancel(e)) {
      record('file', 'saf-export-cancel', true, 'user cancelled, nothing written');
      finish('cancelled', 'הייצוא בוטל');
    } else {
      record('file', 'saf-export', false, String(e));
      finish('failed', 'הייצוא נכשל');
    }
  }
}

/** iOS/Android: write to cache, hand to the OS share sheet ("Save to Files"). */
export async function exportViaShareSheet(): Promise<void> {
  fileFlowStore.set({ phase: 'picking', message: 'חלון שיתוף…', returnToSettings: false });
  try {
    const text = probeEnvelopeText();
    const file = new File(Paths.cache, fileName());
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'ייצוא גיבוי' });
    record('file', 'share-export', true, `bytes=${utf8Length(text)} (share sheet dismissed; destination unknown to app)`);
    finish('done', 'חלון השיתוף נסגר');
  } catch (e) {
    record('file', 'share-export', false, String(e));
    finish('failed', 'השיתוף נכשל');
  }
}

let pendingImport: ProbeBackupEnvelope | null = null;

/** Picker -> read -> parse -> compare. Never writes: confirmation is separate. */
export async function importViaPicker(): Promise<void> {
  fileFlowStore.set({ phase: 'picking', message: 'בחירת קובץ…', returnToSettings: false });
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', 'application/octet-stream'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) {
      record('file', 'import-cancel', true, 'user cancelled, nothing read or written');
      finish('cancelled', 'הייבוא בוטל');
      return;
    }
    const asset = res.assets[0];
    const text = await new File(asset.uri).text();
    const parsed = JSON.parse(text) as ProbeBackupEnvelope;
    const exact = RAW_FIXTURES.every(([k, v]) => parsed.data?.[k] === v);
    record('file', 'import-roundtrip', exact, `name=${asset.name} bytes=${utf8Length(text)} rawValuesExact=${exact}`);
    pendingImport = exact ? parsed : null;
    finish(exact ? 'awaitingConfirm' : 'failed', exact ? 'הקובץ תקין — ממתין לאישור' : 'הקובץ אינו תואם');
  } catch (e) {
    record('file', 'import', false, String(e));
    finish('failed', 'הייבוא נכשל');
  }
}

/** Probe-only confirmation: proves the validated payload survived a lock. */
export function confirmPendingImport(): void {
  const ok = pendingImport !== null;
  record('file', 'import-confirm-after-lock', ok, ok ? `keys=${Object.keys(pendingImport!.data).length} (no write performed)` : 'nothing pending');
  pendingImport = null;
  fileFlowStore.set({ phase: ok ? 'done' : 'failed', message: ok ? 'אושר (בדיקה בלבד, ללא כתיבה)' : 'אין ייבוא ממתין', returnToSettings: false });
}
