# Runbook: Database Restore (Point-in-Time Recovery)

## Overview
Nexus uses Supabase Cloud for backups. This runbook describes how to restore the database to a previous state.

## Automatic Backups
Supabase performs daily backups and stores WAL logs for Point-in-Time Recovery (PITR).

## Steps to Restore
1. **Access Dashboard**: Go to the Supabase Dashboard for the project.
2. **Settings**: Navigate to Database -> Backups.
3. **Select Point**: Choose "Point-in-Time Recovery".
4. **Target Time**: Select the specific timestamp (UTC) you wish to restore to.
5. **Verification**: After restore, verify that the `agents` and `user_roles` tables are consistent.
6. **Sync**: Force a logout for all users if necessary to ensure session consistency with restored data.

## Post-Restore Checklist
- [ ] Verify RLS policies are active.
- [ ] Check Edge Function connectivity.
- [ ] Validate Bitrix24 webhook registration.
