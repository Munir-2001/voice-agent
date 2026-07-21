"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Users,
  Upload,
  Settings,
  PhoneCall,
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

const NAV = [
  { title: "Overview", href: "/overview", icon: LayoutDashboard },
  { title: "Interested", href: "/interested", icon: Sparkles, badge: "4" },
  { title: "All leads", href: "/leads", icon: Users },
  { title: "Upload", href: "/upload", icon: Upload },
];

const MANAGE = [
  { title: "Agent behavior", href: "/agent", icon: Bot },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

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
                  {item.badge && (
                    <SidebarMenuBadge className="bg-success-muted text-success-ink">
                      {item.badge}
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
      <SidebarFooter className="p-3">
        <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            MC
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">Meridian Capital</span>
            <span className="truncate text-xs text-muted-foreground">
              Client workspace
            </span>
          </div>
          <PhoneCall className="ml-auto size-4 text-muted-foreground" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
