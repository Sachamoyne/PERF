import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Token expiré ou corrompu en localStorage → on purge et on repart propre
        // C'est la cause du POST /auth/v1/token?grant_type=password → 400
        console.warn("[auth] getSession error — purge de la session locale :", error.message);
        supabase.auth.signOut();
      }
      console.log("[auth] Session au démarrage :", session ? `user=${session.user.email}` : "null");
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}
