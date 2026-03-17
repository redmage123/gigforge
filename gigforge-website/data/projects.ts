export interface Project {
  slug: string
  title: string
  shortDescription: string
  overview: string
  techStack: string[]
  testCount: number
  sprintCount: number
  tier: string
  budget: string
  platform: string
  highlights: string[]
  image: string
}

export const projects: Project[] = [
  {
    slug: "cryptoadvisor-dashboard",
    title: "CryptoAdvisor Dashboard",
    shortDescription: "AI-powered cryptocurrency analytics with multi-chain blockchain access and real-time market data.",
    overview: "A comprehensive cryptocurrency analytics platform that connects to 7 blockchain networks (ETH, SOL, BTC, Polygon, Arbitrum, Optimism, Base) for real-time on-chain data. Features AI-driven technical analysis, portfolio tracking with P&L calculations, and 5 integrated visualization libraries for market charts, heatmaps, and correlation matrices. Built with FastAPI for high-throughput WebSocket streaming and React for a responsive trading dashboard.",
    techStack: ["Python", "FastAPI", "React", "web3.py", "PostgreSQL", "Redis", "Docker"],
    testCount: 84,
    sprintCount: 4,
    tier: "XL",
    budget: "$4,500",
    platform: "Client",
    highlights: [
      "Multi-chain blockchain access (ETH, SOL, BTC + 4 EVM chains)",
      "Real-time market data via WebSocket streaming",
      "AI-powered technical analysis with pattern recognition",
      "Portfolio tracking with historical P&L calculations",
      "5 visualization libraries: candlestick, heatmap, correlation, depth, volume"
    ],
    image: "/images/project-cryptoadvisor.svg",
  },
  {
    slug: "bacswn-skywatch",
    title: "BACSWN SkyWatch",
    shortDescription: "AI-enhanced bird conservation monitoring with computer vision species identification.",
    overview: "Built for the British Association for Conservation and Wildlife Networks, SkyWatch uses computer vision models to identify bird species from camera trap footage and audio recordings. The system processes real-time feeds from field stations, classifies species with 94% accuracy, monitors habitat health indicators, and triggers conservation alerts when endangered species are detected or population thresholds drop below critical levels.",
    techStack: ["Python", "TensorFlow", "FastAPI", "PostgreSQL", "Redis", "Docker"],
    testCount: 52,
    sprintCount: 3,
    tier: "L",
    budget: "$3,200",
    platform: "Client",
    highlights: [
      "Computer vision species identification (94% accuracy)",
      "Real-time camera trap and audio feed processing",
      "Habitat health monitoring with trend analysis",
      "Automated conservation alerts for endangered species",
      "Interactive map dashboard with sighting heatmaps"
    ],
    image: "/images/project-skywatch.svg",
  },
  {
    slug: "enterprise-crm",
    title: "Enterprise CRM Platform",
    shortDescription: "Full-featured customer relationship management with deal pipeline, analytics, and API webhooks.",
    overview: "A production-grade CRM system built for mid-market B2B companies. Features contact and company management with custom fields, a visual deal pipeline with drag-and-drop stage progression, an analytics dashboard with revenue forecasting, and a webhook system for real-time event notifications to external services. Role-based access control supports sales reps, managers, and admin tiers with granular permissions.",
    techStack: ["Python", "FastAPI", "PostgreSQL", "React", "Redis", "Docker"],
    testCount: 73,
    sprintCount: 4,
    tier: "XL",
    budget: "$5,000",
    platform: "Client",
    highlights: [
      "Contact and company management with custom fields",
      "Visual deal pipeline with drag-and-drop progression",
      "Analytics dashboard with revenue forecasting",
      "API webhooks for real-time event notifications",
      "Role-based access control (sales rep, manager, admin)"
    ],
    image: "/images/project-crm.svg",
  },
  {
    slug: "todo-rest-api",
    title: "Todo REST API",
    shortDescription: "Production-ready JWT auth + CRUD with 29 automated tests.",
    overview: "A fully tested REST API with JWT authentication, bcrypt password hashing, and strict user ownership enforcement. Deployed via Docker Compose.",
    techStack: ["Node.js", "TypeScript", "Express", "PostgreSQL", "Docker"],
    testCount: 29,
    sprintCount: 1,
    tier: "M",
    budget: "$300",
    platform: "Fiverr",
    highlights: ["29 automated tests, 100% passing", "JWT auth with token blacklisting", "Privacy-preserving 404 ownership guards", "Multi-stage Docker build"],
    image: "/images/project-todo-api.jpg",
  },
  {
    slug: "saas-billing-api",
    title: "SaaS Billing Microservice",
    shortDescription: "Full subscription lifecycle with Stripe webhooks and 46 tests.",
    overview: "A billing backend covering user registration, organization management, plan selection, usage metering, invoice generation, and Stripe webhook verification.",
    techStack: ["Node.js", "TypeScript", "Express 5", "PostgreSQL", "Stripe", "Docker"],
    testCount: 46,
    sprintCount: 2,
    tier: "L",
    budget: "Internal",
    platform: "Internal",
    highlights: ["46 tests across 7 suites", "Stripe HMAC webhook verification", "Usage-based overage billing", "Multi-tenant data isolation"],
    image: "/images/project-saas-billing.jpg",
  },
  {
    slug: "ai-chat-widget",
    title: "AI Chat Widget (RAG)",
    shortDescription: "Embeddable AI chat powered by pgvector semantic search — 37 tests.",
    overview: "Document ingestion pipeline, vector embeddings, cosine similarity search, and an embeddable vanilla JS widget. Runs without API keys via mock services.",
    techStack: ["Node.js", "TypeScript", "Express 5", "PostgreSQL", "pgvector", "OpenAI"],
    testCount: 37,
    sprintCount: 2,
    tier: "L",
    budget: "Internal",
    platform: "Internal",
    highlights: ["37 tests, 0 failures", "pgvector cosine similarity search", "~5KB vanilla JS widget", "Mock-first: runs without API keys"],
    image: "/images/project-ai-chat.jpg",
  },
  {
    slug: "job-board",
    title: "Job Board (Full Stack)",
    shortDescription: "React 19 + Express + PostgreSQL full-text search with 36 API tests.",
    overview: "Multi-role RBAC (applicants, employers, admins), PostgreSQL tsvector full-text search with GIN index, and a React 19 frontend with auth context.",
    techStack: ["React 19", "TypeScript", "Express 5", "PostgreSQL", "Docker"],
    testCount: 36,
    sprintCount: 3,
    tier: "L",
    budget: "Internal",
    platform: "Internal",
    highlights: ["36 API tests, 0 failures", "3 user roles with RBAC", "PostgreSQL tsvector full-text search", "3-service Docker Compose"],
    image: "/images/project-job-board.jpg",
  },
  {
    slug: "devops-starter-kit",
    title: "DevOps Starter Kit",
    shortDescription: "Reusable CI/CD toolkit: Docker, GitHub Actions, Prometheus + Grafana — 61 tests.",
    overview: "Production-ready DevOps toolkit with multi-stage Docker, 3 GitHub Actions workflows, Prometheus metrics, Grafana dashboards, and one-command deploy scripts.",
    techStack: ["TypeScript", "Express", "Docker", "GitHub Actions", "Prometheus", "Grafana"],
    testCount: 61,
    sprintCount: 2,
    tier: "L",
    budget: "Internal",
    platform: "Internal",
    highlights: ["61 tests across 7 suites", "Zero-dependency Prometheus metrics", "Composable security middleware", "Deploy to Railway, Fly.io, or VPS"],
    image: "/images/project-devops-kit.jpg",
  },
]
