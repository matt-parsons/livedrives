# Startup Scripts

## PM2

- the user `deploy_user` has pm2s
  - git repo [production] has an action that updates the live server
    - it starts/restarts a pm2 process
    - `pm2 start npm --name "localpaintpilot" -- run start --prefix "/var/www/localpaintpilot.com/public_html"`
- the user `root` has pm2s
  - weekly geo grid scheduler
    - `pm2 start npm --name geogrid-scheduler -- run scheduler:geogrid`
- CTR sessions
  - `pm2 start scheduler-db.js --name drives-db`
  - CTR automation runs the `runCTR` flow with Playwright (Chromium).

### CTR pause control

- The admin dashboard exposes a global pause toggle for CTR automation under **Operations → Today’s scheduled drives**.
- The paused state is stored on-disk at `CTR_PAUSE_PATH`/`CTR_PAUSE_FILE` (defaults to `ctr-pause-state.json` in the repo
  root) so the scheduler and dashboard share the same source of truth.

## Dashboard routes

- `GET /dashboard`, `/dashboard/optimization-steps`, `/dashboard/keywords`, `/dashboard/reviews`,
  `/dashboard/settings`, `/dashboard/runs/:runId`, and `/dashboard/ctr` resolve the active business from the session
  and accept `?bId=<businessId>` to view a specific business (useful for admins).
- `GET /dashboard/upgrade` shows pricing and checkout; Stripe redirects to `/dashboard/upgrade/success?session_id=...`
  to finalize the subscription sync.

## Keyword suggestion service

Onboarding now asks ChatGPT for the top three trackable keywords for a new business. Set the following environment
variable so the suggestions API can call OpenAI:

- `OPENAI_API_KEY` – required
- `OPENAI_MODEL` – optional model override (defaults to `gpt-4o-mini`)

## Google Business Profile OAuth

- `GOOGLE_BUSINESS_PROFILE_OAUTH_CLIENT_ID` – OAuth client ID for your Google Business Profile project.
- `GOOGLE_BUSINESS_PROFILE_OAUTH_CLIENT_SECRET` – Client secret used to exchange authorization codes.
- `GOOGLE_BUSINESS_PROFILE_OAUTH_REDIRECT_URI` – Must match the callback route (`/api/google-business-profile/oauth`).
- The new `GET /api/google-business-profile/oauth` route handles Google's redirect, exchanges the authorization code, stores the refresh/access tokens in the `gbp_authorizations` table, and redirects back to `/dashboard/<business-slug>/reviews`.
- Review data is now fetched via stored tokens (automatically refreshed when needed) so a single refresh token can serve each business instead of relying on a global env var.

## HighLevel CRM sync

- `HIGH_LEVEL_CLIENT_ID` – Client ID for the HighLevel API client.
- `HIGH_LEVEL_CLIENT_SECRET` – Client secret for the HighLevel API client.
- `HIGH_LEVEL_LOCATION_ID` – The HighLevel location identifier to store new trial contacts.
- Registrations attempt to create/update a contact tagged `account_trial` using the email/name collected during signup.
- Successful Stripe subscription syncs add a `subscription_<plan>` tag based on the Stripe product name (or price ID when name is unavailable).
- Subscription cancellations add a `subscription_canceled` tag.
- Trial logins that return 12+ hours after the trial starts upsert a `trial_engaged` tag.
- Trial expirations add a `trial_expired` tag the first time the expiration is detected.
- Business create/update requests also upsert the same contact with company/address/phone/website details when available.

## DataForSEO Google Posts (GBP updates)

- `POST /api/places/sidebar` (when `SIDEBAR_PROVIDER=dataforseo`) creates a DataForSEO posts task and returns `postsTaskId`/`postsPending` so pages can render without waiting for results.
- The dashboard polls `GET /api/places/posts-status/:taskId`; when complete it re-fetches `GET /api/optimization-data?forceRefresh=1` to store the latest post dates.
- If polling exceeds the timeout window, the dashboard requests a fresh posts task via `GET /api/optimization-data?resetPostsTask=1&forceRefresh=1` and stops polling after repeated timeouts.
- Optional: `DATAFORSEO_POSTS_TASK_TIMEOUT_MS` (default `2000`) to cap posts task network time per request.
