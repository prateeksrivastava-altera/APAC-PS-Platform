# Authentication Comparison & Azure App Registration Setup Guide

**Date:** April 2026
**Purpose:** Compare the sample auth.js (EasyAuth-based) with our current auth.js (MSAL-based), explain the AWS deployment issue, and provide step-by-step Azure App Registration configuration.

---

## 1. Key Architectural Differences

The sample `auth.js` and our current `auth.js` use **fundamentally different authentication approaches**:

| Aspect | Our current `auth.js` | Sample `auth.js` |
|--------|----------------------|-------------------|
| **Auth library** | MSAL.js 2.x (client-side SDK loaded from CDN) | Azure EasyAuth (built-in Azure App Service feature) |
| **Auth endpoint** | `login.microsoftonline.com` directly via MSAL redirect | `/.auth/login/aad` (platform-managed routes) |
| **User info** | `msalInstance.getAllAccounts()` | `GET /.auth/me` returns `clientPrincipal` |
| **Token handling** | `acquireTokenSilent()` / `acquireTokenRedirect()` | Platform handles tokens automatically via cookies |
| **Logout** | `msalInstance.logoutRedirect()` | `/.auth/logout` |
| **CDN dependency** | Requires `alcdn.msauth.net` CDN to load MSAL.js | No CDN needed; auth is handled server-side by the platform |
| **Backend validation** | Express middleware validates JWT Bearer tokens via JWKS | Platform injects `X-MS-CLIENT-PRINCIPAL` header automatically |
| **Hosting requirement** | Works on any hosting (AWS EC2, ECS, Elastic Beanstalk, etc.) | **Azure App Service only** (EasyAuth is an Azure-specific feature) |
| **Roles/claims** | Not implemented | Extracts roles from `clientPrincipal.claims` and `userRoles` |
| **Login UI** | Separate `login.html` page with SSO button | Inline auth pill/dropdown button in the page header |

### Summary

- **Sample auth.js** uses Azure App Service's built-in "EasyAuth" feature, which provides `/.auth/*` routes automatically. This is a **platform-level** feature that only works when hosted on Azure App Service. It does NOT work on AWS.
- **Our current auth.js** uses MSAL.js 2.x directly in the browser, which works on **any hosting platform** (AWS, Azure, on-prem, etc.) but requires the MSAL CDN script to load successfully.

---

## 2. Why the App Breaks on AWS

When deployed to AWS, the browser console shows:
```
Uncaught (in promise) ReferenceError: msal is not defined
    at Object.init (auth.js:37:5)
```

**Root cause:** The MSAL.js library is loaded from an external CDN (`https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js`). On AWS, this CDN is likely blocked by:
- AWS Security Group outbound rules
- Network ACLs
- Content Security Policy (CSP) headers
- Or the CDN is simply unreachable from the deployment environment

When the script fails to load, the global `msal` object doesn't exist, causing `auth.init()` to crash. Because there was no error handling around this, the app rendered the stepper headers but never initialized step content (the `goToStep(1)` call never executed).

**Important:** The `/.auth/*` approach from the sample auth.js CANNOT be used on AWS. Our current MSAL.js approach is correct for AWS; we just need to fix the CDN loading issue.

---

## 3. Two Options to Fix the CDN Issue

### Option A: Allow CDN Access (Network Fix)
Ensure the AWS environment allows outbound HTTPS (port 443) to `alcdn.msauth.net`:
- Check **Security Group** outbound rules
- Check **Network ACL** rules
- Check any **WAF** or **CloudFront** Content Security Policy headers
- Check if a **proxy** or **NAT Gateway** is blocking external CDN requests

If the CDN becomes reachable, the existing code will work without any code changes.

### Option B: Bundle MSAL Locally (Recommended — Eliminates CDN Dependency)
Download the MSAL library and serve it from the app's own static files:

1. **Download** `https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js`
2. **Save** it to `public/vendor/msal-browser.min.js`
3. **Update** `public/index.html` — change line 79:
   ```html
   <!-- Before -->
   <script src="https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js"></script>
   <!-- After -->
   <script src="vendor/msal-browser.min.js"></script>
   ```
4. **Update** `public/login.html` — change line 26:
   ```html
   <!-- Before -->
   <script src="https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js"></script>
   <!-- After -->
   <script src="vendor/msal-browser.min.js"></script>
   ```

No changes needed to `auth.js`, `index.js`, `server.js`, or any backend files.

---

## 4. Azure App Registration — Step-by-Step Configuration

Our app requires an Azure AD (Microsoft Entra ID) App Registration configured for **SPA (Single Page Application) + API** use.

### Step 1: Create the App Registration
1. Go to **Azure Portal** > **Microsoft Entra ID** > **App registrations**
2. Click **+ New registration**
3. Fill in:
   - **Name:** `Test Script Generator` (or your preferred name)
   - **Supported account types:** "Accounts in this organizational directory only" (single tenant)
   - **Redirect URI:** Select platform **Single-page application (SPA)** and enter:
     - `https://your-aws-domain.com/index.html`
