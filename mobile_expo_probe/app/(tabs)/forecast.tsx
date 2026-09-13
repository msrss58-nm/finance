import { H, P, Screen, useMountLog } from '../../src/ui/components';

export default function ForecastProbe() {
  useMountLog('forecast');
  return (
    <Screen>
      <H>תחזית</H>
      <P>מסך דמה לבדיקת ניווט בלבד. אין כאן לוגיקה עסקית.</P>
    </Screen>
  );
}
