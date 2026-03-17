import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

const workflowsDir = path.join(__dirname, '../.github/workflows')

function loadYaml(filename: string): Record<string, unknown> {
  return yaml.load(fs.readFileSync(path.join(workflowsDir, filename), 'utf-8')) as Record<
    string,
    unknown
  >
}

describe('GitHub Actions YAML workflows', () => {
  // Test 1: ci.yml — triggers on push to main branch
  it('ci.yml triggers on push to main branch', () => {
    const ci = loadYaml('ci.yml') as {
      on: { push?: { branches?: string[] } }
    }
    const branches = ci.on?.push?.branches ?? []
    expect(branches).toContain('main')
  })

  // Test 2: ci.yml — triggers on pull_request
  it('ci.yml triggers on pull_request', () => {
    const ci = loadYaml('ci.yml') as {
      on: { pull_request?: unknown }
    }
    expect(ci.on).toHaveProperty('pull_request')
  })

  // Test 3: ci.yml — has lint job with npm run lint step
  it('ci.yml has lint job with npm run lint step', () => {
    const ci = loadYaml('ci.yml') as {
      jobs: { lint?: { steps?: Array<{ run?: string }> } }
    }
    expect(ci.jobs).toHaveProperty('lint')
    const steps = ci.jobs.lint?.steps ?? []
    const lintStep = steps.find((s) => s.run?.includes('npm run lint'))
    expect(lintStep).toBeDefined()
  })

  // Test 4: ci.yml — has test job with npm run test step
  it('ci.yml has test job with npm run test step', () => {
    const ci = loadYaml('ci.yml') as {
      jobs: { test?: { steps?: Array<{ run?: string }> } }
    }
    expect(ci.jobs).toHaveProperty('test')
    const steps = ci.jobs.test?.steps ?? []
    const testStep = steps.find((s) => s.run?.includes('npm run test') || s.run?.includes('npm test'))
    expect(testStep).toBeDefined()
  })

  // Test 5: ci.yml — has build job
  it('ci.yml has build job', () => {
    const ci = loadYaml('ci.yml') as {
      jobs: { build?: unknown }
    }
    expect(ci.jobs).toHaveProperty('build')
  })

  // Test 6: ci.yml — uses node-version '20' in setup-node
  it("ci.yml uses node-version '20' in setup-node", () => {
    const ci = loadYaml('ci.yml') as {
      jobs: Record<string, { steps?: Array<{ with?: { 'node-version'?: string | number } }> }>
    }
    const allSteps = Object.values(ci.jobs).flatMap((job) => job.steps ?? [])
    const nodeStep = allSteps.find(
      (s) => s.with?.['node-version'] === '20' || s.with?.['node-version'] === 20
    )
    expect(nodeStep).toBeDefined()
  })

  // Test 7: release.yml — triggers on tags: ['v*']
  it("release.yml triggers on tags matching 'v*'", () => {
    const release = loadYaml('release.yml') as {
      on: { push?: { tags?: string[] } }
    }
    const tags = release.on?.push?.tags ?? []
    expect(tags.some((t) => t.startsWith('v'))).toBe(true)
  })

  // Test 8: release.yml — docker/build-push-action with push: true
  it('release.yml has docker/build-push-action with push: true', () => {
    const release = loadYaml('release.yml') as {
      jobs: Record<
        string,
        { steps?: Array<{ uses?: string; with?: { push?: boolean } }> }
      >
    }
    const allSteps = Object.values(release.jobs).flatMap((job) => job.steps ?? [])
    const dockerPushStep = allSteps.find(
      (s) => s.uses?.includes('docker/build-push-action') && s.with?.push === true
    )
    expect(dockerPushStep).toBeDefined()
  })

  // Test 9: release.yml — uses secrets.GITHUB_TOKEN (not hardcoded)
  it('release.yml uses secrets.GITHUB_TOKEN for registry auth', () => {
    const rawContent = fs.readFileSync(path.join(workflowsDir, 'release.yml'), 'utf-8')
    expect(rawContent).toContain('secrets.GITHUB_TOKEN')
    expect(rawContent).not.toMatch(/password:\s*['"]?ghp_[A-Za-z0-9]+/)
  })

  // Test 10: nightly.yml — has schedule trigger with cron
  it('nightly.yml has schedule trigger with cron expression', () => {
    const nightly = loadYaml('nightly.yml') as {
      on: { schedule?: Array<{ cron?: string }> }
    }
    const schedule = nightly.on?.schedule ?? []
    expect(schedule.length).toBeGreaterThan(0)
    expect(schedule[0]?.cron).toBeDefined()
    expect(typeof schedule[0]?.cron).toBe('string')
  })

  // Test 11: nightly.yml — has npm audit step
  it('nightly.yml has npm audit step', () => {
    const nightly = loadYaml('nightly.yml') as {
      jobs: Record<string, { steps?: Array<{ run?: string }> }>
    }
    const allSteps = Object.values(nightly.jobs).flatMap((job) => job.steps ?? [])
    const auditStep = allSteps.find((s) => s.run?.includes('npm audit'))
    expect(auditStep).toBeDefined()
  })
})
