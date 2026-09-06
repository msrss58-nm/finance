import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

import 'backup_file_gateway.dart';

/// Hard ceiling on a file this app is willing to read into memory.
///
/// A real FamilyFinance backup is a few hundred KB at the very most (it is
/// a handful of JSON-encoded localStorage values). 32 MB is orders of
/// magnitude above any legitimate case and exists purely so a hostile or
/// mistakenly-picked file cannot be used to exhaust memory before a single
/// byte of it has been parsed.
const int kMaxPickedBackupFileBytes = 32 * 1024 * 1024;

/// Production [BackupFileGateway], implemented over `file_picker` 12.2.0.
///
/// Platform behavior this deliberately relies on (rather than reimplementing):
///   - Android: `saveFile`/`pickFile` go through the Storage Access
///     Framework (`ACTION_CREATE_DOCUMENT` / `ACTION_OPEN_DOCUMENT`). The
///     app therefore writes only to a destination the user explicitly chose,
///     never to a hard-coded `/sdcard` path, and needs NO storage permission
///     at all — the plugin's own manifest declares none (only a `<queries>`
///     entry), and this milestone adds none.
///   - iOS: the same two calls map to `UIDocumentPicker`. Nothing in this
///     class is Android-specific; the shared Dart layer above it is
///     platform-neutral by construction.
///
/// `FileType.any` is used for picking ON PURPOSE. Filtering by extension on
/// Android translates into a MIME-type filter applied by the *document
/// provider*, and a legitimate backup that arrived via a share sheet, a
/// messaging app or a cloud provider is frequently reported as
/// `text/plain` or `application/octet-stream` — filtering would hide the
/// user's own valid backup from them with no way to override. Trust is
/// established by fully validating the CONTENT (BackupTransferService ->
/// validateBackupShape), never by the file's name or declared type.
class FilePickerBackupFileGateway implements BackupFileGateway {
  const FilePickerBackupFileGateway({this.maxBytes = kMaxPickedBackupFileBytes});

  final int maxBytes;

  @override
  Future<FileTransferResult<Uri>> saveBackup({
    required String suggestedFileName,
    required Uint8List bytes,
    required String mimeType,
  }) async {
    try {
      final uri = await FilePicker.saveFile(
        fileName: suggestedFileName,
        bytes: bytes,
        mimeType: mimeType,
        dialogTitle: 'שמירת גיבוי',
      );
      // `null` is the plugin's documented "user cancelled" signal — not an
      // error, and explicitly not a failure state for the caller.
      if (uri == null) return const FileTransferCancelled();
      return FileTransferOk(uri);
    } catch (e) {
      return FileTransferFailed(
        FileSaveFailure(causeType: e.runtimeType.toString()),
      );
    }
  }

  @override
  Future<FileTransferResult<PickedFile>> pickBackup() async {
    final PlatformFile? file;
    try {
      file = await FilePicker.pickFile(dialogTitle: 'בחירת קובץ גיבוי');
    } catch (e) {
      return FileTransferFailed(
        FilePickFailure(causeType: e.runtimeType.toString()),
      );
    }
    if (file == null) return const FileTransferCancelled();

    try {
      // Size is checked BEFORE reading. `lengthSync()` is the size the
      // native picker already reported; when the platform did not report
      // one, fall back to the async `length()` rather than reading blindly.
      final knownLength = file.lengthSync() ?? await file.length();
      if (knownLength > maxBytes) {
        return const FileTransferFailed(FileTooLargeFailure());
      }
      final bytes = await file.readAsBytes();
      if (bytes.length > maxBytes) {
        return const FileTransferFailed(FileTooLargeFailure());
      }
      return FileTransferOk(PickedFile(name: file.name, bytes: bytes));
    } catch (e) {
      return FileTransferFailed(
        FileReadFailure(causeType: e.runtimeType.toString()),
      );
    }
  }
}
