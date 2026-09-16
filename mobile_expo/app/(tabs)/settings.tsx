// Settings — index.html #screen-settings: the topics menu (app.js SETTINGS_TOPICS,
// renderSettingsScreenFromRealData()). One .settings-topic-row per topic: icon +
// label, a short description and the "‹" chevron. Each topic opens its own
// screen; Back returns here.

import { Pressable, Text, View } from 'react-native';

import { SETTINGS_TOPICS } from '../../src/presentation/settingsView.ts';
import { Btn, ScreenScroll, SectionTitle, TOUCH, webShadow } from '../../src/ui/kit.tsx';
import { useTheme } from '../../src/ui/theme.ts';
import { useSafePush } from '../../src/ui/useFinance.tsx';

export default function SettingsScreen() {
  const push = useSafePush();
  const t = useTheme();
  return (
    <ScreenScroll testID="screen-settings">
      <SectionTitle title="הגדרות" first />
      {SETTINGS_TOPICS.map((topic) => (
        <Pressable
          key={topic.key}
          accessibilityRole="button"
          accessibilityLabel={topic.label}
          onPress={() => push({ pathname: '/settings-topic/[topic]', params: { topic: topic.key } })}
          testID={`settings-topic-${topic.key}`}
          style={({ pressed }) => [
            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH, backgroundColor: t.c.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
            webShadow,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: t.fs(14), fontWeight: '600', color: t.c.text, textAlign: 'left' }}>{topic.icon + ' ' + topic.label}</Text>
            <Text style={{ fontSize: t.fs(12), color: t.c.textMuted, marginTop: 2, textAlign: 'left' }}>{topic.desc}</Text>
          </View>
          <Text style={{ fontSize: 18, color: t.c.textMuted, paddingStart: 8 }}>‹</Text>
        </Pressable>
      ))}
      {__DEV__ ? <Btn label="בדיקות תשתית (פיתוח)" tone="secondary" testID="open-diagnostics" onPress={() => push('/diagnostics')} /> : null}
    </ScreenScroll>
  );
}
