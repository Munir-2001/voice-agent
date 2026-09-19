"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Users,
  Upload,
  Settings,
  Bot,
  ShieldCheck,
  PhoneCall,
  PhoneIncoming,
  Zap,
  FlaskConical,
  Clock,
  History,
  ListChecks,
  Mail,
  Layers,
  FileText,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/components/workspace-switcher";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  newTab?: boolean;
};
type NavGroup = { label: string; items: NavItem[]; adminOnly?: boolean };

// A single always-visible link at the very top (no group header).
const OVERVIEW: NavItem = { title: "Overview", href: "/overview", icon: LayoutDashboard };

// Everything else lives in collapsible, labelled groups so the panel reads as a
// handful of sections instead of ~14 flat links. Outreach is admin-only.
const GROUPS: NavGroup[] = [
  {
    label: "Calls",
    items: [
      { title: "Call log", href: "/calls", icon: PhoneCall },
      { title: "Interested", href: "/interested", icon: Sparkles },
      { title: "Interested history", href: "/interested/history", icon: History },
      { title: "Callbacks", href: "/callbacks", icon: Clock },
      { title: "Call requests", href: "/requests", icon: PhoneIncoming },
      { title: "Demo calls", href: "/demos", icon: Zap },
    ],
  },
  {
    label: "Leads",
    items: [
      { title: "All leads", href: "/leads", icon: Users },
      { title: "Lists", href: "/lists", icon: ListChecks },
      { title: "Upload", href: "/upload", icon: Upload },
    ],
  },
  {
    label: "Outreach",
    adminOnly: true,
    items: [
      { title: "Campaigns", href: "/outreach/campaigns", icon: Mail },
      { title: "Sequences", href: "/outreach/sequences", icon: Layers },
      { title: "Templates", href: "/outreach/templates", icon: FileText },
      { title: "Reports", href: "/outreach/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Manage",
    items: [
      { title: "Preview", href: "/preview", icon: FlaskConical },
      { title: "Agent behavior", href: "/agent", icon: Bot },
      { title: "Verification", href: "/business-profile", icon: ShieldCheck, newTab: true },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

const COLLAPSE_KEY = "sidebar-collapsed-groups";

export function AppSidebar({
  interestedCount = 0,
  callbackCount = 0,
  requestCount = 0,
  userEmail = "",
  workspaces = [],
  activeWorkspaceId = 1,
  canCreateWorkspace = false,
  isAdmin = false,
}: {
  interestedCount?: number;
  callbackCount?: number;
  requestCount?: number;
  userEmail?: string;
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: number;
  canCreateWorkspace?: boolean;
  isAdmin?: boolean;
}) {
  const activeWorkspaceName =
    workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? "Workspace";
  const pathname = usePathname();

  // Hide admin-only groups from non-admins entirely (belt-and-suspenders — the
  // pages 404 for them too).
  const groups = GROUPS.filter((g) => !g.adminOnly || isAdmin);

  // Which groups are collapsed. Persisted to localStorage; default all open.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore malformed storage */
    }
  }, []);
  const toggle = (label: string) =>
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota/private-mode errors */
      }
      return next;
    });

  // Highlight only the MOST specific matching nav item, so /interested/history
  // lights up its own item without also lighting parent /interested.
  const allHrefs = [OVERVIEW, ...groups.flatMap((g) => g.items)].map((i) => i.href);
  const isActive = (href: string) => {
    const best = allHrefs
      .filter((h) => pathname === h || pathname.startsWith(h + "/"))
      .sort((a, b) => b.length - a.length)[0];
    return best === href;
  };
  const badgeFor = (href: string) => {
    if (href === "/interested" && interestedCount > 0) return String(interestedCount);
    if (href === "/callbacks" && callbackCount > 0) return String(callbackCount);
    if (href === "/requests" && requestCount > 0) return String(requestCount);
    return null;
  };

  const renderItem = (item: NavItem) => (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton
        isActive={!item.newTab && isActive(item.href)}
        tooltip={item.title}
        render={
          <Link
            href={item.href}
            {...(item.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
          />
        }
      >
        <item.icon className="size-4" />
        <span>{item.title}</span>
      </SidebarMenuButton>
      {badgeFor(item.href) && (
        <SidebarMenuBadge className="bg-success-muted text-success-ink">
          {badgeFor(item.href)}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-3 py-4">
        <Brand />
      </SidebarHeader>
      <SidebarContent className="px-1">
        {/* Overview — always visible, no group header. */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{renderItem(OVERVIEW)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groups.map((group) => {
          const isCollapsed = !!collapsed[group.label];
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel
                render={
                  <button
                    type="button"
                    onClick={() => toggle(group.label)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center justify-between"
                  />
                }
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    isCollapsed && "-rotate-90",
                  )}
                />
              </SidebarGroupLabel>
              {!isCollapsed && (
                <SidebarGroupContent>
                  <SidebarMenu>{group.items.map(renderItem)}</SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="gap-1 p-3">
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeWorkspaceId}
          canCreate={canCreateWorkspace}
        />
        <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
            {initials(userEmail.split("@")[0].replace(/[._-]/g, " ")) || "•"}
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">
              {userEmail || "Signed in"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {activeWorkspaceName}
            </span>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SignOutButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
