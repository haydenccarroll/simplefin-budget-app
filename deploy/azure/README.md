# Deploying to Azure

Everything scales to zero, so an idle month costs close to nothing.

```
browser / phone ──HTTPS──▶ budget.example.com = sfba-api (Container App, 0..1 replicas, 0.25 vCPU)
                       ├─ web app (vite build, built into the image) + API + job worker, one process
                       ├─ SQLite on the container's own disk
                       └─ Litestream ──every ~1s──▶ Blob Storage (budget-db)
                                     ◀─restore on start──┘
                     sfba-api ──internal HTTPS─▶ sfba-llm (Container App, 0..1, 2 vCPU / 4 GiB)
                                                  Ollama + qwen2.5:3b baked into the image
```

- **API.** It wakes on the first request and sleeps after about 5 idle minutes. On waking, the entrypoint restores
  the newest copy of the database from Blob Storage, then runs the API under Litestream. Litestream ships every
  write about once a second, and does a final sync when the container is stopped.
- **One writer.** SQLite can have only one writer, so the API is capped at one replica, and the worker runs inside
  it (`RUN_WORKER=true`).
- **Deploys.** During a deploy, the new revision can start before the old one stops. Anything written in those few
  seconds by the old revision can be lost, so deploy when nobody is using the app.
- **Model.** The model app has no public address. It wakes when the worker sends it a transaction, and sleeps after
  about 5 idle minutes. Its image has the model inside, so a cold start downloads nothing else.
- **Images.** Images live in GitHub Container Registry (free) rather than Azure Container Registry (about $5 a
  month).

## Cost

- **Container Apps.** They only bill while running, and each month's free grant covers 180,000 vCPU-seconds and
  360,000 GiB-seconds.
  - The API at 0.25 vCPU uses that up only after about 200 hours awake.
  - The model at 2 vCPU uses about 2,400 vCPU-seconds per wake-up, counting the idle wait before it sleeps. That's
    roughly 75 bank syncs a month for free, and about $0.25 an hour beyond that.
- **Storage.** A few cents a month.
- **Logs.** The environment creates a Log Analytics workspace. The first 5 GB a month is free, far more than this
  app writes.

On a subscription with a spending cap (such as a student or free account), things stop when the credit runs out
rather than billing you.

## First deploy

1. Have an Azure subscription (a free or student account works).
2. `az login`
3. Let the GitHub CLI push images: `gh auth refresh -h github.com -s write:packages,read:packages`
4. `deploy/azure/deploy.sh`. The first run pushes the ~2 GB model image, so it takes a while.
   - Set `LOCATION=<region>` if the default (`westus`) isn't available to your subscription.
   - Set `CUSTOM_DOMAIN=budget.example.com` to serve from your own domain (see the next step).
5. The script prints two DNS records for `CUSTOM_DOMAIN` (for example `budget.example.com`): a CNAME to the app
   and a `TXT asuid.budget` record that proves you own the domain. Add them at your DNS host, wait for them
   to show up (`dig budget.example.com CNAME`), and run the script again. The second run binds the domain
   with a free, auto-renewing certificate.
6. The web app needs no configuration; it's served from the same origin.

Re-run `deploy/azure/deploy.sh` to ship new code.

The apps pull from GitHub with your `gh` token, stored as a secret on each app. To narrow that, create a classic
token with only `read:packages` and deploy with `GHCR_TOKEN=<it>`.

## Operating it

Logs go to Log Analytics; they show up a minute or two late, and reading them wakes nothing:

```bash
WS=$(az containerapp env show -n sfba-env -g sfba-rg --query properties.appLogsConfiguration.logAnalyticsConfiguration.customerId -o tsv)
az monitor log-analytics query -w $WS -o tsv --analytics-query \
  "ContainerAppConsoleLogs_CL | where TimeGenerated > ago(1h) | order by TimeGenerated desc | take 50 | project TimeGenerated, ContainerAppName_s, Log_s"
az containerapp revision list -n sfba-api -g sfba-rg -o table
```

Jobs that failed 8 times stay in the `jobs` table with `dead_at` and `last_error` set. They're queued again the
next time a sync runs.

To grab a copy of the database (Litestream is in the API image, or `brew/apt install litestream`):

```bash
KEY=$(az storage account keys list -g sfba-rg -n <storage account> --query '[0].value' -o tsv)
LITESTREAM_AZURE_ACCOUNT_KEY=$KEY litestream restore -o budget.db abs://<storage account>@budget-db/budget
```

To tear everything down, run `az group delete -n sfba-rg`. This deletes the database too.
