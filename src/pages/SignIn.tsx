import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/contexts/AuthContext";

const SignIn = () => {
  const { session, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Sign in — Slated";
  }, []);

  if (loading) return null;
  if (session) return <Navigate to="/dashboard" replace />;

  const handleGoogle = async () => {
    setSubmitting(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/dashboard`,
    });
    if (result.error) {
      setError(result.error.message ?? "Sign-in failed");
      setSubmitting(false);
      return;
    }
    if (result.redirected) return;
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Slated</CardTitle>
          <CardDescription>Sign in to view your schedule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={handleGoogle} disabled={submitting}>
            {submitting ? "Redirecting…" : "Continue with Google"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
};

export default SignIn;
