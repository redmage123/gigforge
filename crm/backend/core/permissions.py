"""RBAC dependency factory."""
from fastapi import Depends, HTTPException, status

from core.dependencies import get_current_user
from models import User


def require_role(*roles: str):
    """Dependency factory: Depends(require_role('admin', 'manager'))"""
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return checker
