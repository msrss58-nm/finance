import { ltr } from '../../src/core/bidi.ts';
import { formatAmount, formatSignedAmount } from '../../src/core/currencyFormat.ts';
import { Body, Muted, Row, Screen, Section, Title } from '../../src/ui/components.tsx';

export default function HomeScreen() {
  return (
    <Screen testID="screen-home">
      <Title>בית</Title>
      <Muted>שלב 1 — תשתית. תוכן המסך ייבנה בשלבי ה-parity.</Muted>
      <Section title="בדיקת RTL (נתונים סינתטיים)">
        <Row label="יתרה משוערת" value={formatAmount(12345.6)} testID="rtl-row-balance" />
        <Row label="חיוב חודשי" value={formatSignedAmount(-500)} testID="rtl-row-charge" />
        <Row label="Netflix — מנוי" value={formatSignedAmount(-49.9)} testID="rtl-row-latin" />
        <Row
          label="הלוואה עם שם ארוך מאוד שנועד לבדוק גלישת שורה בלי לחתוך את הסכום"
          value={formatAmount(1234567)}
          testID="rtl-row-long"
        />
        <Body testID="rtl-mixed">{`חיוב בכרטיס ${ltr('Visa 4580')} בתאריך ${ltr('02/10/2026')} בסך ${formatAmount(250)}.`}</Body>
        <Body testID="rtl-latin-first">English-first line inside the RTL layout</Body>
      </Section>
    </Screen>
  );
}
