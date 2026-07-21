import {
  MessageSquareQuote,
  Shield,
  Sparkles,
  Heart,
  BookOpen,
  Building2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/motion";
import {
  CONVERSATION_FLOW,
  STYLE_RULES,
  COMFORT_PRINCIPLES,
  PERSUASION_PRINCIPLES,
  COMPLIANCE_RULES,
} from "@/lib/agent/prompt";
import { OBJECTIONS } from "@/lib/agent/objections";
import { KNOWLEDGE_BASE } from "@/lib/agent/knowledge-base";
import { INDUSTRY_PLAYBOOKS } from "@/lib/agent/industry-playbooks";

export default function AgentPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Agent behavior"
        description="Exactly how the AI talks, persuades, handles pushback, and stays compliant. This drives every call."
      />

      <FadeIn>
        <Card className="overflow-hidden border-primary/15 bg-primary/[0.02]">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <MessageSquareQuote className="size-6" />
            </span>
            <div>
              <h2 className="font-semibold">Ava — consultative financing concierge</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Warm, sharp, and human — never a telemarketer. Ava leads with the
                owner&apos;s outcome, keeps every turn short, lowers pressure, and
                only ever aims to book a callback with a human specialist. She
                never guarantees approval or quotes rates.
              </p>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <Tabs defaultValue="flow">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="flow">Conversation</TabsTrigger>
          <TabsTrigger value="objections">Objections</TabsTrigger>
          <TabsTrigger value="industries">Industries</TabsTrigger>
          <TabsTrigger value="kb">Knowledge base</TabsTrigger>
        </TabsList>

        {/* ---- Conversation flow + principles ---- */}
        <TabsContent value="flow" className="space-y-6 pt-4">
          <FadeIn>
            <div className="space-y-3">
              {CONVERSATION_FLOW.map((p) => (
                <Card key={p.step} className="gap-0 p-5">
                  <div className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {p.step}
                    </span>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <h3 className="font-semibold">{p.title}</h3>
                        <span className="text-xs text-muted-foreground">
                          {p.goal}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{p.detail}</p>
                      {p.sample && (
                        <p className="mt-2 border-l-2 border-primary/30 pl-3 text-sm italic text-foreground/80">
                          “{p.sample}”
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </FadeIn>

          <div className="grid gap-4 md:grid-cols-2">
            <PrincipleCard
              icon={<Sparkles className="size-4" />}
              title="Selling the upside"
              items={PERSUASION_PRINCIPLES}
            />
            <PrincipleCard
              icon={<Heart className="size-4" />}
              title="Making them comfortable"
              items={COMFORT_PRINCIPLES}
            />
            <PrincipleCard
              icon={<MessageSquareQuote className="size-4" />}
              title="How Ava talks"
              items={STYLE_RULES}
            />
            <PrincipleCard
              icon={<Shield className="size-4" />}
              title="Hard compliance rules"
              items={COMPLIANCE_RULES}
              tone="danger"
            />
          </div>
        </TabsContent>

        {/* ---- Objections ---- */}
        <TabsContent value="objections" className="pt-4">
          <FadeIn>
            <div className="grid gap-4 md:grid-cols-2">
              {OBJECTIONS.map((o) => (
                <Card key={o.id} className="gap-0 p-5">
                  <p className="text-sm font-semibold">“{o.trigger}”</p>
                  <p className="mt-1 text-xs text-muted-foreground">{o.intent}</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Approach: </span>
                    {o.approach}
                  </p>
                  <p className="mt-3 border-l-2 border-success/40 pl-3 text-sm italic text-foreground/80">
                    “{o.example}”
                  </p>
                </Card>
              ))}
            </div>
          </FadeIn>
        </TabsContent>

        {/* ---- Industries ---- */}
        <TabsContent value="industries" className="pt-4">
          <FadeIn>
            <div className="grid gap-4 md:grid-cols-2">
              {INDUSTRY_PLAYBOOKS.map((i) => (
                <Card key={i.key} className="gap-0 p-5">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    <h3 className="font-semibold">{i.label}</h3>
                  </div>
                  <p className="mt-3 text-sm text-foreground/80">{i.valueHook}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {i.uses.map((u) => (
                      <span
                        key={u}
                        className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {u}
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </FadeIn>
        </TabsContent>

        {/* ---- Knowledge base ---- */}
        <TabsContent value="kb" className="pt-4">
          <FadeIn>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <BookOpen className="size-4" />
                  Knowledge base
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {KNOWLEDGE_BASE.map((f) => (
                  <div key={f.id} className="px-6 py-4">
                    <p className="text-sm font-medium">{f.question}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {f.answer}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </FadeIn>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PrincipleCard({
  icon,
  title,
  items,
  tone = "default",
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone?: "default" | "danger";
}) {
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center gap-2">
        <span
          className={
            tone === "danger" ? "text-danger-ink" : "text-muted-foreground"
          }
        >
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-muted-foreground">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                tone === "danger" ? "bg-danger" : "bg-muted-foreground/40"
              }`}
            />
            {it}
          </li>
        ))}
      </ul>
    </Card>
  );
}
