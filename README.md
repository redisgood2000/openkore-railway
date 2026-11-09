# OpenKore Railway Manager

Separate Railway services for an authenticated web control API and an isolated OpenKore worker.

## Services
- `apps/api`: admin dashboard + authenticated API + WebSocket terminal relay.
- `apps/worker`: private control endpoint; starts/stops OpenKore as a child process.

## Railway setup
Deploy this repository twice:
1. API service root directory: `/apps/api`
2. Worker service root directory: `/apps/worker`

Set API variables: `ADMIN_TOKEN` (long random secret), `WORKER_URL` (private worker URL), `WORKER_TOKEN` (same secret configured on worker).
Set worker variables: `WORKER_TOKEN`, `OPENKORE_DIR` (default /opt/openkore), optional `OPENKORE_ARGS`.

Attach a persistent volume to worker at `/data`; store OpenKore config under `/data/control`. Configure the bot only for a server you own or are authorized to test.

**Security:** keep the worker private; never expose its domain publicly. Use HTTPS for the API. The manager does not provide arbitrary shell access.
