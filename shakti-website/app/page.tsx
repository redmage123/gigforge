export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <HowItWorks />
      <UseCases />
      <Features />
      <Pricing />
      <Footer />
    </main>
  );
}

/* ──────────────────────────── NAV ────────────────────────────── */

function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#06b6d4] flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">Shakti</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-[#a1a1aa]">
          <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
          <a href="#use-cases" className="hover:text-white transition-colors">Use Cases</a>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </div>
        <a
          href="mailto:hello@ai-elevate.ai?subject=Shakti Demo Request"
          className="hidden md:inline-flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-sm font-medium rounded-lg transition-colors"
        >
          Book a Demo
        </a>
      </div>
    </nav>
  );
}

/* ──────────────────────────── HERO ──────────────────────────── */

function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden pt-20">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 animate-gradient opacity-30"
        style={{
          background:
            "linear-gradient(135deg, #6366f1 0%, #0a0a0a 25%, #06b6d4 50%, #0a0a0a 75%, #6366f1 100%)",
          backgroundSize: "200% 200%",
        }}
      />
      {/* Radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-indigo/10 blur-[120px] animate-pulse-glow" />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-tight mb-6">
          The AI Workforce That{" "}
          <span className="bg-gradient-to-r from-indigo to-cyan bg-clip-text text-transparent">
            Never Sleeps
          </span>
        </h1>
        <p className="text-lg sm:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
          Shakti deploys 143+ autonomous agents across your entire organization.
          They hire, sell, build, support, and grow — without you lifting a
          finger.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <a
            href="mailto:hello@ai-elevate.ai?subject=Shakti Demo Request"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-lg bg-indigo hover:bg-indigo-dark text-white font-semibold transition-colors text-lg"
          >
            Book a Demo
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-lg border border-white/20 hover:border-white/40 text-white font-semibold transition-colors text-lg"
          >
            See How It Works
          </a>
        </div>
      </div>

      {/* Stat bar */}
      <div className="relative z-10 w-full max-w-4xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-0 md:divide-x md:divide-white/10 border border-white/10 rounded-2xl bg-white/5 backdrop-blur-sm p-6">
          {[
            { value: "143+", label: "Agents" },
            { value: "3", label: "Live Orgs" },
            { value: "Zero", label: "Human Intervention" },
            { value: "24/7", label: "Operation" },
          ].map((stat) => (
            <div key={stat.label} className="text-center px-4">
              <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-indigo to-cyan bg-clip-text text-transparent">
                {stat.value}
              </div>
              <div className="text-sm text-muted mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────── HOW IT WORKS ──────────────────────── */

const layers = [
  {
    num: "01",
    title: "Gateway Layer",
    desc: "Every email, webhook, and message routed intelligently to the right agent",
    color: "from-indigo to-indigo-light",
  },
  {
    num: "02",
    title: "Agent Runtime",
    desc: "143+ specialized agents, each with a role, memory, and decision-making capability",
    color: "from-indigo-light to-cyan",
  },
  {
    num: "03",
    title: "Temporal Workflows",
    desc: "Durable, retryable, time-aware workflows — nothing gets lost, dropped, or forgotten",
    color: "from-cyan to-cyan-light",
  },
  {
    num: "04",
    title: "Evolution Engine",
    desc: "Agents improve themselves. Each iteration learns from outcomes and rewrites its own logic",
    color: "from-cyan-light to-indigo",
  },
  {
    num: "05",
    title: "Monitoring & Escalation",
    desc: "Critical issues auto-detected, auto-escalated, and auto-fixed — humans only see what matters",
    color: "from-indigo to-cyan",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <SectionHeader
          title="Built Different. Built to Run Itself."
          subtitle="Five layers of architecture that make autonomous operations possible."
        />
        <div className="space-y-4 mt-16">
          {layers.map((layer) => (
            <div
              key={layer.num}
              className="group relative flex items-start gap-6 p-6 rounded-2xl border border-white/5 bg-dark-card hover:border-indigo/30 transition-all duration-300"
            >
              <div
                className={`shrink-0 text-3xl font-bold bg-gradient-to-r ${layer.color} bg-clip-text text-transparent`}
              >
                {layer.num}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {layer.title}
                </h3>
                <p className="text-muted leading-relaxed">{layer.desc}</p>
              </div>
              {/* Connector line */}
              <div className="absolute left-[2.35rem] top-full w-px h-4 bg-gradient-to-b from-white/10 to-transparent group-last:hidden" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────── USE CASES ──────────────────────────── */

const useCases = [
  {
    icon: "⚡",
    title: "Freelance Agency",
    org: "GigForge",
    desc: "15+ agents handle every gig from proposal to delivery to invoice — clients never know there is no human team",
  },
  {
    icon: "🚀",
    title: "SaaS Company",
    org: "TechUni",
    desc: "Full engineering, marketing, sales, and support teams operating 24/7. MRR growing on autopilot.",
  },
  {
    icon: "🎮",
    title: "Game Studio",
    org: "Mythforge Studios",
    desc: "Story generation, asset pipelines, QA, and player support — all automated",
  },
  {
    icon: "🏢",
    title: "Any Org",
    org: "Your Organization",
    desc: "Finance, legal, ops, HR, comms — if it runs on knowledge work, Shakti can run it",
  },
];

function UseCases() {
  return (
    <section id="use-cases" className="py-24 px-6 bg-gradient-to-b from-transparent via-indigo/5 to-transparent">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          title="One Platform. Any Knowledge-Work Organization."
          subtitle="From freelance agencies to game studios — if your business runs on knowledge work, Shakti runs your business."
        />
        <div className="grid md:grid-cols-2 gap-6 mt-16">
          {useCases.map((uc) => (
            <div
              key={uc.title}
              className="p-8 rounded-2xl border border-white/5 bg-dark-card hover:border-indigo/30 transition-all duration-300 group"
            >
              <div className="text-4xl mb-4">{uc.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-1">
                {uc.title}
              </h3>
              <div className="text-sm text-indigo-light font-medium mb-3">
                {uc.org}
              </div>
              <p className="text-muted leading-relaxed">{uc.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────── FEATURES ──────────────────────────── */

const features = [
  {
    title: "Agent Evolution",
    desc: "Agents write and improve their own prompts, logic, and decision trees over time",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
  },
  {
    title: "Full Email Pipeline",
    desc: "Customers email your agents. Agents reply, escalate, and resolve — indistinguishable from a human team",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    title: "Critical Issue Auto-Fix",
    desc: "Anomaly detection triggers automatic remediation workflows before humans even notice",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
      </svg>
    ),
  },
  {
    title: "Time-Aware SLA Enforcement",
    desc: "Deadlines tracked, escalations triggered, SLAs enforced — automatically, always",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    title: "Approval Gates",
    desc: "Quality gates with dual-reviewer patterns ensure nothing ships that should not",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    title: "Built on OpenClaw",
    desc: "Powered by the open-source AI assistant platform trusted by thousands of developers",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
      </svg>
    ),
  },
];

function Features() {
  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          title="The Features That Make It Real"
          subtitle="Not vaporware. Not a demo. These capabilities are running in production right now."
        />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-16">
          {features.map((f) => (
            <div
              key={f.title}
              className="p-8 rounded-2xl border border-white/5 bg-dark-card hover:border-cyan/30 transition-all duration-300 group"
            >
              <div className="text-indigo group-hover:text-cyan transition-colors mb-4">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {f.title}
              </h3>
              <p className="text-muted text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────── PRICING ────────────────────────────── */

function Pricing() {
  return (
    <section id="pricing" className="py-24 px-6 bg-gradient-to-b from-transparent via-cyan/5 to-transparent">
      <div className="max-w-4xl mx-auto">
        <SectionHeader
          title="Enterprise-Grade. Priced for Scale."
          subtitle="Get started with a pilot or deploy across your entire organization."
        />
        <div className="grid md:grid-cols-2 gap-8 mt-16">
          {/* Starter */}
          <div className="p-8 rounded-2xl border border-white/10 bg-dark-card flex flex-col">
            <h3 className="text-2xl font-bold text-white mb-2">Starter</h3>
            <p className="text-muted mb-8 flex-1">
              Get started with a dedicated pilot org. See Shakti in action with
              your own workflows and data.
            </p>
            <a
              href="mailto:hello@ai-elevate.ai?subject=Shakti Starter Inquiry"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-indigo text-indigo hover:bg-indigo hover:text-white font-semibold transition-colors"
            >
              Contact Us
            </a>
          </div>
          {/* Enterprise */}
          <div className="p-8 rounded-2xl border border-indigo/50 bg-gradient-to-br from-indigo/10 to-transparent flex flex-col relative overflow-hidden">
            <div className="absolute top-4 right-4 text-xs font-semibold px-3 py-1 rounded-full bg-indigo/20 text-indigo-light">
              Recommended
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Enterprise</h3>
            <p className="text-muted mb-8 flex-1">
              Full deployment across your organization with dedicated support,
              custom integrations, and priority evolution tuning.
            </p>
            <a
              href="mailto:hello@ai-elevate.ai?subject=Shakti Enterprise Demo"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-indigo hover:bg-indigo-dark text-white font-semibold transition-colors"
            >
              Book a Demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────── FOOTER ─────────────────────────────── */

function Footer() {
  return (
    <footer className="py-16 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto text-center">
        <div className="text-2xl font-bold bg-gradient-to-r from-indigo to-cyan bg-clip-text text-transparent mb-4">
          Shakti
        </div>
        <p className="text-muted text-sm max-w-lg mx-auto mb-6">
          Shakti is the autonomous AI workforce platform powering the next
          generation of organizations.
        </p>
        <a
          href="mailto:hello@ai-elevate.ai"
          className="text-indigo-light hover:text-indigo transition-colors text-sm"
        >
          hello@ai-elevate.ai
        </a>
        <div className="mt-8 text-xs text-muted/60">
          Built by AI Elevate Ltd — Ireland
          <br />
          &copy; 2026 AI Elevate Ltd. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

/* ──────────────────────── SHARED ─────────────────────────────── */

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
        {title}
      </h2>
      <p className="text-muted text-lg leading-relaxed">{subtitle}</p>
    </div>
  );
}
