# Saved service locations — source implementation, deployment pending

## Delivered
- Mobile customer screen selects a saved customer, loads their addresses, and creates an address with optional access preferences.
- GET and POST /v1/locations require verified authentication and business membership.
- Owners/admins may create locations; workers may read.
- Every customer lookup, location read, and insertion is scoped to the requested business and customer.
- The insert rechecks customer ownership in the same SQL statement. Coordinates remain unknown; no geocoding provider is called.
- Field limits are enforced in the client and Worker. The Worker bounds incoming JSON to 8192 bytes.
- The UI prevents repeated in-flight saves and discards superseded address-loading responses.
- Lists disclose when the first 200 records are only partial coverage.

## Verification and limits
Automated endpoint tests cover authentication gates, role restrictions, cross-business customer rejection, successful ownership-bound insertion, malformed input, and storage failure. Client/domain tests cover validation and request shape.
CI and real-device results must be recorded in the PR. A passing mock test does not verify deployed JWT configuration or D1 schema.
No deployment, migration, real customer data, geocoding, location editing or deletion is included.

## Next
Create recurring service agreements using these stable customer/location IDs, then connect the saved setup to the daily queue. Reconcile the live D1 schema and complete authenticated device tests before production use.
