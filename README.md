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

### CTR pause control

- The admin dashboard exposes a global pause toggle for CTR automation under **Operations → Today’s scheduled drives**.
- The paused state is stored on-disk at `CTR_PAUSE_PATH`/`CTR_PAUSE_FILE` (defaults to `ctr-pause-state.json` in the repo
  root) so the scheduler and dashboard share the same source of truth.

## Keyword suggestion service

Onboarding now asks ChatGPT for the top three trackable keywords for a new business. Set the following environment
variable so the suggestions API can call OpenAI:

- `OPENAI_API_KEY` – required
- `OPENAI_MODEL` – optional model override (defaults to `gpt-4o-mini`)
