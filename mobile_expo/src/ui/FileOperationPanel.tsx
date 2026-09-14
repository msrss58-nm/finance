// Foundation file-operation controls (development builds only). The state is
// owned by FileOperationCoordinator, not by this component, so it survives the
// lock that the picker / share sheet triggers.

import { useState } from 'react';

import { FOUNDATION_EXPORT_TEXT, foundationExportFileName } from '../composition/foundationFixtures.ts';
import { FILE_FAILURE_MESSAGES } from '../backup/fileGateway.ts';
import type { FileOperationCoordinator, FileOperationState } from '../backup/fileOperationCoordinator.ts';
import { ltr } from '../core/bidi.ts';
import { Body, Button, ErrorText, Muted, Section } from './components.tsx';
import { useStore } from './useStore.ts';

function describe(state: FileOperationState): string {
  switch (state.phase) {
    case 'idle':
      return 'אין פעולה פעילה';
    case 'working':
      return state.operation === 'import' ? 'בוחר קובץ…' : 'מייצא…';
    case 'awaitingDecision':
      return `נקרא הקובץ ${ltr(state.name)} (${ltr(String(state.byteLength))} בתים) — ממתין להחלטה. לא נכתב דבר.`;
    case 'finished': {
      const what = state.operation === 'import' ? 'ייבוא' : 'ייצוא';
      // Android/iOS do not report whether the user picked a share target:
      // never claim more than "the sheet closed".
      if (state.outcome === 'succeeded' && state.operation === 'exportShare') return 'ייצוא: חלון השיתוף נסגר (היעד אינו ידוע לאפליקציה)';
      if (state.outcome === 'succeeded') return `${what}: הושלם`;
      if (state.outcome === 'cancelled') return `${what}: בוטל — לא בוצע שינוי`;
      return `${what}: נכשל — ${state.failureKind ? FILE_FAILURE_MESSAGES[state.failureKind] : ''}`;
    }
  }
}

function inspect(text: string): string {
  let json = 'לא JSON';
  try {
    JSON.parse(text);
    json = 'JSON תקין';
  } catch {
    // reported below
  }
  const same = text === FOUNDATION_EXPORT_TEXT ? 'זהה בדיוק לקובץ שיוצא' : 'שונה מקובץ הבדיקה';
  return `${json}; ${ltr(String(text.length))} תווים; ${same}`;
}

export function FileOperationPanel({ files }: { files: FileOperationCoordinator }) {
  const state = useStore(files.state);
  const [inspection, setInspection] = useState<string | null>(null);
  const idle = state.phase === 'idle' || state.phase === 'finished';

  return (
    <Section title="קבצים (תשתית, נתונים סינתטיים)">
      {state.phase === 'finished' && state.outcome === 'failed' ? (
        <ErrorText testID="file-state">{describe(state)}</ErrorText>
      ) : (
        <Body testID="file-state">{describe(state)}</Body>
      )}
      {inspection !== null ? <Muted testID="file-inspection">{inspection}</Muted> : null}
      {state.phase === 'awaitingDecision' ? (
        <>
          <Button
            label="בדיקת הקובץ (ללא כתיבה)"
            testID="file-inspect"
            onPress={() => {
              const text = files.takePendingDocument();
              setInspection(text === null ? 'אין קובץ ממתין' : inspect(text));
            }}
          />
          <Button label="ביטול" tone="secondary" testID="file-discard" onPress={() => files.discardPendingDocument()} />
        </>
      ) : null}
      {state.phase === 'finished' ? (
        <Button label="סגירה" tone="secondary" testID="file-ack" onPress={() => files.acknowledge()} />
      ) : null}
      <Button
        label="בחירת קובץ לייבוא"
        testID="file-import"
        disabled={!idle}
        onPress={() => {
          setInspection(null);
          void files.startImport();
        }}
      />
      <Button
        label="ייצוא דרך חלון שיתוף"
        testID="file-export-share"
        disabled={!idle}
        onPress={() => void files.startExport('share', foundationExportFileName(new Date()), FOUNDATION_EXPORT_TEXT)}
      />
      {files.supportsFolderExport ? (
        <Button
          label="ייצוא לתיקייה (Android)"
          testID="file-export-folder"
          disabled={!idle}
          onPress={() => void files.startExport('folder', foundationExportFileName(new Date()), FOUNDATION_EXPORT_TEXT)}
        />
      ) : null}
    </Section>
  );
}
