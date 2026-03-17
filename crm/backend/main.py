"""CRM Platform — FastAPI entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import (
    activities, auth, companies, contacts,
    dashboard, deals, notes, pipelines, search, tags, tasks, webhooks,
)

app = FastAPI(
    title="CRM Platform API",
    version="0.1.0",
    description="Multi-tenant CRM backend — GigForge / TechUni",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
app.include_router(companies.router, prefix="/companies", tags=["companies"])
app.include_router(tags.router, prefix="/tags", tags=["tags"])
app.include_router(pipelines.router)
app.include_router(deals.router)
app.include_router(activities.router)
app.include_router(tasks.router)
app.include_router(dashboard.router)
app.include_router(notes.router)
app.include_router(search.router)
app.include_router(webhooks.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/")
async def root():
    return {"message": "CRM Platform API", "docs": "/docs"}
