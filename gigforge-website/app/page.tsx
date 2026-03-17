import Link from 'next/link'
import Image from 'next/image'
import { Code2, Bot, Video, TrendingUp, CreditCard, Bitcoin, Repeat } from 'lucide-react'
import { projects } from '@/data/projects'
import { testimonials } from '@/data/testimonials'
import ProjectCard from '@/components/ProjectCard'
import TestimonialCard from '@/components/TestimonialCard'

export default function Home() {
  const featuredProjects = projects.slice(0, 3)

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      {/* Hero Section */}
      <section className="py-20 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-5xl font-bold text-text-primary mb-6">
            Your AI-powered freelance agency.
          </h1>
          <p className="text-xl text-text-secondary mb-8 max-w-2xl">
            Expert software development, AI automation, video production, and marketing services
            delivered with military precision through TDD and Agile methodology.
          </p>
          <div className="flex gap-4">
            <Link
              href="/portfolio"
              className="bg-accent text-text-primary px-8 py-3 rounded-lg hover:bg-blue-600 transition-colors font-semibold"
            >
              View Portfolio
            </Link>
            <Link
              href="/contact"
              className="border border-accent text-accent px-8 py-3 rounded-lg hover:bg-accent hover:text-text-primary transition-colors font-semibold"
            >
              Get in Touch
            </Link>
          </div>
        </div>
        <div data-testid="hero-illustration" className="flex justify-center">
          <Image
            src="/images/hero-tech-illustration.svg"
            alt="Technology and code illustration showing a developer workspace with syntax-highlighted code"
            width={600}
            height={400}
            priority
            unoptimized
            className="w-full max-w-lg rounded-lg"
          />
        </div>
      </section>

      {/* Featured Projects */}
      <section className="py-16">
        <h2 className="text-3xl font-bold text-text-primary mb-8">Featured Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredProjects.map((project) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </div>
      </section>

      {/* Services Overview */}
      <section data-testid="services-section" className="py-16">
        <h2 className="text-3xl font-bold text-text-primary mb-8 text-center">Our Services</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-bg-secondary p-6 rounded-lg">
            <Code2 className="w-8 h-8 text-accent mb-4" aria-hidden="true" />
            <h3 className="text-xl font-bold text-text-primary mb-3">Programming & AI</h3>
            <p className="text-text-secondary">
              Full-stack development, REST APIs, microservices, and AI-powered automation solutions.
            </p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg">
            <Bot className="w-8 h-8 text-accent mb-4" aria-hidden="true" />
            <h3 className="text-xl font-bold text-text-primary mb-3">AI & Automation</h3>
            <p className="text-text-secondary">
              RAG systems, chatbots, workflow automation, and intelligent document processing.
            </p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg">
            <Video className="w-8 h-8 text-accent mb-4" aria-hidden="true" />
            <h3 className="text-xl font-bold text-text-primary mb-3">Video Production</h3>
            <p className="text-text-secondary">
              Scripting, editing, motion graphics, and AI-enhanced video content creation.
            </p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg">
            <TrendingUp className="w-8 h-8 text-accent mb-4" aria-hidden="true" />
            <h3 className="text-xl font-bold text-text-primary mb-3">Marketing & SEO</h3>
            <p className="text-text-secondary">
              Content strategy, SEO optimization, copywriting, and multi-channel campaigns.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section data-testid="testimonials-section" className="py-16">
        <h2 className="text-3xl font-bold text-text-primary mb-8 text-center">
          What Our Clients Say
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {testimonials.map((t) => (
            <TestimonialCard key={t.name} testimonial={t} />
          ))}
        </div>
      </section>

      {/* Pricing & Payment Methods */}
      <section data-testid="pricing-section" className="py-16">
        <h2 className="text-3xl font-bold text-text-primary mb-4 text-center">Pricing</h2>
        <p className="text-text-secondary text-center mb-10">
          Transparent, fixed-price engagements. No surprises.
        </p>

        {/* Service tiers */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {/* One-time */}
          <div className="bg-bg-secondary p-6 rounded-lg border border-bg-tertiary flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent mb-3">One-time</span>
            <h3 className="text-xl font-bold text-text-primary mb-2">AI Consultation</h3>
            <p className="text-text-secondary text-sm mb-4 flex-1">
              60-minute expert session covering AI strategy, architecture, tooling selection, and a written action plan.
            </p>
            <div className="text-3xl font-bold text-text-primary mb-4">€100</div>
            <Link href="/payments" className="bg-accent text-text-primary px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-center font-semibold">
              Book Now
            </Link>
          </div>

          <div className="bg-bg-secondary p-6 rounded-lg border border-accent flex flex-col relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-text-primary text-xs font-bold px-3 py-1 rounded-full">POPULAR</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-accent mb-3">One-time</span>
            <h3 className="text-xl font-bold text-text-primary mb-2">MVP Build</h3>
            <p className="text-text-secondary text-sm mb-4 flex-1">
              Full MVP delivered in 2–4 weeks. Includes design, full-stack development, tests, Docker deployment, and handover docs.
            </p>
            <div className="text-3xl font-bold text-text-primary mb-4">€2,500</div>
            <Link href="/payments" className="bg-accent text-text-primary px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-center font-semibold">
              Get Started
            </Link>
          </div>

          {/* Retainers */}
          <div className="bg-bg-secondary p-6 rounded-lg border border-bg-tertiary flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent mb-3">Retainer</span>
            <h3 className="text-xl font-bold text-text-primary mb-2">Basic Retainer</h3>
            <p className="text-text-secondary text-sm mb-4 flex-1">
              Up to 10 hrs/mo of ongoing development, bug fixes, and feature work. Rolling monthly commitment.
            </p>
            <div className="text-3xl font-bold text-text-primary mb-4">€500<span className="text-base text-text-secondary font-normal">/mo</span></div>
            <Link href="/payments" className="bg-accent text-text-primary px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-center font-semibold">
              Subscribe
            </Link>
          </div>

          <div className="bg-bg-secondary p-6 rounded-lg border border-bg-tertiary flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent mb-3">Retainer</span>
            <h3 className="text-xl font-bold text-text-primary mb-2">Standard Retainer</h3>
            <p className="text-text-secondary text-sm mb-4 flex-1">
              Up to 25 hrs/mo. Includes sprint planning, priority support, and a dedicated Slack channel.
            </p>
            <div className="text-3xl font-bold text-text-primary mb-4">€1,000<span className="text-base text-text-secondary font-normal">/mo</span></div>
            <Link href="/payments" className="bg-accent text-text-primary px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-center font-semibold">
              Subscribe
            </Link>
          </div>

          <div className="bg-bg-secondary p-6 rounded-lg border border-bg-tertiary flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent mb-3">Retainer</span>
            <h3 className="text-xl font-bold text-text-primary mb-2">Premium Retainer</h3>
            <p className="text-text-secondary text-sm mb-4 flex-1">
              Unlimited scope within 60 hrs/mo. Full AI team access, weekly calls, and SLA-backed delivery.
            </p>
            <div className="text-3xl font-bold text-text-primary mb-4">€2,000<span className="text-base text-text-secondary font-normal">/mo</span></div>
            <Link href="/payments" className="bg-accent text-text-primary px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-center font-semibold">
              Subscribe
            </Link>
          </div>
        </div>

        {/* Payment methods */}
        <div className="bg-bg-secondary rounded-lg p-6 border border-bg-tertiary">
          <h3 className="text-lg font-bold text-text-primary mb-4 text-center">We Accept</h3>
          <div className="flex flex-wrap justify-center gap-4">
            <span className="flex items-center gap-2 bg-bg-tertiary px-4 py-2 rounded-lg text-text-secondary text-sm">
              <CreditCard className="w-4 h-4 text-accent" />
              Credit / Debit Card
            </span>
            <span className="flex items-center gap-2 bg-bg-tertiary px-4 py-2 rounded-lg text-text-secondary text-sm">
              <Bitcoin className="w-4 h-4 text-accent" />
              BTC (Lightning)
            </span>
            <span className="flex items-center gap-2 bg-bg-tertiary px-4 py-2 rounded-lg text-text-secondary text-sm">
              <Repeat className="w-4 h-4 text-accent" />
              ETH
            </span>
            <span className="flex items-center gap-2 bg-bg-tertiary px-4 py-2 rounded-lg text-text-secondary text-sm">
              <Repeat className="w-4 h-4 text-accent" />
              SOL
            </span>
            <span className="flex items-center gap-2 bg-bg-tertiary px-4 py-2 rounded-lg text-text-secondary text-sm">
              <Repeat className="w-4 h-4 text-accent" />
              XMR
            </span>
            <span className="flex items-center gap-2 bg-bg-tertiary px-4 py-2 rounded-lg text-text-secondary text-sm">
              <Repeat className="w-4 h-4 text-accent" />
              ADA
            </span>
            <span className="flex items-center gap-2 bg-bg-tertiary px-4 py-2 rounded-lg text-text-secondary text-sm">
              <Repeat className="w-4 h-4 text-accent" />
              DOGE
            </span>
          </div>
          <div className="text-center mt-4">
            <Link href="/payments" className="text-accent hover:text-blue-400 text-sm transition-colors">
              View payment details &amp; wallet addresses →
            </Link>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section data-testid="cta-section" className="py-16 text-center">
        <h2 className="text-3xl font-bold text-text-primary mb-4">Ready to get started?</h2>
        <p className="text-text-secondary mb-8">
          Let&apos;s discuss your project and how we can help bring it to life.
        </p>
        <Link
          href="/contact"
          className="inline-block bg-accent text-text-primary px-8 py-3 rounded-lg hover:bg-blue-600 transition-colors font-semibold"
        >
          Contact Us
        </Link>
      </section>
    </div>
  )
}
