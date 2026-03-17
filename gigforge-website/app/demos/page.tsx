import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Live Demos | GigForge',
  description: 'Interactive demos of GigForge portfolio projects — try them without signing up.',
}

const demos = [
  {
    slug: 'todo-rest-api',
    title: 'Todo REST API',
    description: 'JWT auth, CRUD operations, and ownership guards — all live in the browser.',
    tags: ['Node.js', 'Express', 'PostgreSQL', 'JWT'],
    color: 'from-blue-600/20 to-blue-900/10',
    icon: '🔐',
  },
  {
    slug: 'saas-billing-api',
    title: 'SaaS Billing Microservice',
    description: 'Pick a plan, simulate a Stripe checkout, and watch webhook events fire.',
    tags: ['Stripe', 'Subscriptions', 'Webhooks', 'Multi-tenant'],
    color: 'from-violet-600/20 to-violet-900/10',
    icon: '💳',
  },
  {
    slug: 'ai-chat-widget',
    title: 'AI Chat Widget (RAG)',
    description: 'Ask questions over a knowledge base — watch the vector search happen in real time.',
    tags: ['pgvector', 'RAG', 'OpenAI', 'Embeddings'],
    color: 'from-emerald-600/20 to-emerald-900/10',
    icon: '🤖',
  },
  {
    slug: 'job-board',
    title: 'Job Board (Full Stack)',
    description: 'Switch between applicant, employer, and admin roles — RBAC enforced throughout.',
    tags: ['React 19', 'Full-text search', 'RBAC', 'PostgreSQL'],
    color: 'from-orange-600/20 to-orange-900/10',
    icon: '📋',
  },
  {
    slug: 'devops-starter-kit',
    title: 'DevOps Starter Kit',
    description: 'Watch a CI pipeline run, live metrics update, and a Docker build progress.',
    tags: ['GitHub Actions', 'Prometheus', 'Grafana', 'Docker'],
    color: 'from-rose-600/20 to-rose-900/10',
    icon: '⚙️',
  },
]

export default function DemosPage() {
  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-text-primary mb-4">Live Demos</h1>
        <p className="text-xl text-text-secondary max-w-2xl mx-auto">
          Interactive walkthroughs of our portfolio projects. No sign-up required — just click and explore.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {demos.map((demo) => (
          <Link
            key={demo.slug}
            href={`/demos/${demo.slug}`}
            className="group block bg-bg-secondary rounded-xl p-6 border border-transparent hover:border-accent transition-all duration-200"
          >
            <div className={`bg-gradient-to-br ${demo.color} rounded-lg p-6 mb-4 text-4xl flex items-center justify-center h-24`}>
              {demo.icon}
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2 group-hover:text-accent transition-colors">
              {demo.title}
            </h2>
            <p className="text-text-secondary text-sm mb-4 leading-relaxed">{demo.description}</p>
            <div className="flex flex-wrap gap-2">
              {demo.tags.map((tag) => (
                <span key={tag} className="text-xs bg-bg-primary text-text-muted px-2 py-1 rounded">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-4 text-accent text-sm font-medium group-hover:underline">
              Try demo →
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-16 text-center">
        <p className="text-text-secondary mb-4">Want a custom project built to the same standard?</p>
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
