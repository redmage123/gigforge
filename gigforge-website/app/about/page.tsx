import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'About | GigForge',
  description: 'Learn about our engineering methodology, quality assurance process, and commitment to excellence.',
}

export default function About() {
  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold text-text-primary mb-4">About GigForge</h1>
      <p className="text-xl text-text-secondary mb-12 max-w-3xl">
        We're a professional freelance agency that delivers production-ready software, AI automation,
        video content, and marketing campaigns with military precision.
      </p>

      {/* Methodology */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-text-primary mb-6">Our Methodology</h2>
        <div data-testid="methodology-illustration" className="mb-8">
          <Image
            src="/images/methodology-tdd.svg"
            alt="TDD cycle diagram showing RED (write failing test), GREEN (make it pass), and REFACTOR (clean the code) stages"
            width={600}
            height={180}
            unoptimized
            className="w-full max-w-2xl"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-bg-secondary p-6 rounded-lg">
            <h3 className="text-xl font-bold text-text-primary mb-3">Agile/Scrum</h3>
            <p className="text-text-secondary">
              We work in sprints with clear backlogs, daily standups, and regular retrospectives to
              ensure continuous improvement and alignment with your goals.
            </p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg">
            <h3 className="text-xl font-bold text-text-primary mb-3">TDD (Test-Driven Development)</h3>
            <p className="text-text-secondary">
              Every feature starts with tests. RED → GREEN → REFACTOR ensures robust, maintainable code
              with comprehensive test coverage from day one.
            </p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg">
            <h3 className="text-xl font-bold text-text-primary mb-3">XP Pair Programming</h3>
            <p className="text-text-secondary">
              Project Managers and Engineers collaborate on every story, ensuring quality, knowledge
              sharing, and faster problem resolution.
            </p>
          </div>
        </div>
      </section>

      {/* Quality Gate */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-text-primary mb-6">Quality Assurance Process</h2>
        <div className="bg-bg-secondary p-8 rounded-lg">
          <p className="text-text-secondary mb-6 text-lg">
            No deliverable ships without passing our rigorous approval gate:
          </p>
          <div className="space-y-6">
            <div className="flex items-start">
              <div className="bg-accent text-text-primary rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">1</div>
              <div>
                <h4 className="text-text-primary font-semibold mb-1">Development Team</h4>
                <p className="text-text-secondary">Engineers build features using TDD, ensuring comprehensive test coverage.</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-accent text-text-primary rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">2</div>
              <div>
                <h4 className="text-text-primary font-semibold mb-1">Quality Reviewer</h4>
                <p className="text-text-secondary">Code review, architecture assessment, and technical standards verification.</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-accent text-text-primary rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">3</div>
              <div>
                <h4 className="text-text-primary font-semibold mb-1">Acceptance Tester</h4>
                <p className="text-text-secondary">Hands-on verification of every acceptance criterion, ensuring the feature works as specified.</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-accent text-text-primary rounded-full w-8 h-8 flex items-center justify-center font-bold mr-4 flex-shrink-0">4</div>
              <div>
                <h4 className="text-text-primary font-semibold mb-1">Client Advocate</h4>
                <p className="text-text-secondary">Customer-perspective review acting as the paying client, ensuring value delivery.</p>
              </div>
            </div>
          </div>
          <p className="text-text-secondary mt-6 italic">
            Both the Acceptance Tester and Client Advocate must approve before delivery to you.
          </p>
        </div>
      </section>

      {/* Practices */}
      <section className="mb-16">
        <h2 className="text-3xl font-bold text-text-primary mb-6">Our Practices</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-bg-secondary p-6 rounded-lg">
            <h3 className="text-xl font-bold text-text-primary mb-3">Programming & AI</h3>
            <p className="text-text-secondary">
              Full-stack development, REST APIs, microservices, database design, and DevOps automation
              with modern tech stacks and best practices.
            </p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg">
            <h3 className="text-xl font-bold text-text-primary mb-3">AI & Automation</h3>
            <p className="text-text-secondary">
              RAG systems, chatbots, workflow automation, and intelligent document processing leveraging
              the latest AI technologies.
            </p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg">
            <h3 className="text-xl font-bold text-text-primary mb-3">Video Production</h3>
            <p className="text-text-secondary">
              Professional video creation from concept to final cut, including scripting, editing,
              motion graphics, and AI-enhanced production.
            </p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg">
            <h3 className="text-xl font-bold text-text-primary mb-3">Marketing & SEO</h3>
            <p className="text-text-secondary">
              Data-driven content strategy, SEO optimization, persuasive copywriting, and multi-channel
              marketing campaigns that convert.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="text-center pt-8 border-t border-bg-secondary">
        <h3 className="text-2xl font-bold text-text-primary mb-4">Let's work together</h3>
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
