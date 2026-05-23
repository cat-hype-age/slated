import { useEffect } from "react";
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

const getFirstName = (meta: Record<string, any> | undefined, email: string | undefined) => {
  const full = meta?.full_name || meta?.name || meta?.given_name;
  if (full) return String(full).split(" ")[0];
  if (email) return email.split("@")[0];
  return "there";
};

const Dashboard = () => {
  const { user, signOut } = useAuth();

  useEffect(() => {
    document.title = "Dashboard — Slated";
  }, []);

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

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your schedule will appear here.</p>

        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <h2 className="text-lg font-medium">No events yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Connect your sources to start.
            </p>
            <Button disabled className="mt-2">Add iCal URL</Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;
