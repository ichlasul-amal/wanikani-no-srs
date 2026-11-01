import { createContext, useContext, useSyncExternalStore } from "react";

export const SubjectStoreContext = createContext(null);

// Returns the session's store (for actions like ensureLevels) and its
// current snapshot (for reads). Re-renders whenever the store changes.
export function useSubjects() {
  const store = useContext(SubjectStoreContext);
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { store, data };
}
