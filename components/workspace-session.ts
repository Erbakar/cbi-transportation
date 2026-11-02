"use client";
import { createContext, useContext } from 'react';

export type WorkspaceUser = { username: string };
// Keep the context in a shared module: the layout and route client entries
// must use the same provider identity, including during development refreshes.
export const SessionContext = createContext<WorkspaceUser | null>(null);

export function useWorkspaceUser() {
  const user = useContext(SessionContext);
  if (!user) throw new Error('Oturum gerekli.');
  return user;
}
