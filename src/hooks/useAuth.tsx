import { useState, useEffect, useRef, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session, AuthError } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRoles: string[];
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  // Guard: true once getSession resolves, so the onAuthStateChange listener
  // that fires for the *initial* session skips duplicate work.
  const initialised = useRef(false);
  // Track in-flight fetchRoles to avoid double-fetch
  const rolesFetchId = useRef(0);

  useEffect(() => {
    // Set up the listener FIRST (Supabase docs recommend this order).
    // The listener will fire for the initial session, but we ignore that
    // event until getSession has resolved (initialised === true).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Skip events that arrive before getSession resolves — getSession
      // handles the initial state to avoid a double-fetch.
      if (!initialised.current) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        fetchRoles(newSession.user.id);
      } else {
        setUserRoles([]);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      initialised.current = true;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        fetchRoles(initialSession.user.id);
      } else {
        // No user — nothing else to wait for.
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchRoles(userId: string) {
    // Bump the id so any earlier in-flight fetch becomes stale.
    const id = ++rolesFetchId.current;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    // Only apply the result if this is still the latest fetch.
    if (id !== rolesFetchId.current) return;

    setUserRoles(data?.map(r => r.role) || []);
    setLoading(false);
  }

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasRole = (role: string) => userRoles.includes(role);

  return (
    <AuthContext.Provider value={{ user, session, loading, userRoles, signUp, signIn, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
