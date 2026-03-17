'use client'

import { useState } from 'react'
import Link from 'next/link'

type Role = 'applicant' | 'employer' | 'admin'

interface Job {
  id: number
  title: string
  company: string
  location: string
  type: string
  salary: string
  tags: string[]
  posted: string
  applications: number
  status: 'open' | 'closed'
}

const JOBS: Job[] = [
  { id: 1, title: 'Senior TypeScript Engineer', company: 'Acme Corp', location: 'Remote', type: 'Full-time', salary: '$130k–$160k', tags: ['TypeScript', 'Node.js', 'PostgreSQL'], posted: '2026-03-07', applications: 12, status: 'open' },
  { id: 2, title: 'React Frontend Developer', company: 'Spark Labs', location: 'London, UK', type: 'Contract', salary: '£500–£600/day', tags: ['React', 'TypeScript', 'Tailwind'], posted: '2026-03-06', applications: 8, status: 'open' },
  { id: 3, title: 'DevOps Engineer', company: 'DataFlow', location: 'Remote', type: 'Full-time', salary: '$110k–$140k', tags: ['Docker', 'Kubernetes', 'CI/CD'], posted: '2026-03-05', applications: 5, status: 'open' },
  { id: 4, title: 'AI/ML Engineer', company: 'NeuralWorks', location: 'Berlin, DE', type: 'Full-time', salary: '€90k–€120k', tags: ['Python', 'PyTorch', 'RAG'], posted: '2026-03-04', applications: 19, status: 'open' },
  { id: 5, title: 'Backend Engineer (Go)', company: 'CloudBase', location: 'Remote', type: 'Full-time', salary: '$120k–$150k', tags: ['Go', 'gRPC', 'PostgreSQL'], posted: '2026-03-02', applications: 3, status: 'closed' },
]

