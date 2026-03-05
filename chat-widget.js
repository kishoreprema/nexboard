/**
 * NEXBOARD - Chat Widget & Global Notifications
 * This script runs independently and provides chat features on the board page,
 * and global unread notifications on dashboard pages.
 */

const CHAT_API_URL = 'http://localhost:3000/api';
const CHAT_currentUserLine = localStorage.getItem('nexboard_currentUser');
const CHAT_User = CHAT_currentUserLine ? JSON.parse(CHAT_currentUserLine) : null;

let chatMessages = [];
let chatPollInterval = null;
let chatProjectMembers = [];
let chatMentionUserId = null;
let chatMentionActiveIndex = -1;
let lastKnownMsgCount = -1;
let chatUnreadCount = 0;
let chatPanelOpen = false;
let chatListenersInitialized = false;

// Shared AudioContext
let sharedAudioCtx = null;

function getAudioContext() {
    if (!sharedAudioCtx) {
        sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return sharedAudioCtx;
}

/**
 * Dynamically injects the chat widget HTML into the end of the body.
 * This allows us to remove the redundant chat blocks from every HTML file.
 */
function injectChatHTML() {
    if (document.getElementById('chat-toggle-btn')) return; // Already injected

    const chatHTML = `
        <!-- Chat Toggle Button -->
        <button id="chat-toggle-btn" class="chat-toggle-btn">
            <i class="fa-solid fa-comments"></i>
            <span id="chat-unread-badge" class="chat-unread-badge" style="display:none;">0</span>
        </button>

        <!-- Chat Panel -->
        <div id="chat-panel" class="chat-panel hidden">
            <div class="chat-panel-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-comments" style="color: #6554C0;"></i>
                    <h3 id="chat-panel-title">Global Chat Activity</h3>
                    <button id="chat-test-sound" type="button" title="Test Notification Sound"
                        style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);font-size:0.8rem;margin-left:8px;">
                        <i class="fa-solid fa-volume-high"></i>
                    </button>
                </div>
                <button id="chat-close-btn" type="button" class="close-btn"
                    style="background:transparent;border:none;cursor:pointer;font-size:1.1rem;color:var(--text-secondary);">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="chat-messages" id="chat-messages">
                <p class="chat-empty-msg">No messages yet.</p>
            </div>
            <div class="chat-input-area" style="display:none;">
                <div class="chat-mention-dropdown hidden" id="chat-mention-dropdown"></div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="text" id="chat-input" placeholder="Type a message... Use @ to mention" autocomplete="off">
                    <button id="chat-send-btn" type="button" class="primary-btn"
                        style="padding: 8px 14px; font-size: 0.9rem; white-space: nowrap;">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = chatHTML;
    document.body.appendChild(wrapper);
}

document.addEventListener('click', function unlockAudio() {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    document.removeEventListener('click', unlockAudio);
}, { once: true });

async function playNotificationSound() {
    try {
        const audioCtx = getAudioContext();
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        if (audioCtx.state === 'suspended') return;

        const notes = [880, 1108.73, 1318.51];
        const durations = [0.12, 0.12, 0.2];
        let startTime = audioCtx.currentTime;

        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + durations[i]);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(startTime);
            osc.stop(startTime + durations[i]);
            startTime += durations[i] * 0.7;
        });
    } catch (e) {
        console.error('[Chat] Audio Error:', e);
    }
}

function updateUnreadBadge() {
    const badge = document.getElementById('chat-unread-badge');
    if (!badge) return;

    if (chatUnreadCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = chatUnreadCount > 99 ? '99+' : chatUnreadCount;
        if (typeof currentProjectId !== 'undefined') {
            localStorage.setItem(`nexboard_unread_${currentProjectId}`, chatUnreadCount);
        } else {
            localStorage.setItem(`nexboard_unread_global`, chatUnreadCount);
        }
    } else {
        badge.style.display = 'none';
        if (typeof currentProjectId !== 'undefined') {
            localStorage.removeItem(`nexboard_unread_${currentProjectId}`);
        } else {
            localStorage.removeItem(`nexboard_unread_global`);
        }
    }
}

function setupChat() {
    console.log('[Chat] setupChat called. Project ID:', (typeof currentProjectId !== 'undefined' ? currentProjectId : 'global'));
    if (!CHAT_User) {
        console.warn('[Chat] No user found, skipping setup.');
        return;
    }

    // Inject HTML first before trying to find elements
    injectChatHTML();

    window.setupChat = setupChat; // Expose globally

    const toggleBtn = document.getElementById('chat-toggle-btn');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close-btn');
    const sendBtn = document.getElementById('chat-send-btn');
    const chatInput = document.getElementById('chat-input');

    if (!toggleBtn) return;

    // Load persisted unread count
    let savedUnread = null;
    if (typeof currentProjectId !== 'undefined' && currentProjectId) {
        savedUnread = localStorage.getItem(`nexboard_unread_${currentProjectId}`);
    } else {
        savedUnread = localStorage.getItem(`nexboard_unread_global`);
    }

    if (savedUnread) {
        chatUnreadCount = parseInt(savedUnread) || 0;
        updateUnreadBadge();
    }

    if (panel) {
        // --- 1. UI REFRESH (Safe to run multiple times) ---
        if (typeof currentProjectId !== 'undefined' && currentProjectId) {
            const titleEl = document.getElementById('chat-panel-title');
            if (titleEl) {
                if (typeof projects !== 'undefined') {
                    const proj = projects.find(p => String(p.id) === String(currentProjectId));
                    if (proj) titleEl.textContent = (proj.name || 'Project') + ' Chat';
                } else {
                    titleEl.textContent = 'Project Chat';
                }
            }
            // Show input area on project boards
            const inputArea = document.querySelector('.chat-input-area');
            if (inputArea) inputArea.style.display = 'block';
        } else {
            const titleEl = document.getElementById('chat-panel-title');
            if (titleEl) titleEl.textContent = 'Global Chat Activity';

            // Show input area on dashboards for global interactivity
            const inputArea = document.querySelector('.chat-input-area');
            if (inputArea) inputArea.style.display = 'block';
        }

        // --- 2. LISTENERS (ONLY ONCE) ---
        if (!chatListenersInitialized) {
            chatListenersInitialized = true;
            console.log('[Chat] Initializing event listeners');

            toggleBtn.addEventListener('click', (e) => {
                console.log('[Chat] Toggle clicked. Current state hidden:', panel.classList.contains('hidden'));
                if (panel.classList.contains('hidden')) {
                    panel.classList.remove('hidden');
                    chatPanelOpen = true;
                    chatUnreadCount = 0;
                    updateUnreadBadge();
                    loadChatMessages();
                    if (chatInput && typeof currentProjectId !== 'undefined') chatInput.focus();
                } else {
                    panel.classList.add('hidden');
                    chatPanelOpen = false;
                }
            });

            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    panel.classList.add('hidden');
                    chatPanelOpen = false;
                });
            }

            if (sendBtn) sendBtn.addEventListener('click', (e) => {
                e.preventDefault();
                sendChatMessage();
            });

            if (chatInput) {
                chatInput.addEventListener('keydown', (e) => {
                    const dropdown = document.getElementById('chat-mention-dropdown');
                    const isDropdownVisible = dropdown && !dropdown.classList.contains('hidden');

                    if (e.key === 'Enter' && !isDropdownVisible) {
                        e.preventDefault();
                        sendChatMessage();
                    } else if (e.key === 'Enter' && isDropdownVisible) {
                        e.preventDefault();
                        selectMentionItem();
                    } else if (e.key === 'ArrowDown' && isDropdownVisible) {
                        e.preventDefault();
                        navigateMention(1);
                    } else if (e.key === 'ArrowUp' && isDropdownVisible) {
                        e.preventDefault();
                        navigateMention(-1);
                    } else if (e.key === 'Escape' && isDropdownVisible) {
                        closeMentionDropdown();
                    }
                });

                chatInput.addEventListener('input', handleChatInput);
            }

            const testBtn = document.getElementById('chat-test-sound');
            if (testBtn) {
                testBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    playNotificationSound();
                });
            }
        }
    }

    loadChatMembers();
}

async function loadChatMembers() {
    try {
        let url = '';
        if (typeof currentProjectId !== 'undefined' && currentProjectId) {
            url = `${CHAT_API_URL}/projects/${currentProjectId}/users`;
        } else {
            url = `${CHAT_API_URL}/users`;
        }

        const res = await fetch(url);
        if (res.ok) {
            chatProjectMembers = await res.json();
        }
        if (CHAT_User && !chatProjectMembers.find(m => m.id === CHAT_User.id)) {
            if (typeof users !== 'undefined') {
                const u = users.find(u => u.id === CHAT_User.id);
                if (u) chatProjectMembers.push(u);
            }
        }
    } catch (err) {
        console.error('Failed to load chat members:', err);
        if (typeof users !== 'undefined') chatProjectMembers = users;
    }
}

async function loadChatMessages() {
    if (!CHAT_User) return;
    try {
        let url = '';
        if (typeof currentProjectId !== 'undefined' && currentProjectId) {
            url = `${CHAT_API_URL}/projects/${currentProjectId}/messages`;
        } else {
            url = `${CHAT_API_URL}/users/${CHAT_User.id}/messages`;
        }

        const res = await fetch(url);
        if (res.ok) {
            const msgs = await res.json();
            const prevCount = lastKnownMsgCount;
            const newCount = msgs.length;

            if (newCount > prevCount && prevCount !== -1) {
                const newMsgs = msgs.slice(prevCount);
                const fromOthers = newMsgs.filter(m => m.userId !== CHAT_User.id);

                if (fromOthers.length > 0) {
                    playNotificationSound();
                    if (!chatPanelOpen) {
                        chatUnreadCount += fromOthers.length;
                        updateUnreadBadge();
                    }
                }
            }

            lastKnownMsgCount = newCount;
            chatMessages = msgs;
            console.log(`[Chat] Loaded ${msgs.length} messages`);

            if (chatPanelOpen) {
                renderChatMessages();
            }
        }
    } catch (err) {
        console.error('[Chat] Failed to load messages:', err);
    }
}

function renderChatMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    if (chatMessages.length === 0) {
        container.innerHTML = '<p class="chat-empty-msg">No messages yet.</p>';
        return;
    }

    container.innerHTML = chatMessages.map(msg => {
        const isOwn = msg.userId === CHAT_User.id;
        const time = new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const date = new Date(msg.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        let displayMsg = escapeHtml(msg.message);
        displayMsg = displayMsg.replace(/@(\w[\w\s]*?)(?=\s|$|@)/g, '<span class="chat-mention-tag">@$1</span>');

        let headerRow = '';
        if (typeof currentProjectId === 'undefined' || !currentProjectId) {
            headerRow = `<div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 4px;"><i class="fa-solid fa-folder"></i> ${msg.projectName || 'Project'}</div>`;
        }

        return `<div class="chat-msg ${isOwn ? 'own' : ''}">
            <div class="chat-msg-avatar" style="background-color: ${msg.color || '#6554C0'};">${msg.initials || '??'}</div>
            <div class="chat-msg-bubble">
                ${headerRow}
                <div class="chat-msg-name">${msg.userName || 'User'}</div>
                <div class="chat-msg-text">${displayMsg}</div>
                <div class="chat-msg-time">${date} ${time}</div>
            </div>
        </div>`;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function sendChatMessage() {
    const activeProjectId = (typeof currentProjectId !== 'undefined' && currentProjectId) ? currentProjectId : 'global';

    const chatInput = document.getElementById('chat-input');
    if (!chatInput) return;
    const message = chatInput.value.trim();
    if (!message) return;

    try {
        console.log(`[Chat] Sending message to ${activeProjectId}`);
        const res = await fetch(`${CHAT_API_URL}/projects/${activeProjectId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: CHAT_User.id,
                message,
                mentionedUserId: chatMentionUserId || null
            })
        });

        if (res.ok) {
            console.log('[Chat] Message sent successfully');
            chatInput.value = '';
            chatMentionUserId = null;
            closeMentionDropdown();
            loadChatMessages();
        } else {
            const errData = await res.json();
            console.error('[Chat] Send failed:', errData);
            alert('Failed to send message: ' + (errData.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('[Chat] Error sending message:', err);
        alert('Error sending message. Check console.');
    }
}

function startChatPolling() {
    stopChatPolling();
    chatPollInterval = setInterval(loadChatMessages, 5000);
}

function stopChatPolling() {
    if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
    }
}

function handleChatInput(e) {
    const input = e.target;
    const val = input.value;
    const cursorPos = input.selectionStart;

    const textBeforeCursor = val.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1 && (atIndex === 0 || textBeforeCursor[atIndex - 1] === ' ')) {
        const query = textBeforeCursor.substring(atIndex + 1).toLowerCase();

        const everyoneOption = { id: 'all', name: 'Everyone', initials: '✦', color: '#6554C0', role: 'Notify all members' };
        const matchesEveryone = 'everyone'.includes(query) || 'all'.includes(query) || query === '';
        const filtered = chatProjectMembers.filter(m =>
            m.name.toLowerCase().includes(query)
        );

        const mentionList = matchesEveryone ? [everyoneOption, ...filtered] : filtered;

        if (mentionList.length > 0) {
            showMentionDropdown(mentionList);
            return;
        }
    }

    closeMentionDropdown();
}

function showMentionDropdown(members) {
    const dropdown = document.getElementById('chat-mention-dropdown');
    if (!dropdown) return;

    chatMentionActiveIndex = 0;
    dropdown.classList.remove('hidden');
    dropdown.innerHTML = members.map((m, i) => `
        <div class="chat-mention-item ${i === 0 ? 'active' : ''}" data-id="${m.id}" data-name="${m.name}">
            <div class="chat-mention-item-avatar" style="background-color: ${m.color || '#6554C0'};">${m.initials || '??'}</div>
            <div class="chat-mention-item-info">
                <span class="chat-mention-item-name">${m.name}</span>
                <span class="chat-mention-item-role">${m.role}</span>
            </div>
        </div>
    `).join('');

    dropdown.querySelectorAll('.chat-mention-item').forEach(item => {
        item.addEventListener('click', () => {
            insertMention(item.dataset.id, item.dataset.name);
        });
    });
}

function closeMentionDropdown() {
    const dropdown = document.getElementById('chat-mention-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    chatMentionActiveIndex = -1;
}

function navigateMention(direction) {
    const dropdown = document.getElementById('chat-mention-dropdown');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.chat-mention-item');
    if (items.length === 0) return;

    if (items[chatMentionActiveIndex]) items[chatMentionActiveIndex].classList.remove('active');
    chatMentionActiveIndex = (chatMentionActiveIndex + direction + items.length) % items.length;
    if (items[chatMentionActiveIndex]) items[chatMentionActiveIndex].classList.add('active');
    if (items[chatMentionActiveIndex]) items[chatMentionActiveIndex].scrollIntoView({ block: 'nearest' });
}

function selectMentionItem() {
    const dropdown = document.getElementById('chat-mention-dropdown');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.chat-mention-item');
    if (chatMentionActiveIndex >= 0 && items[chatMentionActiveIndex]) {
        const item = items[chatMentionActiveIndex];
        insertMention(item.dataset.id, item.dataset.name);
    }
}

function insertMention(userId, userName) {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput) return;
    const val = chatInput.value;
    const cursorPos = chatInput.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = val.substring(cursorPos);

    chatInput.value = val.substring(0, atIndex) + '@' + userName + ' ' + textAfterCursor;
    chatMentionUserId = userId;
    closeMentionDropdown();
    chatInput.focus();

    const newPos = atIndex + userName.length + 2;
    chatInput.setSelectionRange(newPos, newPos);
}

// Initialize chat widget
document.addEventListener('DOMContentLoaded', () => {
    // Run setup regardless - it handles internal checks for global vs project mode
    setupChat();
    startChatPolling();
    loadChatMessages();
});
