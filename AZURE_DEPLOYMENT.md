# Azure Hosting And SSO Setup

This project is designed for Azure App Service with built-in App Service Authentication ("Easy Auth") using Microsoft Entra ID.

## Recommended architecture

- Hosting: Azure App Service for Linux
- Runtime: Node 22
- Authentication: App Service Authentication with Microsoft provider
- Matcha API key storage: App Service application settings
- SSO flow: browser redirects to `/.auth/login/aad`, Azure handles sign-in, App Service injects user identity headers to the Node app

## Azure portal tasks

### 1. Create the web app

1. In Azure Portal, go to `App Services`.
2. Create `Web App`.
3. Choose your subscription and resource group.
4. Runtime stack: `Node 22 LTS`.
5. Operating system: `Linux`.
6. Region: pick the closest region to your users or existing resources.
7. Create or select an App Service Plan.
8. Finish creation.

### 2. Deploy the code

You can deploy with any of these:

- Deployment Center with GitHub
- Zip deploy
- Local Git

If you use Deployment Center with GitHub, point it at this repository and make sure the startup command is:

```text
node server.js
```

### 3. Add application settings

In the web app, go to `Settings` -> `Environment variables` and add:

- `MATCHA_API_KEY` = your Matcha API key
- `MATCHA_MISSION_ID` = `1920`
- `MATCHA_WORKSPACE_ID` = the workspace that owns mission 1920, if you know it. Otherwise keep `-1`.
- `MATCHA_BASE_URL` = `https://matcha.harriscomputer.com/rest/api/v1`
- `ALLOWED_TENANT_ID` = your Microsoft Entra tenant ID

Optional local-only settings:

- `DEV_BYPASS_AUTH` = `false`
- `DEV_USER_NAME` = not needed in Azure
- `DEV_USER_EMAIL` = not needed in Azure

After saving environment variables, restart the web app.

### 4. Configure Microsoft Entra sign-in

1. In the web app, go to `Authentication`.
2. Click `Add identity provider`.
3. Choose `Microsoft`.
4. Tenant type:
   - usually `Workforce configuration (current tenant)` for internal users only.
5. App registration:
   - easiest: `Create new app registration`.
   - if your organization already has a preferred app registration, choose `Use existing app registration`.
6. For unauthenticated requests, choose:
   - `HTTP 302 Found redirect: recommended for websites`
7. Save.

App Service will use this callback URI:

```text
https://<your-app-name>.azurewebsites.net/.auth/login/aad/callback
```

If you use an existing app registration, make sure that exact redirect URI is present in the app registration.

### 5. Restrict access to signed-in users

In the same `Authentication` blade:

- Set `Require authentication` to `On`
- Set `Unauthenticated requests` to `HTTP 302 redirect to identity provider`

That gives you the "SSO in the beginning" behaviour.

### 6. Optional user or group restriction

If you need to restrict access further:

- use `Enterprise applications` -> your app -> `Users and groups`
- assign only the allowed users/groups
- if needed, turn on `Assignment required?`

## What this app expects from Azure auth

The browser uses:

- `/.auth/me`
- `/.auth/login/aad`
- `/.auth/logout`

The Node server reads the App Service identity header:

- `X-MS-CLIENT-PRINCIPAL`

That is why Azure App Service Authentication is the correct hosting/auth model for this implementation.

## Local development

For local testing without Azure auth:

```powershell
$env:DEV_BYPASS_AUTH="true"
$env:DEV_USER_NAME="Prateek Srivastava"
$env:DEV_USER_EMAIL="prateek@example.com"
$env:MATCHA_API_KEY="your-key"
node .\server.js
```

Open `http://localhost:3000`.

## Validation checklist after deployment

1. Browse to the app URL.
2. Confirm you are redirected to Microsoft sign-in.
3. After login, confirm the user pill appears in the top right.
4. Confirm `Mission status` loads.
5. Send a test prompt and confirm Matcha responds.
6. Confirm no Matcha API key is exposed in browser requests or page source.
