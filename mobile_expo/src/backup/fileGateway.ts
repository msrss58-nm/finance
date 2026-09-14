// Native file boundary (Stage 1 foundation): pick a JSON/text document, read
// it as strict UTF-8, export JSON via the share sheet or (Android) a SAF
// folder. It knows nothing about what a valid backup is — the backup
// validator/restore is a later stage — and nothing about security.

import { err, ok, type Result } from '../core/result.ts';
import { decodeUtf8Strict, stripLeadingBom } from '../core/utf8.ts';

export type FileFailureKind =
  | 'pick'
  | 'read'
  | 'tooLarge'
  | 'empty'
  | 'decode'
  | 'write'
  | 'share'
  | 'shareUnavailable'
  | 'unsupported';

export type FileFailure = { readonly kind: FileFailureKind; readonly causeType?: string };

/** Cancellation is its own outcome — the user did nothing wrong. */
export type FileResult<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly failure: FileFailure };

export type PickedTextDocument = {
  /** Platform display name — for UI text only, never trusted. */
  readonly name: string;
  readonly text: string;
  readonly byteLength: number;
};

/** Same ceiling as the Flutter oracle (kMaxPickedBackupFileBytes). */
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

export interface FileGateway {
  /** True where a folder (SAF) export exists — Android only. */
  readonly supportsFolderExport: boolean;
  pickTextDocument(): Promise<FileResult<PickedTextDocument>>;
  /**
   * Hands the file to the OS share sheet. `ok` = sheet closed; the destination
   * is unknown to the app. `mimeType` defaults to JSON (backups); CSV exports pass their own.
   */
  shareJson(fileName: string, text: string, mimeType?: string): Promise<FileResult<void>>;
  /** Android: user picks a folder, the file is created there and read back. */
  saveJsonToFolder(fileName: string, text: string, mimeType?: string): Promise<FileResult<{ readonly fileName: string }>>;
}

export const JSON_MIME_TYPE = 'application/json';
export const CSV_MIME_TYPE = 'text/csv';

/** Pure decode step shared by every gateway: size, emptiness, strict UTF-8, one BOM. */
export function decodePickedBytes(bytes: Uint8Array, maxBytes: number = MAX_IMPORT_BYTES): Result<string, FileFailure> {
  if (bytes.length > maxBytes) return err({ kind: 'tooLarge' });
  if (bytes.length === 0) return err({ kind: 'empty' });
  const text = decodeUtf8Strict(bytes);
  if (text === null) return err({ kind: 'decode' });
  return ok(stripLeadingBom(text));
}

export const FILE_FAILURE_MESSAGES: Record<FileFailureKind, string> = {
  pick: 'פתיחת בורר הקבצים נכשלה',
  read: 'קריאת הקובץ נכשלה',
  tooLarge: 'הקובץ גדול מדי',
  empty: 'הקובץ ריק',
  decode: 'הקובץ אינו טקסט UTF-8 תקין',
  write: 'שמירת הקובץ נכשלה',
  share: 'השיתוף נכשל',
  shareUnavailable: 'שיתוף אינו זמין במכשיר',
  unsupported: 'הפעולה אינה נתמכת במכשיר זה',
};
