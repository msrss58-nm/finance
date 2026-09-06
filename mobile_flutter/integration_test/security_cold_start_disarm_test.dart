// Milestone 7 physical-QA fixture — DISARM step.
//
// Pair of `security_cold_start_arm_test.dart`. Removes the PIN record from
// the device's real secure storage so physical QA never leaves the device
// holding a lock the user did not set.
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:familyfinance_pro/security/flutter_secure_secret_store.dart';
import 'package:familyfinance_pro/security/pin_service.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('DISARM: remove the PIN record from real secure storage', (tester) async {
    final store = FlutterSecureSecretStore();
    await store.delete(kPinRecordStorageKey);

    final service = PinService(store);
    expect(await service.isPinConfigured(), isFalse);
  });
}
