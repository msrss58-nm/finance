import '../errors/data_errors.dart';

/// Generic outcome type for every repository/normalization operation in this
/// data layer, so callers never need to inspect exceptions to distinguish
/// success from a known, typed failure.
sealed class DataResult<T> {
  const DataResult();

  bool get isOk => this is DataOk<T>;
  bool get isErr => this is DataErr<T>;

  T? get valueOrNull => switch (this) {
        DataOk<T>(value: final v) => v,
        DataErr<T>() => null,
      };

  DataError? get errorOrNull => switch (this) {
        DataOk<T>() => null,
        DataErr<T>(error: final e) => e,
      };
}

final class DataOk<T> extends DataResult<T> {
  final T value;
  const DataOk(this.value);
}

final class DataErr<T> extends DataResult<T> {
  final DataError error;
  const DataErr(this.error);
}
