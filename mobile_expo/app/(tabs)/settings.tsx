// Settings: the topics menu (app.js SETTINGS_TOPICS). Each topic opens its own
// screen; Back returns here.

import { View } from 'react-native';

import { SETTINGS_TOPICS } from '../../src/presentation/settingsView.ts';
import { AppText, Btn, Card, Row, ScreenScroll, SectionTitle } from '../../src/ui/kit.tsx';
import { useSafePush } from '../../src/ui/useFinance.tsx';

export default function SettingsScreen() {
  const push = useSafePush();
  return (
    <ScreenScroll testID="screen-settings">
      <SectionTitle title="הגדרות" />
      {SETTINGS_TOPICS.map((topic) => (
        <Card
          key={topic.key}
          onPress={() => push({ pathname: '/settings-topic/[topic]', params: { topic: topic.key } })}
          testID={`settings-topic-${topic.key}`}
          accessibilityLabel={topic.label}
        >
          <Row>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText bold>{topic.icon + ' ' + topic.label}</AppText>
              <AppText variant="caption" tone="muted">
                {topic.desc}
              </AppText>
            </View>
            <AppText tone="muted">‹</AppText>
          </Row>
        </Card>
      ))}
      {__DEV__ ? <Btn label="בדיקות תשתית (פיתוח)" tone="secondary" testID="open-diagnostics" onPress={() => push('/diagnostics')} /> : null}
    </ScreenScroll>
  );
}
