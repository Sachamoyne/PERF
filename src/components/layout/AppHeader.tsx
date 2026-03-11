import { User } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSyncStatus } from "@/hooks/useSyncStatus";

export function AppHeader() {
  const { data: syncStatus } = useSyncStatus();

  return (
    <>
      <header className="flex items-center justify-between border-b border-border px-4 pb-2" style={{ paddingTop: 'var(--sat, 20px)' }}>
        <div className="flex items-center gap-2">
          <SidebarTrigger />
        </div>
        <div className="flex items-center gap-3">
          {syncStatus && (
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  syncStatus.isRecent
                    ? "bg-primary animate-pulse-glow"
                    : syncStatus.isStale
                    ? "bg-destructive"
                    : "bg-running"
                }`}
              />
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {syncStatus.label}
              </span>
            </div>
          )}

          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </header>
    </>
  );
}
