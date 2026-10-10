# Shopping interface production release — 9 October 2026

Published to https://picnic.devstef.nl with explicit owner approval.

- Worker: `picnic-production`
- New version: `e50cd869-db4b-4eb1-aabc-4b10425bade1`
- Previous version: `ed230882-c795-4c84-9970-6a6370502ff7`
- Built assets: `index-MUsAUpu2.js`, `index-DRSYWeFp.css`
- Root, `/picnic`, `/account`, and `/boodschappen/:recipeId` now use the approved shopping interface. Previous recipe detail URLs redirect to their shopping view. Administration remains accessible.
- Local preview fixture middleware is outside the repository and is absent from production bundles.
- Production bindings and existing variables preserved. No pending database migrations.

Validation: 387 tests in 41 files passed; frontend and Worker typechecks, changed-file lint, build, deployment dry-run passed. Live authenticated homepage, saved lists, Picnic connection status, and existing basket read successfully. No live products added during deployment verification; owner will test additions.

Deployment used `wrangler deploy --env production --keep-vars`. Existing local working changes were preserved; this release was deployed from the workspace, without creating a Git commit.
