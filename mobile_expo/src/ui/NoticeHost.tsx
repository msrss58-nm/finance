// Shows the finance controller's one-shot notices (the auto-archive toast).

import { useCallback } from 'react';

import { useServices } from '../composition/ServicesContext.tsx';
import { Toast } from './kit.tsx';
import { useStore } from './useStore.ts';

export function NoticeHost() {
  const { finance } = useServices();
  const notice = useStore(finance.notice);
  const done = useCallback(() => finance.dismissNotice(), [finance]);
  if (notice === null) return null;
  return <Toast key={notice.id} text={notice.text} onDone={done} />;
}
