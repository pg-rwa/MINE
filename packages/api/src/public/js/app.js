/**
 * MINE App Controller
 */
const App = {
  currentView: 'dashboard',
  chatAgentId: null,
  conversationId: null,

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
      integrations: 'Integrations',
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
      // Auto-grant read+write permissions for required resources
      const available = await API.getAvailableAgents();
      const agent = available.find(a => a.id === agentId);
      if (agent) {
        const allResources = [...agent.requiredPermissions, ...(agent.optionalPermissions || [])];
        for (const resource of allResources) {
          try {
            await API.grantPermission(agentId, resource, 'act_with_approval', ['read', 'write'], '90d');
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
    this.conversationId = null; // Start fresh conversation
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

  async loadConversation(conversationId) {
    this.conversationId = conversationId;
    await this.navigate('chat');
    // Scroll to bottom
    setTimeout(() => {
      const el = document.getElementById('chatMessages');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  },

  async newConversation() {
    this.conversationId = null;
    await this.navigate('chat');
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
      const response = await API.sendMessage(text, this.chatAgentId, this.conversationId);

      // Track conversationId so subsequent messages go to the same conversation
      if (response.conversationId) {
        this.conversationId = response.conversationId;
      }

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

      // Handle actions
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
          if (action.type === 'show_widget' && action.payload.widget === 'inline_form') {
            actionsHtml += App.renderInlineForm(action.payload.form, response.agentId);
          }
        });
      }

      // Format content with newlines
      const formattedContent = esc(response.content).replace(/\n/g, '<br/>');

      messages.innerHTML += `
        <div class="message agent">
          <div class="message-avatar">${emojiStr}</div>
          <div>
            <div class="message-bubble">
              <strong style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">${esc(response.agentId)}</strong>
              ${formattedContent}
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

  // ─── Inline Forms ──────────────────────────────

  renderInlineForm(form, agentId) {
    const formId = 'form-' + Date.now();
    const fieldsHtml = form.fields.map(f => {
      let inputHtml = '';
      if (f.type === 'select') {
        inputHtml = `<select name="${f.name}" class="chat-input" style="width:100%;padding:8px 12px">
          ${f.options.map(o => `<option value="${o}" ${f.value === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>`;
      } else if (f.type === 'date') {
        inputHtml = `<input type="date" name="${f.name}" class="chat-input" style="width:100%;padding:8px 12px" value="${new Date().toISOString().split('T')[0]}" />`;
      } else {
        inputHtml = `<input type="${f.type || 'text'}" name="${f.name}" class="chat-input" style="width:100%;padding:8px 12px" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''} />`;
      }
      return `
        <div style="margin-bottom:10px">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">${f.label}${f.required ? ' *' : ''}</label>
          ${inputHtml}
        </div>
      `;
    }).join('');

    return `
      <div id="${formId}" style="margin-top:12px;padding:14px;background:var(--bg);border:1px solid var(--border-light);border-radius:var(--radius-sm)">
        ${fieldsHtml}
        <button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="App.submitInlineForm('${formId}', '${form.id}', '${form.category}', '${agentId}')">
          Save
        </button>
      </div>
    `;
  },

  async submitInlineForm(formId, formType, category, agentId) {
    const formEl = document.getElementById(formId);
    if (!formEl) return;

    const inputs = formEl.querySelectorAll('input, select');
    const data = { _formId: formType, _category: category };
    let hasRequired = true;

    inputs.forEach(input => {
      const val = input.value.trim();
      if (input.required && !val) {
        hasRequired = false;
        input.style.borderColor = 'var(--red)';
      } else {
        input.style.borderColor = '';
      }
      if (val) {
        // Auto-convert numbers
        data[input.name] = input.type === 'number' ? parseFloat(val) : val;
      }
    });

    if (!hasRequired) return;

    // Disable the save button
    const btn = formEl.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    // Send as a message to the agent
    const saveText = JSON.stringify(data);
    const messages = document.getElementById('chatMessages');

    // Show compact user message
    messages.innerHTML += `
      <div class="message user">
        <div class="message-avatar">P</div>
        <div><div class="message-bubble" style="font-size:12px">Submitted ${category} data</div></div>
      </div>
    `;

    // Remove the form
    formEl.innerHTML = '<div style="text-align:center;color:var(--green);font-size:12px;padding:8px">Submitted!</div>';

    try {
      const response = await API.sendMessage(saveText, agentId);
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

      messages.innerHTML += `
        <div class="message agent">
          <div class="message-avatar">${emojiStr}</div>
          <div>
            <div class="message-bubble">
              <strong style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">${esc(response.agentId)}</strong>
              ${esc(response.content)}
            </div>
            ${suggestionsHtml}
          </div>
        </div>
      `;
    } catch (err) {
      messages.innerHTML += `
        <div class="message agent">
          <div class="message-avatar">!</div>
          <div><div class="message-bubble" style="border-color:var(--red)">Error saving: ${esc(err.message)}</div></div>
        </div>
      `;
    }

    messages.scrollTop = messages.scrollHeight;
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

  // ─── Integrations ─────────────────────────────

  async connectIntegration(integrationId) {
    try {
      const result = await API.startAuth(integrationId);

      if (result.status === 'redirect' && result.authUrl) {
        // Real OAuth — redirect to provider
        window.location.href = result.authUrl;
      } else if (result.status === 'not_configured') {
        // API keys not set — offer demo connect
        if (confirm(`${result.message}\n\nWould you like to connect in demo mode instead?`)) {
          await API.connectDemo(integrationId);
          await this.navigate('integrations');
        }
      } else if (result.error === 'coming_soon') {
        alert(result.message);
      }
    } catch (err) {
      // Fallback: demo connect
      if (confirm(`OAuth not configured yet. Connect in demo mode?`)) {
        await API.connectDemo(integrationId);
        await this.navigate('integrations');
      }
    }
  },

  async disconnectIntegration(connectionId) {
    if (!confirm('Disconnect this integration?')) return;
    await API.disconnectIntegration(connectionId);
    await this.navigate('integrations');
  },

  async syncIntegration(connectionId) {
    try {
      await API.syncIntegration(connectionId);
      alert('Sync triggered successfully!');
    } catch (err) {
      alert('Sync failed: ' + err.message);
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
