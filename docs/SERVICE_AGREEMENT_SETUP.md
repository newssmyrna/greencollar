# Recurring service setup — source implementation, deployment pending

## Flow
Select a saved customer and service address. Enter a service name, agreed USD price per visit, whole estimated minutes, start/end calendar dates and daily, weekly, biweekly, monthly or custom-day recurrence.
The app lists saved agreements, previews scheduled occurrences for the entered start date, and refreshes the saved workday after creation.
A successful save remains successful when the workday follow-up read fails; the UI asks for a separate queue refresh.

## API
GET/POST /v1/agreements?business_id=…&customer_id=… use verified identity and tenant membership.
Owners/admins create; workers read. The selected address must match the business and customer, including inside the SQL insertion predicate.
Lists disclose partial results. Calendar dates, integer cents, duration and recurrence are validated in both client and Worker. Request bodies use the shared bounded JSON reader.

## Scope
Create and list only. Existing agreements, completed visits and invoice records are not edited.
Schedule/price editing requires an effective-date/history design and completed-visit price snapshots to prevent rewriting historical billing.
Time-window, fixed-appointment and weekday-set fields remain supported in existing records; this form creates start-date-aligned schedules with those optional constraints unset.
These are scheduled occurrence previews; the actual Today queue applies completed/skipped history. Neither view claims road optimization.

## Acceptance
CI must pass app/Worker typechecks and tests. Test exact customer/location tenant relationships, invalid dates/amounts, custom recurrence, role restrictions, and compatibility with the existing daily summary.
Run the exact SQL against SQLite and record the outcome in the PR. Live D1 schema reconciliation, authenticated JWT deployment, device operation and production persistence remain pending.
Next: protect historical service pricing before agreement editing, then complete authenticated staging end-to-end setup → due queue → completion → invoice.
