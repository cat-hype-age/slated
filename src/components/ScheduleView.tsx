import { useEffect, useState, useCallback } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type Status = EventRow["status"];

// TechWeek is NYC-based; render all times in ET regardless of viewer locale.
const TZ = "America/New_York";

const statusStyles: Record<Status, string> = {
  pending: "bg-yellow-100 text-yellow-900 hover:bg-yellow-100 border-yellow-200",
  waitlist: "bg-orange-100 text-orange-900 hover:bg-orange-100 border-orange-200",
  approved: "bg-green-100 text-green-900 hover:bg-green-100 border-green-200",
  invited: "bg-blue-100 text-blue-900 hover:bg-blue-100 border-blue-200",
  interested: "bg-gray-100 text-gray-800 hover:bg-gray-100 border-gray-200",
  declined: "bg-gray-100 text-gray-600 hover:bg-gray-100 border-gray-200",
};

const dayKey = (iso: string) => formatInTimeZone(iso, TZ, "yyyy-MM-dd");
const formatDayHeader = (iso: string) => formatInTimeZone(iso, TZ, "EEE, MMM d");
const formatTime = (iso: string) => formatInTimeZone(iso, TZ, "h:mm a");

export const ScheduleView = ({ refreshKey = 0 }: { refreshKey?: number }) => {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("user_id", user.id)
      .gte("starts_at", startOfToday.toISOString())
      .order("starts_at", { ascending: true });
    if (!error && data) setEvents(data as EventRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading your schedule…</p>;
  }

  if (!events.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No upcoming events found yet. We'll keep checking your calendar.
      </p>
    );
  }

  const groups = new Map<string, { iso: string; items: EventRow[] }>();
  for (const ev of events) {
    const key = dayKey(ev.starts_at);
    const g = groups.get(key);
    if (g) g.items.push(ev);
    else groups.set(key, { iso: ev.starts_at, items: [ev] });
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([key, { iso, items }]) => (
        <section key={key}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {formatDayHeader(iso)}
          </h2>
          <ul className="divide-y rounded-lg border bg-card">
            {items.map((ev) => {
              const declined = ev.status === "declined";
              return (
                <li key={ev.id} className="flex items-start gap-3 px-3 py-3">
                  <div className="w-16 shrink-0 text-sm tabular-nums text-muted-foreground">
                    {formatTime(ev.starts_at)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium leading-snug break-words",
                        declined && "line-through text-muted-foreground",
                      )}
                    >
                      {ev.title}
                    </p>
                    {ev.location && (
                      <p
                        className={cn(
                          "mt-0.5 text-xs text-muted-foreground break-words",
                          ev.location_is_gated && "italic",
                        )}
                      >
                        {ev.location}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="outline" className={cn("capitalize", statusStyles[ev.status])}>
                      {ev.status}
                    </Badge>
                    {ev.status_is_inferred && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Inferred from iCal — confirm in Partiful
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};
