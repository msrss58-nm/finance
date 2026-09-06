/// Historical item ids on the Web app are stored as either a JS number
/// (`Date.now()`-based, most item types) or a string (custom category keys,
/// goal/component/confirmedTransfer ids use their own prefixed-string scheme,
/// not this type). This type preserves whichever raw shape a legacy record
/// actually used, losslessly, without coercing one into the other — an
/// [IntItemId] and a [StringItemId] with the same digits are never equal,
/// because the Web app itself never treats them as the same id.
sealed class ItemId {
  const ItemId();

  factory ItemId.fromJson(Object? raw) {
    if (raw is int) return IntItemId(raw);
    if (raw is num && raw == raw.truncateToDouble()) {
      return IntItemId(raw.toInt());
    }
    if (raw is String) return StringItemId(raw);
    throw ArgumentError.value(raw, 'raw', 'ItemId must be an int or a String');
  }

  Object toJson();
}

final class IntItemId extends ItemId {
  final int value;
  const IntItemId(this.value);

  @override
  Object toJson() => value;

  @override
  bool operator ==(Object other) => other is IntItemId && other.value == value;

  @override
  int get hashCode => Object.hash(IntItemId, value);

  @override
  String toString() => 'IntItemId($value)';
}

final class StringItemId extends ItemId {
  final String value;
  const StringItemId(this.value);

  @override
  Object toJson() => value;

  @override
  bool operator ==(Object other) =>
      other is StringItemId && other.value == value;

  @override
  int get hashCode => Object.hash(StringItemId, value);

  @override
  String toString() => 'StringItemId($value)';
}
