/**
 * MINE Views — renders each screen into the #content div.
 */

const AGENT_ICONS = {
  finance: { emoji: '&#128176;', bg: '#1a3a2a' },
  property: { emoji: '&#127968;', bg: '#2a2a1a' },
  fitness: { emoji: '&#128170;', bg: '#1a2a3a' },
  tax: { emoji: '&#128203;', bg: '#2a1a2a' },
  shopping: { emoji: '&#128722;', bg: '#1a2a2a' },
  trading: { emoji: '&#128200;', bg: '#2a3a1a' },
  email: { emoji: '&#9993;', bg: '#1a1a3a' },
  social: { emoji: '&#128241;', bg: '#3a1a2a' },
  utility: { emoji: '&#9889;', bg: '#3a2a1a' },
  delivery: { emoji: '&#128230;', bg: '#1a3a3a' },
  cooking: { emoji: '&#127859;', bg: '#3a1a1a' },
  education: { emoji: '&#127891;', bg: '#1a2a1a' },
  search: { emoji: '&#128269;', bg: '#2a2a2a' },
  chat: { emoji: '&#128172;', bg: '#2a1a3a' },
  adhoc: { emoji: '&#10024;', bg: '#3a2a2a' },
};

const Views = {
  // ─── Dashboard ─────────────────────────────────
  async dashboard() {
    const [installed, insights] = await Promise.all([
      API.getInstalledAgents(),
      API.getInsights().catch(() => []),
    ]);

    const activeAgents = installed.filter(a => a.active);

    return `
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-value" style="color: var(--accent-light)">${activeAgents.length}</div>
          <div class="stat-label">Active Agents</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: var(--green)">${installed.length}</div>
          <div class="stat-label">Installed Agents</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: var(--orange)">${insights.length}</div>
          <div class="stat-label">Insights</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: var(--blue)">15</div>
          <div class="stat-label">Available Agents</div>
        </div>
      </div>

      ${insights.length > 0 ? `
        <div class="section-header">
          <h2 class="section-title">Active Insights</h2>
        </div>
        <div class="insight-list">
          ${insights.map(i => `
            <div class="insight-item">
              <div class="insight-priority ${i.priority}"></div>
              <div class="insight-content">
                <div class="insight-title">${esc(i.title)}</div>
                <div class="insight-summary">${esc(i.summary)}</div>
              </div>
              ${i.actionable && i.action ? `<button class="btn btn-sm btn-primary">${esc(i.action.label)}</button>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="section-header">
        <h2 class="section-title">Your Agents</h2>
        <button class="btn btn-sm btn-secondary" onclick="App.navigate('agents')">Browse All</button>
      </div>

      ${activeAgents.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">&#128640;</div>
          <div class="empty-state-text">No agents installed yet. Head to the Agent Store to get started!</div>
          <br/>
          <button class="btn btn-primary" onclick="App.navigate('agents')">Browse Agents</button>
        </div>
      ` : `
        <div class="agent-grid">
          ${activeAgents.map(a => agentCardHtml(a.manifest, true)).join('')}
        </div>
      `}
    `;
  },

  // ─── Agent Store ───────────────────────────────
  async agents() {
    const [available, installed] = await Promise.all([
      API.getAvailableAgents(),
      API.getInstalledAgents(),
    ]);

    const installedIds = new Set(installed.map(a => a.manifest.id));

    const categories = [...new Set(available.map(a => a.category))];

    return `
      <div class="section-header">
        <h2 class="section-title">All Agents (${available.length})</h2>
      </div>
      <div class="chat-agent-select" style="margin-bottom: 20px">
        <span class="agent-chip active" onclick="App.filterAgents(null, this)">All</span>
        ${categories.map(c => `<span class="agent-chip" onclick="App.filterAgents('${c}', this)">${c}</span>`).join('')}
      </div>
      <div class="agent-grid" id="agentGrid">
        ${available.map(a => agentCardHtml(a, installedIds.has(a.id))).join('')}
      </div>
    `;
  },

  // ─── Chat ──────────────────────────────────────
  async chat() {
    const [installed, conversations] = await Promise.all([
      API.getInstalledAgents(),
      API.getConversations(20, App.chatAgentId).catch(() => []),
    ]);
    const active = installed.filter(a => a.active);

    // If we have an active conversation, load its messages
    let historyHtml = '';
    if (App.conversationId) {
      try {
        const messages = await API.getConversationMessages(App.conversationId);
        historyHtml = messages.map(m => {
          if (m.role === 'user') {
            return `
              <div class="message user">
                <div class="message-avatar">P</div>
                <div><div class="message-bubble">${esc(m.content)}</div></div>
              </div>
            `;
          } else {
            const agentIcon = AGENT_ICONS[m.agentId] || { emoji: 'M' };
            const emojiStr = m.agentId && m.agentId !== 'system' ? agentIcon.emoji : 'M';
            let suggestionsHtml = '';
            if (m.metadata?.suggestions?.length > 0) {
              suggestionsHtml = `
                <div class="message-suggestions">
                  ${m.metadata.suggestions.map(s => `<span class="suggestion-chip" onclick="App.useSuggestion('${esc(s)}')">${esc(s)}</span>`).join('')}
                </div>
              `;
            }
            const formattedContent = esc(m.content).replace(/\n/g, '<br/>');
            return `
              <div class="message agent">
                <div class="message-avatar">${emojiStr}</div>
                <div>
                  <div class="message-bubble">
                    ${m.agentId ? `<strong style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">${esc(m.agentId)}</strong>` : ''}
                    ${formattedContent}
                  </div>
                  ${suggestionsHtml}
                </div>
              </div>
            `;
          }
        }).join('');
      } catch { /* ignore load error */ }
    }

    // Build conversation sidebar with delete buttons
    const convListHtml = conversations.length > 0 ? conversations.map(c => `
      <div class="conversation-item ${c.id === App.conversationId ? 'active' : ''}" onclick="App.loadConversation('${c.id}')">
        <div class="conversation-item-content">
          <div class="conversation-title">${esc(c.title || 'Untitled')}</div>
          <div class="conversation-meta">${new Date(c.lastMessageAt || c.createdAt).toLocaleDateString()}</div>
        </div>
        <button class="conversation-delete" onclick="event.stopPropagation(); App.deleteConversation('${c.id}')" title="Delete conversation">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/></svg>
        </button>
      </div>
    `).join('') : '<div style="padding:12px;color:var(--text-muted);font-size:12px">No conversations yet</div>';

    const welcomeHtml = !historyHtml ? `
      <div class="message agent">
        <div class="message-avatar">M</div>
        <div>
          <div class="message-bubble">
            Hello! I'm MINE, your personal assistant. ${active.length > 0
              ? `You have ${active.length} agent(s) active. Ask me anything!`
              : 'Install some agents first from the Agent Store, then come back to chat!'}
          </div>
        </div>
      </div>
    ` : '';

    // Determine which agent chip should be active
    const activeAgentId = App.chatAgentId || '';

    return `
      <div class="chat-layout">
        <div class="chat-sidebar">
          <div class="chat-sidebar-header">
            <span>Conversations</span>
            <button class="btn btn-sm btn-secondary" onclick="App.newConversation()">+ New</button>
          </div>
          <div class="chat-sidebar-list">${convListHtml}</div>
        </div>
        <div class="chat-container">
          <div class="chat-agent-select">
            <span class="agent-chip ${activeAgentId === '' ? 'active' : ''}" data-agent="" onclick="App.selectChatAgent(null, this)">All Chats</span>
            ${active.map(a => `
              <span class="agent-chip ${activeAgentId === a.manifest.id ? 'active' : ''}" data-agent="${a.manifest.id}" onclick="App.selectChatAgent('${a.manifest.id}', this)">
                ${esc(a.manifest.name)}
              </span>
            `).join('')}
          </div>
          <div class="chat-messages" id="chatMessages">
            ${welcomeHtml}
            ${historyHtml}
          </div>
          <div class="chat-input-area">
            <input class="chat-input" id="chatInput" placeholder="Ask MINE anything..."
                   onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();App.sendChat()}" />
            <button class="chat-send" onclick="App.sendChat()">Send</button>
          </div>
        </div>
      </div>
    `;
  },

  // ─── Integrations ──────────────────────────────
  async integrations() {
    const [available, connections] = await Promise.all([
      API.getAvailableIntegrations(),
      API.getUserConnections(),
    ]);

    const connectedIds = new Set(connections.map(c => c.integrationId));

    const activeSection = connections.length > 0 ? `
      <div class="section-header">
        <h2 class="section-title">Connected (${connections.length})</h2>
      </div>
      <div class="agent-grid" style="margin-bottom:32px">
        ${connections.map(c => {
          const info = available.find(a => a.id === c.integrationId) || { name: c.integrationId, icon: '🔗', description: '' };
          return `
            <div class="agent-card" style="border-color:var(--green);border-width:1px">
              <div class="agent-card-header">
                <div class="agent-icon" style="background:var(--green-bg);font-size:22px">${info.icon}</div>
                <div>
                  <div class="agent-name">${esc(info.name)}</div>
                  <div class="agent-category" style="color:var(--green)">Connected</div>
                </div>
              </div>
              <div class="agent-description">${esc(info.description)}</div>
              <div class="agent-actions">
                <button class="btn btn-sm btn-secondary" onclick="App.syncIntegration('${c.id}')">Sync Now</button>
                <button class="btn btn-sm btn-danger" onclick="App.disconnectIntegration('${c.id}')">Disconnect</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    const availableSection = available.filter(a => !connectedIds.has(a.id));

    return `
      <div class="section-header" style="margin-bottom:8px">
        <h2 class="section-title">Connect Your Apps</h2>
      </div>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:24px">
        Connect external services to auto-sync your data. Your credentials are encrypted and you can disconnect anytime.
      </p>

      ${activeSection}

      <div class="section-header">
        <h2 class="section-title">Available Integrations (${availableSection.length})</h2>
      </div>
      <div class="agent-grid">
        ${availableSection.map(i => `
          <div class="agent-card">
            <div class="agent-card-header">
              <div class="agent-icon" style="background:var(--bg);font-size:22px">${i.icon}</div>
              <div>
                <div class="agent-name">${esc(i.name)}</div>
                <div class="agent-category">${i.authType.toUpperCase()} ${i.status === 'coming_soon' ? '· COMING SOON' : ''}</div>
              </div>
            </div>
            <div class="agent-description">${esc(i.description)}</div>
            <div class="agent-capabilities">
              ${i.categories.map(c => `<span class="cap-tag">${esc(c)}</span>`).join('')}
            </div>
            <div class="agent-actions">
              ${i.status === 'coming_soon'
                ? `<button class="btn btn-sm btn-secondary" disabled>Coming Soon</button>`
                : `<button class="btn btn-sm btn-primary" onclick="App.connectIntegration('${i.id}')">Connect</button>`}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // ─── Permissions ───────────────────────────────
  async permissions() {
    const perms = await API.getPermissions();

    if (perms.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">&#128274;</div>
          <div class="empty-state-text">No permissions granted yet. Install agents and grant them data access.</div>
        </div>
      `;
    }

    const grouped = {};
    perms.forEach(p => {
      if (!grouped[p.agentId]) grouped[p.agentId] = [];
      grouped[p.agentId].push(p);
    });

    return `
      <div class="section-header">
        <h2 class="section-title">Active Permissions (${perms.length})</h2>
      </div>
      ${Object.entries(grouped).map(([agentId, agentPerms]) => `
        <div class="card" style="margin-bottom: 16px">
          <div class="card-header">
            <div>
              <div class="card-title">${esc(agentId)}</div>
              <div class="card-subtitle">${agentPerms.length} permission(s)</div>
            </div>
            <button class="btn btn-sm btn-danger" onclick="App.revokeAllPerms('${agentId}')">Revoke All</button>
          </div>
          <div class="perm-list">
            ${agentPerms.map(p => `
              <div class="perm-item">
                <div class="perm-info">
                  <div class="perm-resource">${esc(p.resource)}</div>
                  <div class="perm-meta">${p.actions.join(', ')} &middot; Expires: ${p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : 'Never'}</div>
                </div>
                <span class="perm-level ${p.level}">${p.level.replace(/_/g, ' ')}</span>
                <button class="btn btn-sm btn-secondary" style="margin-left:8px" onclick="App.revokePerm('${p.id}')">Revoke</button>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `;
  },

  // ─── Data Vault ────────────────────────────────
  async vault() {
    const data = await API.getVaultData();

    if (data.length === 0) {
      return `
        <div class="section-header">
          <h2 class="section-title">Data Vault</h2>
          <button class="btn btn-sm btn-primary" onclick="App.showAddDataForm()">Add Data</button>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">&#128451;</div>
          <div class="empty-state-text">Your vault is empty. Add data manually or connect an integration.</div>
        </div>
        <div id="addDataForm" style="display:none"></div>
      `;
    }

    return `
      <div class="section-header">
        <h2 class="section-title">Data Vault (${data.length} entries)</h2>
        <button class="btn btn-sm btn-primary" onclick="App.showAddDataForm()">Add Data</button>
      </div>
      <div id="addDataForm" style="display:none"></div>
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Key</th>
              <th>Source</th>
              <th>Updated</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(d => `
              <tr>
                <td><span class="badge badge-purple">${esc(d.category)}</span></td>
                <td>${esc(d.key)}</td>
                <td><span class="badge badge-blue">${esc(d.source)}</span></td>
                <td>${new Date(d.updatedAt).toLocaleString()}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(JSON.stringify(d.data))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  // ─── Audit Log ─────────────────────────────────
  async audit() {
    const logs = await API.getAuditLog();

    if (logs.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">&#128196;</div>
          <div class="empty-state-text">No activity yet. Audit logs appear when agents take actions.</div>
        </div>
      `;
    }

    return `
      <div class="section-header">
        <h2 class="section-title">Audit Log (${logs.length} entries)</h2>
      </div>
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Agent</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td>${new Date(l.timestamp).toLocaleString()}</td>
                <td><span class="badge badge-purple">${esc(l.agentId)}</span></td>
                <td>${esc(l.action)}</td>
                <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(JSON.stringify(l.details))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },
};

// ─── Helpers ──────────────────────────────────────

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function agentCardHtml(manifest, isInstalled) {
  const icon = AGENT_ICONS[manifest.id] || { emoji: '&#129302;', bg: '#2a2a2a' };

  return `
    <div class="agent-card" data-category="${manifest.category}" data-agent-id="${manifest.id}">
      <div class="agent-card-header">
        <div class="agent-icon" style="background:${icon.bg}">${icon.emoji}</div>
        <div>
          <div class="agent-name">${esc(manifest.name)}</div>
          <div class="agent-category">${esc(manifest.category)} ${manifest.requiredPlan !== 'free' ? `&middot; ${manifest.requiredPlan}` : ''}</div>
        </div>
      </div>
      <div class="agent-description">${esc(manifest.description)}</div>
      <div class="agent-capabilities">
        ${manifest.capabilities.slice(0, 3).map(c => `<span class="cap-tag">${esc(c.name)}</span>`).join('')}
        ${manifest.capabilities.length > 3 ? `<span class="cap-tag">+${manifest.capabilities.length - 3} more</span>` : ''}
      </div>
      <div class="agent-actions">
        ${isInstalled
          ? `<button class="btn btn-sm btn-installed">Installed &#10003;</button>
             <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); App.chatWithAgent('${manifest.id}')">Chat</button>`
          : `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); App.installAgent('${manifest.id}')">Install</button>`}
      </div>
    </div>
  `;
}
