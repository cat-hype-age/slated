import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { AddIcalDialog } from "@/components/AddIcalDialog";
import { ScheduleView } from "@/components/ScheduleView";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const getFirstName = (meta: Record<string, any> | undefined, email: string | undefined) => {
  const full = meta?.full_name || meta?.name || meta?.given_name;
  if (full) return String(full).split(" ")[0];
  if (email) return email.split("@")[0];
  return "there";
};

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    document.title = "Dashboard — Slated";
  }, []);

  const checkSubscriptions = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from("source_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    setHasSubscription((count ?? 0) > 0);
  }, [user]);

  useEffect(() => { checkSubscriptions(); }, [checkSubscriptions]);

  const onConnected = () => {
    setHasSubscription(true);
    setRefreshKey((k) => k + 1);
  };

  const handleRefresh = async () => {
    if (!user || refreshing) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "poll-partiful-ical",
        { body: { user_id: user.id } },
      );
      if (error) throw error;
      const first = (data as { results?: Array<{ ok: boolean; error?: string; processed?: number }> })?.results?.[0];
      if (first && !first.ok) {
        toast.error(`Refresh failed: ${first.error}`);
      } else {
        toast.success(`Synced ${first?.processed ?? 0} events`);
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const meta = user?.user_metadata as Record<string, any> | undefined;
  const firstName = getFirstName(meta, user?.email);
  const avatarUrl = meta?.avatar_url || meta?.picture;
  const initial = (firstName?.[0] ?? "?").toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-base font-semibold tracking-tight">Slated</span>
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={firstName} />}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col">
                  <span className="text-sm">{firstName}</span>
                  {user?.email && <span className="text-xs text-muted-foreground">{user.email}</span>}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Your schedule.</p>
          </div>
          {hasSubscription && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="Refresh schedule"
                title="Refresh"
              >
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              </Button>
              <AddIcalDialog
                trigger={<Button variant="outline" size="sm">Add source</Button>}
                onConnected={onConnected}
              />
            </div>
          )}
        </div>

        <div className="mt-6">
          {hasSubscription === null ? null : hasSubscription ? (
            <ScheduleView refreshKey={refreshKey} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <h2 className="text-lg font-medium">No events yet</h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Connect your sources to start.
                </p>
                <AddIcalDialog
                  trigger={<Button className="mt-2">Add iCal URL</Button>}
                  onConnected={onConnected}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
