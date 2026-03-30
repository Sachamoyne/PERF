import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type AuthState = {
  user: User | null;
  loading: boolean;
};

let authState: AuthState = {
  user: null,
  loading: true,
};

const listeners = new Set<() => void>();
let initialized = false;

function notify() {
  listeners.forEach((listener) => listener());
}

function setAuthState(next: Partial<AuthState>) {
  authState = {
    ...authState,
    ...next,
  };
  notify();
}

function initializeAuthStore() {
  if (initialized) return;
  initialized = true;

  void supabase.auth.getSession().then(({ data: { session }, error }) => {
    if (error) {
      // Token expiré ou corrompu en localStorage -> purge locale silencieuse.
      console.warn("[auth] getSession error — purge de la session locale");
      void supabase.auth.signOut();
      setAuthState({ user: null, loading: false });
      return;
    }

    setAuthState({ user: session?.user ?? null, loading: false });
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    setAuthState({
      user: session?.user ?? null,
      loading: false,
    });
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  initializeAuthStore();
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return authState;
}

export function useAuth() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