4. Click **Register**
5. On the overview page, copy these two values for your `.env` file:
   - **Application (client) ID** → `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_TENANT_ID`

### Step 2: Configure Authentication Settings
1. Go to your app > **Authentication**
2. Under **Single-page application** > **Redirect URIs**, add ALL environments:
   - `https://your-aws-domain.com/index.html` (AWS production)
   - `http://localhost:3000/index.html` (local development)
3. Under **Front-channel logout URL**, set:
   - `https://your-aws-domain.com/login.html`
4. Under **Implicit grant and hybrid flows**:
   - Access tokens: **UNCHECKED**
   - ID tokens: **UNCHECKED**
   - (MSAL.js 2.x uses the authorization code flow with PKCE, not the implicit flow)
5. Click **Save**

### Step 3: Expose an API
Our code requests the scope `api://{clientId}/access_as_user`, so this must be configured:

1. Go to your app > **Expose an API**
2. Click **Set** next to "Application ID URI"
   - Accept the default `api://<your-client-id>` or set a custom URI
   - Click **Save**
3. Click **+ Add a scope**:
   - **Scope name:** `access_as_user`
   - **Who can consent:** Admins and users
   - **Admin consent display name:** Access Test Script Generator
   - **Admin consent description:** Allows the app to access Test Script Generator API on behalf of the signed-in user
   - **User consent display name:** Access Test Script Generator
   - **User consent description:** Allows you to access Test Script Generator
   - **State:** Enabled
4. Click **Add scope**

### Step 4: API Permissions
1. Go to your app > **API permissions**
2. Click **+ Add a permission**
3. Select the **My APIs** tab > select your app registration (Test Script Generator)
4. Check **access_as_user** > click **Add permissions**
5. Click **Grant admin consent for [your organization]** (requires admin role)
6. Verify that `Microsoft Graph > User.Read` is also listed (added by default)

### Step 5: Token Configuration (Optional but Recommended)
1. Go to your app > **Token configuration**
2. Click **+ Add optional claim**
3. Select token type: **Access**
4. Check these claims:
   - `email`
   - `upn` (User Principal Name)
   - `preferred_username`
5. Click **Add**
6. If prompted "Turn on the Microsoft Graph email, profile permissions?", click **Yes**

---

## 5. Environment Variables Required on AWS

The following environment variables must be set on the AWS deployment:

```
AZURE_CLIENT_ID=<Application (client) ID from Step 1>
AZURE_TENANT_ID=<Directory (tenant) ID from Step 1>
```

These are used by:
- **Frontend (`auth.js`):** Fetched via `GET /auth-config` to configure MSAL
- **Backend (`tokenService.js`):** Used to validate JWT tokens and fetch JWKS signing keys
- **Backend (`authMiddleware.js`):** When both are empty, auth is bypassed (dev mode)

---

## 6. Configuration Verification Checklist

| Setting | Expected Value | Where to Check |
|---------|---------------|----------------|
| App type | Single-page application (SPA) | Authentication > Platform configurations |
| Redirect URIs | `https://your-domain/index.html` + `http://localhost:3000/index.html` | Authentication > Redirect URIs |
| Implicit grant | Both UNCHECKED | Authentication > Implicit grant |
| Application ID URI | `api://<your-client-id>` | Expose an API |
| Exposed scope | `access_as_user` (Enabled) | Expose an API > Scopes |
| API permissions | `access_as_user` (admin consented) + `User.Read` | API permissions |
| `AZURE_CLIENT_ID` in AWS env | Matches Application (client) ID | AWS environment config |
| `AZURE_TENANT_ID` in AWS env | Matches Directory (tenant) ID | AWS environment config |
| MSAL library accessible | CDN reachable OR bundled locally | Browser DevTools > Network tab |

---

## 7. Testing After Deployment

1. **Check MSAL loads:** Open browser DevTools > Network tab, confirm `msal-browser.min.js` loads successfully (200 status)
2. **Check auth-config:** Navigate to `https://your-domain/auth-config` — should return JSON with `clientId` and `tenantId` populated
3. **Login flow:** Load the app > should redirect to `login.html` > click "Sign in with SSO" > Azure AD login page appears > after login, redirects back to `index.html` with step 1 content visible
4. **User display:** After login, user name should appear in the header
5. **API calls:** Upload a document and generate tests — the pipeline API call should include a Bearer token and succeed (check Network tab for `/pipeline` request with Authorization header)
6. **Console errors:** Open DevTools > Console — should be clean (no `msal is not defined` errors)

---

## 8. Files Reference

| File | Purpose |
|------|---------|
| `public/auth.js` | MSAL.js wrapper — handles login, logout, token acquisition |
| `public/login.html` | Login page with SSO button |
| `public/index.html` | Main app — loads MSAL CDN script + auth.js |
| `public/index.js` | App logic — auth guard redirects to login if unauthenticated |
| `server.js` | Express server — serves `/auth-config` endpoint |
| `config.js` | Reads `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` from `.env` |
| `services/authMiddleware.js` | Backend middleware — validates JWT Bearer tokens on `/chat` and `/pipeline` |
| `services/tokenService.js` | JWT verification using Azure AD JWKS keys |
