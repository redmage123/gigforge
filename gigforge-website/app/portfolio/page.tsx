import type { Metadata } from 'next'
import { projects } from '@/data/projects'
import ProjectCard from '@/components/ProjectCard'

export const metadata: Metadata = {
  title: 'Portfolio | GigForge',
  description: 'Explore our portfolio of production-ready software projects, AI automation systems, and full-stack applications.',
}

export default function Portfolio() {
  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold text-text-primary mb-4">Portfolio</h1>
      <p className="text-xl text-text-secondary mb-12 max-w-3xl">
        A showcase of production-ready projects built with TDD methodology, comprehensive test coverage,
        and modern tech stacks.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <ProjectCard key={project.slug} project={project} />
        ))}
      </div>
    </div>
  )
}
