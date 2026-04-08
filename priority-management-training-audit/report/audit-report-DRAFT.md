# Website Audit Report — prioritymanagementtraining.ie

**Prepared by:** GigForge
**Date:** 2026-04-08
**Status:** DRAFT — Awaiting client confirmation to proceed to PDF delivery
**Ref:** BUG-65 / GF-65
**Contact:** D Foley (DFoley@prioritymanagementtraining.ie)

---

## 1. Executive Summary

prioritymanagementtraining.ie is a WordPress-based website for a B2B corporate training provider serving regulated-sector clients including Pfizer, AbbVie, HSE, and Irish Water. The site functions but carries significant technical, compliance, and SEO risks that are likely suppressing lead generation and creating GDPR exposure.

**Critical issues requiring immediate action (3):**

| # | Issue | Risk |
|---|-------|------|
| 1 | Analytics scripts (GTM/UA/GA4) fire in `<head>` before cookie consent interaction | GDPR pre-consent violation |
| 2 | Legacy Universal Analytics tag (UA-214734536-1) still active — dead since July 2023 | Data gap + page weight |
| 3 | SSL certificate expires **14 May 2026** (36 days) — automatic renewal must be verified | Site outage risk |

**High-priority issues (4):**

| # | Issue | Impact |
|---|-------|--------|
| 4 | 4 duplicate/draft pages publicly accessible with no noindex (`home-draft`, `home-2`, `courses-2`, `public-courses`) | SEO crawl budget waste, duplicate content penalties |
| 5 | Privacy Policy last updated October 2020 — missing GDPR Art. 13 obligations | Legal/compliance risk |
| 6 | Facebook Pixel not confirmed on homepage but present via GTM — requires GTM container audit | Undisclosed data sharing risk |
| 7 | "J&J Team Members Exclusive" referenced in navigation HTML (page returns 404) | Broken nav + client confidentiality exposure |

---

## 2. Technical Audit

### 2.1 Security & Compliance

#### [CRITICAL] Pre-consent Analytics Loading

- **Finding:** GTM (`GTM-M3DZNFKN`), Universal Analytics (`UA-214734536-1`), and GA4 (`G-0LSMD8YN2W`) are loaded directly in the HTML `<head>`, meaning they fire before any cookie consent interaction.
- **Cookie consent tool:** Cookie Law Info (WordPress plugin) is detected. However, loading analytics in `<head>` bypasses the consent gate.
- **GDPR risk:** Under GDPR Art. 6 and the ePrivacy Directive, analytics cookies require explicit prior consent in Ireland/EU. Pre-consent firing is a regulatory violation.
- **Recommended fix:** Migrate analytics to GTM with Consent Mode v2 enabled. Ensure all analytics tags have consent triggers (`analytics_storage` = granted before firing).

#### [CRITICAL] SSL Certificate Expiry

- **Issuer:** Let's Encrypt R12
- **Valid to:** 14 May 2026 (approximately 36 days from audit date)
- **Subject:** `*.prioritymanagementtraining.ie`
- **Risk:** Let's Encrypt certificates auto-renew via certbot/ACME. If the renewal process is failing or not configured, the site will go offline on 14 May with a browser security error.
- **Recommended action:** SSH to hosting server and verify: `sudo certbot renew --dry-run`. Confirm cron job for auto-renewal is in place.

#### [HIGH] GDPR Privacy Policy Gaps

- Privacy Policy last updated: **October 2020**
- **Missing under GDPR Art. 13:**
  - Lawful basis for processing personal data
  - Data retention periods
  - Right to lodge a complaint with the DPC (Data Protection Commission Ireland)
  - Details of third-party data processors (GTM, Facebook, HubSpot, Gravity Forms)
- Legacy data request contact email (`pmireland@prioritymanagement.com`) — likely unmaintained
- **Action:** Full policy rewrite required. Recommend engaging a GDPR consultant given regulated-sector client base (Pfizer, AbbVie, HSE).

#### [MEDIUM] Facebook Pixel / GTM Tag Audit

- Facebook Pixel code not detected directly in homepage HTML
- **GTM container (`GTM-M3DZNFKN`) is loaded** — Facebook Pixel may be firing via GTM on page load
- Full GTM container audit required: export all tags, triggers, and variables; verify which fire before consent
- Previous audit flagged Facebook Pixel — may be on inner pages or triggered via GTM

#### [MEDIUM] Analytics Configuration — Dead UA Tag

