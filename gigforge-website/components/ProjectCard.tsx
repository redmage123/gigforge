import Link from 'next/link'
import Image from 'next/image'
import type { Project } from '@/data/projects'

interface ProjectCardProps {
  project: Project
}

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      href={`/portfolio/${project.slug}`}
      className="block bg-bg-secondary rounded-lg hover:border-accent border border-transparent transition-colors overflow-hidden"
      data-testid="project-card"
    >
      <div className="relative aspect-video">
        <Image
          src={project.image}
          alt={`${project.title} project thumbnail`}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover"
        />
      </div>
      <div className="p-6">
        <h3 className="text-xl font-bold text-text-primary mb-2">{project.title}</h3>
        <p className="text-text-secondary mb-4">{project.shortDescription}</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {project.techStack.slice(0, 3).map((tech) => (
            <span
              key={tech}
              className="text-xs bg-bg-primary text-text-secondary px-2 py-1 rounded"
            >
              {tech}
            </span>
          ))}
        </div>
        <div className="text-sm text-text-secondary">
          {project.testCount} tests • {project.sprintCount} sprint{project.sprintCount > 1 ? 's' : ''}
        </div>
      </div>
    </Link>
  )
}
