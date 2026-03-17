import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { projects } from '@/data/projects'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return projects.map((project) => ({
    slug: project.slug,
  }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const project = projects.find((p) => p.slug === slug)

  if (!project) {
    return {
      title: 'Project Not Found | GigForge',
    }
  }

  return {
    title: `${project.title} | GigForge Portfolio`,
    description: project.shortDescription,
  }
}

export default async function ProjectDetail({ params }: PageProps) {
  const { slug } = await params
  const project = projects.find((p) => p.slug === slug)

  if (!project) {
    notFound()
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <Link href="/portfolio" className="text-accent hover:underline mb-6 inline-block">
        ← Back to Portfolio
      </Link>

      <h1 className="text-4xl font-bold text-text-primary mb-4">{project.title}</h1>
      <p className="text-xl text-text-secondary mb-8">{project.shortDescription}</p>

      {/* Project Image */}
      <div className="relative w-full rounded-lg overflow-hidden mb-12" style={{ aspectRatio: '16/9' }}>
        <Image
          src={project.image}
          alt={`${project.title} project screenshot`}
          fill
          sizes="(max-width: 1280px) 100vw, 1280px"
          className="object-cover"
          priority
        />
      </div>

      {/* Project Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
        <div className="bg-bg-secondary p-4 rounded-lg">
          <div className="text-text-secondary text-sm mb-1">Tests</div>
          <div className="text-2xl font-bold text-text-primary">{project.testCount}</div>
        </div>
        <div className="bg-bg-secondary p-4 rounded-lg">
          <div className="text-text-secondary text-sm mb-1">Sprints</div>
          <div className="text-2xl font-bold text-text-primary">{project.sprintCount}</div>
        </div>
        <div className="bg-bg-secondary p-4 rounded-lg">
          <div className="text-text-secondary text-sm mb-1">Tier</div>
          <div className="text-2xl font-bold text-text-primary">{project.tier}</div>
        </div>
        <div className="bg-bg-secondary p-4 rounded-lg">
          <div className="text-text-secondary text-sm mb-1">Platform</div>
          <div className="text-2xl font-bold text-text-primary">{project.platform}</div>
        </div>
      </div>

      {/* Overview */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-text-primary mb-4">Overview</h2>
        <p className="text-text-secondary leading-relaxed">{project.overview}</p>
      </section>

      {/* Tech Stack */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-text-primary mb-4">Tech Stack</h2>
        <div className="bg-bg-secondary rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-bg-primary">
                <th className="text-left p-4 text-text-primary">Technology</th>
                <th className="text-left p-4 text-text-primary">Category</th>
              </tr>
            </thead>
            <tbody>
              {project.techStack.map((tech, index) => (
                <tr key={tech} className={index % 2 === 0 ? 'bg-bg-secondary' : 'bg-bg-primary'}>
                  <td className="p-4 text-text-primary">{tech}</td>
                  <td className="p-4 text-text-secondary">
                    {tech.includes('Node') || tech.includes('Express') ? 'Backend' :
                     tech.includes('React') ? 'Frontend' :
                     tech.includes('PostgreSQL') ? 'Database' :
                     tech.includes('Docker') ? 'DevOps' :
                     tech.includes('Stripe') || tech.includes('OpenAI') ? 'Integration' :
                     'Core'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Key Highlights */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-text-primary mb-4">Key Highlights</h2>
        <ul className="space-y-3">
          {project.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start">
              <span className="text-accent mr-3 mt-1">✓</span>
              <span className="text-text-secondary">{highlight}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Lessons Learned */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-text-primary mb-4">Lessons Learned</h2>
        <div className="bg-bg-secondary p-6 rounded-lg">
          <p className="text-text-secondary leading-relaxed">
            This project reinforced the importance of TDD methodology and comprehensive test coverage.
            By writing tests first, we caught edge cases early and built more robust, maintainable code.
            The {project.sprintCount}-sprint approach allowed for iterative development and continuous client feedback.
          </p>
        </div>
      </section>

      {/* Demo CTA */}
      <div className="text-center pt-8 border-t border-bg-secondary mb-10">
        <h3 className="text-2xl font-bold text-text-primary mb-2">See it in action</h3>
        <p className="text-text-secondary mb-5">Try an interactive demo — no sign-up required.</p>
        <Link
          href={`/demos/${project.slug}`}
          className="inline-block bg-accent text-text-primary px-8 py-3 rounded-lg hover:bg-blue-600 transition-colors font-semibold"
        >
          ▶ Try Demo
        </Link>
      </div>

      {/* CTA */}
      <div className="text-center pt-8 border-t border-bg-secondary">
        <h3 className="text-2xl font-bold text-text-primary mb-4">Interested in a similar project?</h3>
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
