import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CampaignControl } from "@/components/campaign-control";
import { DialNowButton } from "@/components/dial-now-button";
import { CampaignProvider } from "@/components/campaign-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { getCampaignSettings, getInterestedCount, getCallbackCount } from "@/lib/data";
import { getSessionUser } from "@/lib/auth";
import { getUserWorkspaces, getActiveWorkspaceId } from "@/lib/workspace";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, interestedCount, callbackCount, user, workspaces, activeWorkspaceId] =
    await Promise.all([
      getCampaignSettings(),
      getInterestedCount(),
      getCallbackCount(),
      getSessionUser(),
      getUserWorkspaces(),
      getActiveWorkspaceId(),
    ]);
  return (
    <CampaignProvider key={activeWorkspaceId} initialActive={settings.active}>
      <SidebarProvider>
        <AppSidebar
          interestedCount={interestedCount}
          callbackCount={callbackCount}
          userEmail={user?.email ?? ""}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
            <SidebarTrigger className="text-muted-foreground" />
            <Separator orientation="vertical" className="mr-1 h-5" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden max-w-[40ch] truncate font-medium text-foreground sm:inline">
                {settings.name}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <DialNowButton />
              <CampaignControl />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </CampaignProvider>
  );
}
