import * as fs from 'fs'
import * as path from 'path'

function readDeploy(name: string): string {
  return fs.readFileSync(path.join(__dirname, `../deploy/${name}`), 'utf-8')
}

function statDeploy(name: string): fs.Stats {
  return fs.statSync(path.join(__dirname, `../deploy/${name}`))
}

describe('Deploy scripts', () => {
  // Test 1: deploy-railway.sh has shebang #!/usr/bin/env bash
  it('deploy-railway.sh has correct shebang', () => {
    const content = readDeploy('deploy-railway.sh')
    expect(content.startsWith('#!/usr/bin/env bash')).toBe(true)
  })

  // Test 2: deploy-railway.sh has set -euo pipefail
  it('deploy-railway.sh has set -euo pipefail', () => {
    const content = readDeploy('deploy-railway.sh')
    expect(content).toContain('set -euo pipefail')
  })

  // Test 3: deploy-railway.sh contains 'railway' command
  it("deploy-railway.sh contains 'railway' command reference", () => {
    const content = readDeploy('deploy-railway.sh')
    expect(content).toContain('railway')
  })

  // Test 4: deploy-fly.sh has set -euo pipefail and 'fly' command
  it('deploy-fly.sh has set -euo pipefail and fly command', () => {
    const content = readDeploy('deploy-fly.sh')
    expect(content).toContain('set -euo pipefail')
    expect(content).toContain('fly')
  })

  // Test 5: deploy-vps.sh has 'ssh' command
  it('deploy-vps.sh contains ssh command', () => {
    const content = readDeploy('deploy-vps.sh')
    expect(content).toContain('ssh')
  })

  // Test 6: deploy-railway.sh has no hardcoded tokens
  it('deploy-railway.sh has no hardcoded secrets or tokens', () => {
    const content = readDeploy('deploy-railway.sh')
    expect(content).not.toMatch(/sk_|token=|password=/)
  })

  // Test 7: All 3 scripts are readable files with size > 100 bytes
  it('all 3 deploy scripts exist and are non-trivial size (>100 bytes)', () => {
    const scripts = ['deploy-railway.sh', 'deploy-fly.sh', 'deploy-vps.sh']
    for (const script of scripts) {
      const stats = statDeploy(script)
      expect(stats.isFile()).toBe(true)
      expect(stats.size).toBeGreaterThan(100)
    }
  })
})
