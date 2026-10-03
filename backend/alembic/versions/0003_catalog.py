"""catalog — matolar, ranglar, gullar, SKU va tavsiya narx tarixi (docs/05-baza-sxemasi.md, 2-bo'lim).

fabrics, colors, patterns, skus, sku_price_history. Kodlar o'z turi ichida noyob (katta-kichik harf
farqsiz); har biznesda bitta "gulsiz" gul; SKU = mato + rang + gul — biznes ichida noyob.
Ilova roli hech narsani o'chira olmaydi; narx tarixini faqat qo'shadi va o'qiydi.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-02 12:32:03.345093
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.rls import enable_tenant_rls

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _create_tables()
    # --- Row-Level Security: har jadvalda faqat o'z biznesi ---
    for table in ("fabrics", "colors", "patterns", "skus"):
        enable_tenant_rls(table, grant="SELECT, INSERT, UPDATE")
    enable_tenant_rls("sku_price_history", grant="SELECT, INSERT")


def _create_tables() -> None:
    # --- Jadvallar (modellardan generatsiya qilingan) ---
    op.create_table('fabrics',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('code', sa.Text(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('width_cm', sa.Integer(), nullable=True),
    sa.Column('composition', sa.Text(), nullable=True),
    sa.Column('image_url', sa.Text(), nullable=True),
    sa.Column('default_m_per_kg', sa.Numeric(precision=10, scale=4), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('default_m_per_kg > 0', name=op.f('ck_fabrics_default_m_per_kg')),
    sa.CheckConstraint('width_cm > 0', name=op.f('ck_fabrics_width_cm')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_fabrics_business_id_businesses')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_fabrics'))
    )
    op.create_index('uq_fabrics_business_id_code', 'fabrics', ['business_id', sa.literal_column('lower(code)')], unique=True)
    op.create_table('colors',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('fabric_id', sa.BigInteger(), nullable=True),
    sa.Column('code', sa.Text(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('hex', sa.Text(), nullable=True),
    sa.Column('image_url', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("hex ~ '^#[0-9a-f]{6}$'", name=op.f('ck_colors_hex')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_colors_business_id_businesses')),
    sa.ForeignKeyConstraint(['fabric_id'], ['fabrics.id'], name=op.f('fk_colors_fabric_id_fabrics')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_colors'))
    )
    op.create_index('uq_colors_business_id_fabric_id_code', 'colors', ['business_id', 'fabric_id', sa.literal_column('lower(code)')], unique=True, postgresql_nulls_not_distinct=True)
    op.create_table('patterns',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('fabric_id', sa.BigInteger(), nullable=True),
    sa.Column('code', sa.Text(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('image_url', sa.Text(), nullable=True),
    sa.Column('is_plain', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_patterns_business_id_businesses')),
    sa.ForeignKeyConstraint(['fabric_id'], ['fabrics.id'], name=op.f('fk_patterns_fabric_id_fabrics')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_patterns'))
    )
    op.create_index('uq_patterns_business_id_fabric_id_code', 'patterns', ['business_id', 'fabric_id', sa.literal_column('lower(code)')], unique=True, postgresql_nulls_not_distinct=True)
    op.create_index('uq_patterns_business_id_plain', 'patterns', ['business_id'], unique=True, postgresql_where=sa.text('is_plain'))
    op.create_table('skus',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('fabric_id', sa.BigInteger(), nullable=False),
    sa.Column('color_id', sa.BigInteger(), nullable=False),
    sa.Column('pattern_id', sa.BigInteger(), nullable=False),
    sa.Column('price', sa.BigInteger(), nullable=True),
    sa.Column('price_unit', sa.Text(), server_default='m', nullable=False),
    sa.Column('low_stock_threshold', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("price_unit IN ('m', 'kg')", name=op.f('ck_skus_price_unit')),
    sa.CheckConstraint('low_stock_threshold > 0', name=op.f('ck_skus_low_stock_threshold')),
    sa.CheckConstraint('price > 0', name=op.f('ck_skus_price')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_skus_business_id_businesses')),
    sa.ForeignKeyConstraint(['color_id'], ['colors.id'], name=op.f('fk_skus_color_id_colors')),
    sa.ForeignKeyConstraint(['fabric_id'], ['fabrics.id'], name=op.f('fk_skus_fabric_id_fabrics')),
    sa.ForeignKeyConstraint(['pattern_id'], ['patterns.id'], name=op.f('fk_skus_pattern_id_patterns')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_skus')),
    sa.UniqueConstraint('business_id', 'fabric_id', 'color_id', 'pattern_id', name=op.f('uq_skus_business_id_fabric_id_color_id_pattern_id'))
    )
    op.create_index('ix_skus_color_id', 'skus', ['color_id'], unique=False)
    op.create_index('ix_skus_pattern_id', 'skus', ['pattern_id'], unique=False)
    op.create_table('sku_price_history',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('sku_id', sa.BigInteger(), nullable=False),
    sa.Column('old_price', sa.BigInteger(), nullable=True),
    sa.Column('old_price_unit', sa.Text(), nullable=True),
    sa.Column('new_price', sa.BigInteger(), nullable=True),
    sa.Column('price_unit', sa.Text(), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_sku_price_history_business_id_businesses')),
    sa.ForeignKeyConstraint(['sku_id'], ['skus.id'], name=op.f('fk_sku_price_history_sku_id_skus')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_sku_price_history_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sku_price_history'))
    )
    op.create_index('ix_sku_price_history_sku_id_created_at', 'sku_price_history', ['sku_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_sku_price_history_sku_id_created_at', table_name='sku_price_history')
    op.drop_table('sku_price_history')
    op.drop_index('ix_skus_pattern_id', table_name='skus')
    op.drop_index('ix_skus_color_id', table_name='skus')
    op.drop_table('skus')
    op.drop_index('uq_patterns_business_id_plain', table_name='patterns', postgresql_where=sa.text('is_plain'))
    op.drop_index('uq_patterns_business_id_fabric_id_code', table_name='patterns', postgresql_nulls_not_distinct=True)
    op.drop_table('patterns')
    op.drop_index('uq_colors_business_id_fabric_id_code', table_name='colors', postgresql_nulls_not_distinct=True)
    op.drop_table('colors')
    op.drop_index('uq_fabrics_business_id_code', table_name='fabrics')
    op.drop_table('fabrics')
