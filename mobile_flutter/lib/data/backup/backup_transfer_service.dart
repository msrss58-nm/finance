import 'dart:convert';
import 'dart:typed_data';

import '../../core/errors/data_errors.dart';
import '../../core/types/result.dart';
import '../files/backup_file_gateway.dart';
import '../raw/raw_backup_envelope.dart';
import 'backup_service.dart';

/// Milestone 8's import/export coordinator: a thin I/O layer OVER the
/// already-approved backup contract.
///
/// It owns exactly three things — file naming, text encoding/decoding, and
/// the ORDER of operations — and delegates every judgement about what a
/// backup means to [BackupRepository] (`exportBackup` / `validate` /
/// `restore`). It contains no second validator, no second restore
/// implementation and no schema knowledge beyond the envelope type that
/// already existed.
///
/// The import path is split into two methods on purpose:
/// [prepareImport] can read, decode and validate but has NO access to a
/// write path (it never calls `restore`), and [commitImport] is the only
/// method that writes. "No repository write before full validation and
/// explicit user confirmation" is therefore structural, not a comment: the
/// UI physically cannot reach a write without first holding a
/// [BackupImportReady] that only successful validation can produce.
///
/// Security isolation is structural too: nothing in this file imports the
/// security layer, so the PIN, its salt/verifier and `ff_pin_v1` are not
/// reachable from any import/export path. The financial backup sweep is
/// `family_finance_*` keys out of [KeyValueStore]; the PIN record lives in
/// platform-secure storage under a different key entirely and is never part
/// of that sweep.

/// Exact filename convention of the authoritative Web export
/// (`app.js: exportBackupJson()` -> `'familyfinance-backup-' + todayStr() +
/// '.json'`, where `todayStr()` is local-time `YYYY-MM-DD`). Preserved
/// verbatim so a file produced by the Flutter app is indistinguishable from
/// one produced by the Web app.
const String kBackupFileNamePrefix = 'familyfinance-backup-';
const String kBackupFileExtension = '.json';
const String kBackupMimeType = 'application/json';

/// Matches `app.js`'s `JSON.stringify(backup, null, 2)`.
const JsonEncoder kBackupJsonEncoder = JsonEncoder.withIndent('  ');

String backupFileNameFor(DateTime now) {
  final mm = now.month.toString().padLeft(2, '0');
  final dd = now.day.toString().padLeft(2, '0');
  return '$kBackupFileNamePrefix${now.year}-$mm-$dd$kBackupFileExtension';
}

/// Why an import/export failed. The UI maps these to distinct states; the
/// underlying detail (a validator reason string, a JSON parser message)
/// is deliberately NOT carried, because those can quote the picked file's
/// own bytes.
enum BackupTransferFailureKind {
  /// The local data could not be turned into a trustworthy backup, or the
  /// picked file is not a valid FamilyFinance backup.
  validation,

  /// The native file layer failed (save dialog, picker, read).
  fileIo,

  /// The restore write path failed.
  restore,

  /// Reading the app's own storage failed while building an export.
  storage,
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

sealed class BackupExportOutcome {
  const BackupExportOutcome();
}

final class BackupExportSaved extends BackupExportOutcome {
  const BackupExportSaved({
    required this.uri,
    required this.fileName,
    required this.keyCount,
  });

  final Uri uri;
  final String fileName;
  final int keyCount;
}

/// The user backed out of the save dialog. Nothing was written anywhere.
final class BackupExportCancelled extends BackupExportOutcome {
  const BackupExportCancelled();
}

final class BackupExportFailed extends BackupExportOutcome {
  const BackupExportFailed(this.kind, this.message);

  final BackupTransferFailureKind kind;

  /// A fixed Hebrew literal, safe to render. Never interpolates file
  /// contents, stored values, or a third-party exception's text.
  final String message;
}

// ---------------------------------------------------------------------------
// Import — phase 1 (read + validate, zero writes)
// ---------------------------------------------------------------------------

sealed class BackupImportPreparation {
  const BackupImportPreparation();
}

/// Fully validated and ready to restore — but nothing has been written yet.
/// Only [BackupTransferService.commitImport] writes, and it needs this
/// object, which only successful validation produces.
final class BackupImportReady extends BackupImportPreparation {
  const BackupImportReady({
    required this.envelope,
    required this.fileName,
    required this.keyCount,
    required this.isGoalsAware,
  });

