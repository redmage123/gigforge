import * as fs from 'fs'
import * as path from 'path'

const dockerfilePath = path.join(__dirname, '../docker/Dockerfile')
const dockerfile = fs.readFileSync(dockerfilePath, 'utf-8')

describe('Dockerfile', () => {
  // Test 1: Contains at least 2 FROM instructions
  it('contains at least 2 FROM instructions (multi-stage build)', () => {
    const fromCount = (dockerfile.match(/^FROM\s+/gm) ?? []).length
    expect(fromCount).toBeGreaterThanOrEqual(2)
  })

  // Test 2: Has AS deps or AS builder stage
  it('has named build stages (AS deps or AS builder)', () => {
    expect(dockerfile).toMatch(/FROM\s+\S+\s+AS\s+(deps|builder)/i)
  })

  // Test 3: Has AS runner final stage
  it('has AS runner final stage', () => {
    expect(dockerfile).toMatch(/FROM\s+\S+\s+AS\s+runner/i)
  })

  // Test 4: Uses 'npm ci' (not 'npm install')
  it("uses 'npm ci' instead of 'npm install'", () => {
    expect(dockerfile).toContain('npm ci')
    expect(dockerfile).not.toMatch(/RUN\s+npm\s+install(?!\s+-g)/)
  })

  // Test 5: Creates non-root user (addgroup/adduser/useradd)
  it('creates a non-root user', () => {
    expect(dockerfile).toMatch(/addgroup|adduser|useradd/)
  })

  // Test 6: Has USER instruction
  it('has USER instruction to run as non-root', () => {
    expect(dockerfile).toMatch(/^USER\s+\S+/m)
  })

  // Test 7: Has HEALTHCHECK instruction
  it('has HEALTHCHECK instruction', () => {
    expect(dockerfile).toContain('HEALTHCHECK')
  })

  // Test 8: Base image is node:20-alpine
  it('base image is node:20-alpine', () => {
    expect(dockerfile).toMatch(/FROM\s+node:20-alpine/)
  })
})
