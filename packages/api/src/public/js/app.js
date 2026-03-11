/**
 * MINE App Controller
 */
const App = {
  currentView: 'dashboard',
  chatAgentId: null,

  async init() {
    // Set up navigation
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(el.dataset.view);
      });
    });

    // Mobile menu toggle
    document.getElementById('menuToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });

    // Close sidebar on content click (mobile)
    document.getElementById('content').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
    });

    // Load initial view
    await this.navigate('dashboard');
  },

  async navigate(view) {
    this.currentView = view;

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });

    // Update title
    const titles = {
      dashboard: 'Dashboard',
      agents: 'Agent Store',
      chat: 'Chat with Agents',
      permissions: 'Privacy & Permissions',
      vault: 'Data Vault',
      audit: 'Audit Log',
    };
    document.getElementById('pageTitle').textContent = titles[view] || view;

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');

    // Render view
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const html = await Views[view]();
      content.innerHTML = html;
    } catch (err) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#9888;</div>
          <div class="empty-state-text">Error loading view: ${esc(err.message)}</div>
        </div>
      `;
    }
  },

  // ─── Agent Actions ─────────────────────────────

  async installAgent(agentId) {
    try {
      await API.installAgent(agentId);
      // Auto-grant basic read permissions for required resources
      const available = await API.getAvailableAgents();
      const agent = available.find(a => a.id === agentId);
      if (agent) {
        for (const resource of agent.requiredPermissions) {
          try {
            await API.grantPermission(agentId, resource, 'observe', ['read'], '30d');
          } catch(e) { /* some resources may not match enum */ }
        }
      }
      await this.navigate(this.currentView);
    } catch (err) {
      alert('Failed to install: ' + err.message);
    }
  },

  async chatWithAgent(agentId) {
    this.chatAgentId = agentId;
    await this.navigate('chat');
    // Activate the right chip
    setTimeout(() => {
      document.querySelectorAll('.agent-chip').forEach(el => {
        el.classList.toggle('active', el.dataset.agent === agentId);
      });
    }, 100);
  },

  filterAgents(category, el) {
    // Update active chip
    document.querySelectorAll('.chat-agent-select .agent-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    // Filter cards
    document.querySelectorAll('.agent-card').forEach(card => {
      if (!category || card.dataset.category === category) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  },

  // ─── Chat ──────────────────────────────────────

  selectChatAgent(agentId, el) {
    this.chatAgentId = agentId;
    document.querySelectorAll('.chat-agent-select .agent-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  },

  async sendChat() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';

    const messages = document.getElementById('chatMessages');

    // Add user message
    messages.innerHTML += `
      <div class="message user">
        <div class="message-avatar">P</div>
        <div><div class="message-bubble">${esc(text)}</div></div>
      </div>
    `;
    messages.scrollTop = messages.scrollHeight;

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    messages.innerHTML += `
      <div class="message agent" id="${typingId}">
        <div class="message-avatar">M</div>
        <div><div class="message-bubble" style="color:var(--text-muted)">Thinking...</div></div>
      </div>
    `;
    messages.scrollTop = messages.scrollHeight;

    try {
      const response = await API.sendMessage(text, this.chatAgentId);

      // Remove typing indicator
      document.getElementById(typingId)?.remove();

      // Add agent response
      const agentIcon = AGENT_ICONS[response.agentId] || { emoji: 'M' };
      const emojiStr = response.agentId !== 'system' ? agentIcon.emoji : 'M';

      let suggestionsHtml = '';
      if (response.suggestions && response.suggestions.length > 0) {
        suggestionsHtml = `
          <div class="message-suggestions">
            ${response.suggestions.map(s => `<span class="suggestion-chip" onclick="App.useSuggestion('${esc(s)}')">${esc(s)}</span>`).join('')}
          </div>
        `;
      }

      // Handle permission request actions
      let actionsHtml = '';
      if (response.actions) {
        response.actions.forEach(action => {
          if (action.type === 'request_permission') {
            actionsHtml += `
              <div style="margin-top:8px">
                <button class="btn btn-sm btn-primary" onclick="App.grantPermFromChat('${response.agentId}', '${action.payload.resource}')">
                  Grant ${esc(action.payload.resource)} Access
                </button>
              </div>
            `;
          }
        });
      }

      messages.innerHTML += `
        <div class="message agent">
          <div class="message-avatar">${emojiStr}</div>
          <div>
            <div class="message-bubble">
              <strong style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">${esc(response.agentId)}</strong>
              ${esc(response.content)}
              ${actionsHtml}
            </div>
            ${suggestionsHtml}
          </div>
        </div>
      `;
    } catch (err) {
      document.getElementById(typingId)?.remove();
      messages.innerHTML += `
        <div class="message agent">
          <div class="message-avatar">!</div>
          <div><div class="message-bubble" style="border-color:var(--red)">Error: ${esc(err.message)}</div></div>
        </div>
      `;
    }

    messages.scrollTop = messages.scrollHeight;
  },

  useSuggestion(text) {
    document.getElementById('chatInput').value = text;
    this.sendChat();
  },

  async grantPermFromChat(agentId, resource) {
    try {
      await API.grantPermission(agentId, resource, 'observe', ['read'], '30d');
      // Re-send a message to trigger the agent with new permissions
      const input = document.getElementById('chatInput');
      input.value = `Show my ${resource}`;
      await this.sendChat();
    } catch (err) {
      alert('Failed to grant permission: ' + err.message);
    }
  },

  // ─── Permissions ───────────────────────────────

  async revokePerm(permId) {
    if (!confirm('Revoke this permission?')) return;
    await API.revokePermission(permId);
    await this.navigate('permissions');
  },

  async revokeAllPerms(agentId) {
    if (!confirm(`Revoke all permissions for ${agentId}?`)) return;
    const perms = await API.getPermissions();
    for (const p of perms.filter(p => p.agentId === agentId)) {
      await API.revokePermission(p.id);
    }
    await this.navigate('permissions');
  },

  // ─── Vault ─────────────────────────────────────

  showAddDataForm() {
    const form = document.getElementById('addDataForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    form.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="card-title" style="margin-bottom:12px">Add Data to Vault</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Category</label>
            <select id="dataCategory" class="chat-input" style="width:100%">
              <option value="transactions">Transactions</option>
              <option value="emis">EMIs</option>
              <option value="bills">Bills</option>
              <option value="health_metrics">Health Metrics</option>
              <option value="properties">Properties</option>
              <option value="investments">Investments</option>
              <option value="expenses">Expenses</option>
              <option value="income">Income</option>
              <option value="notes">Notes</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Key</label>
            <input id="dataKey" class="chat-input" style="width:100%" placeholder="e.g. home-loan-emi" />
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Data (JSON)</label>
          <input id="dataValue" class="chat-input" style="width:100%" placeholder='{"amount": 1200, "bank": "HDFC", "dueDate": "15th"}' />
        </div>
        <button class="btn btn-primary" onclick="App.submitVaultData()">Save to Vault</button>
      </div>
    `;
  },

  async submitVaultData() {
    const category = document.getElementById('dataCategory').value;
    const key = document.getElementById('dataKey').value;
    const valueStr = document.getElementById('dataValue').value;

    if (!key || !valueStr) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const data = JSON.parse(valueStr);
      await API.storeData(category, key, data);
      await this.navigate('vault');
    } catch (err) {
      alert('Invalid JSON or error: ' + err.message);
    }
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