  final RawBackupEnvelope envelope;
  final String fileName;
  final int keyCount;

  /// schemaVersion >= 2. A legacy (non-goals-aware) backup leaves existing
  /// goals untouched unless the caller explicitly opts in — the exact
  /// pre-existing contract, unchanged by this milestone.
  final bool isGoalsAware;
}

final class BackupImportCancelled extends BackupImportPreparation {
  const BackupImportCancelled();
}

final class BackupImportRejected extends BackupImportPreparation {
  const BackupImportRejected(this.kind, this.message);

  final BackupTransferFailureKind kind;
  final String message;
}

// ---------------------------------------------------------------------------
// Import — phase 2 (restore)
// ---------------------------------------------------------------------------

sealed class BackupRestoreResult {
  const BackupRestoreResult();
}

final class BackupRestoreSucceeded extends BackupRestoreResult {
  const BackupRestoreSucceeded(this.writtenKeys);
  final List<String> writtenKeys;
}

final class BackupRestoreFailed extends BackupRestoreResult {
  const BackupRestoreFailed(
    this.kind,
    this.message, {
    required this.priorStateGuaranteed,
  });

  final BackupTransferFailureKind kind;
  final String message;

  /// `false` only for the genuine worst case (the compensating rollback
  /// itself failed). Never reported as a success in any case.
  final bool priorStateGuaranteed;
}

// ---------------------------------------------------------------------------

class BackupTransferService {
  BackupTransferService({
    required this.repository,
    required this.gateway,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  /// The authoritative backup contract. This service never reimplements any
  /// part of it.
  final BackupRepository repository;

  /// The native file boundary. Swapped for a fake in tests.
  final BackupFileGateway gateway;

  final DateTime Function() _clock;

  /// Collect -> validate -> encode -> native "save as" -> write.
  ///
  /// The validate step preserves the Web app's own refusal contract
  /// (`exportBackupJson()` returns without producing a file when the local
  /// Goals data is corrupt): this app must never hand the user a file that
  /// looks like a backup but could not be restored. It does not modify,
  /// normalize or repair anything — a refusal leaves storage untouched.
  Future<BackupExportOutcome> exportToFile() async {
    final RawBackupEnvelope envelope;
    try {
      envelope = await repository.exportBackup();
    } catch (_) {
      return const BackupExportFailed(
        BackupTransferFailureKind.storage,
        'קריאת הנתונים לגיבוי נכשלה',
      );
    }

    if (!repository.validate(envelope).isValid) {
      return const BackupExportFailed(
        BackupTransferFailureKind.validation,
        'לא ניתן ליצור גיבוי — הנתונים המקומיים אינם תקינים. '
        'יש לתקן את הנתונים לפני יצירת גיבוי חדש.',
      );
    }

    final Uint8List bytes;
    final String fileName;
    try {
      bytes = Uint8List.fromList(
        utf8.encode(kBackupJsonEncoder.convert(envelope.toJson())),
      );
      fileName = backupFileNameFor(_clock());
    } catch (_) {
      return const BackupExportFailed(
        BackupTransferFailureKind.validation,
        'קידוד קובץ הגיבוי נכשל',
      );
    }

    final result = await gateway.saveBackup(
      suggestedFileName: fileName,
      bytes: bytes,
      mimeType: kBackupMimeType,
    );
    return switch (result) {
      FileTransferOk(value: final uri) => BackupExportSaved(
          uri: uri,
          fileName: fileName,
          keyCount: envelope.data.length,
        ),
      FileTransferCancelled() => const BackupExportCancelled(),
      FileTransferFailed(error: final e) =>
        BackupExportFailed(BackupTransferFailureKind.fileIo, e.message),
    };
  }

  /// Pick -> read -> decode -> parse -> FULLY validate. Writes nothing.
  Future<BackupImportPreparation> prepareImport() async {
    final picked = await gateway.pickBackup();
    final PickedFile file;
    switch (picked) {
      case FileTransferOk(value: final f):
        file = f;
      case FileTransferCancelled():
        return const BackupImportCancelled();
      case FileTransferFailed(error: final e):
        return BackupImportRejected(
          BackupTransferFailureKind.fileIo,
          e.message,
        );
    }

    if (file.bytes.isEmpty) {
      return const BackupImportRejected(
        BackupTransferFailureKind.validation,
        'הקובץ ריק',
      );
    }

    final String text;
    try {
      // Strict decoding: malformed UTF-8 is a hard rejection, never
      // silently replaced with U+FFFD. A single leading BOM is stripped
      // because that is ordinary text decoding, not repairing a backup.
      final decoded = utf8.decode(file.bytes);
      text = decoded.startsWith('\uFEFF') ? decoded.substring(1) : decoded;
    } catch (_) {
      return const BackupImportRejected(
        BackupTransferFailureKind.validation,
        'הקובץ אינו קובץ טקסט תקין',
      );
    }

    final RawBackupEnvelope envelope;
    try {
      envelope = RawBackupEnvelope.fromJsonString(text);
    } catch (_) {
      // Intentionally discards the parser's own message: it quotes the
      // offending input, i.e. the user's financial data.
      return const BackupImportRejected(
        BackupTransferFailureKind.validation,
        'הקובץ אינו קובץ גיבוי תקין של FamilyFinance',
      );
    }

    if (!repository.validate(envelope).isValid) {
      // Same reasoning: the validator's reason string can quote a stored
      // value, so only a fixed literal reaches the caller.
      return const BackupImportRejected(
        BackupTransferFailureKind.validation,
        'קובץ הגיבוי אינו תקין ולכן לא יבוצע שחזור',
      );
    }

    return BackupImportReady(
      envelope: envelope,
      fileName: file.name,
      keyCount: envelope.data.length,
      isGoalsAware: envelope.isGoalsAwareVersion,
    );
  }

  /// The ONLY write path. Delegates to the already-approved, already-tested
  /// [BackupRepository.restore] — the single restore implementation, with
  /// its transaction/snapshot-rollback behavior reused as-is.
  Future<BackupRestoreResult> commitImport(
    BackupImportReady ready, {
    bool deleteExistingGoalsForLegacyBackup = false,
  }) async {
    final DataResult<RestoreOutcome> result;
    try {
      result = await repository.restore(
        ready.envelope,
        deleteExistingGoalsForLegacyBackup: deleteExistingGoalsForLegacyBackup,
      );
    } catch (_) {
      return const BackupRestoreFailed(
        BackupTransferFailureKind.restore,
        'השחזור נכשל',
        priorStateGuaranteed: false,
      );
    }

    return switch (result) {
      DataOk(value: final outcome) =>
        BackupRestoreSucceeded(outcome.writtenKeys),
      DataErr(error: RollbackFailure()) => const BackupRestoreFailed(
          BackupTransferFailureKind.restore,
          'השחזור נכשל והשחזור לאחור לא הושלם — ייתכן שהנתונים אינם במצבם הקודם',
          priorStateGuaranteed: false,
        ),
      DataErr(error: PartialWriteFailure()) => const BackupRestoreFailed(
          BackupTransferFailureKind.restore,
          'השחזור נכשל. הנתונים הקודמים שוחזרו ולא בוצע שינוי.',
          priorStateGuaranteed: true,
        ),
      DataErr(error: InvalidBackupShape()) => const BackupRestoreFailed(
          BackupTransferFailureKind.validation,
          'קובץ הגיבוי אינו תקין ולכן לא יבוצע שחזור',
          priorStateGuaranteed: true,
        ),
      DataErr() => const BackupRestoreFailed(
          BackupTransferFailureKind.restore,
          'השחזור נכשל',
          priorStateGuaranteed: false,
        ),
    };
  }
}
