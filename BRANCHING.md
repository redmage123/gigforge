# Git Branching Strategy

## Branches

| Branch | Purpose | Deploys To | Protection |
|--------|---------|------------|------------|
| `master` | Production-ready code | gigforge.ai (auto) | PR required, CI + QA + security must pass |
| `develop` | Integration/staging | — | PR required, CI must pass |
| `feature/CC-*` | New features | — | CI runs on PR |
| `bugfix/BUG-*` | Non-urgent bug fixes | — | CI runs on PR |
| `hotfix/BUG-*` | Urgent production fixes | Production (fast-track) | QA fast-track required |
| `release/v*` | Release candidates | Production on merge | Full QA + security required |

## Workflow

### Features & Non-Urgent Bugs

```
1. Create branch from develop:
   git checkout develop && git pull origin develop
   git checkout -b feature/CC-5-add-oauth-provider

2. Commit and push:
   git add <files>
   git commit -m "feat(CC-5): add OAuth2 provider support"
   git push origin feature/CC-5-add-oauth-provider

3. Open PR to develop — CI runs automatically

4. Team walkthrough → QA tests → Security scan

5. Merge to develop (squash merge preferred)

6. Delete the feature branch after merge
```

### Releases

```
1. PM creates release branch from develop:
   git checkout develop && git pull origin develop
   git checkout -b release/v2026.03.18

2. Final QA on release branch — only bug fixes allowed, no new features

3. Merge to master via PR — auto-deploys to production

4. Merge master back to develop (to include any release fixes)

5. Tag the release:
   git tag v2026.03.18
   git push origin v2026.03.18
```

### Hotfixes (urgent production bugs)

```
1. Create hotfix from master:
   git checkout master && git pull origin master
   git checkout -b hotfix/BUG-4-middleware-crash

2. Fix, commit, push

3. Open PR to master — fast-track QA (functional test only, regression can follow)

4. After merge to master (auto-deploys), also merge to develop:
   git checkout develop && git merge master
```

## Branch Naming Convention

- `feature/CC-{number}-{short-kebab-description}`
- `bugfix/BUG-{number}-{short-kebab-description}`
- `hotfix/BUG-{number}-{short-kebab-description}`
- `release/v{YYYY.MM.DD}`

The Plane issue ID (CC-X or BUG-X) MUST be in the branch name.

## Commit Message Convention

```
type(ISSUE-ID): short description

type: feat, fix, refactor, test, docs, ci, chore
ISSUE-ID: CC-5, BUG-3, etc.
```

Examples:
- `feat(CC-5): add OAuth2 provider support`
- `fix(BUG-3): catch HTTPException in middleware dispatch`
- `test(CC-5): add OAuth2 integration tests`
- `ci: update deploy workflow for staging`

## Rules

1. **Never push directly to master or develop** — always use PRs
2. **Every branch references a Plane issue** — no orphan branches
3. **Delete branches after merge** — keep the repo clean
4. **Hotfixes merge to BOTH master and develop** — keep them in sync
5. **Release branches are short-lived** — create, QA, merge, delete
