# Task Manager

Task Manager supports both the original single-process server and a transitional
backend microservices setup. Both use the same PostgreSQL database and browser
application; the modular JavaScript files are not independently deployable
microfrontends.

## Architecture and ports

| Component | Port | Responsibility |
| --- | ---: | --- |
| Monolith (`npm start`) | 5000 | Existing all-in-one app and API fallback |
| Auth Service | 5001 | Registration, login, logout, current user and session creation |
| Task Service | 5002 | Authenticated task CRUD, with ownership checks |
| Admin Service | 5003 | Admin-only user and task management API |
| API Gateway | 5005 | Frontend hosting and routing to the backend services |
| PostgreSQL | host 5433 / container 5432 | Existing application data and PostgreSQL session table |

The gateway serves `/` and `/admin` with the existing HTML pages and proxies
`/auth`, `/tasks` and `/admin/api` to their respective services. It preserves
the request method, path, query string, body, response status and cookies;
client-supplied identity and forwarded-identity headers are not trusted. Its
upstream timeout is 10 seconds by default and can be changed with
`GATEWAY_REQUEST_TIMEOUT_MS`. Connection failures and timeouts return safe 502
and 504 JSON errors.

The browser uses native JavaScript modules: `public/js/api.js` centralizes
requests, `auth.js` and `tasks.js` provide API operations, `reminders.js`
encapsulates reminder scheduling/snooze state, and the page scripts handle
application and admin UI behavior. The relative API base is empty by default,
so requests go to whichever origin served the page (port 5000 for the monolith,
5005 for the gateway). To target a same-origin proxy prefix, set the
`api-base` meta element in the page or set `window.TASK_MANAGER_API_BASE`
before loading the page scripts. A separately deployed microfrontend system is
not implemented.

## Prerequisites and environment

- Node.js 20 or newer and npm.
- Docker Desktop with its Docker engine running for the Compose workflow, or
  an existing PostgreSQL server reachable at the configured host and port.
- A local `.env` file. If needed, copy `.env.example` to `.env`, then set a
  database password and a long, random `SESSION_SECRET`. Do not overwrite an
  existing `.env` or commit it. For an existing `postgres_data` volume,
  `DB_PASSWORD` must match that database's current password; changing Compose
  environment values does not change credentials already stored in the volume.

Relevant settings are `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`,
`DB_PORT`, and `SESSION_SECRET`. Set `DB_USER` and `DB_PASSWORD` to match the
existing PostgreSQL instance/volume. The Compose database listens on host port
5433; the services use port 5432 inside the Compose network. Service ports and
their gateway URLs can also be configured with `AUTH_SERVICE_PORT`,
`TASK_SERVICE_PORT`, `ADMIN_SERVICE_PORT`, `GATEWAY_PORT`,
`AUTH_SERVICE_URL`, `TASK_SERVICE_URL`, and `ADMIN_SERVICE_URL`. The Compose
file sets internal service URLs to Compose DNS names.

## Start the monolith

From PowerShell in the project directory:

```powershell
docker info
docker compose up -d postgres
npm ci
npm start
```

Open <http://localhost:5000>. The monolith retains its original port and remains
available when running the microservices setup.

## Start all services with Compose

First ensure `.env` contains the right database credentials and session secret.
Then run:

```powershell
docker info
docker compose up -d --build
docker compose ps
```

Open <http://localhost:5005>. Auth initializes the existing Sequelize schema
using the project's existing non-force sync and migration helper before the
task/admin services become healthy. The Compose setup reuses the named
`postgres_data` volume and does not reset or remove it. To stop services while
preserving data, run `docker compose down` (do not add `-v`).

For a host-based service run, start PostgreSQL with `docker compose up -d
postgres`, then run `npm run start:auth`, `npm run start:tasks`,
`npm run start:admin`, and `npm run start:gateway` in separate terminals, in
that order. Auth must finish starting first so it can prepare the schema.

## End-to-end check

After starting Compose, check `http://localhost:5005/api/health` returns a
successful gateway health response, then open <http://localhost:5005>. In the
browser, register/sign in, add a task, edit it, change its completion state,
filter the list, and refresh to verify the PostgreSQL-backed session and task
list persist. Set a due date/time and verify the due panel, browser alert
(after granting permission), sound (after a user gesture), and five-minute
snooze. Use a separate account to verify that it cannot see the first
account's tasks. To exercise the admin screen, `ADMIN_EMAIL` must match an
existing account during Auth Service startup; confirm a regular account is
denied by the admin API and that the promoted account can view `/admin`.

## API routes

- Auth Service: `GET /auth/me`, `POST /auth/register`, `POST /auth/login`,
  `POST /auth/logout`.
- Task Service: `GET /tasks`, `GET /tasks/:id`, `POST /tasks`,
  `PUT /tasks/:id`, `PATCH /tasks/:id`, `DELETE /tasks/:id`.
- Admin Service: `GET /admin/api/users`, `GET /admin/api/users/:id`,
  `POST /admin/api/users`, `PUT /admin/api/users/:id`,
  `PATCH /admin/api/users/:id`, `DELETE /admin/api/users/:id`.
- Gateway health: `GET /api/health`.

The monolith also retains its existing `/api/users` admin API alias; the
microservices gateway uses `/admin/api/users`.

Every service that reads sessions must use the same `SESSION_SECRET` and
PostgreSQL session table. Authenticated task endpoints resolve the user from
the PostgreSQL-backed session and scope every task lookup/update/delete to that
user. Admin endpoints require an authenticated administrator. The gateway
strips identity headers; it does not create an alternate identity mechanism.

## Shared database and session limitations

This is a transitional decomposition, not database-per-service isolation:
Auth, Task and Admin each use the existing PostgreSQL database and Sequelize
models. This avoids copying or migrating existing user/task data, but couples
service availability and deployment to the same database and schema. Each
service can access the shared tables, so database-level ownership boundaries
are not enforced independently. The PostgreSQL-backed session table and
identical session secret allow the services to validate the same browser
session; they also make session availability and secret rotation shared
operational concerns. A later independent-service design would need explicit
data ownership and session/token integration decisions.

## Tests

Run the automated suite with `npm test`. The gateway tests use a mocked
`fetch` upstream to verify routing, path/query/body forwarding, cookies,
timeouts and unavailable upstreams; they are not live-service integration
tests. Session/auth/ownership unit tests exercise middleware with mocked
models. Live end-to-end testing requires a running PostgreSQL instance and
services; the project does not reset test databases or user/task data.
