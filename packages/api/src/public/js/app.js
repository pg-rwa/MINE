/**
 * MINE App Controller
 */
const App = {
  currentView: 'dashboard',
  chatAgentId: null,
  conversationId: null,
  _eventSource: null,

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

    // Connect to activity stream
    this.connectActivityStream();

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

  // ─── Activity Stream (SSE) ─────────────────────

  connectActivityStream() {
    if (this._eventSource) {
      this._eventSource.close();
    }

    this._eventSource = new EventSource('/api/activity/stream');

    this._eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.addActivityItem(data);
      } catch { /* ignore parse errors */ }
    };

    this._eventSource.onerror = () => {
      // Auto-reconnect is built into EventSource.
      // Just update the panel to show disconnected state briefly.
      const statusEl = document.getElementById('activityStatus');
      if (statusEl) statusEl.textContent = 'Reconnecting...';
      setTimeout(() => {
        const s = document.getElementById('activityStatus');
        if (s) s.textContent = 'Live';
      }, 3000);
    };
  },

  addActivityItem(event) {
    const feed = document.getElementById('activityFeed');
    if (!feed) return;

    // Remove empty state
    const emptyState = feed.querySelector('.activity-empty');
    if (emptyState) emptyState.remove();

    const item = document.createElement('div');
    item.className = `activity-item activity-${event.status || 'running'}`;
    item.dataset.eventId = event.id;

    const iconMap = {
      routing_started: '&#128269;',   // magnifying glass
      agent_selected: '&#9989;',      // check
      agent_processing: '&#9881;',    // gear
      ai_call_started: '&#129504;',   // brain
      ai_call_completed: '&#129504;', // brain
      agent_delegation: '&#128257;',  // arrows
      agent_responded: '&#9989;',     // check
      error: '&#9888;',               // warning
      info: '&#128161;',              // lightbulb
    };

    const statusClass = event.status === 'error' ? 'error'
      : event.status === 'completed' ? 'done'
      : 'running';

    const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    item.innerHTML = `
      <div class="activity-item-icon ${statusClass}">${iconMap[event.type] || '&#128172;'}</div>
      <div class="activity-item-body">
        <div class="activity-item-msg">${esc(event.message)}</div>
        ${event.detail ? `<div class="activity-item-detail">${esc(event.detail)}</div>` : ''}
        <div class="activity-item-meta">
          ${event.agentId ? `<span class="activity-agent-tag">${esc(event.agentId)}</span>` : ''}
          <span class="activity-item-time">${time}</span>
        </div>
      </div>
      <div class="activity-item-status">
        ${statusClass === 'running' ? '<div class="activity-dot-pulse"></div>' : ''}
        ${statusClass === 'done' ? '<span style="color:var(--green)">&#10003;</span>' : ''}
        ${statusClass === 'error' ? '<span style="color:var(--red)">&#10007;</span>' : ''}
      </div>
    `;

    feed.appendChild(item);

    // Auto-scroll to bottom
    feed.scrollTop = feed.scrollHeight;

    // Limit to 100 items
    while (feed.children.length > 100) {
      feed.removeChild(feed.firstChild);
    }
  },

  clearActivity() {
    const feed = document.getElementById('activityFeed');
    if (feed) {
      feed.innerHTML = '<div class="activity-empty">No activity yet. Send a message to see live agent activity.</div>';
    }
  },

  toggleActivityPanel() {
    const panel = document.getElementById('activityPanel');
    if (panel) {
      panel.classList.toggle('collapsed');
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
    this.conversationId = null;
    document.querySelectorAll('.chat-agent-select .agent-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    // Reload entire chat view (sidebar + messages) for this agent
    this.navigate('chat');
  },

  async refreshConversationSidebar() {
    try {
      const conversations = await API.getConversations(20, this.chatAgentId);
      const listEl = document.querySelector('.chat-sidebar-list');
      if (!listEl) return;

      if (conversations.length === 0) {
        listEl.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px">No conversations yet</div>';
      } else {
        listEl.innerHTML = conversations.map(c => `
          <div class="conversation-item ${c.id === this.conversationId ? 'active' : ''}" onclick="App.loadConversation('${c.id}')">
            <div class="conversation-item-content">
              <div class="conversation-title">${esc(c.title || 'Untitled')}</div>
              <div class="conversation-meta">${new Date(c.lastMessageAt || c.createdAt).toLocaleDateString()}</div>
            </div>
            <button class="conversation-delete" onclick="event.stopPropagation(); App.deleteConversation('${c.id}')" title="Delete conversation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/></svg>
            </button>
          </div>
        `).join('');
      }
    } catch { /* ignore */ }
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

  async deleteConversation(conversationId) {
    if (!confirm('Delete this conversation?')) return;
    try {
      await API.deleteConversation(conversationId);
      // If we deleted the active conversation, clear it
      if (this.conversationId === conversationId) {
        this.conversationId = null;
      }
      await this.navigate('chat');
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  },

  // ─── File Attachment State ──────────────────────────
  pendingAttachments: [],

  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const result = await API.uploadFile(file);
      this.pendingAttachments.push(result);
      this.updateAttachmentPreview();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }

    // Reset file input so the same file can be re-selected
    event.target.value = '';
  },

  removeAttachment(index) {
    this.pendingAttachments.splice(index, 1);
    this.updateAttachmentPreview();
  },

  updateAttachmentPreview() {
    const preview = document.getElementById('attachmentPreview');
    if (!preview) return;

    if (this.pendingAttachments.length === 0) {
      preview.style.display = 'none';
      preview.innerHTML = '';
      return;
    }

    preview.style.display = 'flex';
    preview.innerHTML = this.pendingAttachments.map((att, i) => {
      const icon = att.type === 'image'
        ? `<img src="${att.uri}" alt="${esc(att.filename)}" />`
        : '📄';
      return `<div class="attachment-chip">
        ${icon}
        <span>${esc(att.filename)}</span>
        <span class="remove-attachment" onclick="App.removeAttachment(${i})">&times;</span>
      </div>`;
    }).join('');
  },

  async sendChat() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text && this.pendingAttachments.length === 0) return;

    input.value = '';

    // Grab and clear pending attachments
    const attachments = [...this.pendingAttachments];
    this.pendingAttachments = [];
    this.updateAttachmentPreview();

    // Disable send while processing
    const sendBtn = document.querySelector('.chat-send');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Working...';
    }

    const messages = document.getElementById('chatMessages');

    // Build user message HTML with attachment previews
    let attachmentHtml = '';
    if (attachments.length > 0) {
      attachmentHtml = '<div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">' +
        attachments.map(att => {
          if (att.type === 'image') {
            return `<img src="${att.uri}" alt="${esc(att.filename)}" style="max-width:200px;max-height:150px;border-radius:8px" />`;
          }
          return `<span class="attachment-chip">📄 ${esc(att.filename)}</span>`;
        }).join('') + '</div>';
    }

    // Add user message
    const userMsgDiv = document.createElement('div');
    userMsgDiv.className = 'message user';
    userMsgDiv.innerHTML = `
      <div class="message-avatar">P</div>
      <div>${attachmentHtml}<div class="message-bubble">${esc(text || 'Sent attachment(s)')}</div></div>
    `;
    messages.appendChild(userMsgDiv);
    messages.scrollTop = messages.scrollHeight;

    // Show simple typing indicator in chat (activity panel shows the details)
    const typingId = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message agent';
    typingDiv.id = typingId;
    typingDiv.innerHTML = `
      <div class="message-avatar"><div class="activity-dot-pulse"></div></div>
      <div><div class="message-bubble" style="color:var(--text-muted);font-size:13px">
        Processing<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>
        <span style="font-size:11px;color:var(--text-dim);margin-left:8px">see activity panel &rarr;</span>
      </div></div>
    `;
    messages.appendChild(typingDiv);
    messages.scrollTop = messages.scrollHeight;

    try {
      const msgAttachments = attachments.length > 0 ? attachments.map(a => ({
        type: a.type, uri: a.uri, mimeType: a.mimeType, filename: a.filename,
      })) : undefined;
      const response = await API.sendMessage(text || 'Please analyze the attached file(s)', this.chatAgentId, this.conversationId, msgAttachments);

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
        // Group select_item actions into a clickable result list
        const selectItems = response.actions.filter(a => a.type === 'select_item');
        if (selectItems.length > 0) {
          actionsHtml += '<div class="select-item-list">';
          selectItems.forEach((action, idx) => {
            const p = action.payload;
            const label = esc(p.label || `Item ${idx + 1}`);
            const subtitle = p.subtitle ? `<span class="select-item-subtitle">${esc(p.subtitle)}</span>` : '';
            const icon = p.icon ? esc(p.icon) : '📄';
            const msg = esc(p.message || `open:${p.key || idx}`);
            actionsHtml += `
              <div class="select-item" onclick="App.useSuggestion('${msg}')">
                <span class="select-item-icon">${icon}</span>
                <div class="select-item-content">
                  <span class="select-item-label">${label}</span>
                  ${subtitle}
                </div>
                <span class="select-item-arrow">›</span>
              </div>
            `;
          });
          actionsHtml += '</div>';
        }

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
          // Handle navigate-to-agent: switch to target agent chat and auto-send message
          if (action.type === 'navigate' && action.payload.agent) {
            setTimeout(() => {
              App.handoffToAgent(action.payload.agent, action.payload.message, action.payload.autoSend);
            }, 800);
          }
        });
      }

      // Format content with newlines
      const formattedContent = esc(response.content).replace(/\n/g, '<br/>');

      const responseDiv = document.createElement('div');
      responseDiv.className = 'message agent';
      responseDiv.innerHTML = `
        <div class="message-avatar">${emojiStr}</div>
        <div>
          <div class="message-bubble">
            <strong style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">${esc(response.agentId)}</strong>
            ${formattedContent}
            ${actionsHtml}
          </div>
          ${suggestionsHtml}
        </div>
      `;
      messages.appendChild(responseDiv);

      // Refresh sidebar to show new conversation
      this.refreshConversationSidebar();

    } catch (err) {
      document.getElementById(typingId)?.remove();

      // Show error in chat
      const errorDiv = document.createElement('div');
      errorDiv.className = 'message agent';
      errorDiv.innerHTML = `
        <div class="message-avatar" style="background:var(--red-bg);color:var(--red)">!</div>
        <div>
          <div class="message-bubble error-bubble">
            <div class="error-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <strong>Agent Error</strong>
            </div>
            <div class="error-detail">${esc(err.message)}</div>
          </div>
        </div>
      `;
      messages.appendChild(errorDiv);
    }

    // Re-enable send button
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }

    messages.scrollTop = messages.scrollHeight;
  },

  useSuggestion(text) {
    document.getElementById('chatInput').value = text;
    this.sendChat();
  },

  /**
   * Handoff to another agent: switch to their chat and optionally auto-send a message.
   * This gives users a seamless cross-agent experience instead of flaky background delegation.
   */
  async handoffToAgent(agentId, message, autoSend) {
    this.chatAgentId = agentId;
    this.conversationId = null;
    await this.navigate('chat');

    // Activate the correct agent chip
    setTimeout(() => {
      document.querySelectorAll('.agent-chip').forEach(el => {
        el.classList.toggle('active', el.dataset.agent === agentId);
      });

      if (message) {
        const input = document.getElementById('chatInput');
        if (input) {
          input.value = message;
          if (autoSend) {
            this.sendChat();
          }
        }
      }
    }, 150);
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
        data[input.name] = input.type === 'number' ? parseFloat(val) : val;
      }
    });

    if (!hasRequired) return;

    const btn = formEl.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const saveText = JSON.stringify(data);
    const messages = document.getElementById('chatMessages');

    messages.innerHTML += `
      <div class="message user">
        <div class="message-avatar">P</div>
        <div><div class="message-bubble" style="font-size:12px">Submitted ${category} data</div></div>
      </div>
    `;

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
        window.location.href = result.authUrl;
      } else if (result.status === 'not_configured') {
        if (confirm(`${result.message}\n\nWould you like to connect in demo mode instead?`)) {
          await API.connectDemo(integrationId);
          await this.navigate('integrations');
        }
      } else if (result.error === 'coming_soon') {
        alert(result.message);
      }
    } catch (err) {
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
