import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/data/files/backup_file_gateway.dart';
import 'package:familyfinance_pro/data/files/file_picker_backup_file_gateway.dart';

/// Milestone 8 — the PRODUCTION gateway's mapping of the plugin's contract
/// onto this app's three-valued result type.
///
/// This is where "cancel is not an error", "a plugin exception never becomes
/// a silent success", and the size ceiling are actually verified, by swapping
/// the plugin's own platform instance rather than by trusting the fake used
/// elsewhere. No platform channel and no real file system are involved.

/// Minimal [PlatformFile] test double.
///
/// `xFile` is overridden with a `Never` return type so this file does not
/// need to import `cross_file` (a transitive dependency this app does not
/// declare): nothing under test ever reads it.
final class _FakePlatformFile extends PlatformFile {
  _FakePlatformFile({
    required this.name,
    required List<int> bytes,
    this.reportedLength,
    this.throwOnRead = false,
  }) : _bytes = Uint8List.fromList(bytes);

  @override
  final String name;

  final Uint8List _bytes;

  /// `null` reproduces a platform that does not report a size up front, so
  /// the gateway's fallback to the async `length()` is exercised too.
  final int? reportedLength;

  final bool throwOnRead;

  @override
  Uri get uri => Uri.parse('content://test/$name');

  @override
  Never get xFile => throw UnimplementedError();

  @override
  int? lengthSync() => reportedLength;

  @override
  Future<int> length() async => _bytes.length;

  @override
  Future<Uint8List> readAsBytes() async {
    if (throwOnRead) throw StateError('read failed');
    return _bytes;
  }

  @override
  Stream<Uint8List> readAsByteStream() => Stream.value(_bytes);
}

/// Programmable stand-in for the plugin's platform implementation.
class _FakeFilePickerPlatform extends FilePickerPlatform {
  PlatformFile? pickResult;
  Object? pickThrows;

  Uri? saveResult;
  Object? saveThrows;

  String? lastSaveFileName;
  String? lastSaveMimeType;
  Uint8List? lastSaveBytes;

  @override
  Future<PlatformFile?> pickFile({
    String? dialogTitle,
    String? initialDirectory,
    FileType type = FileType.any,
    List<String>? allowedExtensions,
    Function(FilePickerStatus)? onFileLoading,
    int compressionQuality = 0,
    AndroidOptions androidOptions = const AndroidOptions(),
    DarwinOptions darwinOptions = const DarwinOptions(),
    WindowsOptions windowsOptions = const WindowsOptions(),
    LinuxOptions linuxOptions = const LinuxOptions(),
    WebOptions webOptions = const WebOptions(),
  }) async {
    final t = pickThrows;
    if (t != null) throw t;
    return pickResult;
  }

  @override
  Future<Uri?> saveFile({
    required String fileName,
    required Uint8List bytes,
    required String mimeType,
    String? dialogTitle,
    String? initialDirectory,
    Function(FilePickerStatus)? onFileSaving,
    WindowsOptions windowsOptions = const WindowsOptions(),
    LinuxOptions linuxOptions = const LinuxOptions(),
    WebOptions webOptions = const WebOptions(),
  }) async {
    lastSaveFileName = fileName;
    lastSaveMimeType = mimeType;
    lastSaveBytes = bytes;
    final t = saveThrows;
    if (t != null) throw t;
    return saveResult;
  }
}

