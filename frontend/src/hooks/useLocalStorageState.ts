'use client';

import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

function resolveState<T>(value: SetStateAction<T>, previous: T): T {
  return typeof value === 'function' ? (value as (current: T) => T)(previous) : value;
}

export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const initialRef = useRef(initialValue);
  const [state, setState] = useState<T>(initialValue);

  useEffect(() => {
    const raw = localStorage.getItem(key);
    if (!raw) return;

    try {
      setState(JSON.parse(raw) as T);
    } catch {
      setState(initialRef.current);
    }
  }, [key]);

  const setStoredState = useCallback(
    (value: SetStateAction<T>) => {
      setState((previous) => {
        const next = resolveState(value, previous);
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key],
  );

  return [state, setStoredState];
}
