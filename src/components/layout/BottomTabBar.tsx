import { House, Activity, BookOpen, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { key: "dashboard", label: "Dashboard", icon: House, path: "/" },
  { key: "sport", label: "Sport", icon: Activity, path: "/sport" },
  { key: "mental", label: "Mental", icon: BookOpen, path: "/journal" },
  { key: "settings", label: "Paramètres", icon: Settings, path: "/settings" },
] as const;

function isTabActive(pathname: string, tabPath: string) {
  if (tabPath === "/sport") {
    return pathname === "/sport" || ["/running", "/cycling", "/swimming", "/racket", "/strength"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (tabPath === "/") return pathname === "/";
  return pathname === tabPath || pathname.startsWith(`${tabPath}/`);
}

export function BottomTabBar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[80] border-t bg-white md:hidden"
      style={{
        borderTopColor: "#EEEEEE",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        height: "calc(64px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="grid h-16 grid-cols-4 items-center">
        {tabs.map((tab) => {
          const active = isTabActive(location.pathname, tab.path);
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.path)}
              className="relative flex h-full flex-col items-center justify-center gap-0.5"
            >
              <Icon className="h-[22px] w-[22px]" style={{ color: active ? "#00C853" : "#AAAAAA" }} />
              <span className="text-[10px] leading-none" style={{ color: active ? "#00C853" : "#AAAAAA" }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
