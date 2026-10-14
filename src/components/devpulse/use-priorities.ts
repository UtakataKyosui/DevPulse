import { useEffect, useState } from 'react';
import {
  PRIORITIES_STORAGE_KEY,
  type Priorities,
  type Priority,
  parsePriorities,
} from './priorities.ts';

export function usePriorities() {
  const [priorities, setPriorities] = useState<Priorities>({});
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    try {
      setPriorities(
        parsePriorities(localStorage.getItem(PRIORITIES_STORAGE_KEY)),
      );
    } catch {
      setSaveError(true);
    }
    setReady(true);
  }, []);

  function changePriority(id: string, priority: Priority) {
    const next = { ...priorities, [id]: priority };
    setPriorities(next);
    try {
      localStorage.setItem(PRIORITIES_STORAGE_KEY, JSON.stringify(next));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }

  return { priorities, ready, saveError, changePriority };
}
