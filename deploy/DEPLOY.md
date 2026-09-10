# Facilitation frontend — Deployment (facilitation.foxugly.com)

Angular SPA served statically by nginx at `facilitation.foxugly.com`; it calls the API at
`facilitation-api.foxugly.com` cross-origin and opens a WebSocket to `wss://facilitation-api.foxugly.com/ws/`.

**Model = S3-bundle + OIDC→SSM** (like tm-frontend / quizonline). CI builds the SPA →
tarball → S3 (`foxugly-deploy/builds/facilitation-frontend/`), then root on the box installs the
nginx vhost / runtime-fetch unit / fetch script **from the committed git blob**, pulls the
bundle from S3 via the instance role, runs the runtime-fetch (writes the SSM snippet), and
reloads nginx. Runtime config is injected into `index.html` as `window.__FACILITATION__` (read by
`core/runtime-config.ts`).

## Off-box prerequisites (admin, via CloudShell)

1. **SSM** `/facilitation-frontend/prod/*` (all String): `API_BASE_URL=https://facilitation-api.foxugly.com`,
   `SENTRY_DSN=<frontend DSN>`, `SENTRY_ENV=production`, `SENTRY_RELEASE=`. Grant the instance
   role `foxugly-fleet-ec2` `ssm:GetParametersByPath` on `/facilitation-frontend/prod` (+ `/*`).
2. **OIDC role** `facilitation-frontend-deploy`: trust pinned to
   `repo:Foxugly/Facilitation_frontend:environment:production`; perms `ssm:SendCommand` on the
   instance + `AWS-RunShellScript`, `ssm:GetCommandInvocation`, and `s3:PutObject` on
   `foxugly-deploy/builds/facilitation-frontend/*`. (The instance role already reads
   `foxugly-deploy/builds/*` per §3.14.)
3. **GitHub repo secrets** (Foxugly/Facilitation_frontend): `AWS_DEPLOY_ROLE_ARN`, `EC2_INSTANCE_ID`,
   `S3_DEPLOY_BUCKET=foxugly-deploy`.
4. **DNS**: `facilitation.foxugly.com` → box IP (already done). TLS = shared wildcard `*.foxugly.com`.

## One-time box bootstrap

`sudo -u django git clone https://github.com/Foxugly/Facilitation_frontend.git
/var/www/django_websites/Facilitation_frontend` (the deploy assumes the repo exists). The build runs
in CI, not on the box — no node needed on the box.

## First deploy & verify

Push `main` → CI test (vitest + build) → deploy. Then:
- `curl -I https://facilitation.foxugly.com/` → 200, `index.html` served.
- In a browser: create a room, confirm live voting (WS) works against facilitation-api.
- Check the injected `window.__FACILITATION__` (view-source) has the right `apiBaseUrl`.
