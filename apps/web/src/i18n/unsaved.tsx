'use client';
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
const DirtyContext = createContext<Map<string, boolean> | null>(null);
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<string, boolean>());
  return <DirtyContext.Provider value={entries.current}>{children}</DirtyContext.Provider>;
}
export function useUnsavedChanges(dirty: boolean) {
  const entries = useContext(DirtyContext);
  const id = useId();
  useEffect(() => {
    entries?.set(id, dirty);
    return () => {
      entries?.delete(id);
    };
  }, [entries, id, dirty]);
}
export function useHasUnsavedChanges() {
  const entries = useContext(DirtyContext);
  return () => (entries ? [...entries.values()].some(Boolean) : false);
}
