/**
 * MINE API Client
 */
const API = {
  userId: 'piyush-001',
  base: '',

  async request(method, path, body) {
    const headers = { 'x-user-id': this.userId };
    if (body) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${this.base}${path}`, opts);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }
    return res.json();
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  del(path) { return this.request('DELETE', path); },

  // Agents
  getAvailableAgents() { return this.get('/api/agents/available'); },
  getInstalledAgents() { return this.get('/api/agents/installed'); },
  installAgent(id) { return this.post(`/api/agents/install/${id}`); },
  uninstallAgent(id) { return this.post(`/api/agents/uninstall/${id}`); },

  // Messages
  sendMessage(content, agentId) {
    return this.post('/api/messages', { content, agentId: agentId || undefined });
  },

  // Permissions
  getPermissions() { return this.get('/api/permissions'); },
  grantPermission(agentId, resource, level, actions, duration) {
    return this.post('/api/permissions/grant', { agentId, resource, level, actions, duration });
  },
  revokePermission(id) { return this.post(`/api/permissions/revoke/${id}`); },

  // Vault
  getVaultData(category) {
    const q = category ? `?category=${category}` : '';
    return this.get(`/api/vault${q}`);
  },
  storeData(category, key, data) {
    return this.post('/api/vault', { category, key, data });
  },

  // Insights
  getInsights() { return this.get('/api/insights'); },
  getAuditLog() { return this.get('/api/insights/audit'); },

  // Integrations
  getAvailableIntegrations() { return this.get('/api/integrations/available'); },
  getUserConnections() { return this.get('/api/integrations/connections'); },
  startAuth(integrationId) { return this.post('/api/integrations/auth/start', { integrationId }); },
  connectDemo(integrationId) { return this.post('/api/integrations/connect/demo', { integrationId }); },
  disconnectIntegration(connectionId) { return this.post(`/api/integrations/disconnect/${connectionId}`); },
  syncIntegration(connectionId) { return this.post(`/api/integrations/sync/${connectionId}`); },
};
