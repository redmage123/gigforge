import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import {
  Globe, Brain, Layers, Container, MessageSquare, Bot,
  CheckCircle, Star, ArrowRight,
} from 'lucide-react'
import { projects } from '@/data/projects'
import { testimonials } from '@/data/testimonials'

export const metadata: Metadata = {
  title: 'GigForge | AI-Powered Development Agency',
  description:
    'Describe what you need. Our autonomous AI team designs, codes, tests, and ships it — with human approval at every gate.',
}

const stats = [
  { value: '98',   label: 'AI Agents' },
  { value: '4',    label: 'Organisations' },
  { value: '50+',  label: 'Projects Delivered' },
  { value: '24/7', label: 'Autonomous Operation' },
]

const services = [
  {
    icon: Globe,
    title: 'Full-Stack Web Apps',
    description:
      'Custom web applications built with modern frameworks — React, Next.js, Express — tested, Dockerised, and production-ready.',
  },
  {
    icon: Brain,
    title: 'AI/ML Integration',
    description:
      'Embed AI into your product: LLM APIs, RAG pipelines, vector search, and fine-tuned models wired into your stack.',
  },
  {
    icon: Layers,
    title: 'SaaS Platforms',
    description:
      'Multi-tenant SaaS from scratch — subscription billing, usage metering, RBAC, and webhook infrastructure.',
  },
  {
    icon: Container,
    title: 'DevOps & CI/CD',
    description:
      'Docker, GitHub Actions, Railway, Fly.io — automated pipelines, health checks, Prometheus metrics, Grafana dashboards.',
  },
  {
    icon: MessageSquare,
    title: 'RAG Chatbots',
    description:
      'Document-grounded chat assistants. pgvector similarity search, context injection, embeddable widget for any site.',
  },
  {
    icon: Bot,
    title: 'Custom AI Agents',
    description:
      'Autonomous multi-agent workflows — Scouts, PMs, Engineers, QA — orchestrated to complete complex business tasks end-to-end.',
  },
]

const steps = [
  {
    number: 1,
    title: 'Describe what you need',
    description:
      'Tell us your requirements, deadline, and budget — no technical jargon required.',
  },
  {
    number: 2,
    title: 'AI team builds it',
    description:
      'Spec, design, code, tests, and deploy — all autonomous, all transparent, tracked in a live sprint board.',
  },
  {
    number: 3,
    title: 'You review & approve',
    description:
      "We don't ship a single line without your sign-off. QA and Client Advocate gates are non-negotiable.",
  },
]

const pricing = [
  {
    tier: 'Discovery',
    price: 'from $500',
    priceUnit: '',
    description: 'Scoping session to define your requirements, scope, and a fixed-price delivery plan.',
    features: [
      'Requirements workshop',
      'Written scope summary',
      'Fixed-price estimate',
      'No commitment required',
    ],
    ctaLabel: 'Book a Call',
    ctaHref: '/contact',
    featured: false,
  },
  {
    tier: 'Project',
    price: 'from $5,000',
    priceUnit: '',
    description: 'Full project delivery with Agile sprints, TDD, and dual approval gate before shipping.',
    features: [
      'Full project delivery',
      'TDD + automated tests',
      'Docker + CI/CD setup',
      'Approval gate (QA + Advocate)',
      'Source code + docs',
    ],
    ctaLabel: 'Get Started',
    ctaHref: '/contact',
    featured: true,
  },
  {
    tier: 'Enterprise',
    price: 'Custom',
    priceUnit: '',
    description:
      'Retainer-based engagement with SLA guarantees, dedicated agents, and regular strategy calls.',
    features: [
      'Dedicated agent team',
      'SLA response guarantee',
      'Weekly progress calls',
      'Ongoing improvements',
      'Priority support',
    ],
    ctaLabel: 'Contact Us',
    ctaHref: '/contact',
    featured: false,
  },
]

const featuredProjects = projects.slice(0, 3)
const featuredTestimonials = testimonials.slice(0, 2)

