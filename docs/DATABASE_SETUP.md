# Database setup and validation

Migration `supabase/migrations/0001_core.sql` has been updated to constrain cross-tenant references and separate owner/admin rights from worker rights, but **is not deployed or security-certified**.

## Before connecting any real customer data

1. Create a dedicated Supabase staging project. Never commit project secrets or service-role keys.
2. Apply the migration to a fresh staging database.
3. Provision businesses and initial memberships atomically using a reviewed server-side onboarding path.
4. Test authenticated users from two different businesses. Reject cross-tenant reads/writes and foreign-key references, including customer/location mismatches inside the same tenant.
5. Test owner, admin, worker and unauthenticated access independently.
6. Verify no direct client route can change membership roles, create a new owner, or bypass the business creation flow.
7. Inspect function grants/security-definer ownership, profile information access, public schema grants and storage bucket policies.
8. Exercise concurrent changes and deletion workflows; customer deletion with associated jobs currently requires an explicit retention decision.
9. Add a tested rollback/backups plan.

## Status

Schema drafted in GitHub; Supabase project connection and integration tests are **not yet completed**. No real customer data should be added before these checks pass.
