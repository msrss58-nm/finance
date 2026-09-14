import { TAB_TITLES, type TabScreen } from '../navigation/routes.ts';
import { Muted, Screen, Title } from './components.tsx';

export function PlaceholderScreen({ screen }: { screen: TabScreen }) {
  return (
    <Screen testID={`screen-${screen}`}>
      <Title>{TAB_TITLES[screen]}</Title>
      <Muted>שלב 1 — תשתית. תוכן המסך ייבנה בשלבי ה-parity.</Muted>
    </Screen>
  );
}