export default function HomePage() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-white py-20 lg:py-28">
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 lg:px-12">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-7">
              <p className="text-sm font-semibold uppercase tracking-widest text-gold mb-4">
                ✦ AI-POWERED DEVELOPMENT AGENCY
              </p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-navy mb-6">
                We Build Your Software<br />
                With a Team of AI Agents.
              </h1>
              <p className="text-lg leading-relaxed text-text-secondary max-w-2xl mb-8">
                Describe what you need. Our autonomous AI team designs, codes, tests, and ships
                it — with human approval at every gate.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center px-10 py-4 text-base rounded-lg font-semibold bg-gold text-white hover:bg-gold-hover transition-colors duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
                >
                  Request a Demo
                </Link>
                <Link
                  href="/portfolio"
                  className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-navy hover:underline underline-offset-4 transition-colors focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2 rounded"
                >
                  View Our Work <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="hidden md:flex md:col-span-5 items-center justify-center">
              <Image
                src="/images/team-collaboration.jpg"
                alt="Team collaborating on software projects"
                width={480}
                height={360}
                className="w-full max-w-sm rounded-2xl shadow-xl object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Band ───────────────────────────────────────────────────── */}
      <section className="bg-navy py-12" aria-label="Key metrics">
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 lg:px-12">
          <dl className="flex flex-col sm:flex-row justify-center divide-y sm:divide-y-0 sm:divide-x divide-white/20">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center text-center px-8 py-4 sm:py-0"
              >
                <dd className="text-5xl font-bold text-white leading-none tracking-tight mb-2">
                  {stat.value}
                </dd>
                <dt className="text-sm text-blue-200 uppercase tracking-wider">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────────────────── */}
      <section className="bg-white py-24" id="services">
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 lg:px-12">
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest text-gold mb-4">
              ✦ WHAT WE BUILD
            </p>
            <h2 className="text-4xl font-bold text-navy mb-4">
              From idea to production — we handle it all
            </h2>
            <p className="text-lg text-text-secondary">
              Six specialisms, one autonomous team. Full-stack web, AI/ML, SaaS, DevOps, RAG
              chatbots, and custom agents.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="bg-white border border-border rounded-xl p-8 hover:shadow-lg hover:border-navy/20 transition-all duration-200 flex flex-col gap-4"
              >
                <div className="bg-navy/10 rounded-xl p-3.5 w-16 h-16 flex items-center justify-center">
                  <Icon className="w-8 h-8 text-navy" aria-hidden="true" />
                </div>
                <h3 className="text-2xl font-semibold text-navy">{title}</h3>
                <p className="text-sm text-text-secondary leading-normal">{description}</p>
                <Link
                  href="/services"
                  className="text-navy font-semibold hover:underline underline-offset-4 flex items-center gap-1 text-sm mt-auto focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2 rounded"
                >
                  Learn more <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="bg-bg-light py-24" id="how-it-works">
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 lg:px-12">
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest text-gold mb-4">
              ✦ THE PROCESS
            </p>
            <h2 className="text-4xl font-bold text-navy mb-4">Simple. Transparent. Fast.</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {steps.map((step, idx) => (
              <div key={step.number} className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-navy flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {step.number}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className="hidden lg:block flex-1 h-px bg-navy/20" aria-hidden="true" />
                  )}
                </div>
                <h3 className="text-2xl font-semibold text-navy">{step.title}</h3>
                <p className="text-text-secondary leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Team Photo Band ──────────────────────────────────────────────── */}
      <section className="bg-white py-24">
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 lg:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <Image
                src="/images/team-meeting.jpg"
                alt="Team meeting and planning together"
                width={600}
                height={400}
                className="w-full rounded-2xl shadow-xl object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-gold mb-4">
                ✦ HOW WE WORK
              </p>
              <h2 className="text-4xl font-bold text-navy mb-6">
                Human oversight at every step
              </h2>
              <p className="text-lg text-text-secondary leading-relaxed mb-6">
                Our AI agents design, build, and test — but you stay in control. Every sprint ends
                with a review, every deliverable passes a dual approval gate before it reaches you.
              </p>
              <p className="text-text-secondary leading-relaxed">
                Real collaboration, real accountability, real results. Not a black box — a
                transparent pipeline you can see and steer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Portfolio Preview ────────────────────────────────────────────── */}
      <section className="bg-white py-24">
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 lg:px-12">
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest text-gold mb-4">
              ✦ OUR WORK
            </p>
            <h2 className="text-4xl font-bold text-navy mb-4">
              Projects delivered by our AI team
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {featuredProjects.map((project) => (
              <Link
                key={project.slug}
                href={`/portfolio/${project.slug}`}
                className="bg-white border border-border rounded-xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex flex-col focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2"
              >
                <div className="relative aspect-video">
                  <Image
                    src={project.image}
                    alt={`${project.title} project thumbnail`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-6 flex flex-col gap-3 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gold">
                    {project.tier}
                  </p>
                  <h3 className="text-2xl font-semibold text-navy">{project.title}</h3>
                  <p className="text-sm text-text-secondary">{project.shortDescription}</p>
                  <div className="flex flex-wrap gap-2 mt-auto pt-2">
                    {project.techStack.slice(0, 3).map((tech) => (
                      <span
                        key={tech}
                        className="bg-bg-subtle text-navy text-xs font-medium px-3 py-1 rounded-full"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="text-center">
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-1 text-sm font-semibold text-navy hover:underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2 rounded"
            >
              View All Projects <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section className="bg-bg-light py-24" id="pricing">
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 lg:px-12">
          <div className="max-w-2xl mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest text-gold mb-4">
              ✦ PRICING
            </p>
            <h2 className="text-4xl font-bold text-navy mb-4">
              Transparent, fixed-price engagements
            </h2>
            <p className="text-lg text-text-secondary">
              No surprises. No hourly billing. Just results.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {pricing.map((plan) => (
              <div
                key={plan.tier}
                className={
                  plan.featured
                    ? 'bg-navy text-white rounded-xl p-8 flex flex-col gap-6 ring-4 ring-gold shadow-2xl lg:scale-105'
                    : 'bg-white border border-border rounded-xl p-8 flex flex-col gap-6'
                }
              >
                <div>
                  <h3
                    className={`text-lg font-semibold mb-1 ${
                      plan.featured ? 'text-gold' : 'text-text-secondary'
                    }`}
                  >
                    {plan.tier}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-5xl font-bold leading-none tracking-tight ${
                        plan.featured ? 'text-white' : 'text-navy'
                      }`}
                    >
                      {plan.price}
                    </span>
                    {plan.priceUnit && (
                      <span
                        className={`text-sm ${
                          plan.featured ? 'text-blue-200' : 'text-text-muted'
                        }`}
                      >
                        {plan.priceUnit}
                      </span>
                    )}
                  </div>
                </div>
                <p
                  className={`text-sm leading-relaxed ${
                    plan.featured ? 'text-blue-100' : 'text-text-secondary'
                  }`}
                >
                  {plan.description}
                </p>
                <ul className="flex flex-col gap-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm">
                      <CheckCircle
                        size={20}
                        className={`flex-shrink-0 ${
                          plan.featured ? 'text-gold' : 'text-success'
                        }`}
                        aria-hidden="true"
                      />
                      <span className={plan.featured ? 'text-blue-100' : 'text-text-secondary'}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.ctaHref}
                  className={
                    plan.featured
                      ? 'mt-auto border-2 border-white text-white px-8 py-3.5 text-sm rounded-lg font-semibold hover:bg-white hover:text-navy transition-colors duration-150 text-center focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-navy'
                      : 'mt-auto bg-gold text-white px-8 py-3.5 text-sm rounded-lg font-semibold hover:bg-gold-hover transition-colors duration-150 shadow-sm text-center focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2'
                  }
                >
                  {plan.ctaLabel}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      {featuredTestimonials.length > 0 && (
        <section className="bg-white py-24">
          <div className="max-w-[1280px] mx-auto px-6 md:px-8 lg:px-12">
            <div className="max-w-2xl mb-16">
              <p className="text-sm font-semibold uppercase tracking-widest text-gold mb-4">
                ✦ CLIENT FEEDBACK
              </p>
              <h2 className="text-4xl font-bold text-navy mb-4">What our clients say</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {featuredTestimonials.map((testimonial) => (
                <div
                  key={testimonial.name}
                  className="bg-bg-light border border-border rounded-xl p-8 flex flex-col gap-6"
                >
                  <p className="text-text-secondary italic text-base leading-relaxed flex-1">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>
                  <div className="flex gap-1" role="img" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-gold text-gold" aria-hidden="true" />
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full bg-navy flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                      aria-hidden="true"
                    >
                      {testimonial.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <p className="text-sm text-text-secondary">
                      <strong className="text-text-primary font-semibold">{testimonial.name}</strong>
                      {' · '}
                      {testimonial.role}
                      {' · '}
                      {testimonial.company}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA Band ─────────────────────────────────────────────────────── */}
      <section className="bg-navy py-20" id="contact">
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 lg:px-12 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to build something great?</h2>
          <p className="text-lg text-blue-200 mb-10">
            Tell us what you need — we&apos;ll handle the rest.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-10 py-4 text-base rounded-lg font-semibold bg-gold text-white hover:bg-gold-hover transition-colors duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2"
            >
              Request a Demo
            </Link>
            <a
              href="mailto:hello@gigforge.ai"
              className="inline-flex items-center justify-center gap-1 border-2 border-white text-white px-8 py-3.5 text-sm rounded-lg font-semibold hover:bg-white hover:text-navy transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-navy"
            >
              hello@gigforge.ai <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
