import 'dart:convert';
import 'dart:typed_data';

import 'package:familyfinance_pro/data/files/backup_file_gateway.dart';

/// Programmable [BackupFileGateway] test double.
///
/// Deliberately records what it was asked to write: several tests assert on
/// the EXACT bytes the export path produced (envelope shape, indentation,
/// absence of `ff_pin_v1`), which is only observable here.
class FakeBackupFileGateway implements BackupFileGateway {
  FakeBackupFileGateway({
    this.saveResult,
    this.pickResult = const FileTransferCancelled<PickedFile>(),
  });

  /// `null` means "succeed with a canned URI".
  FileTransferResult<Uri>? saveResult;
  FileTransferResult<PickedFile> pickResult;

  int saveCalls = 0;
  int pickCalls = 0;

  String? lastSuggestedFileName;
  String? lastMimeType;
  Uint8List? lastSavedBytes;

  @override
  Future<FileTransferResult<Uri>> saveBackup({
    required String suggestedFileName,
    required Uint8List bytes,
    required String mimeType,
  }) async {
    saveCalls++;
    lastSuggestedFileName = suggestedFileName;
    lastMimeType = mimeType;
    lastSavedBytes = bytes;
    return saveResult ?? FileTransferOk(Uri.parse('content://test/$suggestedFileName'));
  }

  @override
  Future<FileTransferResult<PickedFile>> pickBackup() async {
    pickCalls++;
    return pickResult;
  }

  /// Convenience: make the next pick return [text] as UTF-8 bytes.
  void willPickText(String text, {String name = 'backup.json'}) {
    pickResult = FileTransferOk(
      PickedFile(name: name, bytes: Uint8List.fromList(utf8.encode(text))),
    );
  }

  /// Convenience: make the next pick return raw [bytes] verbatim (used for
  /// the malformed-UTF-8 and empty-file cases).
  void willPickBytes(List<int> bytes, {String name = 'backup.json'}) {
    pickResult = FileTransferOk(
      PickedFile(name: name, bytes: Uint8List.fromList(bytes)),
    );
  }
}
