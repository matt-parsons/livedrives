# Utility Scripts

## Run a Live Session
- `node scripts/run-business.js <businessId>`
  - Loads the business config from the database and hands it to `index.js`.
  - Accepts `BUSINESS_ID` env var when you prefer not to pass an argument.

Other helpful runners:
- `node scripts/manual-rank-session.js <businessId|config>` to dry-run CTR without the drive stage.
- `node scripts/test-get-profile-rank.js --business=<id>` to inspect profile ranks.

