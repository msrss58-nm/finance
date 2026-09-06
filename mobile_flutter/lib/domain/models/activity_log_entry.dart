import '../../core/types/safe_cast.dart';

/// One `family_finance_activity_log` entry. `ts` is the Web app's own
/// local "YYYY-MM-DD HH:mm" display string (nowTimestampStr()) — NOT the
/// canonical ISO timestamp format Goals uses; kept as a raw string here for
/// the same reason legacy numeric fields are kept raw: this data layer must
/// not invent a stricter format than the Web app itself has ever written.
class ActivityLogEntry {
  final String ts;
  final String action;
  final String detail;

  const ActivityLogEntry({
    required this.ts,
    required this.action,
    required this.detail,
  });

  factory ActivityLogEntry.fromJson(Object? json) {
    if (json is! Map) {
      throw FormatException('activity log entry is not a JSON object: $json');
    }
    return ActivityLogEntry(
      ts: asStringOrNull(json['ts']) ?? '',
      action: asStringOrNull(json['action']) ?? '',
      detail: asStringOrNull(json['detail']) ?? '',
    );
  }

  Map<String, Object?> toJson() => {'ts': ts, 'action': action, 'detail': detail};
}
