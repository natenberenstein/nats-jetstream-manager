'use client';

import { useEffect, useState } from 'react';

export type UiRole = 'admin' | 'viewer';

const ROLE_KEY = 'nats_ui_role_v1';

export function useUiRole() {
  const [role, setRoleState] = useState<UiRole>('admin');

  useEffect(() => {
    const saved = localStorage.getItem(ROLE_KEY);
    if (saved === 'admin' || saved === 'viewer') {
      setRoleState(saved);
    }
  }, []);

  const setRole = (nextRole: UiRole) => {
    setRoleState(nextRole);
    localStorage.setItem(ROLE_KEY, nextRole);
  };

  return { role, setRole, isAdmin: role === 'admin' };
}
