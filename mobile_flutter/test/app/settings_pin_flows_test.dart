import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:familyfinance_pro/app/screens/settings_screen.dart';
import 'package:familyfinance_pro/app/security/auth_scope.dart';
import 'package:familyfinance_pro/app/services/app_services.dart';
import 'package:familyfinance_pro/app/services/app_services_scope.dart';
import 'package:familyfinance_pro/data/persistence/drift/app_database.dart';
import 'package:familyfinance_pro/security/auth_controller.dart';
import 'package:familyfinance_pro/security/pin_service.dart';

import '../fakes/fake_secure_secret_store.dart';

/// Milestone 7, section 10 — the Settings PIN setup / change / disable UI.
///
/// These are behaviour tests against the REAL [PinService] over a fake secure
/// store: no mocked service, so "the UI said it worked" and "the stored
/// record actually changed" are asserted separately. That distinction is the
/// point — a security UI that reports success without a persisted change
/// would be worse than one that fails loudly.
///
/// Work factor: 1000 instead of the production 210000. The iteration count is
/// stored inside each record and used for verification, so lowering it here
/// changes only test runtime, never correctness.
const int _kTestIterations = 1000;

const Key _statusKey = ValueKey('settings-pin-status');
const Key _setupButton = ValueKey('settings-pin-setup-button');
const Key _changeButton = ValueKey('settings-pin-change-button');
const Key _disableButton = ValueKey('settings-pin-disable-button');
const Key _fieldCurrent = ValueKey('pin-form-current');
const Key _fieldNew = ValueKey('pin-form-new');
const Key _fieldConfirm = ValueKey('pin-form-confirm');
const Key _submit = ValueKey('pin-form-submit');
const Key _cancel = ValueKey('pin-form-cancel');
const Key _formError = ValueKey('pin-form-error');

class _Fixture {
  _Fixture(this.db, this.store, this.pinService);

  final AppDatabase db;
  final FakeSecureSecretStore store;
  final PinService pinService;

  String? get record => store.snapshot[kPinRecordStorageKey];
  bool get hasRecord => record != null;
}

