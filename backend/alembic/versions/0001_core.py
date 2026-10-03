"""core — platforma va kirish jadvallari (docs/05-baza-sxemasi.md, 1-bo'lim) + locations.

businesses, users, locations, user_locations, devices, sessions, recovery_codes,
business_status_events, audit_logs, counters; ilova roli, RLS siyosatlari, jurnal himoyasi.

Revision ID: 0001
Revises:
Create Date: 2026-10-02 10:20:49.398160
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.rls import enable_tenant_rls, ensure_app_role

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- Ilova roli va umumiy funksiyalar ---
    ensure_app_role()
    # Joriy biznes: har tranzaksiya boshida set_config('app.business_id', ...) bilan o'rnatiladi.
    # O'rnatilmagan bo'lsa NULL — RLS hech qaysi qatorni ko'rsatmaydi.
    op.execute(
        "CREATE FUNCTION app_business_id() RETURNS bigint LANGUAGE sql STABLE AS "
        "$$ SELECT CAST(NULLIF(current_setting('app.business_id', true), '') AS bigint) $$"
    )
    op.execute(
        "CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$ "
        "BEGIN RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME "
        "USING ERRCODE = 'restrict_violation'; END $$"
    )

    # --- Jadvallar (modellardan generatsiya qilingan) ---
    op.create_table('businesses',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('status', sa.Text(), server_default='active', nullable=False),
    sa.Column('sell_by_kg', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('credit_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('credit_days', sa.Integer(), server_default='30', nullable=False),
    sa.Column('low_stock_default', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('price_rounding', sa.Integer(), server_default='1000', nullable=False),
    sa.Column('autolock_minutes', sa.Integer(), server_default='30', nullable=False),
    sa.Column('daily_summary_time', sa.Time(), server_default=sa.text("'21:00'"), nullable=False),
    sa.Column('timezone', sa.Text(), server_default='Asia/Tashkent', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_activity_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("status IN ('active', 'blocked')", name=op.f('ck_businesses_status')),
    sa.CheckConstraint('autolock_minutes > 0', name=op.f('ck_businesses_autolock_minutes')),
    sa.CheckConstraint('credit_days > 0', name=op.f('ck_businesses_credit_days')),
    sa.CheckConstraint('price_rounding IN (1, 100, 1000)', name=op.f('ck_businesses_price_rounding')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_businesses'))
    )
    op.create_table('counters',
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('value', sa.BigInteger(), server_default='0', nullable=False),
    sa.CheckConstraint("name IN ('batch', 'sale', 'transfer', 'receipt')", name=op.f('ck_counters_name')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_counters_business_id_businesses')),
    sa.PrimaryKeyConstraint('business_id', 'name', name=op.f('pk_counters'))
    )
    op.create_table('locations',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('type', sa.Text(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('address', sa.Text(), nullable=True),
    sa.Column('phone', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("type IN ('store', 'warehouse')", name=op.f('ck_locations_type')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_locations_business_id_businesses')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_locations'))
    )
    op.create_index('ix_locations_business_id_type', 'locations', ['business_id', 'type'], unique=False)
    op.create_table('users',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=True),
    sa.Column('full_name', sa.Text(), nullable=False),
    sa.Column('phone', sa.Text(), nullable=True),
    sa.Column('password_hash', sa.Text(), nullable=True),
    sa.Column('pin_lookup', sa.Text(), nullable=True),
    sa.Column('role', sa.Text(), nullable=False),
    sa.Column('is_primary_owner', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('all_locations', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('totp_secret', sa.Text(), nullable=True),
    sa.Column('language', sa.Text(), server_default='uz', nullable=False),
    sa.Column('must_change_password', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("(role = 'platform_owner') = (business_id IS NULL)", name=op.f('ck_users_business_by_role')),
    sa.CheckConstraint("language IN ('uz', 'en', 'ru')", name=op.f('ck_users_language')),
    sa.CheckConstraint("role IN ('platform_owner', 'owner', 'warehouse', 'seller')", name=op.f('ck_users_role')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_users_business_id_businesses')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users'))
    )
    op.create_index('ix_users_business_id_role', 'users', ['business_id', 'role'], unique=False)
    op.create_index('uq_users_business_id_pin_lookup', 'users', ['business_id', 'pin_lookup'], unique=True, postgresql_where=sa.text("role = 'seller' AND is_active"))
    op.create_index('uq_users_phone', 'users', ['phone'], unique=True, postgresql_where=sa.text('phone IS NOT NULL'))
    op.create_index('uq_users_primary_owner', 'users', ['business_id'], unique=True, postgresql_where=sa.text('is_primary_owner'))
    op.create_table('audit_logs',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=True),
    sa.Column('location_id', sa.BigInteger(), nullable=True),
    sa.Column('category', sa.Text(), nullable=False),
    sa.Column('event_code', sa.Text(), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("category IN ('login', 'sale', 'stock', 'price', 'credit', 'staff')", name=op.f('ck_audit_logs_category')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_audit_logs_business_id_businesses')),
    sa.ForeignKeyConstraint(['location_id'], ['locations.id'], name=op.f('fk_audit_logs_location_id_locations')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_audit_logs_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_logs'))
    )
    op.create_index('ix_audit_logs_business_id_category_created_at', 'audit_logs', ['business_id', 'category', 'created_at'], unique=False)
    op.create_index('ix_audit_logs_business_id_created_at', 'audit_logs', ['business_id', 'created_at'], unique=False)
    op.create_index('ix_audit_logs_business_id_user_id_created_at', 'audit_logs', ['business_id', 'user_id', 'created_at'], unique=False)
    op.create_table('business_status_events',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('action', sa.Text(), nullable=False),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("action IN ('block', 'unblock', 'owner_change')", name=op.f('ck_business_status_events_action')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_business_status_events_business_id_businesses')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_business_status_events_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_business_status_events'))
    )
    op.create_index('ix_business_status_events_business_id', 'business_status_events', ['business_id', 'created_at'], unique=False)
    op.create_table('devices',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('store_id', sa.BigInteger(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('token_hash', sa.Text(), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_devices_business_id_businesses')),
    sa.ForeignKeyConstraint(['store_id'], ['locations.id'], name=op.f('fk_devices_store_id_locations')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_devices'))
    )
    op.create_index('ix_devices_business_id_store_id', 'devices', ['business_id', 'store_id'], unique=False)
    op.create_index('uq_devices_token_hash', 'devices', ['token_hash'], unique=True)
    op.create_table('recovery_codes',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('code_hash', sa.Text(), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_recovery_codes_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recovery_codes'))
    )
    op.create_index('ix_recovery_codes_user_id', 'recovery_codes', ['user_id'], unique=False)
    op.create_table('user_locations',
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('location_id', sa.BigInteger(), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_user_locations_business_id_businesses')),
    sa.ForeignKeyConstraint(['location_id'], ['locations.id'], name=op.f('fk_user_locations_location_id_locations')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_user_locations_user_id_users')),
    sa.PrimaryKeyConstraint('user_id', 'location_id', name=op.f('pk_user_locations'))
    )
    op.create_index('ix_user_locations_location_id', 'user_locations', ['location_id'], unique=False)
    op.create_table('sessions',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=True),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('device_id', sa.BigInteger(), nullable=True),
    sa.Column('refresh_token_hash', sa.Text(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_sessions_business_id_businesses')),
    sa.ForeignKeyConstraint(['device_id'], ['devices.id'], name=op.f('fk_sessions_device_id_devices')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_sessions_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sessions'))
    )
    op.create_index('ix_sessions_device_id', 'sessions', ['device_id'], unique=False, postgresql_where=sa.text('device_id IS NOT NULL'))
    op.create_index('ix_sessions_user_id_active', 'sessions', ['user_id'], unique=False, postgresql_where=sa.text('revoked_at IS NULL'))
    op.create_index('uq_sessions_refresh_token_hash', 'sessions', ['refresh_token_hash'], unique=True)
    # ### end Alembic commands ###

    # --- Row-Level Security: ilova roli faqat joriy biznes qatorlarini ko'radi ---
    # Biznes o'z holatini (bloklangan/faol) va nomini o'zgartira olmaydi — faqat sozlamalarni.
    enable_tenant_rls(
        "businesses",
        column="id",
        grant="SELECT, UPDATE (sell_by_kg, credit_enabled, credit_days, low_stock_default, "
        "price_rounding, autolock_minutes, daily_summary_time, last_activity_at)",
    )
    enable_tenant_rls("users", grant="SELECT, INSERT, UPDATE")
    enable_tenant_rls("locations", grant="SELECT, INSERT, UPDATE")
    # Yagona DELETE: xodimning joylar ro'yxati almashtirilganda eski bog'lanishlar olib tashlanadi
    enable_tenant_rls("user_locations", grant="SELECT, INSERT, DELETE")
    enable_tenant_rls("devices", grant="SELECT, INSERT, UPDATE")
    enable_tenant_rls("sessions", grant="SELECT, INSERT, UPDATE")
    enable_tenant_rls("audit_logs", grant="SELECT, INSERT")
    enable_tenant_rls("counters", grant="SELECT, INSERT, UPDATE")
    # business_status_events va recovery_codes — faqat platforma egasi uchun: ilova roliga huquq berilmaydi.

    # --- Jurnal o'zgarmas: yangilash, o'chirish va tozalash hech kimga mumkin emas ---
    op.execute(
        "CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs "
        "FOR EACH ROW EXECUTE FUNCTION forbid_change()"
    )
    op.execute(
        "CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs "
        "FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()"
    )


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index('uq_sessions_refresh_token_hash', table_name='sessions')
    op.drop_index('ix_sessions_user_id_active', table_name='sessions', postgresql_where=sa.text('revoked_at IS NULL'))
    op.drop_index('ix_sessions_device_id', table_name='sessions', postgresql_where=sa.text('device_id IS NOT NULL'))
    op.drop_table('sessions')
    op.drop_index('ix_user_locations_location_id', table_name='user_locations')
    op.drop_table('user_locations')
    op.drop_index('ix_recovery_codes_user_id', table_name='recovery_codes')
    op.drop_table('recovery_codes')
    op.drop_index('uq_devices_token_hash', table_name='devices')
    op.drop_index('ix_devices_business_id_store_id', table_name='devices')
    op.drop_table('devices')
    op.drop_index('ix_business_status_events_business_id', table_name='business_status_events')
    op.drop_table('business_status_events')
    op.drop_index('ix_audit_logs_business_id_user_id_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_logs_business_id_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_logs_business_id_category_created_at', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index('uq_users_primary_owner', table_name='users', postgresql_where=sa.text('is_primary_owner'))
    op.drop_index('uq_users_phone', table_name='users', postgresql_where=sa.text('phone IS NOT NULL'))
    op.drop_index('uq_users_business_id_pin_lookup', table_name='users', postgresql_where=sa.text("role = 'seller' AND is_active"))
    op.drop_index('ix_users_business_id_role', table_name='users')
    op.drop_table('users')
    op.drop_index('ix_locations_business_id_type', table_name='locations')
    op.drop_table('locations')
    op.drop_table('counters')
    op.drop_table('businesses')
    # ### end Alembic commands ###
    op.execute("DROP FUNCTION forbid_change()")
    op.execute("DROP FUNCTION app_business_id()")
    # Ilova roli qoldiriladi — u butun server uchun umumiy.
