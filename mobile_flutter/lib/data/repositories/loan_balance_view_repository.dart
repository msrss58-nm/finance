import 'dart:convert';

import '../../domain/models/enums.dart';
import '../persistence/key_value_store.dart';

const String kLoanBalanceViewKey = 'family_finance_loan_balance_view';

/// loadLoanBalanceView()/saveLoanBalanceView(): this key has a legacy raw
/// (non-JSON) stored form ('total'/'principal' with no quote characters).
/// Reads try the JSON-encoded form first and fall back to treating the raw
/// string itself as the value — read-only, never rewrites on read. Writes
/// always use the newer JSON-encoded form (matches the Web app's own
/// gradual migration-on-write, never migration-on-read).
abstract interface class LoanBalanceViewRepository {
  Future<LoanBalanceView> load();
  Future<void> save(LoanBalanceView view);
}

class LoanBalanceViewRepositoryImpl implements LoanBalanceViewRepository {
  final KeyValueStore _store;
  const LoanBalanceViewRepositoryImpl(this._store);

  @override
  Future<LoanBalanceView> load() async {
    final raw = await _store.getString(kLoanBalanceViewKey);
    if (raw == null) return LoanBalanceView.total;
    Object? value;
    try {
      value = jsonDecode(raw);
    } catch (_) {
      value = raw;
    }
    return value == 'principal' ? LoanBalanceView.principal : LoanBalanceView.total;
  }

  @override
  Future<void> save(LoanBalanceView view) async {
    final value = view == LoanBalanceView.principal ? 'principal' : 'total';
    await _store.setString(kLoanBalanceViewKey, jsonEncode(value));
  }
}
