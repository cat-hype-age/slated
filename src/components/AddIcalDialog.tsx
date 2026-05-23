import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Props = {
  trigger: React.ReactNode;
  onConnected?: () => void;
};

export const AddIcalDialog = ({ trigger, onConnected }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Please paste your Partiful iCal URL");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("source_subscriptions")
        .upsert(
          { user_id: user.id, source_type: "partiful", ical_url: trimmed },
          { onConflict: "user_id,source_type" },
        );
      if (error) throw error;
      setOpen(false);
      setUrl("");
      toast.success("Connected. Pulling your events…");

      const { data, error: fnErr } = await supabase.functions.invoke(
        "poll-partiful-ical",
        { body: { user_id: user.id } },
      );
      if (fnErr) throw fnErr;
      const first = (data as { results?: Array<{ ok: boolean; error?: string; processed?: number }> })?.results?.[0];
      if (first && !first.ok) {
        toast.error(`Couldn't read that calendar: ${first.error}`);
      } else {
        toast.success(`Synced ${first?.processed ?? 0} events`);
      }
      onConnected?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Partiful</DialogTitle>
          <DialogDescription>
            Get this from your Partiful calendar → Export → iCal URL
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ical">Partiful iCal URL</Label>
            <Input
              id="ical"
              type="url"
              inputMode="url"
              placeholder="https://partiful.com/ical/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="w-full sm:w-auto">
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
