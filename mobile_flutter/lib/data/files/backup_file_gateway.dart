import 'dart:typed_data';

/// Milestone 8's native-file boundary.
///
/// This layer knows about BYTES and about the native picker only. It
/// deliberately knows NOTHING about:
///   - what a valid FamilyFinance backup looks like (that is
///     `validateBackupShape` / [BackupRepository]'s job),
///   - repositories, Drift, or any write path,
///   - the PIN, [SecureSecretStore], or any security state.
///
/// Keeping it this narrow is what makes "no repository write can possibly
/// happen inside the file layer" a structural property rather than a
/// convention: there is no repository reachable from here at all.

/// Typed, secret-free failure from the native file layer.
///
/// Same hard rule the security layer already follows: [message] is a fixed
/// Hebrew literal and [causeType] is at most the *runtime type name* of an
/// underlying platform exception — never its text, never a file path, and
/// never any byte of the file's contents. A picked file is untrusted input;
/// echoing it back into an error string (or a log line) would leak the
/// user's financial data into places it was never meant to reach.
sealed class FileTransferError {
  const FileTransferError(this.message, {this.causeType});

  final String message;
  final String? causeType;

  @override
  String toString() => causeType == null
      ? '$runtimeType: $message'
      : '$runtimeType: $message ($causeType)';
}

/// The native "save as" dialog itself failed (not a cancellation).
final class FileSaveFailure extends FileTransferError {
  const FileSaveFailure({super.causeType}) : super('שמירת הקובץ נכשלה');
}

/// The native "open document" dialog itself failed (not a cancellation).
final class FilePickFailure extends FileTransferError {
  const FilePickFailure({super.causeType}) : super('פתיחת בורר הקבצים נכשלה');
}

/// A file was selected but its bytes could not be read.
final class FileReadFailure extends FileTransferError {
  const FileReadFailure({super.causeType}) : super('קריאת הקובץ נכשלה');
}

/// A file was selected but is far larger than any real backup could be.
/// Refused BEFORE the bytes are read into memory, so a hostile/huge file
/// cannot be used to exhaust memory.
final class FileTooLargeFailure extends FileTransferError {
  const FileTooLargeFailure() : super('הקובץ גדול מכדי להיות גיבוי תקין');
}

/// Three-valued outcome of a native file interaction.
///
/// Cancellation is modelled as its own case ON PURPOSE: a user who backs
/// out of the picker did nothing wrong, so it must never be reported (or
/// handled) as an error.
sealed class FileTransferResult<T> {
  const FileTransferResult();
}

final class FileTransferOk<T> extends FileTransferResult<T> {
  const FileTransferOk(this.value);
  final T value;
}

final class FileTransferCancelled<T> extends FileTransferResult<T> {
  const FileTransferCancelled();
}

final class FileTransferFailed<T> extends FileTransferResult<T> {
  const FileTransferFailed(this.error);
  final FileTransferError error;
}

/// A file the user picked, already read into memory.
class PickedFile {
  const PickedFile({required this.name, required this.bytes});

  /// The display name reported by the platform (e.g. `backup.json`). Used
  /// for UI text only — never to decide whether the contents are valid.
  final String name;

  final Uint8List bytes;
}

/// The abstraction the import/export coordinator depends on. Production
/// wiring is `FilePickerBackupFileGateway`; tests use `FakeBackupFileGateway`
/// and never touch a platform channel.
abstract interface class BackupFileGateway {
  /// Opens the platform's native "save as" flow and writes [bytes] to
  /// whatever destination the user chooses.
  ///
  /// Returns the saved document's URI on success, [FileTransferCancelled]
  /// when the user backs out, and [FileTransferFailed] only for a real I/O
  /// failure.
  Future<FileTransferResult<Uri>> saveBackup({
    required String suggestedFileName,
    required Uint8List bytes,
    required String mimeType,
  });

  /// Opens the platform's native document picker for a single file and
  /// reads it.
  Future<FileTransferResult<PickedFile>> pickBackup();
}
