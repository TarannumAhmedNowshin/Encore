import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/encore/primitives";
import { safeRedirect } from "@/lib/auth";

const PENDING_KEY = "encore-post-auth";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => (typeof s["redirect"] === "string" ? { redirect: s["redirect"] } : {}),
  head: () => ({
    meta: [
      { title: "Sign in — Encore" },
      { name: "description", content: "Sign in or create your Encore account." },
      { property: "og:title", content: "Sign in to Encore" },
      { property: "og:description", content: "Access your Encore analyses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const target = () => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    return safeRedirect(redirect ?? stored);
  };

  const go = () => {
    const dest = target();
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    navigate({ href: dest, replace: true });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && go());
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (s && (e === "SIGNED_IN" || e === "INITIAL_SESSION")) go();
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?redirect=${encodeURIComponent(safeRedirect(redirect))}`,
            data: { full_name: fullName, company },
          },
        });
        if (error) throw error;
        if (!data.session) setSent(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    try {
      sessionStorage.setItem(PENDING_KEY, safeRedirect(redirect));
    } catch {
      /* ignore */
    }
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    go();
  }

  return (
    <div className="dot-grid flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 inline-block rounded-md" aria-label="Encore home">
          <Logo />
        </Link>
        <div className="surface p-6">
          {sent ? (
            <div>
              <h1 className="text-xl font-semibold">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">We sent a confirmation link to {email}. Open it to finish signing up.</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signin" ? "Sign in to continue to your analyses." : "Start turning wins into pipeline."}
              </p>
              <Button variant="secondary" className="mt-6 w-full" onClick={onGoogle} type="button">
                <GoogleIcon /> Continue with Google
              </Button>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <form onSubmit={onSubmit} className="space-y-4">
                {mode === "signup" && (
                  <>
                    <Field id="name" label="Full name" value={fullName} onChange={setFullName} autoComplete="name" />
                    <Field id="company" label="Company" value={company} onChange={setCompany} autoComplete="organization" />
                  </>
                )}
                <Field id="email" label="Work email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
                <Field id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={6} />
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              </form>
              <p className="mt-5 text-center text-sm text-muted-foreground">
                {mode === "signin" ? "New to Encore?" : "Already have an account?"}{" "}
                <button type="button" className="rounded font-medium text-primary hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; required?: boolean; minLength?: number }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input id={props.id} type={props.type ?? "text"} value={props.value} onChange={(e) => props.onChange(e.target.value)} autoComplete={props.autoComplete} required={props.required} minLength={props.minLength} className="h-10 rounded-lg bg-background" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
