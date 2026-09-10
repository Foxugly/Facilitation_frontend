#!/usr/bin/env bash
# =============================================================================
# Delegation Poker frontend — seed AWS SSM /facilitation-frontend/prod/* (OFF-BOX, admin).
# All String (public — ships in the browser). Idempotent.
# =============================================================================
set -euo pipefail
REGION="eu-west-1"
P="/facilitation-frontend/prod"
put(){ aws ssm put-parameter --region "$REGION" --name "$P/$1" --type String --overwrite --value "$2"; }

put API_BASE_URL "https://facilitation-api.foxugly.com"
put SENTRY_DSN "<POKER_FRONTEND_SENTRY_DSN>"
put SENTRY_ENV "production"
# Note: SSM rejects empty values — do NOT seed SENTRY_RELEASE="" (the runtime-fetch
# script defaults it to "" when absent). Seed it only with a real release string.

echo "Seeded $P/* — grant the instance role foxugly-fleet-ec2 SSM read on $P and $P/*."
