import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/domain/goals/goals_reminder_schedule.dart';

/// Milestone 9 — WHEN the reminder fires. Pure date arithmetic; no plugin,
/// no repository, no clock read.
void main() {
  DateTime next(DateTime now) => nextGoalsReminderDateTime(now: now);

  test('the reminder day and time are the approved constants', () {
    expect(kGoalsReminderDayOfMonth, 2);
    expect(kGoalsReminderHour, 9);
    expect(kGoalsReminderMinute, 0);
  });

  test('before the 2nd: this month', () {
    expect(next(DateTime(2026, 9, 1, 23, 59)), DateTime(2026, 9, 2, 9, 0));
  });

  test('on the 2nd before the reminder time: today', () {
    expect(next(DateTime(2026, 9, 2, 8, 59)), DateTime(2026, 9, 2, 9, 0));
  });

  test('exactly at the reminder instant: NEXT month, never "now"', () {
    // Scheduling an instant that is not strictly in the future would be
    // delivered by the OS immediately.
    expect(next(DateTime(2026, 9, 2, 9, 0)), DateTime(2026, 10, 2, 9, 0));
  });

  test('after the 2nd: next month', () {
    expect(next(DateTime(2026, 9, 2, 9, 1)), DateTime(2026, 10, 2, 9, 0));
    expect(next(DateTime(2026, 9, 30, 23, 59)), DateTime(2026, 10, 2, 9, 0));
  });

  test('year rollover: December rolls to January of the next year', () {
    expect(next(DateTime(2026, 12, 2, 9, 1)), DateTime(2027, 1, 2, 9, 0));
    expect(next(DateTime(2026, 12, 31, 12, 0)), DateTime(2027, 1, 2, 9, 0));
  });

  test('February is unremarkable — the 2nd exists in every month', () {
    expect(next(DateTime(2026, 1, 15)), DateTime(2026, 2, 2, 9, 0));
    expect(next(DateTime(2026, 2, 3)), DateTime(2026, 3, 2, 9, 0));
    // Leap year.
    expect(next(DateTime(2028, 1, 31)), DateTime(2028, 2, 2, 9, 0));
    expect(next(DateTime(2028, 2, 29)), DateTime(2028, 3, 2, 9, 0));
  });

  test('a 31-day month rolls over correctly', () {
    for (final month in [1, 3, 5, 7, 8, 10]) {
      final result = next(DateTime(2026, month, 31));
      expect(result.month, month + 1);
      expect(result.day, 2);
    }
  });

  test('the result is always strictly in the future and always the 2nd', () {
    var now = DateTime(2026, 1, 1, 0, 0);
    for (var i = 0; i < 400; i++) {
      final result = next(now);
      expect(result.isAfter(now), isTrue, reason: 'now=$now result=$result');
      expect(result.day, 2);
      expect(result.hour, 9);
      expect(result.minute, 0);
      now = now.add(const Duration(days: 1, hours: 7));
    }
  });

  test('consecutive reminders are exactly one calendar month apart', () {
    var cursor = DateTime(2026, 1, 5);
    var previous = next(cursor);
    for (var i = 0; i < 30; i++) {
      cursor = previous.add(const Duration(minutes: 1));
      final following = next(cursor);
      expect(following.day, 2);
      final monthsApart = (following.year - previous.year) * 12 +
          (following.month - previous.month);
      expect(monthsApart, 1);
      previous = following;
    }
  });
}
