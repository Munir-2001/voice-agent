import { Brand } from "@/components/brand";
import { BusinessProfileForm } from "@/components/business-profile-form";
import { FadeIn } from "@/components/motion";

export const dynamic = "force-dynamic";

export default function BusinessProfilePage() {
  return (
    <div className="min-h-dvh bg-muted/30">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <FadeIn className="space-y-8">
          <div className="space-y-3">
            <Brand />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                Business verification details
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                To enable calling on your behalf, our telephony provider requires
                a one-time business verification. Please fill in your business
                details below — it takes a couple of minutes, and we&apos;ll handle
                the rest. All information is used only for this verification.
              </p>
            </div>
          </div>

          <BusinessProfileForm />
        </FadeIn>
      </div>
    </div>
  );
}
