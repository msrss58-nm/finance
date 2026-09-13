import { H, P, Screen, useMountLog } from '../../src/ui/components';

export default function GoalsProbe() {
  useMountLog('goals');
  return (
    <Screen>
      <H>יעדים</H>
      <P>מסך יעד לניווט מהקשה על התראה. אין כאן לוגיקת יעדים.</P>
    </Screen>
  );
}