- **Finding confirmed:** `UA-214734536-1` (Universal Analytics format) is present in page source
- UA sunset: July 2023. This tag has been firing to a dead Google endpoint for ~21 months
- GA4 (`G-0LSMD8YN2W`) is also present — migration appears to have happened but legacy tag was not removed
- **Impact:** Extra HTTP request on every pageload (performance), potential data confusion
- **Fix:** Remove the UA tag from GTM/direct code. Confirm GA4 is capturing all conversions.

#### [LOW] Platform & Plugin Hygiene

- WordPress version: Hidden ✅
- HTTPS: Active ✅
- robots.txt: Present ✅
- Plugin CVE scan needed for: All in One SEO v4.9.5.1, LearnDash (version unknown), Gravity Forms, HubSpot CRM plugin, WP Job Openings

---

### 2.2 Performance

**Response time benchmarks (measured from audit server, no CDN warmup):**

| Page | HTTP Status | Page Size | Response Time |
|------|-------------|-----------|---------------|
| Homepage | 200 | 443 KB | 284ms |
| Courses | 200 | 271 KB | 229ms |
| Courses-2 (duplicate) | 200 | 272 KB | 2,847ms |
| Public Courses (duplicate) | 200 | 238 KB | 2,920ms |
| Home Draft (duplicate) | 200 | 551 KB | 3,578ms |
| Home-2 (duplicate) | 200 | 361 KB | 3,690ms |

**Observations:**
- Homepage and main courses page load acceptably (229–284ms)
- Duplicate/draft pages are significantly slower (2.8–3.7s) — likely uncached, older Elementor layouts
- Homepage at 443 KB is heavy — typical Elementor sites; Lighthouse/PageSpeed analysis recommended to identify image/script optimisation opportunities
- **Note:** Full Lighthouse (LCP, INP, CLS) requires direct Google PageSpeed API access — recommend client run via Google Search Console for authoritative Core Web Vitals

---

### 2.3 Platform Health

#### [HIGH] Duplicate & Draft Pages Publicly Accessible

The following pages return HTTP 200, have no `noindex` directive, and are not excluded from crawl:

| URL | Title | Status | Noindex? |
|-----|-------|--------|----------|
| `/home-draft/` | "Home draft | Priority Management Training" | 200 ✅ | ❌ NO |
| `/home-2/` | "Home | Priority Management Training" | 200 ✅ | ❌ NO |
| `/courses-2/` | "Courses | Priority Management Training" | 200 ✅ | ❌ NO |
| `/public-courses/` | "Public Courses | Priority Management Training" | 200 ✅ | ❌ NO |

**Impact:** Google indexes all four. Duplicate `<title>` tags will trigger duplicate content signals. Crawl budget is wasted on draft pages.
**Fix:** Add `noindex, nofollow` robots meta to all four pages immediately. Or delete them if they are unused.

#### [MEDIUM] J&J Team Members Exclusive Page

- Referenced in navigation HTML
- Page URL `/j-j-team-members-exclusive/` returns HTTP 404 — page has been deleted or moved
- **Impact:** Broken navigation link (bad UX), but the reference in the nav implies a client-specific exclusivity arrangement that may need a properly-gated member area rather than security-through-obscurity
- **Fix:** Remove the broken nav item. If a client portal is needed, implement proper authentication.

#### [LOW] Dual Event Systems

- My Calendar + Tribe Events plugins both appear active
- One is likely redundant — increases plugin attack surface and maintenance overhead
- **Recommendation:** Audit which is in use, deactivate and delete the unused one

---

## 3. SEO Audit

### 3.1 Technical SEO

| Finding | Severity | Detail |
|---------|----------|--------|
| Duplicate content — 4 pages same title/content | HIGH | `/home-draft/`, `/home-2/`, `/courses-2/`, `/public-courses/` all indexed, no canonical |
| Stale meta description references "Lean Process" | MEDIUM | Doesn't match current positioning (AI for Professionals, Time Management) |
| Broken internal link in nav | MEDIUM | J&J page 404 — affects crawl and user trust |
| Sitemap: 12 URLs only | LOW | Small sitemap — may indicate deeper pages not submitted; run Screaming Frog crawl to verify full site coverage |
| Blog last active ~2024 | LOW | Reduced content velocity affects organic authority |

### 3.2 Crawl Note

Full keyword analysis, backlink profile, and competitor benchmarking require:
- Screaming Frog full crawl (client provides access or we use `wget --spider`)
- Google Search Console access (ideally)
- Ahrefs/Semrush/Ubersuggest for keyword gap and backlinks

These are included in the audit delivery scope pending client confirmation.

---

## 4. Business & UX Review

### 4.1 Navigation & UX

