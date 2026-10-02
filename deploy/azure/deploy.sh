#!/usr/bin/env bash
# Deploys the API and the categorization model to Azure Container Apps, both
# scaling to zero when idle. Safe to re-run: it creates what is missing and
# updates what is there (a re-run ships the current code as a new API image).
#
#   deploy/azure/deploy.sh
#
# Needs: az (logged in), docker, and a GitHub token that can push packages
# (gh auth refresh -h github.com -s write:packages). See deploy/azure/README.md.
#
# What it builds:
#
#   resource group  $RG
#   storage account $STORAGE   blob container "budget-db": the SQLite database,
#                              streamed there by Litestream about once a second
#   environment     $ENV_NAME  Container Apps, consumption plan (no idle cost)
#   app             $API_APP   the API with the job worker inside it, serving
#                              the web app too; public HTTPS at $CUSTOM_DOMAIN;
#                              0..1 replicas (SQLite needs one writer)
#   app             $LLM_APP   Ollama with the model baked in; reachable only
#                              from inside the environment; 0..1 replicas
set -euo pipefail
export PYTHONWARNINGS=ignore # quiets the Azure CLI's own Python warnings

# Pick any Azure region that offers Container Apps.
LOCATION=${LOCATION:-westus}
PREFIX=${PREFIX:-sfba}
RG=${RG:-$PREFIX-rg}
ENV_NAME=${ENV_NAME:-$PREFIX-env}
API_APP=${API_APP:-$PREFIX-api}
LLM_APP=${LLM_APP:-$PREFIX-llm}
DB_CONTAINER=budget-db

MODEL=${MODEL:-qwen2.5:3b}
GHCR_USER=${GHCR_USER:-$(gh api user -q .login)}
GHCR_TOKEN=${GHCR_TOKEN:-$(gh auth token)}
REPO_URL=${REPO_URL:-}
API_IMAGE=ghcr.io/$GHCR_USER/simplefin-budget-api:$(date -u +%Y%m%d%H%M%S)
LLM_IMAGE=ghcr.io/$GHCR_USER/simplefin-budget-llm:${MODEL//:/-}

# The public address of the web app and API, e.g. budget.example.com. Empty skips the custom domain.
CUSTOM_DOMAIN=${CUSTOM_DOMAIN-}
# Other web origins allowed to call the API from a browser, comma separated.
# The web app is served by the API itself, so this is normally empty.
CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS:-}

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
step() { printf '\n==> %s\n' "$*"; }

SUBSCRIPTION=$(az account show --query id -o tsv)
# Storage account names are global, so derive a stable one from the subscription.
STORAGE=${STORAGE:-$PREFIX$(printf %s "$SUBSCRIPTION" | sha1sum | cut -c1-14)}

step "Images"
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
if docker manifest inspect "$LLM_IMAGE" >/dev/null 2>&1; then
  echo "model image $LLM_IMAGE already pushed"
else
  docker build --platform linux/amd64 --build-arg MODEL="$MODEL" \
    ${REPO_URL:+--label org.opencontainers.image.source=$REPO_URL} -t "$LLM_IMAGE" "$ROOT/deploy/ollama"
  docker push "$LLM_IMAGE"
fi
docker build --platform linux/amd64 ${REPO_URL:+--label org.opencontainers.image.source=$REPO_URL} \
  --build-context webapp="$ROOT/apps/simplefin-budget-app" \
  -t "$API_IMAGE" "$ROOT/apps/budget-api"
docker push "$API_IMAGE"

step "Azure providers and CLI extension"
az extension add --name containerapp --upgrade --only-show-errors
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.Storage; do
  az provider register --namespace "$ns" --wait --only-show-errors
done

step "Resource group $RG ($LOCATION)"
az group create -n "$RG" -l "$LOCATION" -o none

step "Storage account $STORAGE"
if ! az storage account show -n "$STORAGE" -g "$RG" -o none 2>/dev/null; then
  az storage account create -n "$STORAGE" -g "$RG" -l "$LOCATION" \
    --sku Standard_LRS --kind StorageV2 --access-tier Hot \
    --min-tls-version TLS1_2 --allow-blob-public-access false -o none
fi
STORAGE_KEY=$(az storage account keys list -n "$STORAGE" -g "$RG" --query '[0].value' -o tsv)
az storage container create -n "$DB_CONTAINER" --account-name "$STORAGE" --account-key "$STORAGE_KEY" -o none

step "Container Apps environment $ENV_NAME"
if ! az containerapp env show -n "$ENV_NAME" -g "$RG" -o none 2>/dev/null; then
  az containerapp env create -n "$ENV_NAME" -g "$RG" -l "$LOCATION" -o none
fi

