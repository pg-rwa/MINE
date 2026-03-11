# Deploying MINE

## Option 1: Railway (Recommended)

### One-click deploy
1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub repo
4. Railway auto-detects the config and deploys

### CLI deploy
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Railway will:
- Auto-detect Node.js via `nixpacks.toml`
- Run `npm ci` to install dependencies
- Start with `npx tsx packages/api/src/index.ts`
- Expose port 3000 automatically
- Give you a public URL like `mine-super-app.up.railway.app`

### Environment variables (optional)
```
PORT=3000          # Railway sets this automatically
NODE_ENV=production
```

## Option 2: Docker (any platform)

```bash
docker build -t mine-api .
docker run -p 3000:3000 mine-api
```

## Option 3: Fly.io

```bash
flyctl launch
flyctl deploy
```

## Option 4: Local development

```bash
npm install
npm run dev
# Server starts at http://localhost:3000
```

## Verify deployment

```bash
# Health check
curl https://your-app.up.railway.app/health

# List available agents
curl https://your-app.up.railway.app/api/agents/available

# Install an agent
curl -X POST https://your-app.up.railway.app/api/agents/install/finance \
  -H 'x-user-id: your-user-id'

# Send a message
curl -X POST https://your-app.up.railway.app/api/messages \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: your-user-id' \
  -d '{"content": "Show my expenses", "agentId": "finance"}'
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/agents/available` | List all registered agents |
| GET | `/api/agents/installed` | List installed agents |
| POST | `/api/agents/install/:id` | Install an agent |
| POST | `/api/agents/uninstall/:id` | Uninstall an agent |
| POST | `/api/messages` | Send message (auto-routed or to specific agent) |
| GET | `/api/permissions` | List all permissions |
| POST | `/api/permissions/grant` | Grant a permission |
| POST | `/api/permissions/revoke/:id` | Revoke a permission |
| GET | `/api/vault` | Query data vault |
| POST | `/api/vault` | Store data |
| GET | `/api/vault/export` | Export all user data |
| GET | `/api/insights` | Get insights from all agents |
| GET | `/api/insights/audit` | Get audit log |
| GET | `/api/integrations/available` | List integrations |
| POST | `/api/integrations/connect` | Connect integration |
