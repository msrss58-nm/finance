import 'enums.dart';

class CategoryConfig {
  final String key;
  final String label;
  final CategoryBaseType baseType;
  final int? defaultDayOfMonth;

  const CategoryConfig({
    required this.key,
    required this.label,
    required this.baseType,
    this.defaultDayOfMonth,
  });
}

/// PREVIEW_BUILTIN_CATEGORY_KEYS — protects only these 4 built-in keys from
/// deletion. 'dated' is deliberately excluded (a known, documented gap in
/// the Web app); this data layer must reproduce that gap exactly, not fix
/// it, so parity is preserved for this migration phase.
const List<String> kProtectedBuiltinCategoryKeys = [
  'income',
  'fixed',
  'variable',
  'loan',
];

bool isBuiltinProtectedCategoryKey(String key) =>
    kProtectedBuiltinCategoryKeys.contains(key);

/// DEFAULT_CATEGORY_CONFIG_JSON — the 5 built-in categories seeded for a
/// fresh install. None carry a defaultDayOfMonth.
final Map<String, CategoryConfig> kDefaultCategoryConfig = {
  'income': const CategoryConfig(
    key: 'income',
    label: '💰 הכנסות',
    baseType: CategoryBaseType.income,
  ),
  'fixed': const CategoryConfig(
    key: 'fixed',
    label: '🏡 הוצאות קבועות',
    baseType: CategoryBaseType.fixed,
  ),
  'variable': const CategoryConfig(
    key: 'variable',
    label: '🛒 תשלומים שונים',
    baseType: CategoryBaseType.variable,
  ),
  'loan': const CategoryConfig(
    key: 'loan',
    label: '🏦 הלוואות',
    baseType: CategoryBaseType.loan,
  ),
  'dated': const CategoryConfig(
    key: 'dated',
    label: '💳 חיוב כרטיס אשראי',
    baseType: CategoryBaseType.dated,
  ),
};
