import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const posts: Record<string, { title: string; date: string; category: string; content: string }> = {
  'why-we-build-ai-agents-not-just-ai-features': {
    title: 'Why We Build AI Agents, Not Just AI Features',
    date: 'March 15, 2026',
    category: 'Engineering',
    content: `There is a fundamental difference between adding an AI feature to an existing product and building an AI agent that operates autonomously.

A feature is a button that generates text. An agent is a system that understands context, makes decisions, and takes action across multiple tools and data sources.

At GigForge, every project we deliver is built with the agent mindset. When a client asks for a chatbot, we don't build a wrapper around an LLM. We build a system that connects to their CRM, understands their product catalog, checks inventory in real time, and handles the full conversation lifecycle — including escalation to humans when needed.

The difference in outcomes is dramatic. Feature-based AI handles maybe 30% of customer queries. Agent-based AI handles 85% and actually resolves them.

The architecture matters too. Features are stateless — each call to the LLM starts fresh. Agents maintain context through session management, knowledge graphs, and RAG pipelines. They remember what the customer said three emails ago. They know which product the customer bought last quarter.

If you're evaluating AI development partners, ask them this: does your system just generate text, or does it actually do things? That's the difference between a feature and an agent.`,
  },
  'our-stack-in-2026-fastapi-react': {
    title: 'Our Stack in 2026: FastAPI, React, and Why We Ditched Django',
    date: 'March 10, 2026',
    category: 'Engineering',
    content: `Every agency has opinions about their tech stack. Ours is FastAPI on the backend, React on the frontend, PostgreSQL for persistence, and Docker Compose for orchestration.

We moved away from Django two years ago and haven't looked back. The reason is simple: FastAPI gives us async out of the box, automatic OpenAPI documentation, and type safety with Pydantic. For the AI-heavy workloads our clients need, the async performance alone justified the switch.

Django REST Framework is solid, but when you're making 50 concurrent LLM calls per request, synchronous frameworks become a bottleneck. We benchmarked the same workload on both — FastAPI handled 3x the throughput with half the latency.

Our frontend is React with Next.js for SSR where SEO matters, plain Vite builds where it doesn't. We keep it boring on purpose. Boring tech ships faster and breaks less.

PostgreSQL handles everything from user data to vector embeddings (via pgvector). We tried dedicated vector databases and kept coming back to Postgres. One fewer service to manage, and the query performance is more than adequate for our scale.

Docker Compose ties it all together. Every project ships with a docker-compose.yml that spins up the entire stack in one command. No "works on my machine" issues, no environment drift.

The lesson we've learned: pick mature tools, understand them deeply, and resist the urge to chase every new framework. Your clients don't care what you built it with — they care that it works.`,
  },
  'how-we-delivered-a-multi-chain-crypto-dashboard': {
    title: 'How We Delivered a Multi-Chain Crypto Dashboard in 4 Sprints',
    date: 'March 5, 2026',
    category: 'Case Study',
    content: `When a client needed a cryptocurrency analytics platform that could query seven different blockchains in real time, we knew the architecture had to be right from day one.

The CryptoAdvisor project was delivered in four two-week sprints.

Sprint 1 focused on the data layer. We built blockchain RPC connections to Ethereum, Solana, Bitcoin, and four EVM-compatible chains (Polygon, Arbitrum, Optimism, Avalanche). The key challenge was rate limiting — each chain has different API limits and latency characteristics. We built a caching layer with Redis that reduced RPC calls by 80%.

Sprint 2 built the analytics engine. Technical indicators (RSI, MACD, Bollinger Bands), portfolio tracking across all seven chains, and risk metrics. The tricky part was normalizing data across chains — token standards, decimal precision, and timestamp formats all differ.

Sprint 3 was the React frontend. Five different visualization libraries: lightweight-charts for candlesticks, recharts for portfolio breakdowns, and custom D3 components for the cross-chain flow visualizations. The dashboard updates in real time via WebSocket feeds.

Sprint 4 was hardening. Load testing revealed a memory leak in our WebSocket handler — fixed it, added circuit breakers for each chain connection, and wrote comprehensive error handling. The project shipped with 84 passing tests covering both unit and integration scenarios.

Total delivery time: 8 weeks. The client went from concept to production-ready dashboard in two months.`,
  },
}

export function generateStaticParams() {
  return Object.keys(posts).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = posts[slug]
  if (!post) return {}
  const excerpt = post.content.split('\n\n')[0].slice(0, 160)
  return {
    title: `${post.title} | GigForge`,
    description: excerpt,
    openGraph: {
      title: post.title,
      description: excerpt,
      url: `https://gigforge.ai/blog/${slug}`,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: excerpt,
    },
  }
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = posts[slug]
  if (!post) notFound()

  return (
    <div className="min-h-screen bg-bg-primary">
      <article className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-xs font-semibold text-accent bg-accent/10 px-2.5 py-1 rounded-full">
              {post.category}
            </span>
            <span className="text-text-secondary text-sm">{post.date}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-8">
            {post.title}
          </h1>
          <div className="prose prose-invert max-w-none">
            {post.content.split('\n\n').map((paragraph, i) => (
              <p key={i} className="text-text-secondary leading-relaxed mb-4">
                {paragraph}
              </p>
            ))}
          </div>
          <div className="mt-12 pt-8 border-t border-bg-secondary">
            <Link href="/blog" className="text-accent font-semibold hover:underline">
              Back to blog
            </Link>
          </div>
        </div>
      </article>
    </div>
  )
}
