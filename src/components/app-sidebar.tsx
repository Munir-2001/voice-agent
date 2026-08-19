"use client";

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
  FlaskConical,
  Clock,
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

const NAV = [
  { title: "Overview", href: "/overview", icon: LayoutDashboard },
  { title: "Call log", href: "/calls", icon: PhoneCall },
  { title: "Interested", href: "/interested", icon: Sparkles },
  { title: "Callbacks", href: "/callbacks", icon: Clock },
  { title: "All leads", href: "/leads", icon: Users },
  { title: "Upload", href: "/upload", icon: Upload },
];

const MANAGE = [
  { title: "Preview", href: "/preview", icon: FlaskConical },
  { title: "Agent behavior", href: "/agent", icon: Bot },
  // Standalone public form (for the client) — opens in a new tab so the
  // dashboard stays put.
  { title: "Verification", href: "/business-profile", icon: ShieldCheck, newTab: true },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar({
  interestedCount = 0,
  callbackCount = 0,
  userEmail = "",
  workspaces = [],
  activeWorkspaceId = 1,
}: {
  interestedCount?: number;
  callbackCount?: number;
  userEmail?: string;
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: number;
}) {
  const activeWorkspaceName =
    workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? "Workspace";
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  // Interested and Callbacks each carry a badge when leads are waiting.
  const badgeFor = (href: string) => {
    if (href === "/interested" && interestedCount > 0) return String(interestedCount);
    if (href === "/callbacks" && callbackCount > 0) return String(callbackCount);
    return null;
  };

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-3 py-4">
        <Brand />
      </SidebarHeader>
      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel>Campaign</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                    render={<Link href={item.href} />}
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
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MANAGE.map((item) => (
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
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-1 p-3">
        <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspaceId} />
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
