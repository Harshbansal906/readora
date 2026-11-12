# 🚀 READORA — Production Deployment & Operations Guide

This guide provides end-to-end instructions for deploying **READORA** to production with high availability, automatic SSL (`https://`), managed PostgreSQL database persistence, Cloudinary permanent media storage, and Resend transactional email delivery.

---

## Architecture Overview

```
[ User Browser / Mobile ]
         │
         ▼
[ Render Web Service (Node.js/Express) ] ── (Port 5000 / HTTPS)
         │
         ├───▶ [ Render Managed PostgreSQL Database ] (Permanent Data Storage)
         │
         ├───▶ [ Cloudinary CDN ] (Permanent Image Storage & Optimization)
         │
         ├───▶ [ Resend HTTP REST API ] (High-Deliverability Verification Emails)
         │
         └───▶ [ Google Gemini API ] (AI Writing Assistant & Summarization)
```

---

## Option 1: 1-Click Blueprint Deployment on Render (Recommended)

Render Blueprints use [`render.yaml`](./render.yaml) to automatically provision both the **Web Service** and the **Free Managed PostgreSQL Database**, seamlessly wiring their connection strings together.

### Step 1: Push Code to GitHub
Ensure your repository is pushed to GitHub:
```bash
git add .
git commit -m "feat: prepare production deployment with PostgreSQL and Cloudinary"
git push origin main
```

### Step 2: Deploy Blueprint on Render
1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** in the top navigation bar and select **Blueprint**.
3. Connect your GitHub repository (`Harshbansal906/readora`).
4. Render will detect `render.yaml` and display:
   - **Service**: `readora` (Node Web Service)
   - **Database**: `readora-db` (PostgreSQL Database)
5. Click **Apply**.
6. Within 2–3 minutes, both the database and web service will be live!

---

## Option 2: Migrating Existing SQLite Data to PostgreSQL

If you have existing posts, users, comments, or likes in your local `readora.db` that you want in production:

1. Copy the **External Connection String** of your Render PostgreSQL database from the Render Dashboard (or your Supabase connection string).
2. In your local terminal, run the safe migration script:
   ```bash
   DATABASE_URL="postgresql://readora:YOUR_PASSWORD@YOUR_HOST:5432/readora" npm run db:migrate
   ```
3. The script will:
   - Create all 10 tables, constraints, foreign keys, and indexes in PostgreSQL.
   - Stream rows from `readora.db` into PostgreSQL with `ON CONFLICT DO NOTHING`.
   - Verify row count parity and output a data integrity report.
   - **Safety Guarantee**: Your local `readora.db` remains 100% untouched.

---

## 3. Configuring Cloud Services (Free Tiers)

### A. Permanent Image Storage (Cloudinary)
Render's web instances use ephemeral filesystems. To ensure user photos and article cover images are permanently stored:
1. Create a free account at [Cloudinary.com](https://cloudinary.com).
2. Go to your Cloudinary Dashboard and find:
   - **Cloud Name**
   - **API Key**
   - **API Secret**
3. In Render Web Service > **Environment**:
   - `CLOUDINARY_CLOUD_NAME` = your cloud name
   - `CLOUDINARY_API_KEY` = your API key
   - `CLOUDINARY_API_SECRET` = your API secret

### B. High-Deliverability Email (Resend)
Cloud hosts frequently block outbound SMTP ports (25/465/587). Using HTTP-based Resend ensures 100% reliable OTP delivery:
1. Create a free account at [Resend.com](https://resend.com).
2. Generate an API Key (starts with `re_`).
3. In Render Web Service > **Environment**:
   - `RESEND_API_KEY` = `re_xxxxxxxxxxxx`
   - `FROM_EMAIL` = `READORA <onboarding@resend.dev>` (or your custom domain address)

### C. Google Gemini AI (Optional)
To enable the AI Writing Polish, Auto-Summarize, and floating Chat Assistant:
1. Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. In Render Web Service > **Environment**:
   - `GEMINI_API_KEY` = your API key

---

## 4. Custom Domain & SSL Setup

Once your application is deployed on Render:
1. In the Render Dashboard, navigate to your web service > **Settings** > **Custom Domains**.
2. Click **Add Custom Domain** and enter your domain (e.g. `readora.app` or `www.readora.app`).
3. In your domain registrar (GoDaddy, Namecheap, Hostinger, Cloudflare):
   - Add a **CNAME** record:
     - Name: `www`
     - Value: `readora.onrender.com`
   - Add an **A** record:
     - Name: `@`
     - Value: `216.24.57.1` (or the IP displayed by Render)
4. Render will automatically provision and renew a free **Let's Encrypt SSL Certificate** (`https://`).

---

## 5. Backup, Export & Disaster Recovery

### Creating a Local Backup:
Before major updates or database migrations, run:
```bash
node -e "require('fs').copyFileSync('readora.db', 'readora.db.' + Date.now() + '.backup')"
```

### Exporting User Content via App:
Users and administrators can download a full JSON archive of all published content anytime from:
👉 **Account & Settings > Danger Zone & Data > Export Your Publication Archive**

### Restoring PostgreSQL Database:
If restoring a PostgreSQL dump on Render:
```bash
psql "YOUR_POSTGRES_DATABASE_URL" < backup.sql
```

---

## 6. Health & Monitoring

Readora includes an automated health check endpoint used by Render to monitor uptime:
- **Health Check URL**: `https://your-app.onrender.com/api/health`
- **Response Format**:
  ```json
  {
    "status": "online",
    "app": "READORA",
    "tagline": "Where readers become creators.",
    "database": "postgresql",
    "databaseStatus": "healthy",
    "timestamp": "2026-11-12T22:00:00.000Z"
  }
  ```
