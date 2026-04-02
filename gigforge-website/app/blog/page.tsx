import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Blog | GigForge',
  description: 'Technical deep-dives, project retrospectives, and insights from the GigForge AI development team.',
  openGraph: {
    title: 'GigForge Engineering Blog',
    description: 'Technical deep-dives, project retrospectives, and insights from the GigForge AI development team.',
    url: 'https://gigforge.ai/blog',
  },
}

const posts = [
  {
    slug: 'why-we-build-ai-agents-not-just-ai-features',
    title: 'Why We Build AI Agents, Not Just AI Features',
    date: 'March 15, 2026',
    excerpt: 'The difference between AI features and AI agents — and why it matters for your product.',
    category: 'Engineering',
  },
  {
    slug: 'our-stack-in-2026-fastapi-react',
    title: 'Our Stack in 2026: FastAPI, React, and Why We Ditched Django',
    date: 'March 10, 2026',
    excerpt: 'FastAPI, React, PostgreSQL, Docker — our tech stack choices and the reasoning behind them.',
    category: 'Engineering',
  },
  {
    slug: 'how-we-delivered-a-multi-chain-crypto-dashboard',
    title: 'How We Delivered a Multi-Chain Crypto Dashboard in 4 Sprints',
    date: 'March 5, 2026',
    excerpt: 'A behind-the-scenes look at how we built the CryptoAdvisor Dashboard across seven blockchains.',
    category: 'Case Study',
  },
]

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-accent text-sm font-semibold uppercase tracking-widest mb-3">Blog</p>
          <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4">
            GigForge Engineering Blog
          </h1>
          <p className="text-text-secondary text-lg mb-16 max-w-2xl">
            Technical deep-dives, project retrospectives, and insights from our AI development team.
          </p>

          <div className="space-y-8">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block group"
              >
                <article className="border border-bg-secondary rounded-xl p-8 hover:border-accent/40 transition-all duration-200">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-semibold text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                      {post.category}
                    </span>
                    <span className="text-text-secondary text-sm">{post.date}</span>
                  </div>
                  <h2 className="text-xl font-bold text-text-primary group-hover:text-accent transition-colors mb-2">
                    {post.title}
                  </h2>
                  <p className="text-text-secondary leading-relaxed">
                    {post.excerpt}
                  </p>
                  <span className="inline-block mt-4 text-accent text-sm font-semibold group-hover:underline">
                    Read more →
                  </span>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
