import { useState } from "react";
import { LayoutDashboard, Timer, Swords, Dumbbell, Settings, ChevronRight, BookOpen, Brain } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Vue d'ensemble", url: "/", icon: LayoutDashboard },
];

const mentalItems = [
  { title: "Journal", url: "/journal", icon: BookOpen },
];

const sportItems = [
  { title: "Running", url: "/running", icon: Timer },
  { title: "Raquette", url: "/racket", icon: Swords },
  { title: "Musculation", url: "/strength", icon: Dumbbell },
];

const bottomItems = [
  { title: "Paramètres", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [sportOpen, setSportOpen] = useState(false);
  const [mentalOpen, setMentalOpen] = useState(false);
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isSportActive = sportItems.some((item) => location.pathname.startsWith(item.url));
  const isMentalActive = mentalItems.some((item) => location.pathname.startsWith(item.url));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <div
        className="p-4 flex items-center gap-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 20px) + 1rem)" }}
      >
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-display font-bold text-sm">PT</span>
        </div>
        {!collapsed && <span className="font-display font-bold text-foreground text-lg">PERF-TRACK</span>}
      </div>
      <SidebarContent>
        {/* Groupe principal */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-accent/50"
                      activeClassName="bg-accent text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Groupe Mental */}
        <SidebarGroup>
          <Collapsible open={mentalOpen || isMentalActive} onOpenChange={setMentalOpen}>
            <CollapsibleTrigger asChild>
              <button className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm
                hover:bg-accent/50 transition-colors
                ${isMentalActive ? "text-primary font-medium" : "text-muted-foreground"}
              `}>
                <Brain className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">Mental</span>
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200
                      ${(mentalOpen || isMentalActive) ? "rotate-90" : ""}
                    `} />
                  </>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenu className={`${!collapsed ? "ml-4 border-l border-border pl-2 mt-1" : ""}`}>
                {mentalItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={false}
                        className="hover:bg-accent/50"
                        activeClassName="bg-accent text-primary font-medium"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Groupe Sport */}
        <SidebarGroup>
          <Collapsible open={sportOpen || isSportActive} onOpenChange={setSportOpen}>
            <CollapsibleTrigger asChild>
              <button className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm
                hover:bg-accent/50 transition-colors
                ${isSportActive ? "text-primary font-medium" : "text-muted-foreground"}
              `}>
                <Dumbbell className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">Sport</span>
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200
                      ${(sportOpen || isSportActive) ? "rotate-90" : ""}
                    `} />
                  </>
                )}
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <SidebarMenu className={`${!collapsed ? "ml-4 border-l border-border pl-2 mt-1" : ""}`}>
                {sportItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={false}
                        className="hover:bg-accent/50"
                        activeClassName="bg-accent text-primary font-medium"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Paramètres en bas */}
        <SidebarGroup
          className="mt-auto"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 20px) + 0.5rem)" }}
        >
          <SidebarGroupContent>
            <SidebarMenu>
              {bottomItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={false}
                      className="hover:bg-accent/50"
                      activeClassName="bg-accent text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
