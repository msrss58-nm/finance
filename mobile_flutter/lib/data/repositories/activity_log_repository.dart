import 'dart:convert';

import '../../domain/models/activity_log_entry.dart';
import '../persistence/key_value_store.dart';

const String kActivityLogKey = 'family_finance_activity_log';
const int kActivityLogMax = 200;

abstract interface class ActivityLogRepository {
  Future<List<ActivityLogEntry>> loadAll();

  /// Append-only, capped at [kActivityLogMax] (oldest dropped first) —
  /// mirrors appendActivityLog() exactly.
  Future<void> append(String action, String detail);
}

class ActivityLogRepositoryImpl implements ActivityLogRepository {
  final KeyValueStore _store;
  const ActivityLogRepositoryImpl(this._store);

  @override
  Future<List<ActivityLogEntry>> loadAll() async {
    final raw = await _store.getString(kActivityLogKey);
    if (raw == null) return [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return [];
      return decoded
          .map(ActivityLogEntry.fromJson)
          .toList(growable: false);
    } catch (_) {
      return [];
    }
  }

  @override
  Future<void> append(String action, String detail) async {
    final current = await loadAll();
    final next = [
      ...current,
      ActivityLogEntry(ts: _nowTimestampStr(), action: action, detail: detail),
    ];
    final trimmed = next.length > kActivityLogMax
        ? next.sublist(next.length - kActivityLogMax)
        : next;
    await _store.setString(
      kActivityLogKey,
      jsonEncode(trimmed.map((e) => e.toJson()).toList()),
    );
  }

  /// nowTimestampStr(): local "YYYY-MM-DD HH:mm", NOT UTC/ISO.
  String _nowTimestampStr() {
    final d = DateTime.now();
    String pad(int n) => n < 10 ? '0$n' : '$n';
    return '${d.year}-${pad(d.month)}-${pad(d.day)} ${pad(d.hour)}:${pad(d.minute)}';
  }
}
