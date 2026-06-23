# EC2 Ubuntu Deployment & Azure App Registration Guide

**Project:** Test Script Builder (APAC)  
**Auth:** MSAL.js 2.x (browser) + JWT Bearer token validation (backend)  
**Date:** April 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Part A — Azure App Registration](#part-a--azure-app-registration)
   - [A1. Register the Application](#a1-register-the-application)
   - [A2. Add a Redirect URI](#a2-add-a-redirect-uri)
   - [A3. Expose an API Scope](#a3-expose-an-api-scope)
   - [A4. Add Optional Token Claims](#a4-add-optional-token-claims)
   - [A5. Grant API Permissions](#a5-grant-api-permissions)
   - [A6. Record Your IDs](#a6-record-your-ids)
3. [Part B — AWS EC2 Instance Setup](#part-b--aws-ec2-instance-setup)
   - [B1. Launch an EC2 Instance](#b1-launch-an-ec2-instance)
   - [B2. Configure Security Groups](#b2-configure-security-groups)
   - [B3. Connect to the Instance](#b3-connect-to-the-instance)
   - [B4. Install System Dependencies](#b4-install-system-dependencies)
   - [B5. Deploy the Application](#b5-deploy-the-application)
   - [B6. Configure the Environment](#b6-configure-the-environment)
   - [B7. Run a Smoke Test](#b7-run-a-smoke-test)
   - [B8. Configure PM2 for Process Management](#b8-configure-pm2-for-process-management)
4. [Part C — Nginx Reverse Proxy with HTTPS](#part-c--nginx-reverse-proxy-with-https)
   - [C1. Install Nginx](#c1-install-nginx)
   - [C2. Obtain a TLS Certificate (Let's Encrypt)](#c2-obtain-a-tls-certificate-lets-encrypt)
   - [C3. Write the Nginx Site Config](#c3-write-the-nginx-site-config)
   - [C4. Enable the Site and Reload Nginx](#c4-enable-the-site-and-reload-nginx)
5. [Part D — Finalise the Azure App Registration](#part-d--finalise-the-azure-app-registration)
6. [Part E — Verification Checklist](#part-e--verification-checklist)
7. [Troubleshooting](#troubleshooting)

---

## Overview

```
Browser  ──HTTPS──►  Nginx (EC2, port 443)  ──HTTP──►  Node.js (port 3000)
                                                         │
              Azure AD  ◄──MSAL redirect──────────────►  │
              (login.microsoftonline.com)                 │
                                                         ▼
                                                  Matcha AI API
```

**Authentication flow:**
1. The browser loads `login.html` which calls `auth.init()`.
2. MSAL fetches `/auth-config` from the Node server to get `clientId` and `tenantId`.
3. On sign-in, MSAL redirects to Azure AD; after consent it returns to `/index.html` with an auth code.
4. MSAL exchanges the code for tokens silently. `auth.getToken()` acquires an access token scoped to `api://<clientId>/access_as_user`.
5. Every API call includes `Authorization: Bearer <token>`.
6. The Node backend validates the JWT against Azure AD's JWKS endpoint (no secret needed).

**Important:** The SSE pipeline (`/pipeline`) **requires** `proxy_buffering off` in Nginx. Without it, streaming responses will hang.

---

## Part A — Azure App Registration

> **Where:** [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations**

### A1. Register the Application

1. Click **+ New registration**.
2. Fill in:
   - **Name:** `Test Script Generator`
   - **Supported account types:** *Accounts in this organizational directory only (Single tenant)*
   - **Redirect URI:** Leave blank for now — you will add it in A2 after the domain is known.
3. Click **Register**.

> ⚠️ After registration, you land on the Overview page. **Keep this tab open** — you need the IDs in A6.

---

### A2. Add a Redirect URI

After your EC2 domain or IP is known, add the login callback URI.

1. In the App Registration, go to **Authentication** (left sidebar).
2. Under **Platform configurations**, click **+ Add a platform**.
3. Select **Single-page application**.
4. Add the following URIs (one at a time using **+ Add URI**):

   | Environment | URI |
   |-------------|-----|
   | Production  | `https://<your-domain>/index.html` |
   | Local dev   | `http://localhost:3000/index.html` |

5. Under **Implicit grant and hybrid flows**, ensure **both checkboxes are UNCHECKED** (MSAL 2.x uses auth-code flow, not implicit).
6. Under **Advanced settings**, set **Allow public client flows** to **No**.
7. Click **Save**.

---

### A3. Expose an API Scope

The backend validates tokens with `audience: api://<clientId>`. You must declare this scope.

1. In the App Registration, go to **Expose an API** (left sidebar).
2. Next to **Application ID URI**, click **Set**. Accept the default value (`api://<clientId>`) and click **Save**.
3. Click **+ Add a scope**.
4. Fill in:
   - **Scope name:** `access_as_user`
   - **Who can consent:** *Admins and users*
   - **Admin consent display name:** `Access Test Script Generator`
   - **Admin consent description:** `Allows the app to call the Test Script Generator API on behalf of the signed-in user.`
   - **State:** *Enabled*
5. Click **Add scope**.

> The full scope string is now `api://<clientId>/access_as_user`. This matches the scope used in `auth.js` and validated in `tokenService.js`.

---

### A4. Add Optional Token Claims

This ensures the user's display name and email appear in the header.

1. Go to **Token configuration** (left sidebar).
2. Click **+ Add optional claim**.
3. Select token type: **Access**.
4. Check: `name`, `preferred_username`, `upn`, `email`.
5. Click **Add**. If prompted *"Turn on the Microsoft Graph profile permission"*, click **Yes**.
6. Repeat for token type **ID** with the same claims.

---

### A5. Grant API Permissions

1. Go to **API permissions** (left sidebar).
2. Confirm that `User.Read` (Microsoft Graph) is already listed.
3. Click **Grant admin consent for \<your tenant\>**.
4. Click **Yes** in the confirmation dialog.
5. All entries should show a green tick under **Status**.

---

### A6. Record Your IDs

From the **Overview** page, copy and save:

| Value | Where to find it |
|-------|-----------------|
| **Application (client) ID** | Overview → *Application (client) ID* field |
| **Directory (tenant) ID** | Overview → *Directory (tenant) ID* field |

You will paste these into the `.env` file on the EC2 instance in [B6](#b6-configure-the-environment).

---

## Part B — AWS EC2 Instance Setup

### B1. Launch an EC2 Instance

1. Open the [EC2 Console](https://console.aws.amazon.com/ec2).
2. Click **Launch instance**.
3. Configure:
   - **Name:** `test-script-generator`
   - **AMI:** Ubuntu Server 24.04 LTS (64-bit x86)
   - **Instance type:** `t3.small` or larger (the pipeline calls Matcha AI and can be memory-intensive)
   - **Key pair:** Select an existing key pair or create a new one. **Download the `.pem` file.**
   - **Storage:** 20 GB gp3 (default is sufficient)
4. Under **Network settings**, click **Edit** and configure the security group (see B2 below).
5. Click **Launch instance**.
6. Note the **Public IPv4 address** or **Public IPv4 DNS** of the instance.

---

### B2. Configure Security Groups

In **Network settings** during launch (or via **Security Groups** after launch), add these inbound rules:

| Type | Protocol | Port | Source | Purpose |
|------|----------|------|--------|---------|
| SSH | TCP | 22 | Your IP (`x.x.x.x/32`) | Management access |
| HTTP | TCP | 80 | `0.0.0.0/0` | Let's Encrypt challenge + HTTP→HTTPS redirect |
| HTTPS | TCP | 443 | `0.0.0.0/0` | Application traffic |

> Do **not** expose port 3000 publicly. Node.js listens only on localhost; Nginx proxies to it.

---

### B3. Connect to the Instance

```bash
# On your local machine
chmod 400 ~/path/to/your-key.pem
ssh -i ~/path/to/your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

---

### B4. Install System Dependencies

```bash
# Update package lists
sudo apt-get update && sudo apt-get upgrade -y

# Install Git, Nginx, Certbot
sudo apt-get install -y git nginx certbot python3-certbot-nginx

# Install Node.js 20.x via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify versions
node --version   # Should print v20.x.x
npm --version    # Should print 10.x.x

# Install PM2 globally (process manager)
sudo npm install -g pm2
```

---

### B5. Deploy the Application

```bash
# Create an app directory
sudo mkdir -p /var/www/test-script-generator
sudo chown ubuntu:ubuntu /var/www/test-script-generator

# Clone the repository
git clone https://github.com/APAC-Touchwork/sm-test-script-builder.git \
  /var/www/test-script-generator

cd /var/www/test-script-generator

# Install production dependencies
npm install --omit=dev
```

---

### B6. Configure the Environment

```bash
# Create the .env file from the live .env (or fill it in manually)
nano /var/www/test-script-generator/.env
```

Paste the following, replacing placeholder values with your real ones:

```dotenv
# ── Server ──────────────────────────────────────────────────────────────────
PORT=3000

# ── Matcha AI ───────────────────────────────────────────────────────────────
MATCHA_API_KEY=<your-matcha-api-key>
BASE_URL=https://matcha.harriscomputer.com/rest/api/v1
WORKSPACE_ID=11797

# Pipeline Mission IDs (in execution order)
MISSION_ID_DECOMPOSER=16131
MISSION_ID_NORMALISER=16132
MISSION_ID_SCENARIO_BUILDER=16130
MISSION_ID_MATERIALISER=16129

# Matcha timeout (seconds per mission call)
MATCHA_TIMEOUT_SECONDS=300

# ── Azure AD SSO ─────────────────────────────────────────────────────────────
# Paste the values recorded in Part A, Step A6
AZURE_CLIENT_ID=<Application (client) ID from Azure>
AZURE_TENANT_ID=<Directory (tenant) ID from Azure>
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

Protect the file:

```bash
chmod 600 /var/www/test-script-generator/.env
```

---

### B7. Run a Smoke Test

Start the server directly to confirm configuration is correct before setting up PM2:

```bash
cd /var/www/test-script-generator
npm start
```

Expected output:
```
Test Script Generator running at http://localhost:3000
```

In a second SSH session (or using `curl` from within the instance):

```bash
# Should return {"clientId":"<your-id>","tenantId":"<your-id>"}
curl -s http://localhost:3000/auth-config
```

Stop the server with `Ctrl+C` once verified.

---

### B8. Configure PM2 for Process Management

PM2 keeps the Node.js process alive across crashes and server reboots.

```bash
cd /var/www/test-script-generator

# Start the app with PM2
pm2 start server.js --name test-script-generator

# Save the PM2 process list so it restarts on reboot
pm2 save

# Generate and enable the systemd startup script
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Copy and run the command that pm2 prints — it will look like:
# sudo systemctl enable pm2-ubuntu

# Confirm the app is running
pm2 status
pm2 logs test-script-generator --lines 20
```

---

## Part C — Nginx Reverse Proxy with HTTPS

### C1. Install Nginx

Already installed in B4. Confirm it is running:

```bash
sudo systemctl status nginx
# Should show: active (running)
```

---

### C2. Obtain a TLS Certificate (Let's Encrypt)

> **Prerequisite:** Your domain DNS A record must already point to the EC2 public IP before running Certbot.  
> If you are using a bare IP address instead of a domain, skip this step and use a self-signed cert (not recommended for production — Azure AD login will warn users).

```bash
# Replace <your-domain> with your actual domain, e.g. testscripts.example.com
sudo certbot --nginx -d <your-domain> --non-interactive --agree-tos -m admin@example.com
```

Certbot will automatically modify the default Nginx config. You will overwrite it in C3.

**Auto-renewal** is set up automatically by the Certbot package. Verify:

```bash
sudo systemctl status certbot.timer
```

---

### C3. Write the Nginx Site Config

```bash
sudo nano /etc/nginx/sites-available/test-script-generator
```

Paste the following (replace `<your-domain>` throughout):

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name <your-domain>;
    return 301 https://$host$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl;
    server_name <your-domain>;

    ssl_certificate     /etc/letsencrypt/live/<your-domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<your-domain>/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy all requests to the Node.js app
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # ── CRITICAL for SSE streaming ─────────────────────────────────────
        # The /pipeline endpoint uses Server-Sent Events. Without these lines,
        # Nginx will buffer the entire response and the browser will not receive
        # progress events until the pipeline completes (or times out).
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 360s;   # Allow up to 6 minutes for long pipelines
        # ───────────────────────────────────────────────────────────────────
    }
}
```

> **Why `proxy_buffering off` is critical:**  
> The `/pipeline` endpoint streams SSE events as each Matcha mission completes (up to ~5 minutes total). Nginx's default response buffering collects the entire body before forwarding it to the browser. With buffering enabled, the user sees nothing until the very end — or the connection times out. `proxy_buffering off` ensures each SSE frame is forwarded to the browser immediately.

---

### C4. Enable the Site and Reload Nginx

```bash
# Remove the default site
sudo rm -f /etc/nginx/sites-enabled/default

# Enable the new site
sudo ln -s /etc/nginx/sites-available/test-script-generator \
           /etc/nginx/sites-enabled/test-script-generator

# Test the configuration
sudo nginx -t
# Expected: syntax is ok / test is successful

# Reload Nginx to apply changes
sudo systemctl reload nginx
```

---

## Part D — Finalise the Azure App Registration

Now that the EC2 domain is live, return to the Azure Portal to add the production redirect URI (if you left it blank in A2).

1. Go to **Azure Portal** → **Microsoft Entra ID** → **App registrations** → **Test Script Generator**.
2. Go to **Authentication** → **Single-page application** → **Redirect URIs**.
3. Confirm or add `https://<your-domain>/index.html`.
4. Click **Save**.

> **Note:** The redirect URI must match **exactly** what the browser shows in the address bar when it returns from Azure AD. A trailing slash or `http` vs `https` mismatch will result in an `AADSTS50011` error.

---

## Part E — Verification Checklist

Open `https://<your-domain>/login.html` in a browser and confirm each of the following:

| # | Check | Expected result |
|---|-------|-----------------|
| 1 | Login page loads with Altera branding | ✅ Dark background, logo, "Sign in with Altera SSO" button |
| 2 | SSO button is enabled | ✅ Button is clickable (not greyed out) |
| 3 | HTTPS badge (lock icon) is green | ✅ Green — page is served over HTTPS |
| 4 | Azure AD badge (verified icon) is green | ✅ Green — `AZURE_CLIENT_ID` is set on the server |
| 5 | Clicking SSO redirects to Microsoft login | ✅ Browser goes to `login.microsoftonline.com` |
| 6 | After sign-in, app loads at Step 1 | ✅ Upload Document wizard step is shown |
| 7 | User's real name appears in the header | ✅ e.g. "Jane Smith" (from Azure AD `name` claim) |
| 8 | Upload a document and run the pipeline | ✅ Progress bar advances through 4 steps; results appear |
| 9 | Logout returns to `login.html` | ✅ Session cleared, login page shown |
| 10 | No errors in browser DevTools console | ✅ No red errors |

**Quick curl checks from the server:**

```bash
# Auth config endpoint (should return your Azure IDs)
curl -s https://<your-domain>/auth-config | python3 -m json.tool

# Pipeline without a token (should return 401)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://<your-domain>/pipeline \
  -H "Content-Type: application/json" \
  -d '{"input":"test"}'
# Expected: 401
```

---

## Troubleshooting

### Authentication Issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `AADSTS50011: The redirect URI specified in the request does not match` | Redirect URI mismatch in App Registration | In Azure → Authentication, add the **exact** URI shown in the browser's address bar after login |
| `AADSTS65001: The user or administrator has not consented` | API scope not granted | In Azure → API permissions, click **Grant admin consent** |
| `AADSTS700016: Application not found` | Wrong `clientId` in `.env` | Verify `AZURE_CLIENT_ID` matches the Application (client) ID on the App Registration overview |
| SSO button stays disabled after page load | `auth.init()` error | Open DevTools → Console; check for errors from `/auth-config` fetch |
| `401 Invalid or expired token` from API | JWT validation failing | Check `AZURE_CLIENT_ID`/`AZURE_TENANT_ID` match App Registration; verify scope `api://<clientId>/access_as_user` exists in "Expose an API" |
| Token acquired but `audience` claim is wrong | API scope not set up | Complete step A3 — set Application ID URI and add `access_as_user` scope |

### SSE / Pipeline Issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Progress bar never updates; result appears all at once | Nginx response buffering | Confirm `proxy_buffering off` is in the Nginx config; `sudo nginx -t && sudo systemctl reload nginx` |
| Pipeline times out with 504 Gateway Timeout | Nginx `proxy_read_timeout` too short | Increase to `360s` or more in Nginx config |
| Pipeline returns 401 mid-stream | Token expired during long run | Token lifetime is typically 1 hour; pipelines run < 10 minutes so this should not occur normally |

### Server / PM2 Issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `ERROR: MATCHA_API_KEY is not set` on startup | `.env` missing or not in working directory | Ensure `.env` exists in `/var/www/test-script-generator/` and `MATCHA_API_KEY` is set |
| App does not restart after EC2 reboot | PM2 startup not configured | Re-run `pm2 save` and the `pm2 startup` command from B8 |
| Port 3000 connection refused | Node process crashed | `pm2 logs test-script-generator` to view crash reason; `pm2 restart test-script-generator` |

### Nginx Issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `502 Bad Gateway` | Node.js is not running | `pm2 status` — restart with `pm2 restart test-script-generator` |
| `nginx: [emerg] unknown directive "proxy_buffering"` | Syntax error in config | Run `sudo nginx -t` and fix the reported line |
| Certificate renewal fails | Port 80 blocked | Ensure security group allows TCP 80 from `0.0.0.0/0` |

---

## Local Development Reference

To run without Azure AD (dev mode):

```bash
# .env — leave Azure values blank
AZURE_CLIENT_ID=
AZURE_TENANT_ID=

npm install
npm run dev
# Open http://localhost:3000/login.html
# Click "Sign in with Altera SSO" → logs in as "Developer" (no Azure required)
```

In dev mode, `auth.getToken()` returns `null` and the server's `requireAuth` middleware skips token validation entirely.
