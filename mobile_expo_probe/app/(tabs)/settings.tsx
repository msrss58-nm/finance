import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import {
  confirmPendingImport,
  exportViaSafDirectory,
  exportViaShareSheet,
  importViaPicker,
} from '../../src/probe/fileProbe';
import { record } from '../../src/probe/log';
import {
  cancelReminder,
  enableReminders,
  listScheduled,
  permissionStatus,
  scheduleInSeconds,
  scheduleNextMonthly,
} from '../../src/probe/notifyProbe';
import { applyPrivacy } from '../../src/probe/privacy';
import { deletePinRecord, writeSyntheticPinRecord } from '../../src/probe/secureProbe';
import { runSqliteProbe } from '../../src/probe/sqliteProbe';
import { dispatchLock, fileFlowStore, lockStore, useStore } from '../../src/probe/stores';
import { Btn, H, H2, P, Results, Screen, useMountLog } from '../../src/ui/components';

export default function SettingsProbe() {
  const lock = useStore(lockStore);
  const flow = useStore(fileFlowStore);
  const [perm, setPerm] = useState('?');
  useMountLog('settings');

  useEffect(() => {
    void permissionStatus().then(setPerm);
  }, []);

  return (
    <Screen>
      <H>הגדרות — בדיקות Stage 0</H>
      <P>מצב נעילה: {lock.kind}</P>

      <H2>PIN סינתטי (אחסון מאובטח)</H2>
      <Btn
        label="הגדר רשומת PIN סינתטית"
        testID="pin-set"
        onPress={async () => {
          await writeSyntheticPinRecord();
          record('secure', 'write', true, 'synthetic record written');
          await applyPrivacy(true);
          dispatchLock({ type: 'pinSet' });
        }}
      />
      <Btn
        label="הסר רשומת PIN"
        testID="pin-remove"
        onPress={async () => {
          await deletePinRecord();
          record('secure', 'delete', true, 'record removed');
          await applyPrivacy(false);
          dispatchLock({ type: 'pinRemoved' });
        }}
      />

      <H2>התראות (הרשאה: {perm})</H2>
      <Btn
        label="הפעל תזכורת (בקשת הרשאה)"
        testID="notify-enable"
        onPress={async () => {
          await enableReminders();
          setPerm(await permissionStatus());
        }}
      />
      <Btn label="תזמן בעוד 20 שניות" testID="notify-20s" onPress={() => scheduleInSeconds(20)} />
      <Btn label="תזמן בעוד 3 דקות" testID="notify-3m" onPress={() => scheduleInSeconds(180)} />
      <Btn label="תזמן ל-2 בחודש 09:00" testID="notify-monthly" onPress={scheduleNextMonthly} />
      <Btn label="בטל תזכורת" testID="notify-cancel" onPress={cancelReminder} />
      <Btn label="רשימת מתוזמנות" testID="notify-list" onPress={listScheduled} />

      <H2>קבצים</H2>
      <P>
        מצב: {flow.phase} {flow.message}
      </P>
      {Platform.OS === 'android' ? (
        <Btn label="ייצוא — בחירת תיקייה (SAF)" testID="export-saf" onPress={exportViaSafDirectory} />
      ) : null}
      <Btn label="ייצוא — חלון שיתוף" testID="export-share" onPress={exportViaShareSheet} />
      <Btn label="ייבוא — בחירת קובץ" testID="import-pick" onPress={importViaPicker} />
      {flow.phase === 'awaitingConfirm' ? (
        <Btn label="אשר ייבוא (בדיקה בלבד)" testID="import-confirm" onPress={confirmPendingImport} />
      ) : null}

      <H2>SQLite</H2>
      <Btn label="הרץ בדיקת SQLite שוב" testID="sqlite-rerun" onPress={runSqliteProbe} />

      <H2>תוצאות</H2>
      <Results />
    </Screen>
  );
}
