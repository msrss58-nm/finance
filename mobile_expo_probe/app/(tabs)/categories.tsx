import { H, P, Screen, useMountLog } from '../../src/ui/components';

export default function CategoriesProbe() {
  useMountLog('categories');
  return (
    <Screen>
      <H>קטגוריות</H>
      <P>מסך דמה לבדיקת ניווט בלבד.</P>
    </Screen>
  );
}
