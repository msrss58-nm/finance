// FileGateway bound to official Expo modules only (Stage 0 decision 8: no
// third-party "Save As" package).
//   import: expo-document-picker (copy to cache) -> strict UTF-8 decode; the
//           cached copy is deleted afterwards.
//   export: expo-sharing share sheet (iOS "Save to Files", Android targets),
//           or on Android a SAF folder chosen with Directory.pickDirectoryAsync
//           (no storage permission). expo-file-system has no
//           ACTION_CREATE_DOCUMENT "Save As" (Stage 0 finding).

import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  decodePickedBytes,
  MAX_IMPORT_BYTES,
  type FileFailure,
  type FileFailureKind,
  type FileGateway,
  type FileResult,
  type PickedTextDocument,
} from '../backup/fileGateway.ts';
import { causeTypeOf } from '../core/result.ts';

const EXPORT_DIR = 'ff-exports';
const JSON_MIME = 'application/json';

/** iOS Uniform Type Identifier for the share sheet. */
function utiFor(mimeType: string): string {
  if (mimeType === JSON_MIME) return 'public.json';
  if (mimeType === 'text/csv') return 'public.comma-separated-values-text';
  return 'public.plain-text';
}

function failed(kind: FileFailureKind, e?: unknown): { readonly status: 'failed'; readonly failure: FileFailure } {
  return { status: 'failed', failure: e === undefined ? { kind } : { kind, causeType: causeTypeOf(e) } };
}

/** expo-file-system's PickerCancelledException -> CodedException code. */
function isPickerCancelled(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'ERR_PICKER_CANCELLED';
}

/** A fresh, empty export folder in the app cache: an earlier export never lingers past the next one. */
function freshExportDirectory(): Directory {
  const dir = new Directory(Paths.cache, EXPORT_DIR);
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function deleteQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // best effort: a cache copy that cannot be deleted is cleared by the OS
  }
}

export function createExpoFileGateway(): FileGateway {
  return {
    supportsFolderExport: Platform.OS === 'android',

    async pickTextDocument(): Promise<FileResult<PickedTextDocument>> {
      let picked: DocumentPicker.DocumentPickerResult;
      try {
        picked = await DocumentPicker.getDocumentAsync({
          type: [JSON_MIME, 'text/plain', 'application/octet-stream'],
          copyToCacheDirectory: true,
          multiple: false,
        });
      } catch (e) {
        return failed('pick', e);
      }
      if (picked.canceled) return { status: 'cancelled' };
      const asset = picked.assets[0];
      if (asset === undefined) return { status: 'cancelled' };

      const file = new File(asset.uri);
      try {
        const size = asset.size ?? file.size;
        if (typeof size === 'number' && size > MAX_IMPORT_BYTES) return failed('tooLarge');
        let bytes: Uint8Array;
        try {
          bytes = await file.bytes();
        } catch (e) {
          return failed('read', e);
        }
        const decoded = decodePickedBytes(bytes);
        if (!decoded.ok) return { status: 'failed', failure: decoded.error };
        return { status: 'ok', value: { name: asset.name, text: decoded.value, byteLength: bytes.length } };
      } finally {
        // The picker copied the user's file into our cache; do not keep it.
        deleteQuietly(file);
      }
    },

    async shareJson(fileName: string, text: string, mimeType: string = JSON_MIME): Promise<FileResult<void>> {
      try {
        if (!(await Sharing.isAvailableAsync())) return failed('shareUnavailable');
      } catch (e) {
        return failed('share', e);
      }
      let file: File;
      try {
        file = new File(freshExportDirectory(), fileName);
        file.create();
        file.write(text);
      } catch (e) {
        return failed('write', e);
      }
      try {
        await Sharing.shareAsync(file.uri, { mimeType, UTI: utiFor(mimeType), dialogTitle: 'ייצוא' });
        return { status: 'ok', value: undefined };
      } catch (e) {
        return failed('share', e);
      }
    },

    async saveJsonToFolder(fileName: string, text: string, mimeType: string = JSON_MIME): Promise<FileResult<{ readonly fileName: string }>> {
      if (Platform.OS !== 'android') return failed('unsupported');
      let dir: Directory;
      try {
        dir = await Directory.pickDirectoryAsync();
      } catch (e) {
        return isPickerCancelled(e) ? { status: 'cancelled' } : failed('pick', e);
      }
      try {
        const file = dir.createFile(fileName, mimeType);
        file.write(text);
        // Read back: success is claimed only for bytes that are really there.
        if ((await file.text()) !== text) return failed('write');
        return { status: 'ok', value: { fileName: file.name } };
      } catch (e) {
        return failed('write', e);
      }
    },
  };
}
