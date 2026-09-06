// Milestone 7 physical-QA fixture — ARM step.
//
// Writes a real PIN record into the device's real Keystore-backed secure
// storage and then exits, deliberately LEAVING it configured. The host then
// force-stops and cold-starts the installed app over adb and confirms the
// lock screen really is what a fresh process shows — something that cannot
// be proven from inside a running Flutter test process, because restarting
// the process kills the test.
//
// `security_cold_start_disarm_test.dart` removes the record afterwards.
// These two always run as a pair; the disarm step must be run even if the
// check in between fails, so the device is never left holding a PIN.
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:familyfinance_pro/security/flutter_secure_secret_store.dart';
import 'package:familyfinance_pro/security/pin_service.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('ARM: configure a real PIN and leave it in place', (tester) async {
    final store = FlutterSecureSecretStore();
    // Start from a known state in case a previous run was interrupted.
    await store.delete(kPinRecordStorageKey);

    final service = PinService(store);
    await service.setPin('4321');

    expect(await service.isPinConfigured(), isTrue);
    expect(await service.verifyPin('4321'), isTrue);
    expect(await service.verifyPin('1234'), isFalse);
  });
}