export default function JobBoardDemo() {
  const [role, setRole] = useState<Role>('applicant')
  const [search, setSearch] = useState('')
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set())
  const [applyingId, setApplyingId] = useState<number | null>(null)
  const [showPostForm, setShowPostForm] = useState(false)
  const [jobs, setJobs] = useState<Job[]>(JOBS)
  const [newJob, setNewJob] = useState({ title: '', company: '', location: '', salary: '', type: 'Full-time' })
  const [postSuccess, setPostSuccess] = useState(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)

  const filtered = jobs.filter((j) => {
    const q = search.toLowerCase()
    return !q || j.title.toLowerCase().includes(q) || j.tags.some((t) => t.toLowerCase().includes(q)) || j.company.toLowerCase().includes(q) || j.location.toLowerCase().includes(q)
  })

  async function handleApply(job: Job) {
    setApplyingId(job.id)
    await new Promise((r) => setTimeout(r, 700))
    setAppliedIds((prev) => new Set([...prev, job.id]))
    setApplyingId(null)
  }

  async function handlePost() {
    if (!newJob.title || !newJob.company) return
    await new Promise((r) => setTimeout(r, 600))
    const posted: Job = {
      id: Date.now(),
      title: newJob.title,
      company: newJob.company,
      location: newJob.location || 'Remote',
      type: newJob.type,
      salary: newJob.salary || 'Competitive',
      tags: ['New'],
      posted: new Date().toISOString().slice(0, 10),
      applications: 0,
      status: 'open',
    }
    setJobs((prev) => [posted, ...prev])
    setPostSuccess(true)
    setShowPostForm(false)
    setNewJob({ title: '', company: '', location: '', salary: '', type: 'Full-time' })
    setTimeout(() => setPostSuccess(false), 3000)
  }

  async function handleToggleStatus(job: Job) {
    setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: j.status === 'open' ? 'closed' : 'open' } : j))
  }

  const roleLabel: Record<Role, string> = { applicant: '👤 Applicant', employer: '🏢 Employer', admin: '🔑 Admin' }
  const roleDesc: Record<Role, string> = {
    applicant: 'Browse jobs and apply. Only open listings are visible.',
    employer: 'Post new jobs and see application counts on your listings.',
    admin: 'Full access — view all listings, manage status, see all application counts.',
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-16">
      <Link href="/demos" className="text-accent hover:underline mb-6 inline-block text-sm">
        ← All Demos
      </Link>
      <div className="flex items-center gap-4 mb-2">
        <span className="text-3xl">📋</span>
        <h1 className="text-3xl font-bold text-text-primary">Job Board (Full Stack)</h1>
      </div>
      <p className="text-text-secondary mb-8">Role-based access control in action. Switch roles to see what each user type can see and do.</p>

      {/* Role Switcher */}
      <div className="bg-bg-secondary rounded-xl p-4 mb-6">
        <div className="flex flex-wrap gap-2 mb-2">
          {(['applicant', 'employer', 'admin'] as Role[]).map((r) => (
            <button
              key={r}
              onClick={() => { setRole(r); setSelectedJob(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${role === r ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary hover:text-text-primary'}`}
            >
              {roleLabel[r]}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">{roleDesc[role]}</p>
      </div>

      {postSuccess && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-lg px-4 py-3 mb-4 text-sm">
          ✓ Job posted successfully — visible to all users.
        </div>
      )}

      {/* Employer: Post Job */}
      {(role === 'employer' || role === 'admin') && (
        <div className="mb-6">
          {!showPostForm ? (
            <button
              onClick={() => setShowPostForm(true)}
              className="bg-accent hover:bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Post a Job
            </button>
          ) : (
            <div className="bg-bg-secondary rounded-xl p-6">
              <h3 className="text-base font-semibold text-text-primary mb-4">New Job Posting</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Job Title *</label>
                  <input className="w-full bg-bg-primary border border-bg-tertiary rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent" value={newJob.title} onChange={(e) => setNewJob((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Senior React Developer" />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Company *</label>
                  <input className="w-full bg-bg-primary border border-bg-tertiary rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent" value={newJob.company} onChange={(e) => setNewJob((p) => ({ ...p, company: e.target.value }))} placeholder="e.g. Acme Corp" />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Location</label>
                  <input className="w-full bg-bg-primary border border-bg-tertiary rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent" value={newJob.location} onChange={(e) => setNewJob((p) => ({ ...p, location: e.target.value }))} placeholder="Remote / City" />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Salary</label>
                  <input className="w-full bg-bg-primary border border-bg-tertiary rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-accent" value={newJob.salary} onChange={(e) => setNewJob((p) => ({ ...p, salary: e.target.value }))} placeholder="e.g. $100k–$130k" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handlePost} disabled={!newJob.title || !newJob.company} className="bg-accent hover:bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40">Post Job</button>
                <button onClick={() => setShowPostForm(false)} className="bg-bg-tertiary text-text-secondary px-5 py-2 rounded-lg text-sm transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job List */}
        <div className="lg:col-span-2">
          {/* Search */}
          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">🔍</span>
            <input
              className="w-full bg-bg-secondary border border-bg-tertiary rounded-lg pl-9 pr-4 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent"
              placeholder="Search by title, skill, or company (PostgreSQL full-text search)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            {filtered
              .filter((j) => role === 'applicant' ? j.status === 'open' : true)
              .map((job) => (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(job.id === selectedJob?.id ? null : job)}
                  className={`bg-bg-secondary rounded-xl p-4 cursor-pointer border-2 transition-all ${selectedJob?.id === job.id ? 'border-accent' : 'border-transparent hover:border-bg-tertiary'} ${job.status === 'closed' ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-text-primary">{job.title}</h3>
                        {job.status === 'closed' && <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">Closed</span>}
                      </div>
                      <div className="text-sm text-text-secondary">{job.company} · {job.location} · {job.type}</div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {job.tags.map((tag) => (
                          <span key={tag} className="text-xs bg-bg-primary text-text-muted px-2 py-0.5 rounded">{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-accent">{job.salary}</div>
                      <div className="text-xs text-text-muted">{job.posted}</div>
                      {(role === 'employer' || role === 'admin') && (
                        <div className="text-xs text-text-secondary mt-1">{job.applications} applicants</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            {filtered.filter((j) => role === 'applicant' ? j.status === 'open' : true).length === 0 && (
              <p className="text-text-muted text-sm text-center py-8">No jobs match your search.</p>
            )}
          </div>
        </div>

        {/* Detail / Actions Panel */}
        <div className="space-y-4">
          {selectedJob ? (
            <div className="bg-bg-secondary rounded-xl p-5 sticky top-4">
              <h3 className="text-base font-semibold text-text-primary mb-1">{selectedJob.title}</h3>
              <p className="text-sm text-text-secondary mb-3">{selectedJob.company} · {selectedJob.location}</p>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between"><span className="text-text-muted">Type</span><span className="text-text-primary">{selectedJob.type}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Salary</span><span className="text-accent font-medium">{selectedJob.salary}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Posted</span><span className="text-text-secondary">{selectedJob.posted}</span></div>
                {(role === 'employer' || role === 'admin') && (
                  <div className="flex justify-between"><span className="text-text-muted">Applications</span><span className="text-text-primary">{selectedJob.applications}</span></div>
                )}
              </div>

              {role === 'applicant' && selectedJob.status === 'open' && (
                <button
                  onClick={() => handleApply(selectedJob)}
                  disabled={applyingId === selectedJob.id || appliedIds.has(selectedJob.id)}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${appliedIds.has(selectedJob.id) ? 'bg-green-800 text-green-200' : 'bg-accent hover:bg-blue-600 text-white disabled:opacity-50'}`}
                >
                  {applyingId === selectedJob.id ? 'Submitting…' : appliedIds.has(selectedJob.id) ? '✓ Applied' : 'Apply Now'}
                </button>
              )}

              {role === 'admin' && (
                <button
                  onClick={() => handleToggleStatus(selectedJob)}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${selectedJob.status === 'open' ? 'bg-red-900 hover:bg-red-800 text-red-200' : 'bg-green-900 hover:bg-green-800 text-green-200'}`}
                >
                  {selectedJob.status === 'open' ? 'Close Listing' : 'Reopen Listing'}
                </button>
              )}
            </div>
          ) : (
            <div className="bg-bg-secondary rounded-xl p-5">
              <h3 className="text-base font-semibold text-text-primary mb-2">RBAC in action</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2"><span className="text-accent mt-0.5">✓</span><span className="text-text-secondary"><strong className="text-text-primary">Applicant</strong> — sees open jobs only, can apply</span></div>
                <div className="flex items-start gap-2"><span className="text-accent mt-0.5">✓</span><span className="text-text-secondary"><strong className="text-text-primary">Employer</strong> — sees application counts, can post</span></div>
                <div className="flex items-start gap-2"><span className="text-accent mt-0.5">✓</span><span className="text-text-secondary"><strong className="text-text-primary">Admin</strong> — full access, can open/close any listing</span></div>
              </div>
              <p className="text-xs text-text-muted mt-3">Click any listing to see the actions available to your role.</p>
            </div>
          )}

          {role === 'admin' && (
            <div className="bg-bg-secondary rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Admin Stats</h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-bg-primary rounded-lg p-3"><div className="text-xl font-bold text-text-primary">{jobs.filter(j => j.status === 'open').length}</div><div className="text-xs text-text-secondary">Open</div></div>
                <div className="bg-bg-primary rounded-lg p-3"><div className="text-xl font-bold text-text-primary">{jobs.filter(j => j.status === 'closed').length}</div><div className="text-xs text-text-secondary">Closed</div></div>
                <div className="bg-bg-primary rounded-lg p-3 col-span-2"><div className="text-xl font-bold text-text-primary">{jobs.reduce((a, j) => a + j.applications, 0)}</div><div className="text-xs text-text-secondary">Total applications</div></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-4 text-center">
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">36</div><div className="text-xs text-text-secondary">API tests, 0 failures</div></div>
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">3</div><div className="text-xs text-text-secondary">User roles with RBAC</div></div>
        <div className="bg-bg-secondary rounded-lg p-4"><div className="text-2xl font-bold text-text-primary">tsvector</div><div className="text-xs text-text-secondary">Full-text search + GIN</div></div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/portfolio/job-board" className="text-accent hover:underline text-sm mr-6">View case study →</Link>
        <Link href="/contact" className="inline-block bg-accent text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium">Build something similar</Link>
      </div>
    </div>
  )
}
