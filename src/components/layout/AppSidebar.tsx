import { useMemo, useState } from "react";
import { LayoutDashboard, Timer, Bike, Waves, Swords, Dumbbell, Settings, ChevronRight, BookOpen, Brain } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

const primaryItems = [
  { title: "Vue d'ensemble", url: "/", icon: LayoutDashboard, exact: true },
  { title: "Coach IA", url: "/coach", icon: Brain },
  { title: "Mental", url: "/journal", icon: BookOpen },
] as const;

const sportItems = [
  { title: "Running", url: "/running", icon: Timer },
  { title: "Vélo", url: "/cycling", icon: Bike },
  { title: "Natation", url: "/swimming", icon: Waves },
  { title: "Raquette", url: "/racket", icon: Swords },
  { title: "Musculation", url: "/strength", icon: Dumbbell },
] as const;

function MovaLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 250 250"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g transform="translate(-215 -50)">
        <rect x="215" y="50" width="250" height="250" rx="56" fill="#0A0A0A" />
        <path
          d="M 280 210
           C 280 165, 298 138, 315 120
           C 332 102, 348 120, 358 143
           C 368 166, 372 183, 384 166
           C 396 149, 408 120, 425 120
           C 442 120, 454 148, 454 185
           C 454 212, 442 228, 436 218"
          fill="none"
          stroke="#00E676"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="280" cy="210" r="5" fill="#00E676" />
        <circle cx="436" cy="218" r="5" fill="#00E676" />
        <ellipse cx="358" cy="226" rx="78" ry="5" fill="#00E676" opacity="0.12" />
      </g>
    </svg>
  );
}

function isItemActive(pathname: string, url: string, exact?: boolean) {
  if (exact) return pathname === url;
  return pathname === url || pathname.startsWith(`${url}/`);
}

function initialsFromEmail(email?: string | null) {
  if (!email) return "PT";
  const base = email.split("@")[0] ?? "PT";
  const chunks = base.split(/[._-]/).filter(Boolean);
  if (chunks.length >= 2) return `${chunks[0][0] ?? ""}${chunks[1][0] ?? ""}`.toUpperCase();
  return (base.slice(0, 2) || "PT").toUpperCase();
}

function displayNameFromEmail(email?: string | null) {
  if (!email) return "Utilisateur";
  return email.split("@")[0] || email;
}

function SidebarItem({
  label,
  icon: Icon,
  active,
  onClick,
  indented = false,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  indented?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full flex items-center rounded-lg text-left transition-colors border-l-2",
        `${indented ? "pl-8" : "pl-4"} pr-4 py-[10px] gap-[10px] ${indented ? "text-[13px]" : "text-sm"}`,
        active
          ? "border-l-primary bg-primary/10 text-primary"
          : "border-l-transparent text-[#888888] hover:bg-white/5 hover:text-[#CCCCCC]",
      ].join(" ")}
    >
      <Icon className={active ? "h-4 w-4 text-primary" : "h-4 w-4 text-[#555555]"} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [sportOpen, setSportOpen] = useState(true);

  const isSportSectionActive = useMemo(
    () => sportItems.some((item) => isItemActive(location.pathname, item.url)),
    [location.pathname]
  );

  const avatarInitials = initialsFromEmail(user?.email);
  const displayName = displayNameFromEmail(user?.email);

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border/80 bg-sidebar">
      <div
        className="flex justify-center px-5 pb-4 border-b border-sidebar-border/80"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
      >
        <div className="h-12 w-12 min-w-12">
          <MovaLogo size={48} />
        </div>
      </div>

      <SidebarContent className="px-2 pb-2 gap-1">
        <SidebarGroup className="p-0 pt-1">
          <SidebarGroupContent className="space-y-1">
            {primaryItems.map((item) => (
              <SidebarItem
                key={item.title}
                label={item.title}
                icon={item.icon}
                active={isItemActive(location.pathname, item.url, item.exact)}
                onClick={() => navigate(item.url)}
              />
            ))}
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="my-1 h-px bg-sidebar-border/80" />

        <SidebarGroup className="p-0">
          <SidebarGroupContent className="space-y-1">
            <button
              type="button"
              onClick={() => setSportOpen((v) => !v)}
              className={`w-full flex items-center rounded-lg text-left transition-colors border-l-2 ${
                "gap-[10px] py-[10px] pr-4 pl-4"
              } ${
                isSportSectionActive
                  ? "border-l-primary bg-primary/10 text-primary"
                  : "border-l-transparent text-[#888888] hover:bg-white/5 hover:text-[#CCCCCC]"
              }`}
            >
              <Timer className={isSportSectionActive ? "h-4 w-4 text-primary" : "h-4 w-4 text-[#555555]"} />
              <span className="flex-1">Sport</span>
              <ChevronRight className={`h-4 w-4 transition-transform ${sportOpen ? "rotate-90" : ""}`} />
            </button>

            {sportOpen ? (
              <div className="space-y-1">
                {sportItems.map((item) => (
                  <SidebarItem
                    key={item.title}
                    label={item.title}
                    icon={item.icon}
                    active={isItemActive(location.pathname, item.url)}
                    onClick={() => navigate(item.url)}
                    indented
                  />
                ))}
              </div>
            ) : null}
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="my-1 h-px bg-sidebar-border/80" />

        <SidebarGroup
          className="mt-auto p-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 20px) + 0.5rem)" }}
        >
          <SidebarGroupContent>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className={`w-full flex items-center rounded-lg border border-sidebar-border/80 hover:bg-white/5 transition-colors ${
                "gap-3 px-3 py-2"
              }`}
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {avatarInitials}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs text-foreground">{displayName}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{user?.email ?? "—"}</span>
              </span>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </button>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
