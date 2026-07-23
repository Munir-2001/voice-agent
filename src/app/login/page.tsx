import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { LiveWaveform } from "@/components/live-indicator";
import { FadeIn } from "@/components/motion";

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-blue p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-brand-blue">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="2" y1="6.5" x2="2" y2="9.5" />
                <line x1="5" y1="4" x2="5" y2="12" />
                <line x1="8" y1="1.5" x2="8" y2="14.5" />
                <line x1="11" y1="4" x2="11" y2="12" />
                <line x1="14" y1="6.5" x2="14" y2="9.5" />
              </g>
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Rose</span>
        </div>

        <FadeIn className="relative max-w-md space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium">
            <LiveWaveform active barClassName="bg-white" />
            Agent live · calling in business hours
          </div>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-balance">
            Your AI loan specialist that never stops prospecting.
          </h1>
          <p className="text-white/75 leading-relaxed">
            Rose calls your lead lists, has a natural conversation, qualifies
            interest, and hands warm prospects straight to your team — every
            call recorded, transcribed, and scored.
          </p>
        </FadeIn>

        <div className="relative flex gap-8 text-sm">
          <div>
            <div className="text-2xl font-semibold tracking-tight tnum">500</div>
            <div className="text-white/60">leads / month</div>
          </div>
          <div>
            <div className="text-2xl font-semibold tracking-tight tnum">9–6</div>
            <div className="text-white/60">local business hrs</div>
          </div>
          <div>
            <div className="text-2xl font-semibold tracking-tight tnum">100%</div>
            <div className="text-white/60">calls logged</div>
          </div>
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <FadeIn className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Welcome back. Enter your credentials to open the console.
            </p>
          </div>

          <LoginForm />

          <p className="text-center text-xs text-muted-foreground">
            Protected workspace · calls comply with configured hours &amp;
            do-not-call rules.
          </p>
        </FadeIn>
      </div>
    </div>
  );
}
