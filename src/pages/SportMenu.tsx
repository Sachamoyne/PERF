import { Timer, Bike, Waves, Swords, Dumbbell } from "lucide-react";
import { useNavigate } from "react-router-dom";

const sports = [
  { key: "running", label: "Running", path: "/running", icon: Timer },
  { key: "cycling", label: "Vélo", path: "/cycling", icon: Bike },
  { key: "swimming", label: "Natation", path: "/swimming", icon: Waves },
  { key: "racket", label: "Raquette", path: "/racket", icon: Swords },
  { key: "strength", label: "Musculation", path: "/strength", icon: Dumbbell },
] as const;

export default function SportMenu() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-display font-bold text-foreground">Sport</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sports.map((sport) => {
          const Icon = sport.icon;
          return (
            <button
              key={sport.key}
              type="button"
              onClick={() => navigate(sport.path)}
              className="glass-card w-full rounded-2xl border border-border p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-foreground">{sport.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
