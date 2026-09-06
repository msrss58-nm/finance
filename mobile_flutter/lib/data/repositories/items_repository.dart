import 'dart:convert';

import '../../core/errors/data_errors.dart';
import '../../core/types/result.dart';
import '../../domain/models/finance_item.dart';
import '../../domain/normalization/item_normalizer.dart';
import '../persistence/key_value_store.dart';
import '../raw/raw_item.dart';

const String kDataKey = 'family_finance_data';

/// loadAll()/saveAll() mirror loadPreviewItems()/savePreviewItems(): a
/// whole-array replace, never per-record CRUD at the storage layer (the
/// Web app's own in-memory `items` array is mutated first; only the full
/// array is ever written back).
abstract interface class ItemsRepository {
  /// A missing key or a value that isn't a JSON array resolves to an empty
  /// list — never throws — matching loadPreviewItems()'s own fallback.
  /// Per-entry failures are reported as [ParseError]s inside the result
  /// rather than aborting the whole load; [UnknownLegacyValueNotice]s are
  /// informational only.
  Future<DataResult<ItemsLoadOutcome>> loadAll();
  Future<void> saveAll(List<FinanceItem> items);
}

class ItemsLoadOutcome {
  final List<FinanceItem> items;
  final List<ParseError> itemErrors;
  final List<UnknownLegacyValueNotice> diagnostics;
  const ItemsLoadOutcome({
    required this.items,
    required this.itemErrors,
    required this.diagnostics,
  });
}

class ItemsRepositoryImpl implements ItemsRepository {
  final KeyValueStore _store;
  const ItemsRepositoryImpl(this._store);

  @override
  Future<DataResult<ItemsLoadOutcome>> loadAll() async {
    final raw = await _store.getString(kDataKey);
    if (raw == null) {
      return const DataOk(
        ItemsLoadOutcome(items: [], itemErrors: [], diagnostics: []),
      );
    }

    List<Object?> parsed;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) {
        return const DataOk(
          ItemsLoadOutcome(items: [], itemErrors: [], diagnostics: []),
        );
      }
      parsed = decoded;
    } catch (e) {
      return const DataOk(
        ItemsLoadOutcome(items: [], itemErrors: [], diagnostics: []),
      );
    }

    final items = <FinanceItem>[];
    final errors = <ParseError>[];
    final diagnostics = <UnknownLegacyValueNotice>[];
    for (final entry in parsed) {
      try {
        final rawItem = RawItemJson.fromJson(entry);
        final outcome = normalizeItem(rawItem);
        diagnostics.addAll(outcome.diagnostics);
        if (outcome.item != null) {
          items.add(outcome.item!);
        } else {
          errors.add(ParseError(kDataKey, outcome.error ?? 'unparseable item'));
        }
      } catch (e) {
        errors.add(ParseError(kDataKey, 'malformed item entry', cause: e));
      }
    }

    return DataOk(ItemsLoadOutcome(
      items: items,
      itemErrors: errors,
      diagnostics: diagnostics,
    ));
  }

  @override
  Future<void> saveAll(List<FinanceItem> items) async {
    final rawList = items.map(itemToRawJson).toList();
    await _store.setString(kDataKey, jsonEncode(rawList));
  }
}
