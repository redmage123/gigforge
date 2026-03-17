from fastapi import APIRouter, Request
from pydantic import BaseModel
from services.ai_wizard import get_wizard_guidance, get_personalized_recommendations
from services.user_data import load_user_data, save_user_data

router = APIRouter()

class WizardStepRequest(BaseModel):
    step: str
    answer: str = ""
    level: str = ""
    interests: list[str] = []
    holdings: str = ""
    risk: str = "moderate"
    completed_steps: list[str] = []

class WizardCompleteRequest(BaseModel):
    experience: str
    interests: list[str]

@router.post("/step")
async def wizard_step(req: WizardStepRequest, request: Request):
    username = request.state.user.get("sub", "")
    user_input = req.model_dump()
    guidance = await get_wizard_guidance(req.step, user_input)
    return {"guidance": guidance, "step": req.step}

@router.post("/recommendations")
async def recommendations(req: WizardCompleteRequest, request: Request):
    recs = await get_personalized_recommendations(req.experience, req.interests)
    return {"recommendations": recs}

@router.get("/status")
async def wizard_status(request: Request):
    username = request.state.user.get("sub", "")
    data = load_user_data(username, "wizard_status")
    return data if data else {"completed": False, "current_step": "welcome"}

@router.post("/complete")
async def complete_wizard(request: Request):
    username = request.state.user.get("sub", "")
    save_user_data(username, "wizard_status", {"completed": True, "current_step": "done"})
    return {"status": "completed"}

@router.post("/skip")
async def skip_wizard(request: Request):
    username = request.state.user.get("sub", "")
    save_user_data(username, "wizard_status", {"completed": True, "current_step": "skipped"})
    return {"status": "skipped"}
