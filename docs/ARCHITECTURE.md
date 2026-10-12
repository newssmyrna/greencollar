# Proposed Engineering Architecture

**Status:** design proposal, not an implemented system.

## Client
- Expo + React Native + TypeScript mobile app for iOS and Android.
- Responsive web/customer portal for invoices, upcoming visits and service requests.

## Backend
- Supabase Auth, PostgreSQL, tenant-based access controls, object storage for images.
- Server-side functions/background jobs for reminders, route planning, invoicing and webhooks.
- Dedicated scheduling service with constraint validation, historical job-duration estimation, routing-provider travel matrix, operator approval and day-of replanning.

## External services
- Road-based routing/optimization API; measure costs, quotas and feasibility first.
- Consent-based outbound SMS; registration, opt-outs, logs and delivery statuses required.
- Hosted invoicing and card payments; never store payment-card details.
- Native permission-aware GPS/geofencing; manual start/stop/edit is mandatory.

## Initial data entities
businesses, users, memberships, customers, service_locations, service_types, service_contracts, recurrence_rules, customer_preferences, customer_contacts, jobs, route_plans, route_stops, job_events, time_entries, vehicles, equipment, fuel_prices, invoices, payment_events, messages, consents, photos, duration_predictions, audit_events.

All business data scoped by tenant. No work/employer data, secrets, or real customer data in development fixtures.

## Critical behavior
- GPS events may be late or inaccurate: do not silently bill or send customer messages solely on a location event.
- Weather, seasonality, crew composition and equipment can affect actual duration; start with transparent statistical estimates.
- Offline events queued with recoverable, auditable sync.
- Cost model includes API traffic, SMS, payment fees, push delivery, storage, and support.
