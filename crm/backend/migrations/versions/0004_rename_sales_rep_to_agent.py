"""Rename UserRole.SALES_REP to UserRole.AGENT in users table.

BLK-001: SRS v2.0 requires 'agent' role value; 'sales_rep' was the original
sprint-0 placeholder. Any pre-existing rows with role='sales_rep' are
backfilled to 'agent'. The application-layer enum has already been updated
in models/user.py.

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-16
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET role = 'agent' WHERE role = 'sales_rep'")


def downgrade() -> None:
    op.execute("UPDATE users SET role = 'sales_rep' WHERE role = 'agent'")
