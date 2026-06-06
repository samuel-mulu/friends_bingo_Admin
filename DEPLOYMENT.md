# Friends Bingo Admin - Deployment Guide

## 🚀 Quick Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

### 1. Prepare Your Repository

```bash
# Make sure all changes are committed
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Framework Preset: **Next.js**
5. Add Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-render-api.onrender.com
   ```
6. Click **Deploy**

### 3. After Deployment

1. Copy your Vercel URL (e.g., `https://friends-bingo-admin.vercel.app`)
2. Add this URL to your Render backend's `CORS_ORIGINS` environment variable

---

## 📋 Environment Variables

### Required

| Variable | Description | Development | Production |
|----------|-------------|-------------|------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:3002` | `https://api.onrender.com` |

### How It Works

The admin dashboard uses `NEXT_PUBLIC_API_URL` to connect to the backend:
- **API calls** go to `${NEXT_PUBLIC_API_URL}/admin/...`
- **Socket.IO** connects to `${NEXT_PUBLIC_API_URL}/realtime`

---

## 🔗 Backend Configuration (Render)

Your backend must allow the Vercel domain via CORS:

### Update CORS_ORIGINS in Render

```
CORS_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:3000
```

This allows:
- Your production Vercel app
- Local development

---

## 🏗️ Architecture Overview

```
┌─────────────────┐     HTTPS      ┌─────────────────┐
│   Vercel        │ ─────────────→ │   Render        │
│   (Next.js)     │                │   (NestJS)      │
│                 │ ←───────────── │                 │
│   Admin UI      │   WebSocket    │   API + DB      │
└─────────────────┘                └─────────────────┘
      │                                    │
      │         Socket.IO Events           │
      │    (game:operation_updated,       │
      │     session:prize_updated, etc)   │
      └────────────────────────────────────┘
```

### Real-time Updates Flow

1. Admin makes change (e.g., starts game)
2. Backend emits `game:operation_updated` event
3. Socket.IO broadcasts to all connected clients
4. Admin dashboard receives event, invalidates React Query cache
5. UI updates automatically

---

## ⚙️ Configuration Files

### vercel.json

Already configured in your project:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "installCommand": "npm install"
}
```

### next.config.js

For static export (optional):

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Only if you need static HTML
  distDir: 'dist',
}

module.exports = nextConfig
```

---

## 🧪 Testing Before Deploy

### Local Production Build

```bash
# Build production version locally
npm run build

# Test the production build
npm start
```

### Check API Connection

```bash
# Test if API is reachable
curl https://your-render-api.onrender.com/health
```

---

## 🚨 Troubleshooting

### CORS Errors

If you see CORS errors in browser console:
1. Check `CORS_ORIGINS` in Render includes your Vercel URL
2. Ensure no trailing slash in URL
3. Format: `https://app.vercel.app,https://www.app.vercel.app`

### Socket Connection Failed

If real-time updates don't work:
1. Check browser console for WebSocket errors
2. Verify `NEXT_PUBLIC_API_URL` is set correctly
3. Ensure Render service is running (not sleeping)

### API 500 Errors

If API calls fail:
1. Check Render logs for errors
2. Verify database is connected
3. Check environment variables are set

---

## 📱 Mobile App Configuration

Update Flutter app to use production API:

### For Android Release

```bash
flutter build apk --release \
  --dart-define=API_BASE_URL=https://your-render-api.onrender.com
```

### For iOS Release

```bash
flutter build ios --release \
  --dart-define=API_BASE_URL=https://your-render-api.onrender.com
```

---

## 🔄 Deployment Checklist

### Backend (Render)
- [ ] Database migrated and connected
- [ ] Environment variables configured
- [ ] CORS_ORIGINS includes Vercel URL
- [ ] Health check responding
- [ ] Socket.IO working

### Frontend (Vercel)
- [ ] NEXT_PUBLIC_API_URL set correctly
- [ ] Build successful
- [ ] API calls working
- [ ] Socket connections established
- [ ] Real-time updates functioning

### Post-Deploy
- [ ] Test admin login
- [ ] Test game operations
- [ ] Verify real-time updates
- [ ] Check mobile app connection