Future<_Fixture> _mount(WidgetTester tester) async {
  // Tall surface: the security section is the last thing in the settings
  // list, and the inline form adds three more fields below it.
  await tester.binding.setSurfaceSize(const Size(900, 2400));
  addTearDown(() => tester.binding.setSurfaceSize(null));

  final db = AppDatabase(NativeDatabase.memory());
  addTearDown(db.close);
  final services = AppServices.fromDatabase(db);
  final store = FakeSecureSecretStore();
  final pinService = PinService(store, iterations: _kTestIterations);

  await tester.pumpWidget(
    MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: AuthScope(
          controller: AuthController(pinService),
          pinService: pinService,
          child: AppServicesScope(services: services, child: const SettingsScreen()),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return _Fixture(db, store, pinService);
}

/// Sets up a PIN through the real UI, so every "already configured" test
/// starts from a state a user could actually have produced.
Future<void> _setupPinViaUi(WidgetTester tester, String pin) async {
  await tester.tap(find.byKey(_setupButton));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(_fieldNew), pin);
  await tester.enterText(find.byKey(_fieldConfirm), pin);
  await tester.tap(find.byKey(_submit));
  await tester.pumpAndSettle();
}

String _errorText(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(_formError)).data ?? '';

void main() {
  testWidgets('starts not configured and offers only a setup action', (tester) async {
    final f = await _mount(tester);

    expect(find.byKey(_statusKey), findsOneWidget);
    expect(find.text('PIN לא מוגדר'), findsOneWidget);
    expect(find.byKey(_setupButton), findsOneWidget);
    expect(find.byKey(_changeButton), findsNothing);
    expect(find.byKey(_disableButton), findsNothing);
    expect(f.hasRecord, isFalse);
  });

  testWidgets('setup PIN succeeds and the status flips to configured', (tester) async {
    final f = await _mount(tester);

    await tester.tap(find.byKey(_setupButton));
    await tester.pumpAndSettle();
    expect(find.byKey(_fieldNew), findsOneWidget);
    expect(find.byKey(_fieldConfirm), findsOneWidget);
    // Setup must not ask for a current PIN — there is none.
    expect(find.byKey(_fieldCurrent), findsNothing);

    await tester.enterText(find.byKey(_fieldNew), '1234');
    await tester.enterText(find.byKey(_fieldConfirm), '1234');
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(find.text('PIN מוגדר'), findsOneWidget);
    // Form closed, and the change/disable actions are now the offered ones.
    expect(find.byKey(_submit), findsNothing);
    expect(find.byKey(_changeButton), findsOneWidget);
    expect(find.byKey(_disableButton), findsOneWidget);
    // A record really was persisted, and it verifies.
    expect(f.hasRecord, isTrue);
    expect(await f.pinService.verifyPin('1234'), isTrue);
    // The record must not contain the PIN itself in any readable form.
    expect(f.record, isNot(contains('1234')));
  });

  testWidgets('setup rejects a malformed PIN with the format message', (tester) async {
    final f = await _mount(tester);

    await tester.tap(find.byKey(_setupButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(_fieldNew), '12');
    await tester.enterText(find.byKey(_fieldConfirm), '12');
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(find.byKey(_formError), findsOneWidget);
    expect(_errorText(tester), 'PIN חייב להכיל 4 עד 6 ספרות');
    expect(find.text('PIN לא מוגדר'), findsOneWidget);
    expect(f.hasRecord, isFalse);
    expect(f.store.writeCount, 0, reason: 'invalid input must not reach storage');
  });

  testWidgets('setup rejects a mismatched confirmation', (tester) async {
    final f = await _mount(tester);

    await tester.tap(find.byKey(_setupButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(_fieldNew), '1234');
    await tester.enterText(find.byKey(_fieldConfirm), '5678');
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(_errorText(tester), 'הקודים אינם תואמים');
    expect(find.text('PIN לא מוגדר'), findsOneWidget);
    expect(f.hasRecord, isFalse);
  });

  testWidgets('cancel closes the form and clears the entered digits', (tester) async {
    await _mount(tester);

    await tester.tap(find.byKey(_setupButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(_fieldNew), '1234');
    await tester.tap(find.byKey(_cancel));
    await tester.pumpAndSettle();

    expect(find.byKey(_fieldNew), findsNothing);

    await tester.tap(find.byKey(_setupButton));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byKey(_fieldNew)).controller?.text, '');
  });

  testWidgets('change PIN with a WRONG current PIN is rejected and the record is unchanged',
      (tester) async {
    final f = await _mount(tester);
    await _setupPinViaUi(tester, '1234');
    final before = f.record;
    expect(before, isNotNull);

    await tester.tap(find.byKey(_changeButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(_fieldCurrent), '9999');
    await tester.enterText(find.byKey(_fieldNew), '5678');
    await tester.enterText(find.byKey(_fieldConfirm), '5678');
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(_errorText(tester), 'קוד נוכחי שגוי');
    expect(f.record, before, reason: 'a failed change must not touch the stored record');
    expect(await f.pinService.verifyPin('1234'), isTrue);
    expect(await f.pinService.verifyPin('5678'), isFalse);
    expect(find.text('PIN מוגדר'), findsOneWidget);
  });

  testWidgets('change PIN with the correct current PIN replaces it', (tester) async {
    final f = await _mount(tester);
    await _setupPinViaUi(tester, '1234');
    final before = f.record;

    await tester.tap(find.byKey(_changeButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(_fieldCurrent), '1234');
    await tester.enterText(find.byKey(_fieldNew), '567890');
    await tester.enterText(find.byKey(_fieldConfirm), '567890');
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(find.byKey(_formError), findsNothing);
    expect(find.text('PIN מוגדר'), findsOneWidget);
    expect(f.record, isNot(before), reason: 'a real change rewrites the record');
    expect(await f.pinService.verifyPin('1234'), isFalse, reason: 'old PIN must stop working');
    expect(await f.pinService.verifyPin('567890'), isTrue);
  });

  testWidgets('change PIN validates the new PIN format before verifying anything',
      (tester) async {
    final f = await _mount(tester);
    await _setupPinViaUi(tester, '1234');
    final writesAfterSetup = f.store.writeCount;

    await tester.tap(find.byKey(_changeButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(_fieldCurrent), '1234');
    await tester.enterText(find.byKey(_fieldNew), '12');
    await tester.enterText(find.byKey(_fieldConfirm), '12');
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(_errorText(tester), 'PIN חייב להכיל 4 עד 6 ספרות');
    expect(f.store.writeCount, writesAfterSetup);
    expect(await f.pinService.verifyPin('1234'), isTrue);
  });

  testWidgets('disable PIN with the correct current PIN removes it', (tester) async {
    final f = await _mount(tester);
    await _setupPinViaUi(tester, '1234');

    await tester.tap(find.byKey(_disableButton));
    await tester.pumpAndSettle();
    // Disable asks for the current PIN only.
    expect(find.byKey(_fieldCurrent), findsOneWidget);
    expect(find.byKey(_fieldNew), findsNothing);
    expect(find.byKey(_fieldConfirm), findsNothing);

    await tester.enterText(find.byKey(_fieldCurrent), '1234');
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(find.text('PIN לא מוגדר'), findsOneWidget);
    expect(find.byKey(_setupButton), findsOneWidget);
    expect(f.hasRecord, isFalse);
  });

  testWidgets('disable PIN with a wrong current PIN is rejected and the PIN stays configured',
      (tester) async {
    final f = await _mount(tester);
    await _setupPinViaUi(tester, '1234');
    final before = f.record;

    await tester.tap(find.byKey(_disableButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(_fieldCurrent), '9999');
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(_errorText(tester), 'קוד נוכחי שגוי');
    expect(f.hasRecord, isTrue);
    expect(f.record, before);
    expect(await f.pinService.verifyPin('1234'), isTrue);
    expect(f.store.deleteCount, 0, reason: 'a failed disable must not attempt a delete');
    expect(find.text('PIN מוגדר'), findsOneWidget);
  });

  testWidgets('a secure-storage write failure surfaces an error and is NOT reported as success',
      (tester) async {
    final f = await _mount(tester);
    f.store.failWrites = true;

    await tester.tap(find.byKey(_setupButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(_fieldNew), '1234');
    await tester.enterText(find.byKey(_fieldConfirm), '1234');
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(find.byKey(_formError), findsOneWidget);
    expect(_errorText(tester), 'שמירת נתוני האבטחה נכשלה');
    // The form stays open (the user's action did not complete) and the status
    // still says not configured — no false claim of success.
    expect(find.byKey(_submit), findsOneWidget);
    expect(find.text('PIN לא מוגדר'), findsOneWidget);
    expect(find.text('PIN מוגדר'), findsNothing);
    expect(f.hasRecord, isFalse);
  });

  testWidgets('a secure-storage delete failure is not reported as a successful disable',
      (tester) async {
    final f = await _mount(tester);
    await _setupPinViaUi(tester, '1234');
    f.store.failDeletes = true;

    await tester.tap(find.byKey(_disableButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(_fieldCurrent), '1234');
    await tester.tap(find.byKey(_submit));
    await tester.pumpAndSettle();

    expect(_errorText(tester), 'מחיקת נתוני האבטחה נכשלה');
    expect(f.hasRecord, isTrue);
    expect(find.text('PIN מוגדר'), findsOneWidget);
  });

  testWidgets('every PIN field is obscured, numeric and digit-only', (tester) async {
    await _mount(tester);
    await _setupPinViaUi(tester, '1234');

    await tester.tap(find.byKey(_changeButton));
    await tester.pumpAndSettle();

    for (final key in [_fieldCurrent, _fieldNew, _fieldConfirm]) {
      final field = tester.widget<TextField>(find.byKey(key));
      expect(field.obscureText, isTrue, reason: '$key must never show the PIN');
      expect(field.keyboardType, TextInputType.number);
      expect(field.maxLength, 6);
      expect(field.decoration?.counterText, '');
      expect(field.inputFormatters, isNotNull);
    }

    // Non-digits are filtered out rather than accepted and later rejected.
    await tester.enterText(find.byKey(_fieldNew), 'a1b2c3');
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byKey(_fieldNew)).controller?.text, '123');
  });
}
