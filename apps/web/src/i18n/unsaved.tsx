'use client';
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
interface DirtyState {
  entries: Map<string, boolean>;
  navigationApproved: boolean;
}
const DirtyContext = createContext<DirtyState | null>(null);
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const state = useRef<DirtyState>({ entries: new Map(), navigationApproved: false });
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!state.current.navigationApproved && [...state.current.entries.values()].some(Boolean))
        event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  return <DirtyContext.Provider value={state.current}>{children}</DirtyContext.Provider>;
}
export function useUnsavedChanges(dirty: boolean) {
  const state = useContext(DirtyContext);
  const id = useId();
  useEffect(() => {
    state?.entries.set(id, dirty);
    return () => {
      state?.entries.delete(id);
    };
  }, [state, id, dirty]);
}
export function useHasUnsavedChanges() {
  const state = useContext(DirtyContext);
  return () => (state ? [...state.entries.values()].some(Boolean) : false);
}
/** Call only after the user explicitly accepts losing drafts and locale persistence succeeds. */
export function useAllowNavigation() {
  const state = useContext(DirtyContext);
  return () => {
    if (state) state.navigationApproved = true;
  };
}
