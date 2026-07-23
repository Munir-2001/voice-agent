import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "@/components/motion";
import { getCampaignSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getCampaignSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Settings"
        description="Campaign guardrails and compliance controls."
      />
      <FadeIn>
        <SettingsForm settings={settings} />
      </FadeIn>
      <FadeIn delay={0.1}>
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              The agent identifies itself as an AI assistant when asked, never
              guarantees approval or quotes rates, and honors opt-out requests
              immediately by adding the number to the suppression list.
            </p>
            <p>
              Lead lists must be consented and lawful to call — this is the
              account holder&apos;s responsibility.
            </p>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
