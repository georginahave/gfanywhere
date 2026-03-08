# 🍽️ Dishcovery — Restaurant Review Finder

Search Google reviews for restaurants in any location.

## Project Structure

```
/
├── index.html          ← Frontend (the full UI)
├── api/
│   ├── search.js       ← Serverless: searches restaurants + fetches reviews
│   └── photo.js        ← Serverless: proxies Google place photos
├── vercel.json         ← Vercel routing config
└── package.json
```

---

## 🚀 Deploy to Vercel (Step-by-Step)

### Option A — Drag & Drop (Easiest)

1. Go to [vercel.com](https://vercel.com) and sign up / log in (free)
2. Click **"Add New Project"**
3. Click **"Upload"** and drag the entire project folder
4. Before clicking Deploy, click **"Environment Variables"** and add:
   - **Name:** `GOOGLE_PLACES_API_KEY`
   - **Value:** your API key
5. Click **Deploy** — you'll get a live URL in ~30 seconds!

### Option B — GitHub (Recommended for Updates)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import from GitHub
3. Add environment variable: `GOOGLE_PLACES_API_KEY` = your key
4. Deploy — future pushes to GitHub auto-redeploy!

### Option C — Vercel CLI

```bash
npm i -g vercel
cd restaurant-finder
vercel
# Follow prompts, then add env var:
vercel env add GOOGLE_PLACES_API_KEY
vercel --prod
```

---

## 🔑 Securing Your API Key

After deployment:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. APIs & Services → Credentials → Edit your API key
3. Under **API restrictions**: restrict to "Places API" only
4. Under **Application restrictions**: restrict to your Vercel domain

---

## Features

- 🔍 Search restaurants by city, neighborhood, or zip
- 🍜 Filter by cuisine type
- ⭐ Filter by minimum star rating
- 📷 Restaurant photos
- 💬 Up to 3 real Google reviews per restaurant
- 📱 Mobile responsive
- 🔒 API key never exposed to users
