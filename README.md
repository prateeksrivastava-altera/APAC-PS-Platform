# APAC AI Troubleshooting Platform

This project is now a small web application intended for Azure App Service. It places Azure identity SSO at the front, then proxies authenticated user requests to the Matcha mission `APAC PS - Troubleshooting Issues` (`mission_id: 1920`) without exposing the Matcha API key to the browser.

## What was added

- `server.js`: dependency-free Node web server and Matcha proxy
- `public/index.html`: browser UI for the troubleshooting assistant
- `public/auth.js`: Azure Easy Auth client bootstrap based on your reference `auth.js`
- `public/app.js`: mission lookup and chat workflow
- `public/styles.css`: UI styling
- `AZURE_DEPLOYMENT.md`: Azure portal steps for hosting and SSO
- `persona_improved.md`: stronger request-level persona context

The original CLI remains available in `matcha-client.js`, but the main deployable path is now the web app.

## Local run

Set environment variables in PowerShell:

```powershell
$env:DEV_BYPASS_AUTH="true"
$env:DEV_USER_NAME="Prateek Srivastava"
$env:DEV_USER_EMAIL="prateek@example.com"
$env:MATCHA_API_KEY="YOUR_MATCHA_API_KEY"
```

Start the app:

```powershell
node .\server.js
```

Open:

```text
http://localhost:3000
```

## Azure run

Deploy to Azure App Service and configure App Service Authentication with Microsoft Entra ID. Use [AZURE_DEPLOYMENT.md](</c:/Users/PSRIVASTAVA2/OneDrive - Altera Digital Health/Technical Services/Tools/APAC_AI_Troubleshooting_Platform/AZURE_DEPLOYMENT.md>) for the exact portal steps.

Minimum Azure environment variables:

- `MATCHA_API_KEY`
- `MATCHA_MISSION_ID=1920`
- `MATCHA_WORKSPACE_ID=-1` or the actual owning workspace
- `MATCHA_BASE_URL=https://matcha.harriscomputer.com/rest/api/v1`
- `ALLOWED_TENANT_ID=<your-tenant-id>`

## Authentication model

This implementation uses Azure App Service built-in authentication, not Passport. That choice is deliberate:

- it matches your reference `auth.js`
- it removes the need to manage sessions or OAuth secrets in app code
- it keeps the SSO entry path simple: `/.auth/login/aad`
- it works cleanly with a small Node proxy that protects the Matcha API key

## Notes

- The Matcha documentation you attached documents mission listing and completions, but not a mission update endpoint. The improved persona is therefore applied as request `context`, not written back into Matcha metadata.
- If mission lookup does not find mission `1920` but chat still works, that means the workspace-filtered mission listing did not return it. Set `MATCHA_WORKSPACE_ID` to the specific workspace if needed.
