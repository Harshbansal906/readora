# 🚀 READORA - Deployment & Custom Domain Setup Guide

This guide walks you step-by-step through running **READORA** locally, deploying it to the cloud for free with automatic SSL (`https://`), and connecting your custom domain.

---

## Part 1: Run & Test Locally (On Your Laptop)

1. Open PowerShell or Command Prompt.
2. Navigate to your project folder:
   ```bash
   cd "C:\Users\Harsh bansal\OneDrive\Desktop\frontend"
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open your browser and go to:
   👉 **`http://localhost:5000`**

*(Note: You can also double click `index.html` anytime to preview it offline without starting the server!)*

---

## Part 2: Push to GitHub (Ready for 1-Click Deployment)

1. Go to [GitHub.com](https://github.com) and create a **New Repository** (e.g., `readora`).
2. In your terminal inside `frontend` folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial launch of Readora platform"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/readora.git
   git push -u origin main
   ```

---

## Part 3: Deploy to Cloud for FREE (Using Render.com)

[Render](https://render.com) gives you free web hosting with automatic continuous deployment from GitHub:

1. Sign up / Log in to [Render.com](https://render.com) using your GitHub account.
2. Click **New +** > **Web Service**.
3. Select your `readora` repository.
4. Set the following settings:
   - **Name**: `readora` (or any name you like)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
5. Click **Deploy Web Service**.
6. Within 1-2 minutes, Render will provide you with a live URL (e.g., `https://readora.onrender.com`).

---

## Part 4: Connect Your Custom Domain (GoDaddy, Hostinger, Namecheap)

Once you buy your domain (e.g., `readora.in`, `readora.app`, or `readora.com`):

### 1. In Render Dashboard:
- Go to your Web Service > **Settings** > **Custom Domains**.
- Click **Add Custom Domain** and enter your domain (e.g., `www.yourdomain.com` and `yourdomain.com`).

### 2. In Your Domain Registrar (GoDaddy / Hostinger / Namecheap DNS Management):
Add these two DNS records:

| Type | Name / Host | Target / Value | TTL |
| :--- | :--- | :--- | :--- |
| **CNAME** | `www` | `readora.onrender.com` *(your render URL)* | Automatic / 1 Hour |
| **A** | `@` | `216.24.57.1` *(Render's IP shown on screen)* | Automatic / 1 Hour |

Render will automatically issue a **Free SSL Certificate (`https://`)** for your domain within a few minutes!

---

## 🌟 Default Admin / Demo Credentials

- **Email / Username**: `harsh@readora.app` or `harshbansal`
- **Password**: `readora123`
