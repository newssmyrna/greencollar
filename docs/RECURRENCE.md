# Recurring service scheduling foundation

Implemented: pure TypeScript recurrence generation for daily, weekly, biweekly, monthly, custom day intervals. It supports start/end dates, preferred windows, fixed times, inactive services and test fixtures.

**Important:** This creates due-visit candidates, **not** a full optimized road itinerary. Due visits can be converted to ServiceJob inputs and given to the current baseline planner; true optimization requires a road travel matrix and a more capable solver.

- ISO calendar dates represent the customer's local day; all comparisons use UTC calendar arithmetic to avoid DST shifting dates.
- Monthly service starting on the 31st falls on the last day of shorter months.
- An agreement yields one idempotent visit ID per due date.
- Predictive durations will eventually override configured estimates when observations are sufficiently reliable.
- The planned `0003_service_agreements.sql` migration is committed but **not deployed** until Clerk auth and per-business authorization are tested.

## Next

1. Verify Expo and Cloudflare tests green.
2. Authenticate sign-up and business owner provisioning.
3. Add customer and agreement CRUD through the API and connect to mobile app.
4. Materialize due visits idempotently then optimize daily work by actual road travel.

## Service workload preview

The Planner tab now checks the synthetic example jobs against the entered hours and job-count limit. It reports service-minute overage and how many example jobs fall outside the cap. This is a sample workload indicator only: travel, breaks, fixed appointments, customer windows, and fuel are not modeled, and it does not change the saved queue or claim route feasibility.
