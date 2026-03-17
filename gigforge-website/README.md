# GigForge Website

Production-ready freelance agency website built with Next.js 15, TypeScript, and Tailwind CSS 4, following strict TDD methodology.

## Features

- **Next.js 15** with App Router and React 19
- **TypeScript** with strict mode
- **Tailwind CSS 4** with custom design tokens
- **Comprehensive test coverage** (70 tests) using Vitest and Testing Library
- **SEO-optimized** with Next.js metadata API
- **Accessible** with semantic HTML and ARIA labels
- **Responsive design** with mobile-first approach
- **Contact form** with client and server-side validation
- **Docker support** with multi-stage build

## Prerequisites

- Node.js 20+
- npm 10+
- Docker (optional, for containerized deployment)

## Setup

1. Clone the repository:
```bash
cd ~/ai-elevate/gigforge/projects/gigforge-website
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing

Run the test suite:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

Run tests with UI:
```bash
npm run test:ui
```

## Building

Build the production bundle:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## Email Configuration (Contact Form)

The contact form sends emails via [Resend](https://resend.com). Copy `.env.example` and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Your Resend API key (get one free at resend.com) |
| `CONTACT_EMAIL` | Email address to receive contact form submissions |

If `RESEND_API_KEY` is not set, the form still works — it returns a success response without sending an email (useful for development).

## Docker Deployment

### Using Docker Compose (recommended)

```bash
docker-compose up --build
```

The site will be available at http://localhost:3000

### Using Docker directly

Build the image:
```bash
docker build -t gigforge-website .
```

Run the container:
```bash
docker run -p 3000:3000 gigforge-website
```

## Project Structure

```
gigforge-website/
├── app/                      # Next.js app router pages
│   ├── api/contact/         # Contact form API route
│   ├── about/               # About page
│   ├── contact/             # Contact page with form
│   ├── portfolio/           # Portfolio pages
│   │   └── [slug]/          # Dynamic case study pages
│   ├── services/            # Services page with pricing
│   ├── layout.tsx           # Root layout with header/footer
│   ├── page.tsx             # Home page
│   └── globals.css          # Global styles
├── components/              # Reusable components
│   ├── Header.tsx           # Navigation header (with mobile hamburger menu)
│   ├── Footer.tsx           # Site footer
│   ├── ProjectCard.tsx      # Portfolio project card
│   └── TestimonialCard.tsx  # Client testimonial card
├── data/                    # Static data
│   ├── projects.ts          # Portfolio projects data
│   └── testimonials.ts      # Client testimonials (placeholder data)
├── __tests__/               # Test files
│   ├── app/                 # Page tests
│   └── components/          # Component tests
├── Dockerfile               # Multi-stage Docker build
├── docker-compose.yml       # Docker Compose configuration
├── tailwind.config.ts       # Tailwind configuration
├── vitest.config.ts         # Vitest configuration
└── next.config.ts           # Next.js configuration
```

## Pages

- **/** - Home page with hero, featured projects, services overview, and testimonials
- **/portfolio** - Portfolio grid of all 5 projects
- **/portfolio/[slug]** - Individual case study pages (5 projects)
- **/services** - Services page with rate cards for 4 practices
- **/about** - About page with methodology and quality process
- **/contact** - Contact form with validation

## Design Tokens

```css
bg-primary: #0f172a    /* Body background */
bg-secondary: #1e293b  /* Cards, sections */
accent: #3b82f6        /* CTAs, links, highlights */
text-primary: #f8fafc  /* Headings, body */
text-secondary: #94a3b8 /* Metadata, captions */
```

## TDD Methodology

This project was built following strict Test-Driven Development:

1. **RED** - Write failing tests first
2. **GREEN** - Write minimum code to pass tests
3. **REFACTOR** - Improve code while keeping tests green

Every component and page has:
- 1 render test
- 1 interaction/state test
- 1 accessibility test

Every API route has:
- 1 success test
- 1 validation test
- 1 error test

## Test Coverage

- **57 tests** across 11 test files
- **100% pass rate**
- Components: Header (incl. mobile menu), Footer, ProjectCard, TestimonialCard
- Pages: Home (incl. testimonials), Portfolio, Case Studies, Services, About, Contact
- API Routes: Contact form endpoint (incl. Resend integration)
- Data: testimonials data

## Tech Stack

- **Next.js 15** - React framework with App Router
- **React 19** - UI library
- **TypeScript 5.7** - Type safety
- **Tailwind CSS 4** - Utility-first CSS
- **Vitest** - Unit testing framework
- **Testing Library** - React testing utilities
- **Docker** - Containerization

## License

Private - GigForge © 2026
