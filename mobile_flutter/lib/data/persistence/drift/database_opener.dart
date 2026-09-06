import 'dart:io';

import 'package:drift/native.dart';

import '../../../core/errors/data_errors.dart';
import 'app_database.dart';

/// Opens (creating if necessary) the production [AppDatabase] at [file],
/// classifying failures into the typed [PersistenceError] hierarchy instead
/// of letting a raw SqliteException/FileSystemException surface to callers.
///
/// Runs one real query immediately so an open/migration/corruption failure
/// is detected HERE, at startup, rather than silently deferred to whichever
/// repository happens to touch the database first — and so a migration
/// (which Drift/sqlite run lazily, on first access) actually executes
/// before this function returns.
///
/// Called once at startup by `AppBootstrap` (lib/app/app_bootstrap.dart,
/// Milestone 5), which resolves [file] via the platform's app-documents
/// directory before calling this function — unchanged since it was written.
Future<AppDatabase> openAppDatabase(File file) async {
  final AppDatabase db;
  try {
    db = AppDatabase(NativeDatabase(file));
  } catch (e) {
    throw StorageOpenFailure('failed to open database at ${file.path}', cause: e);
  }

  try {
    await db.customSelect('select 1').getSingle();
  } on SchemaMigrationFailure {
    await db.close();
    rethrow;
  } catch (e) {
    await db.close();
    final msg = e.toString().toLowerCase();
    final looksCorrupt = msg.contains('not a database') ||
        msg.contains('malformed') ||
        msg.contains('corrupt');
    if (looksCorrupt) {
      throw StorageCorruptionFailure(
        'database file at ${file.path} appears corrupted: $e',
      );
    }
    throw StorageOpenFailure('failed to open database at ${file.path}: $e');
  }

  return db;
}