app_exists() { az containerapp show -n "$1" -g "$RG" -o none 2>/dev/null; }

step "Model app $LLM_APP"
if app_exists "$LLM_APP"; then
  az containerapp registry set -n "$LLM_APP" -g "$RG" --server ghcr.io \
    --username "$GHCR_USER" --password "$GHCR_TOKEN" -o none
  az containerapp update -n "$LLM_APP" -g "$RG" --image "$LLM_IMAGE" -o none
else
  az containerapp create -n "$LLM_APP" -g "$RG" --environment "$ENV_NAME" \
    --image "$LLM_IMAGE" \
    --registry-server ghcr.io --registry-username "$GHCR_USER" --registry-password "$GHCR_TOKEN" \
    --cpu 2 --memory 4Gi --min-replicas 0 --max-replicas 1 \
    --ingress internal --target-port 11434 --transport http -o none
fi

# The model app's address inside the environment (its ingress is internal only).
LLM_URL=https://$(az containerapp show -n "$LLM_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)

API_ENV=(
  "DATABASE_PATH=/data/budget.db"
  "LITESTREAM_ACCOUNT_NAME=$STORAGE"
  "LITESTREAM_CONTAINER=$DB_CONTAINER"
  "LITESTREAM_AZURE_ACCOUNT_KEY=secretref:storage-key"
  "RUN_WORKER=true"
  "LLM_URL=$LLM_URL"
  "LLM_MODEL=$MODEL"
  # A cold start of the model app (pulling its image) can take a while.
  "LLM_TIMEOUT=3m"
  "COOKIE_SECURE=true"
  "TRUST_PROXY_HEADERS=true"
  "CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS"
  "LOG_LEVEL=INFO"
)

step "API app $API_APP"
if app_exists "$API_APP"; then
  az containerapp secret set -n "$API_APP" -g "$RG" --secrets "storage-key=$STORAGE_KEY" -o none
  az containerapp registry set -n "$API_APP" -g "$RG" --server ghcr.io \
    --username "$GHCR_USER" --password "$GHCR_TOKEN" -o none
  az containerapp update -n "$API_APP" -g "$RG" --image "$API_IMAGE" \
    --set-env-vars "${API_ENV[@]}" -o none
else
  az containerapp create -n "$API_APP" -g "$RG" --environment "$ENV_NAME" \
    --image "$API_IMAGE" \
    --registry-server ghcr.io --registry-username "$GHCR_USER" --registry-password "$GHCR_TOKEN" \
    --secrets "storage-key=$STORAGE_KEY" \
    --env-vars "${API_ENV[@]}" \
    --cpu 0.25 --memory 0.5Gi --min-replicas 0 --max-replicas 1 \
    --ingress external --target-port 8080 --transport http -o none
fi

API_FQDN=$(az containerapp show -n "$API_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)
API_URL=https://$API_FQDN

if [ -n "$CUSTOM_DOMAIN" ]; then
  step "Custom domain $CUSTOM_DOMAIN"
  bound=$(az containerapp hostname list -n "$API_APP" -g "$RG" --query "[?name=='$CUSTOM_DOMAIN'].bindingType" -o tsv)
  if [ "$bound" = "SniEnabled" ]; then
    echo "already serving https://$CUSTOM_DOMAIN"
    API_URL=https://$CUSTOM_DOMAIN
  else
    verify=$(az containerapp show -n "$API_APP" -g "$RG" --query properties.customDomainVerificationId -o tsv)
    sub=${CUSTOM_DOMAIN%%.*}
    if dig +short @1.1.1.1 TXT "asuid.$CUSTOM_DOMAIN" | grep -q "$verify" &&
       dig +short @1.1.1.1 CNAME "$CUSTOM_DOMAIN" | grep -q "$API_FQDN"; then
      # A free certificate managed (and renewed) by Azure.
      az containerapp hostname add -n "$API_APP" -g "$RG" --hostname "$CUSTOM_DOMAIN" -o none 2>/dev/null || true
      az containerapp hostname bind -n "$API_APP" -g "$RG" --hostname "$CUSTOM_DOMAIN" \
        --environment "$ENV_NAME" --validation-method CNAME -o none
      API_URL=https://$CUSTOM_DOMAIN
    else
      echo "DNS for $CUSTOM_DOMAIN isn't in place yet. Add these records where the domain's DNS is hosted,"
      echo "then run this script again:"
      echo "  CNAME  $sub         -> $API_FQDN"
      echo "  TXT    asuid.$sub   -> $verify"
    fi
  fi
fi

step "Done"
echo "Web app and API: $API_URL"
echo "Check it: curl -i $API_URL/ready   (the first request wakes it up; give it a few seconds)"