void main() {
  late _FakeFilePickerPlatform platform;
  late FilePickerBackupFileGateway gateway;

  setUp(() {
    platform = _FakeFilePickerPlatform();
    FilePickerPlatform.instance = platform;
    gateway = const FilePickerBackupFileGateway();
  });

  group('saveBackup', () {
    test('passes the name, mime type and bytes through unchanged', () async {
      platform.saveResult = Uri.parse('content://downloads/backup.json');
      final bytes = Uint8List.fromList([1, 2, 3]);

      final result = await gateway.saveBackup(
        suggestedFileName: 'familyfinance-backup-2026-09-06.json',
        bytes: bytes,
        mimeType: 'application/json',
      );

      expect(result, isA<FileTransferOk<Uri>>());
      expect((result as FileTransferOk<Uri>).value.toString(),
          'content://downloads/backup.json');
      expect(platform.lastSaveFileName, 'familyfinance-backup-2026-09-06.json');
      expect(platform.lastSaveMimeType, 'application/json');
      expect(platform.lastSaveBytes, bytes);
    });

    test('a null URI means the user cancelled — not a failure', () async {
      platform.saveResult = null;
      final result = await gateway.saveBackup(
        suggestedFileName: 'b.json',
        bytes: Uint8List(0),
        mimeType: 'application/json',
      );
      expect(result, isA<FileTransferCancelled<Uri>>());
    });

    test('a plugin exception becomes a typed, secret-free save failure',
        () async {
      platform.saveThrows = StateError('boom: /storage/emulated/0/secret.json');
      final result = await gateway.saveBackup(
        suggestedFileName: 'b.json',
        bytes: Uint8List(0),
        mimeType: 'application/json',
      );

      expect(result, isA<FileTransferFailed<Uri>>());
      final error = (result as FileTransferFailed<Uri>).error;
      expect(error, isA<FileSaveFailure>());
      expect(error.message.contains('secret.json'), isFalse);
      expect(error.causeType, 'StateError');
    });
  });

  group('pickBackup', () {
    test('returns the file name and its bytes', () async {
      platform.pickResult = _FakePlatformFile(
        name: 'my-backup.json',
        bytes: const [10, 20, 30],
        reportedLength: 3,
      );

      final result = await gateway.pickBackup();
      expect(result, isA<FileTransferOk<PickedFile>>());
      final picked = (result as FileTransferOk<PickedFile>).value;
      expect(picked.name, 'my-backup.json');
      expect(picked.bytes, [10, 20, 30]);
    });

    test('falls back to the async length when the platform reports none',
        () async {
      platform.pickResult = _FakePlatformFile(
        name: 'b.json',
        bytes: const [1, 2],
        reportedLength: null,
      );
      expect(await gateway.pickBackup(), isA<FileTransferOk<PickedFile>>());
    });

    test('a null result means the user cancelled — not a failure', () async {
      platform.pickResult = null;
      expect(await gateway.pickBackup(), isA<FileTransferCancelled<PickedFile>>());
    });

    test('a plugin exception becomes a typed pick failure', () async {
      platform.pickThrows = StateError('picker exploded');
      final result = await gateway.pickBackup();
      expect(result, isA<FileTransferFailed<PickedFile>>());
      expect((result as FileTransferFailed<PickedFile>).error,
          isA<FilePickFailure>());
    });

    test('a read failure becomes a typed read failure, never empty bytes',
        () async {
      platform.pickResult = _FakePlatformFile(
        name: 'b.json',
        bytes: const [1, 2, 3],
        reportedLength: 3,
        throwOnRead: true,
      );
      final result = await gateway.pickBackup();
      expect(result, isA<FileTransferFailed<PickedFile>>());
      expect((result as FileTransferFailed<PickedFile>).error,
          isA<FileReadFailure>());
    });

    test('an implausibly large file is refused before it is read', () async {
      const small = FilePickerBackupFileGateway(maxBytes: 8);
      platform.pickResult = _FakePlatformFile(
        name: 'huge.json',
        bytes: List<int>.filled(64, 7),
        reportedLength: 64,
      );

      final result = await small.pickBackup();
      expect(result, isA<FileTransferFailed<PickedFile>>());
      expect((result as FileTransferFailed<PickedFile>).error,
          isA<FileTooLargeFailure>());
    });

    test('the size ceiling is enforced again after reading', () async {
      // A platform that under-reports the size must not be able to smuggle a
      // huge payload past the first check.
      const small = FilePickerBackupFileGateway(maxBytes: 8);
      platform.pickResult = _FakePlatformFile(
        name: 'lying.json',
        bytes: List<int>.filled(64, 7),
        reportedLength: 1,
      );

      final result = await small.pickBackup();
      expect(result, isA<FileTransferFailed<PickedFile>>());
      expect((result as FileTransferFailed<PickedFile>).error,
          isA<FileTooLargeFailure>());
    });
  });
}
