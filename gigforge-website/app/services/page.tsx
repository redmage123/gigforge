import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Services | GigForge',
  description: 'Professional software development, AI automation, video production, and marketing services with transparent pricing.',
}

export default function Services() {
  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold text-text-primary mb-4">Services</h1>
      <p className="text-xl text-text-secondary mb-12 max-w-3xl">
        We offer four core practices, each with transparent pricing tiers to match your project scope and budget.
      </p>

      {/* Programming & AI */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-text-primary mb-4">Programming & AI</h2>
        <p className="text-text-secondary mb-6">
          Full-stack development, REST APIs, microservices, database design, and DevOps automation.
        </p>
        <div className="bg-bg-secondary rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-bg-primary">
                <th className="text-left p-4 text-text-primary">Tier</th>
                <th className="text-left p-4 text-text-primary">Price Range</th>
                <th className="text-left p-4 text-text-primary">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-bg-primary">
                <td className="p-4 text-text-primary font-semibold">Basic</td>
                <td className="p-4 text-accent">$75-150</td>
                <td className="p-4 text-text-secondary">Simple scripts, utilities, basic CRUD</td>
              </tr>
              <tr className="border-b border-bg-primary">
                <td className="p-4 text-text-primary font-semibold">Standard</td>
                <td className="p-4 text-accent">$150-400</td>
                <td className="p-4 text-text-secondary">APIs, integrations, moderate complexity</td>
              </tr>
              <tr>
                <td className="p-4 text-text-primary font-semibold">Premium</td>
                <td className="p-4 text-accent">$400-2,000</td>
                <td className="p-4 text-text-secondary">Full-stack apps, microservices, complex systems</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* AI & Automation */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-text-primary mb-4">AI & Automation</h2>
        <p className="text-text-secondary mb-6">
          RAG systems, chatbots, workflow automation, and intelligent document processing.
        </p>
        <div className="bg-bg-secondary rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-bg-primary">
                <th className="text-left p-4 text-text-primary">Tier</th>
                <th className="text-left p-4 text-text-primary">Price Range</th>
                <th className="text-left p-4 text-text-primary">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-bg-primary">
                <td className="p-4 text-text-primary font-semibold">Basic</td>
                <td className="p-4 text-accent">$100-250</td>
                <td className="p-4 text-text-secondary">Simple automations, basic AI integration</td>
              </tr>
              <tr className="border-b border-bg-primary">
                <td className="p-4 text-text-primary font-semibold">Standard</td>
                <td className="p-4 text-accent">$250-600</td>
                <td className="p-4 text-text-secondary">Chatbots, RAG systems, workflow automation</td>
              </tr>
              <tr>
                <td className="p-4 text-text-primary font-semibold">Premium</td>
                <td className="p-4 text-accent">$600-3,000</td>
                <td className="p-4 text-text-secondary">Custom AI solutions, complex integrations</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Video Production */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-text-primary mb-4">Video Production</h2>
        <p className="text-text-secondary mb-6">
          Scripting, editing, motion graphics, and AI-enhanced video content creation.
        </p>
        <div className="bg-bg-secondary rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-bg-primary">
                <th className="text-left p-4 text-text-primary">Tier</th>
                <th className="text-left p-4 text-text-primary">Price Range</th>
                <th className="text-left p-4 text-text-primary">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-bg-primary">
                <td className="p-4 text-text-primary font-semibold">Basic</td>
                <td className="p-4 text-accent">$100-200</td>
                <td className="p-4 text-text-secondary">Simple edits, basic production</td>
              </tr>
              <tr className="border-b border-bg-primary">
                <td className="p-4 text-text-primary font-semibold">Standard</td>
                <td className="p-4 text-accent">$200-500</td>
                <td className="p-4 text-text-secondary">Scripting, professional editing</td>
              </tr>
              <tr>
                <td className="p-4 text-text-primary font-semibold">Premium</td>
                <td className="p-4 text-accent">$500-1,500</td>
                <td className="p-4 text-text-secondary">Motion graphics, advanced production</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Marketing & SEO */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-text-primary mb-4">Marketing & SEO</h2>
        <p className="text-text-secondary mb-6">
          Content strategy, SEO optimization, copywriting, and multi-channel campaigns.
        </p>
        <div className="bg-bg-secondary rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-bg-primary">
                <th className="text-left p-4 text-text-primary">Tier</th>
                <th className="text-left p-4 text-text-primary">Price Range</th>
                <th className="text-left p-4 text-text-primary">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-bg-primary">
                <td className="p-4 text-text-primary font-semibold">Basic</td>
                <td className="p-4 text-accent">$75-150</td>
                <td className="p-4 text-text-secondary">Blog posts, basic copywriting</td>
              </tr>
              <tr className="border-b border-bg-primary">
                <td className="p-4 text-text-primary font-semibold">Standard</td>
                <td className="p-4 text-accent">$150-400</td>
                <td className="p-4 text-text-secondary">SEO audits, content strategy</td>
              </tr>
              <tr className="border-b border-bg-primary">
                <td className="p-4 text-text-primary font-semibold">Premium</td>
                <td className="p-4 text-accent">$400-1,500</td>
                <td className="p-4 text-text-secondary">Full campaigns, advanced SEO</td>
              </tr>
              <tr>
                <td className="p-4 text-text-primary font-semibold">Retainer</td>
                <td className="p-4 text-accent">$500-3,000/mo</td>
                <td className="p-4 text-text-secondary">Ongoing marketing support</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <div className="text-center pt-8 border-t border-bg-secondary">
        <h3 className="text-2xl font-bold text-text-primary mb-4">Ready to start your project?</h3>
        <Link
          href="/contact"
          className="inline-block bg-accent text-text-primary px-8 py-3 rounded-lg hover:bg-blue-600 transition-colors font-semibold"
        >
          Get in Touch
        </Link>
      </div>
    </div>
  )
}
