// storapedia/assets/js/pages/inbox.js
import { db } from '../firebase-init.js';
import { getCurrentUser } from '../services/auth.js';
import { showLoader, showToast } from '../ui/ui-helpers.js';

let chatListener = null;

export default {
    render: async () => `
            <h2 class="page-title"></h2>
        </div>
            <div id="chat-messages" class="chat-messages-display">
                </div>
            <div class="chat-input-controls">
                <input type="text" id="chat-input" class="chat-text-input" placeholder="Type your message..." autocomplete="off">
                <button id="chat-send-btn" class="chat-send-button"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `,
    afterRender: async () => {
        const user = getCurrentUser();
        if (!user) {
            location.hash = '#/auth';
            return;
        }

        const chatMessagesEl = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');

        if (chatListener) {
            chatListener.off();
        }

        chatListener = db.ref(`chats/${user.uid}/messages`).orderByChild('timestamp');

        chatListener.on('value', (snapshot) => {
            chatMessagesEl.innerHTML = '';
            if (snapshot.exists()) {
                snapshot.forEach((child) => {
                    const msg = child.val();
                    const messageContainer = document.createElement('div');
                    messageContainer.className = `message-container ${msg.sender === 'user' ? 'sent' : 'received'}`;

                    const messageBubbleContent = document.createElement('div');
                    messageBubbleContent.className = 'message-bubble-content';
                    messageBubbleContent.textContent = msg.text;

                    const messageMeta = document.createElement('div');
                    messageMeta.className = 'message-meta';
                    
                    const senderName = document.createElement('span');
                    senderName.className = 'message-sender-name';
                    senderName.textContent = msg.sender === 'user' ? 'You' : 'Admin';

                    const timestampEl = document.createElement('span');
                    timestampEl.className = 'message-timestamp';
                    const date = new Date(msg.timestamp);
                    timestampEl.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    messageMeta.appendChild(senderName);
                    messageMeta.appendChild(timestampEl);

                    messageContainer.appendChild(messageBubbleContent);
                    messageContainer.appendChild(messageMeta);
                    chatMessagesEl.appendChild(messageContainer);
                });
            } else {
                // Initial welcome message if no chats exist
                const initialMessageContainer = document.createElement('div');
                initialMessageContainer.className = 'message-container received';
                const initialBubbleContent = document.createElement('div');
                initialBubbleContent.className = 'message-bubble-content';
                initialBubbleContent.textContent = 'Hello! How can we help you today?';
                const initialMeta = document.createElement('div');
                initialMeta.className = 'message-meta';
                const initialSender = document.createElement('span');
                initialSender.className = 'message-sender-name';
                initialSender.textContent = 'Admin';
                const initialTimestamp = document.createElement('span');
                initialTimestamp.className = 'message-timestamp';
                initialTimestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                initialMeta.appendChild(initialSender);
                initialMeta.appendChild(initialTimestamp);
                initialMessageContainer.appendChild(initialBubbleContent);
                initialMessageContainer.appendChild(initialMeta);
                chatMessagesEl.appendChild(initialMessageContainer);
            }
            chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        }, (error) => {
            console.error("Error fetching chat messages:", error);
            showToast('Failed to load chat messages.', 'error');
        });

        chatSendBtn.addEventListener('click', async () => {
            const text = chatInput.value.trim();
            if (!text) return;

            showLoader(true, 'Sending message...');
            try {
                const messageData = {
                    sender: 'user',
                    text: text,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    read: false
                };

                await db.ref(`chats/${user.uid}/messages`).push(messageData);
                await db.ref(`chats/${user.uid}/lastMessage`).set({
                    text: text,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    read: false
                });

                chatInput.value = '';
                showLoader(false);
            } catch (error) {
                console.error("Error sending message:", error);
                showToast('Failed to send message.', 'error');
                showLoader(false);
            }
        });

        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                chatSendBtn.click();
            }
        });
    }
};