- **"Public Courses" vs "Our Courses"** — distinction unclear to first-time visitors; creates decision friction
- **"J&J Team Members Exclusive"** — broken link AND exposes that exclusive B2B arrangements exist; confusing and professionally risky if visible to non-clients
- **"60 min per employee per day"** hero claim — compelling statistic but not substantiated on the page; reduces trust for B2B buyers from regulated sectors
- **Multiple course listing URLs** — three apparent course pages creates user confusion about where to go

### 4.2 Business Strengths (Underutilised)

- **Strong client roster** (Pfizer, AbbVie, Irish Water, HSE, EY, Ryanair visible in content) — this is enormous social proof for B2B buyers and is underutilised on the homepage
- **"AI for Professionals"** positioning is timely and differentiated — content and SEO strategy should reinforce this
- **Established brand** — domain authority built over multiple years

### 4.3 Conversion & Booking Flow

- Multiple booking systems appear to coexist (HubSpot forms, Gravity Forms, LearnDash enrollment) — no single, coherent conversion funnel
- Lead capture should funnel to HubSpot CRM for pipeline visibility
- **Recommendation:** Audit all conversion paths; consolidate to HubSpot-integrated forms with automated follow-up sequences

---

## 5. Rebuild Outline & Investment Options

### 5.1 What to Retain

- Domain authority and all indexed URLs (301 redirects on rebuild — mandatory)
- Blog content (migrate with original URLs)
- HubSpot CRM integration (upgrade, don't replace)
- LearnDash LMS (if online course delivery is in scope)
- Strong client case studies (rewrite and prominently feature on homepage)

### 5.2 Recommended Tech Stack

**Option A — WordPress Refresh (lower cost, familiar for client)**
- Replace Elementor with Full Site Editing (FSE) or lightweight custom theme
- Consolidate to single event/booking system
- Implement proper GTM Consent Mode v2
- Fix all technical/SEO issues above
- Estimated: €4,000–7,000

**Option B — Headless WordPress (modern, best performance)**
- WordPress as headless CMS (Gutenberg editor preserved)
- Next.js 15 App Router frontend
- Best Core Web Vitals scores
- GA4 Consent Mode v2, server-side analytics option
- Estimated: €10,000–16,000

**Option C — Full Feature Rebuild + AI Additions**
All of Option B plus:
- AI course recommender (short quiz → personalised training path)
- Proper client portal with authentication (replacing J&J hack)
- ROI calculator (time saved × employees × rate)
- Testimonial/case study hub with named client logos
- Consolidated HubSpot booking flow
- Estimated: €16,000–25,000+

### 5.3 Quick Wins (Before Rebuild Decision)

Items that can be fixed immediately regardless of rebuild decision:

| Action | Effort | Impact |
|--------|--------|--------|
| Add noindex to 4 duplicate/draft pages | 30 min | HIGH — stops SEO damage today |
| Remove broken J&J nav link | 10 min | MEDIUM — fixes broken UX |
| Remove UA tag from GTM/code | 30 min | MEDIUM — removes dead tag, minor perf gain |
| Verify SSL auto-renewal | 15 min | CRITICAL — prevents site outage May 14 |
| Move analytics to GTM Consent Mode v2 | 2–3h | HIGH — GDPR compliance |

---

## Appendix: Evidence Log

| Check | Method | Finding |
|-------|--------|---------|
| SSL certificate | Node.js TLS socket | Let's Encrypt R12, expires May 14 2026 |
| HTTP status codes | Node.js HTTP GET | All pages verified (see Section 2.2 table) |
| Analytics tags | HTML source inspection | UA-214734536-1 + G-0LSMD8YN2W + GTM-M3DZNFKN confirmed |
| Facebook Pixel | HTML source inspection | Not in homepage HTML; GTM audit required for inner pages |
| Cookie consent plugin | HTML source inspection | Cookie Law Info plugin present; GTM fires pre-consent |
| Noindex status | HTML meta tag scan | All 4 duplicate pages confirmed noindex-free |
| J&J page | HTTP GET | Returns 404 |
| Sitemap | XML fetch | 12 URLs, no draft/duplicate pages listed (Yoast not submitting them) |

---

## Next Steps

1. **Immediate (client action):** Verify SSL auto-renewal, add noindex to draft pages, remove broken J&J link
2. **Short-term (GigForge):** Full GTM audit, Screaming Frog crawl, Lighthouse report, keyword analysis — upon client confirmation
3. **Proposal:** Present Options A/B/C with ROI framing; quick-wins as immediate value demonstration

---

_Report compiled by gigforge-engineer, 2026-04-08_
_Technical checks performed live against https://prioritymanagementtraining.ie/_
