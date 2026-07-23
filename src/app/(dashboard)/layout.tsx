import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CampaignControl } from "@/components/campaign-control";
import { CampaignProvider } from "@/components/campaign-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { getCampaignSettings, getInterestedCount } from "@/lib/data";
import { getSessionUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, interestedCount, user] = await Promise.all([
    getCampaignSettings(),
    getInterestedCount(),
    getSessionUser(),
  ]);
  return (
    <CampaignProvider initialActive={settings.active}>
      <SidebarProvider>
        <AppSidebar
          interestedCount={interestedCount}
          userEmail={user?.email ?? ""}
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
