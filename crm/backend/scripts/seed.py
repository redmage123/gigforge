"""
Seed script — creates GigForge and TechUni tenants with admin users,
sample companies, contacts, pipelines, deals, activities and tasks.
Idempotent: safe to run multiple times.

Usage:
    python scripts/seed.py
    GIGFORGE_ADMIN_PASSWORD=mypassword python scripts/seed.py
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Allow running from any directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import settings
from core.security import hash_password
from models import Tenant, User
from models.activity import Activity
from models.company import Company
from models.contact import Contact
from models.deal import Deal, DealStatus
from models.pipeline import Pipeline, PipelineStage
from models.task import Task, TaskStatus

# ---------------------------------------------------------------------------
# Tenant definitions
# ---------------------------------------------------------------------------
TENANTS = [
    {
        "name": "GigForge",
        "slug": "gigforge",
        "admin_email": "admin@gigforge.ai",
        "password_env": "GIGFORGE_ADMIN_PASSWORD",
        "default_password": "gigforge-admin-2026",
    },
    {
        "name": "TechUni",
        "slug": "techuni",
        "admin_email": "admin@techuni.ai",
        "password_env": "TECHUNI_ADMIN_PASSWORD",
        "default_password": "techuni-admin-2026",
    },
]

# ---------------------------------------------------------------------------
# Per-tenant seed data
# ---------------------------------------------------------------------------
SEED_DATA = {
    "gigforge": {
        "companies": [
            {"name": "Acme Corp", "domain": "acme.com", "industry": "Technology", "size": "51-200"},
            {"name": "Bright Minds Ltd", "domain": "brightminds.io", "industry": "Education", "size": "11-50"},
            {"name": "Nova Digital", "domain": "novadigital.co", "industry": "Marketing", "size": "1-10"},
        ],
        "contacts": [
            {"first_name": "Alice", "last_name": "Johnson", "email": "alice@acme.com", "phone": "+1-555-0101", "source": "upwork", "status": "customer", "company_idx": 0},
            {"first_name": "Bob", "last_name": "Smith", "email": "bob@brightminds.io", "phone": "+1-555-0102", "source": "fiverr", "status": "prospect", "company_idx": 1},
            {"first_name": "Carol", "last_name": "Davis", "email": "carol@novadigital.co", "phone": "+1-555-0103", "source": "linkedin", "status": "lead", "company_idx": 2},
            {"first_name": "Dan", "last_name": "Lee", "email": "dan@acme.com", "phone": "+1-555-0104", "source": "referral", "status": "customer", "company_idx": 0},
            {"first_name": "Eva", "last_name": "Martinez", "email": "eva@brightminds.io", "phone": "+1-555-0105", "source": "website", "status": "prospect", "company_idx": 1},
        ],
        "pipeline": {
            "name": "GigForge Sales Pipeline",
            "stages": [
                {"name": "Lead", "order": 0, "stage_type": "active", "probability_pct": 10, "color": "#94A3B8"},
                {"name": "Proposal Sent", "order": 1, "stage_type": "active", "probability_pct": 30, "color": "#3B82F6"},
                {"name": "Negotiation", "order": 2, "stage_type": "active", "probability_pct": 60, "color": "#F59E0B"},
                {"name": "Closed Won", "order": 3, "stage_type": "won", "probability_pct": 100, "color": "#10B981"},
                {"name": "Closed Lost", "order": 4, "stage_type": "lost", "probability_pct": 0, "color": "#EF4444"},
            ],
        },
        "deals": [
            {"title": "Acme Corp — Full-Stack Web App", "value": 3500.00, "contact_idx": 0, "company_idx": 0, "stage_idx": 2, "probability": 60, "status": DealStatus.OPEN, "days_to_close": 14},
            {"title": "Bright Minds — LMS Integration", "value": 1200.00, "contact_idx": 1, "company_idx": 1, "stage_idx": 1, "probability": 30, "status": DealStatus.OPEN, "days_to_close": 21},
            {"title": "Nova Digital — SEO Audit", "value": 800.00, "contact_idx": 2, "company_idx": 2, "stage_idx": 0, "probability": 10, "status": DealStatus.OPEN, "days_to_close": 30},
            {"title": "Acme Corp — API Automation", "value": 2000.00, "contact_idx": 3, "company_idx": 0, "stage_idx": 3, "probability": 100, "status": DealStatus.WON, "days_to_close": -7},
            {"title": "Bright Minds — Chatbot MVP", "value": 1500.00, "contact_idx": 4, "company_idx": 1, "stage_idx": 4, "probability": 0, "status": DealStatus.LOST, "days_to_close": -14},
        ],
        "activities": [
            {"type": "call", "subject": "Discovery call with Alice", "contact_idx": 0, "deal_idx": 0, "days_ago": 5},
            {"type": "email", "subject": "Proposal sent to Bob", "contact_idx": 1, "deal_idx": 1, "days_ago": 3},
            {"type": "meeting", "subject": "Kickoff meeting — Acme Corp API", "contact_idx": 3, "deal_idx": 3, "days_ago": 10},
            {"type": "call", "subject": "Follow-up with Carol re: SEO audit", "contact_idx": 2, "deal_idx": 2, "days_ago": 1},
            {"type": "email", "subject": "Contract sent to Alice", "contact_idx": 0, "deal_idx": 0, "days_ago": 2},
        ],
        "tasks": [
            {"title": "Send revised proposal to Bright Minds", "priority": "high", "deal_idx": 1, "contact_idx": 1, "days_due": 2},
            {"title": "Follow up with Carol — SEO scope call", "priority": "medium", "deal_idx": 2, "contact_idx": 2, "days_due": 5},
            {"title": "Invoice Acme Corp — API Automation", "priority": "urgent", "deal_idx": 3, "contact_idx": 3, "days_due": 1},
            {"title": "Post-mortem: Chatbot MVP loss", "priority": "low", "deal_idx": 4, "contact_idx": 4, "days_due": 7},
        ],
    },
    "techuni": {
        "companies": [
            {"name": "EduTech Ventures", "domain": "edutechventures.com", "industry": "Education", "size": "11-50"},
            {"name": "SkillBridge Corp", "domain": "skillbridge.io", "industry": "HR & Training", "size": "51-200"},
            {"name": "LearnFast Ltd", "domain": "learnfast.co", "industry": "EdTech", "size": "1-10"},
        ],
        "contacts": [
            {"first_name": "Michael", "last_name": "Chen", "email": "m.chen@edutechventures.com", "phone": "+1-555-0201", "source": "conference", "status": "customer", "company_idx": 0},
            {"first_name": "Sarah", "last_name": "Williams", "email": "s.williams@skillbridge.io", "phone": "+1-555-0202", "source": "website", "status": "prospect", "company_idx": 1},
            {"first_name": "James", "last_name": "Brown", "email": "j.brown@learnfast.co", "phone": "+1-555-0203", "source": "linkedin", "status": "lead", "company_idx": 2},
            {"first_name": "Priya", "last_name": "Patel", "email": "p.patel@edutechventures.com", "phone": "+1-555-0204", "source": "referral", "status": "customer", "company_idx": 0},
            {"first_name": "Tom", "last_name": "Garcia", "email": "t.garcia@skillbridge.io", "phone": "+1-555-0205", "source": "upwork", "status": "prospect", "company_idx": 1},
        ],
        "pipeline": {
            "name": "TechUni Course Sales",
            "stages": [
                {"name": "Inquiry", "order": 0, "stage_type": "active", "probability_pct": 15, "color": "#94A3B8"},
                {"name": "Demo Booked", "order": 1, "stage_type": "active", "probability_pct": 40, "color": "#6366F1"},
                {"name": "Trial Active", "order": 2, "stage_type": "active", "probability_pct": 70, "color": "#F59E0B"},
                {"name": "Subscription Started", "order": 3, "stage_type": "won", "probability_pct": 100, "color": "#10B981"},
                {"name": "No Decision", "order": 4, "stage_type": "lost", "probability_pct": 0, "color": "#EF4444"},
            ],
        },
        "deals": [
            {"title": "EduTech Ventures — Team Plan (20 seats)", "value": 4800.00, "contact_idx": 0, "company_idx": 0, "stage_idx": 2, "probability": 70, "status": DealStatus.OPEN, "days_to_close": 10},
            {"title": "SkillBridge Corp — Enterprise Plan", "value": 9600.00, "contact_idx": 1, "company_idx": 1, "stage_idx": 1, "probability": 40, "status": DealStatus.OPEN, "days_to_close": 20},
            {"title": "LearnFast Ltd — Starter Plan", "value": 600.00, "contact_idx": 2, "company_idx": 2, "stage_idx": 0, "probability": 15, "status": DealStatus.OPEN, "days_to_close": 30},
            {"title": "EduTech Ventures — Annual Renewal", "value": 4800.00, "contact_idx": 3, "company_idx": 0, "stage_idx": 3, "probability": 100, "status": DealStatus.WON, "days_to_close": -5},
            {"title": "SkillBridge Corp — Pro Plan Trial", "value": 2400.00, "contact_idx": 4, "company_idx": 1, "stage_idx": 4, "probability": 0, "status": DealStatus.LOST, "days_to_close": -10},
        ],
        "activities": [
            {"type": "demo", "subject": "Platform demo — EduTech Ventures", "contact_idx": 0, "deal_idx": 0, "days_ago": 4},
            {"type": "email", "subject": "Trial activation — SkillBridge Corp", "contact_idx": 1, "deal_idx": 1, "days_ago": 2},
            {"type": "call", "subject": "Onboarding check-in — Priya Patel", "contact_idx": 3, "deal_idx": 3, "days_ago": 3},
            {"type": "meeting", "subject": "Intro call — LearnFast Ltd", "contact_idx": 2, "deal_idx": 2, "days_ago": 6},
            {"type": "email", "subject": "Renewal proposal — EduTech Ventures", "contact_idx": 0, "deal_idx": 0, "days_ago": 1},
        ],
        "tasks": [
            {"title": "Schedule trial check-in with SkillBridge", "priority": "high", "deal_idx": 1, "contact_idx": 1, "days_due": 3},
            {"title": "Send LearnFast pricing comparison", "priority": "medium", "deal_idx": 2, "contact_idx": 2, "days_due": 5},
            {"title": "Process EduTech annual renewal invoice", "priority": "urgent", "deal_idx": 3, "contact_idx": 3, "days_due": 1},
            {"title": "Analyse SkillBridge churn — survey feedback", "priority": "low", "deal_idx": 4, "contact_idx": 4, "days_due": 10},
        ],
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _days(n: int) -> datetime:
    return _now() + timedelta(days=n)


# ---------------------------------------------------------------------------
# Per-tenant seeder
# ---------------------------------------------------------------------------

async def seed_tenant(session: AsyncSession, tenant_cfg: dict, tenant: Tenant, admin: User) -> None:
    slug = tenant_cfg["slug"]
    data = SEED_DATA[slug]
    tid = tenant.id

    # ---- Companies ----
    companies = []
    for c in data["companies"]:
        res = await session.execute(
            select(Company).where(Company.tenant_id == tid, Company.name == c["name"])
        )
        existing = res.scalar_one_or_none()
        if existing:
            companies.append(existing)
            print(f"    Company already exists: {c['name']}")
        else:
            company = Company(
                tenant_id=tid,
                name=c["name"],
                domain=c.get("domain"),
                industry=c.get("industry"),
                size=c.get("size"),
            )
            session.add(company)
            await session.flush()
            companies.append(company)
            print(f"    Created company: {c['name']}")

    # ---- Contacts ----
    contacts = []
    for ct in data["contacts"]:
        res = await session.execute(
            select(Contact).where(Contact.tenant_id == tid, Contact.email == ct["email"])
        )
        existing = res.scalar_one_or_none()
        if existing:
            contacts.append(existing)
            print(f"    Contact already exists: {ct['email']}")
        else:
            contact = Contact(
                tenant_id=tid,
                first_name=ct["first_name"],
                last_name=ct["last_name"],
                email=ct["email"],
                phone=ct.get("phone"),
                company_id=companies[ct["company_idx"]].id,
                source=ct.get("source"),
                status=ct.get("status", "lead"),
                created_by=admin.id,
            )
            session.add(contact)
            await session.flush()
            contacts.append(contact)
            print(f"    Created contact: {ct['email']}")

    # ---- Pipeline + stages ----
    pipe_cfg = data["pipeline"]
    res = await session.execute(
        select(Pipeline).where(Pipeline.tenant_id == tid, Pipeline.name == pipe_cfg["name"])
    )
    pipeline = res.scalar_one_or_none()
    if pipeline:
        print(f"    Pipeline already exists: {pipe_cfg['name']}")
        stage_res = await session.execute(
            select(PipelineStage)
            .where(PipelineStage.pipeline_id == pipeline.id)
            .order_by(PipelineStage.order)
        )
        stages = list(stage_res.scalars().all())
    else:
        pipeline = Pipeline(tenant_id=tid, name=pipe_cfg["name"], is_default=True)
        session.add(pipeline)
        await session.flush()
        print(f"    Created pipeline: {pipe_cfg['name']}")
        stages = []
        for s in pipe_cfg["stages"]:
            stage = PipelineStage(
                pipeline_id=pipeline.id,
                name=s["name"],
                order=s["order"],
                stage_type=s["stage_type"],
                probability_pct=s["probability_pct"],
                color=s.get("color"),
            )
            session.add(stage)
            await session.flush()
            stages.append(stage)
            print(f"      Stage: {s['name']}")

    # ---- Deals ----
    deals = []
    for d in data["deals"]:
        res = await session.execute(
            select(Deal).where(Deal.tenant_id == tid, Deal.title == d["title"])
        )
        existing = res.scalar_one_or_none()
        if existing:
            deals.append(existing)
            print(f"    Deal already exists: {d['title']}")
        else:
            close_date = _days(d["days_to_close"]).date()
            deal = Deal(
                tenant_id=tid,
                title=d["title"],
                value=d["value"],
                currency="USD",
                pipeline_id=pipeline.id,
                stage_id=stages[d["stage_idx"]].id,
                contact_id=contacts[d["contact_idx"]].id,
                company_id=companies[d["company_idx"]].id,
                assigned_to=admin.id,
                probability=d["probability"],
                expected_close=close_date,
                status=d["status"],
                created_by=admin.id,
            )
            session.add(deal)
            await session.flush()
            deals.append(deal)
            print(f"    Created deal: {d['title']} (${d['value']:.0f})")

    # ---- Activities ----
    for a in data["activities"]:
        res = await session.execute(
            select(Activity).where(Activity.tenant_id == tid, Activity.subject == a["subject"])
        )
        if res.scalar_one_or_none():
            print(f"    Activity already exists: {a['subject']}")
            continue
        activity = Activity(
            tenant_id=tid,
            type=a["type"],
            subject=a["subject"],
            contact_id=contacts[a["contact_idx"]].id,
            deal_id=deals[a["deal_idx"]].id,
            performed_by=admin.id,
            completed_at=_days(-a["days_ago"]),
        )
        session.add(activity)
        await session.flush()
        print(f"    Created activity: [{a['type']}] {a['subject']}")

    # ---- Tasks ----
    for t in data["tasks"]:
        res = await session.execute(
            select(Task).where(Task.tenant_id == tid, Task.title == t["title"])
        )
        if res.scalar_one_or_none():
            print(f"    Task already exists: {t['title']}")
            continue
        task = Task(
            tenant_id=tid,
            title=t["title"],
            priority=t["priority"],
            deal_id=deals[t["deal_idx"]].id,
            contact_id=contacts[t["contact_idx"]].id,
            assigned_to=admin.id,
            due_date=_days(t["days_due"]),
            status=TaskStatus.OPEN,
            created_by=admin.id,
        )
        session.add(task)
        await session.flush()
        print(f"    Created task: {t['title']}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def seed(session: AsyncSession) -> None:
    for t in TENANTS:
        print(f"\n[{t['slug']}]")

        # Upsert tenant
        result = await session.execute(select(Tenant).where(Tenant.slug == t["slug"]))
        tenant = result.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(name=t["name"], slug=t["slug"])
            session.add(tenant)
            await session.flush()
            print(f"  Created tenant: {t['slug']}")
        else:
            print(f"  Tenant already exists: {t['slug']}")

        # Upsert admin user
        result = await session.execute(
            select(User).where(User.email == t["admin_email"], User.tenant_id == tenant.id)
        )
        admin = result.scalar_one_or_none()
        if not admin:
            password = os.environ.get(t["password_env"], t["default_password"])
            admin = User(
                email=t["admin_email"],
                username="admin",
                password_hash=hash_password(password),
                tenant_id=tenant.id,
                role="admin",
            )
            session.add(admin)
            await session.flush()
            print(f"  Created admin: {t['admin_email']}")
        else:
            print(f"  Admin already exists: {t['admin_email']}")

        await seed_tenant(session, t, tenant, admin)

    await session.commit()


async def main() -> None:
    print("Seeding CRM database...")
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        await seed(session)
    await engine.dispose()
    print("\nDone. Seeded: gigforge, techuni")
    print("\nCredentials:")
    for t in TENANTS:
        pw = os.environ.get(t["password_env"], t["default_password"])
        print(f"  {t['admin_email']} / {pw}")


if __name__ == "__main__":
    asyncio.run(main())
