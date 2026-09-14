import { useRouter } from 'expo-router';

import { useServices } from '../../src/composition/ServicesContext.tsx';
import { describeAuthState } from '../../src/ui/authText.ts';
import { Body, Button, Muted, Screen, Section, Title } from '../../src/ui/components.tsx';
import { FileOperationPanel } from '../../src/ui/FileOperationPanel.tsx';
import { useStore } from '../../src/ui/useStore.ts';

export default function SettingsScreen() {
  const { auth, files } = useServices();
  const state = useStore(auth.state);
  const router = useRouter();

  return (
    <Screen testID="screen-settings">
      <Title>הגדרות</Title>
      <Section title="אבטחה">
        <Body testID="settings-auth-state">{describeAuthState(state)}</Body>
        <Muted>קוד PIN אמיתי ייושם לאחר אישור חבילת ה-KDF.</Muted>
      </Section>
      {__DEV__ ? <FileOperationPanel files={files} /> : null}
      {__DEV__ ? (
        <Button label="בדיקות תשתית (פיתוח)" tone="secondary" testID="open-diagnostics" onPress={() => router.push('/diagnostics')} />
      ) : null}
    </Screen>
  );
}
