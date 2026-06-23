# EasyAuth Deployment Guide

**Date:** April 2026
**Purpose:** Step-by-step guide to deploy the Test Script Generator on Azure Static Web Apps with EasyAuth SSO.

---

## Prerequisites

- An **Azure subscription** with permissions to create resources
- Access to **Microsoft Entra ID** (Azure AD) to register applications
- The Test Script Generator codebase pushed to a GitHub repository

---

## Step 1: Create an Azure App Registration

1. Go to **Azure Portal** > **Microsoft Entra ID** > **App registrations**
2. Click **+ New registration**
3. Fill in:
   - **Name:** `Test Script Generator`
   - **Supported account types:** Accounts in this organizational directory only (single tenant)
   - **Redirect URI:** Select **Single-page application (SPA)** and enter your SWA URL + `/index.html`
4. Click **Register**
5. On the overview page, copy these two values (you will need them later):
   - **Application (client) ID**
   - **Directory (tenant) ID**

---

## Step 2: Create a Client Secret

1. In your App Registration, go to **Certificates & secrets**
2. Click **+ New client secret**
3. Add a description (e.g. "SWA EasyAuth") and choose an expiry period
4. Click **Add**
5. **Copy the Value immediately** — it is only shown once

---

## Step 3: Configure Redirect URIs

1. Go to **Authentication** > **Single-page application** > **Redirect URIs**
2. Add:
   - `https://<your-swa-domain>.azurestaticapps.net/index.html`
   - `http://localhost:3000/index.html` (for local dev with SWA CLI)
3. Under **Implicit grant and hybrid flows**, ensure both checkboxes are **UNCHECKED**
4. Click **Save**

---

## Step 4: Configure Token Claims (Optional but Recommended)

1. Go to **Token configuration** > **+ Add optional claim**
2. Select token type: **ID**
3. Check: `email`, `preferred_username`, `name`
4. Click **Add**
5. If prompted to turn on Microsoft Graph permissions, click **Yes**

This ensures the user's display name appears correctly in the app header.

---

## Step 5: Create an Azure Static Web App

1. In the Azure Portal, click **+ Create a resource** > search **Static Web App**
2. Fill in:
   - **Resource group:** Choose or create one
   - **Name:** `test-script-generator` (or your preferred name)
   - **Hosting plan:** Free or Standard
   - **Source:** GitHub
   - **Repository:** Select your repo and branch
3. Configure the build:
   - **App location:** `/public`
   - **API location:** `/api` (or leave blank if using Express backend separately)
   - **Output location:** leave blank
4. Click **Review + create** > **Create**

---

## Step 6: Configure the SWA Identity Provider

1. Navigate to your Static Web App resource in the Azure Portal
2. Go to **Settings** > **Authentication**
3. Click **Add identity provider**
4. Select **Microsoft**
5. Enter:
   - **Client ID:** The Application (client) ID from Step 1
   - **Client Secret:** The value from Step 2
   - **Issuer URL:** `https://login.microsoftonline.com/<TENANT_ID>/v2.0`
6. Click **Add**

---

## Step 7: Set Application Settings

1. In your Static Web App resource, go to **Configuration** > **Application settings**
2. Add the following settings:

   | Name | Value |
   |------|-------|
   | `AZURE_CLIENT_ID` | Application (client) ID from Step 1 |
   | `AZURE_TENANT_ID` | Directory (tenant) ID from Step 1 |
   | `MATCHA_API_KEY` | Your Matcha API key |
   | `MATCHA_BASE_URL` | Your Matcha API base URL |
   | `MISSION_ID_DECOMPOSER` | Decomposer mission ID |
   | `MISSION_ID_NORMALISER` | Normaliser mission ID |
   | `MISSION_ID_SCENARIO_BUILDER` | Scenario Builder mission ID |
   | `MISSION_ID_MATERIALISER` | Materialiser mission ID |

3. Click **Save**

---

## Step 8: Deploy

Push your code to the linked GitHub branch. The SWA GitHub Action will build and deploy automatically.

```bash
git add -A
git commit -m "Deploy to Azure Static Web Apps"
git push origin main
```

---

## Step 9: Verify

Open your SWA URL in the browser and check:

| Check | Expected |
|-------|----------|
| Login page loads with dark theme and Altera branding | Yes |
| SSO button is enabled | Yes |
| Clicking SSO redirects to Azure AD login | Yes |
| After login, app loads at Step 1 (Upload Document) | Yes |
| User's real name appears in the header | Yes |
| Logout returns to login page | Yes |
| HTTPS badge (lock icon) is green | Yes |
| Azure AD badge (verified icon) is green | Yes |
| Uploading a document and running the pipeline works | Yes |
| No errors in browser console | Yes |

---

## Local Development

To run locally without Azure AD:

1. Set blank values in `.env`:
   ```
   AZURE_CLIENT_ID=
   AZURE_TENANT_ID=
   ```
2. Run:
   ```bash
   npm install
   npm run dev
   ```
3. Open `http://localhost:3000/login.html`
4. Click SSO — logs in as "Developer" (mock user, no Azure needed)

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| SSO button stays disabled | `auth.init()` failing | Check browser console for errors; verify `/auth-config` endpoint responds |
| Login redirects but returns to login page | SWA identity provider misconfigured | Verify Client ID, Client Secret, and Issuer URL in SWA Authentication settings |
| 401 on pipeline API calls | `x-ms-client-principal` header missing | Confirm SWA Authentication is enabled and the identity provider is added |
| User name shows as "User" | Name claim not in token | Add optional claims in App Registration (Step 4) |
| Badges stay muted on production | `AZURE_CLIENT_ID` not set in SWA config | Add it to Application Settings (Step 7) |
