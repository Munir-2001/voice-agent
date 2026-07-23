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
import { initials } from "@/lib/format";

const NAV = [
  { title: "Overview", href: "/overview", icon: LayoutDashboard },
  { title: "Interested", href: "/interested", icon: Sparkles },
  { title: "All leads", href: "/leads", icon: Users },
  { title: "Upload", href: "/upload", icon: Upload },
];

const MANAGE = [
  { title: "Agent behavior", href: "/agent", icon: Bot },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar({
  interestedCount = 0,
  userEmail = "",
}: {
  interestedCount?: number;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  // Only the Interested item carries a badge, and only when leads are waiting.
  const badgeFor = (href: string) =>
    href === "/interested" && interestedCount > 0 ? String(interestedCount) : null;

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
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                    render={<Link href={item.href} />}
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
        <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
            {initials(userEmail.split("@")[0].replace(/[._-]/g, " ")) || "•"}
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">
              {userEmail || "Signed in"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              Client workspace
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
