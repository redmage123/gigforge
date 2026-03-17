"""Replace is_won/is_lost booleans with stage_type enum on pipeline_stages.

stage_type values: active | won | lost
Exactly one won and one lost stage is enforced at the application layer.

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add stage_type with a temporary default so existing rows get a value
    op.add_column(
        "pipeline_stages",
        sa.Column(
            "stage_type",
            sa.String(10),
            nullable=False,
            server_default="active",
        ),
    )

    # Backfill from the old boolean columns
    op.execute(
        """
        UPDATE pipeline_stages
        SET stage_type = CASE
            WHEN is_won  THEN 'won'
            WHEN is_lost THEN 'lost'
            ELSE 'active'
        END
        """
    )

    # Remove the server default now that all rows have real values
    op.alter_column("pipeline_stages", "stage_type", server_default=None)

    # Add index to support fast lookups by type (e.g., "find the won stage")
    op.create_index(
        "ix_pipeline_stages_stage_type", "pipeline_stages", ["stage_type"]
    )

    # Drop the now-redundant boolean columns
    op.drop_column("pipeline_stages", "is_won")
    op.drop_column("pipeline_stages", "is_lost")


def downgrade() -> None:
    # Restore boolean columns
    op.add_column(
        "pipeline_stages",
        sa.Column(
            "is_won",
            sa.Boolean,
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "pipeline_stages",
        sa.Column(
            "is_lost",
            sa.Boolean,
            nullable=False,
            server_default="false",
        ),
    )

    # Backfill booleans from stage_type
    op.execute(
        """
        UPDATE pipeline_stages
        SET
            is_won  = (stage_type = 'won'),
            is_lost = (stage_type = 'lost')
        """
    )

    # Remove server defaults
    op.alter_column("pipeline_stages", "is_won", server_default=None)
    op.alter_column("pipeline_stages", "is_lost", server_default=None)

    # Drop stage_type and its index
    op.drop_index("ix_pipeline_stages_stage_type", table_name="pipeline_stages")
    op.drop_column("pipeline_stages", "stage_type")
