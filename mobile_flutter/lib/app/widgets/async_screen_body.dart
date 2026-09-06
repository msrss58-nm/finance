import 'package:flutter/material.dart';

/// Shared loading/error chrome reused by every real screen's `FutureBuilder`
/// (Milestone 6, section 11): a screen must show a spinner while loading and
/// the REAL typed failure on error — never fabricate an empty/zero state
/// when a repository call actually threw (every repository can throw a
/// typed `PersistenceError` from the Milestone 4 persistence layer; that
/// must stay observable here, not be swallowed).
Widget buildAsyncScreenBody<T>(
  AsyncSnapshot<T> snapshot, {
  required Widget Function(T data) data,
}) {
  if (snapshot.connectionState != ConnectionState.done) {
    return const Center(
      key: ValueKey('screen-loading'),
      child: CircularProgressIndicator(),
    );
  }
  if (snapshot.hasError) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'שגיאה בטעינת הנתונים:\n${snapshot.error}',
          key: const ValueKey('screen-error-text'),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
  return data(snapshot.data as T);
}
