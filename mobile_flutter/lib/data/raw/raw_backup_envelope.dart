import 'dart:convert';

import '../../core/types/safe_cast.dart';

/// Raw view of a backup file's top-level shape: `{schemaVersion?, exportedAt?,
/// data: {"family_finance_*" key: raw JSON-encoded string}}`.
///
/// `data`'s values are kept as raw strings on purpose — collectAppLocalStorageBackup()
/// copies localStorage values verbatim, and this data layer's backup boundary
/// must do the same (operate on raw strings via the persistence layer, never
/// on re-serialized domain objects) so a restored value is byte-for-byte
/// identical to what was exported.
class RawBackupEnvelope {
  final Object? schemaVersion;
  final String? exportedAt;
  final Map<String, String> data;

  const RawBackupEnvelope({
    required this.schemaVersion,
    required this.exportedAt,
    required this.data,
  });

  /// schemaVersion >= 2 means goals-aware; absent/1/anything else means a
  /// pre-Goals backup whose goals key (if present at all) must be ignored.
  bool get isGoalsAwareVersion =>
      schemaVersion is num && (schemaVersion as num) >= 2;

  factory RawBackupEnvelope.fromJsonString(String text) {
    final Object? decoded = jsonDecode(text);
    if (decoded is! Map) {
      throw const FormatException('backup is not a JSON object');
    }
    final rawData = decoded['data'];
    if (rawData is! Map) {
      throw const FormatException('backup.data is missing or not an object');
    }
    final data = <String, String>{};
    for (final entry in rawData.entries) {
      final key = entry.key;
      final value = entry.value;
      if (key is! String || value is! String) {
        throw FormatException('backup.data["$key"] must be a string');
      }
      data[key] = value;
    }
    return RawBackupEnvelope(
      schemaVersion: decoded['schemaVersion'],
      exportedAt: asStringOrNull(decoded['exportedAt']),
      data: data,
    );
  }

  Map<String, Object?> toJson() => {
        'schemaVersion': schemaVersion,
        'exportedAt': exportedAt,
        'data': data,
      };
}
