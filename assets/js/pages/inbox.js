import { db } from '../firebase-init.js';
import { getCurrentUser } from '../services/auth.js';

export default {
    render: async () => {
        // Kontainer utama dengan gaya inline untuk memastikan tata letak layar penuh
        return `
            <div id="inbox-page-container" style="display: flex; flex-direction: column; height: 100vh; background-color: #F8F9FD;">
                <div class="page-header" style="padding: 1.5rem 2rem; border-bottom: 1px solid #EAEBF0; background-color: #FFFFFF; flex-shrink: 0;">
                    <h2 class="page-title" style="margin: 0; font-size: 1.5rem;">Inbox</h2>
                </div>
                <div id="chat-messages" style="flex-grow: 1; overflow-y: auto; padding: 1.5rem; background-color: #F8F9FD;">
                    <p style="text-align: center; color: #697586;">Memuat pesan...</p>
                </div>
                <div class="chat-input-area" style="display: flex; padding: 1rem; border-top: 1px solid #EAEBF0; background-color: #FFFFFF; flex-shrink: 0;">
                    <input type="text" id="chat-input" placeholder="Ketik pesan Anda..." style="flex-grow: 1; border: 1px solid #EAEBF0; border-radius: 50px; padding: 10px 20px; margin-right: 1rem; font-size: 15px;">
                    <button id="send-chat-btn" class="btn" style="background-color: #007AFF; color: white; border-radius: 50px; padding: 10px 24px; border: none; font-weight: 600; cursor: pointer;">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
    },
    afterRender: async () => {
        const user = await getCurrentUser();
        if (!user) {
            location.hash = '/auth';
            return;
        }

        const chatMessagesContainer = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-chat-btn');

        const messagesRef = db.ref(`messages/${user.uid}`);

        const sendMessage = () => {
            const text = chatInput.value.trim();
            if (text) {
                messagesRef.push({
                    text: text,
                    senderId: user.uid,
                    timestamp: Date.now()
                });
                chatInput.value = '';
            }
        };

        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        messagesRef.on('value', (snapshot) => {
            chatMessagesContainer.innerHTML = ''; // Hapus pesan lama
            const messages = snapshot.val();
            if (messages) {
                Object.values(messages).sort((a, b) => a.timestamp - b.timestamp).forEach(msg => {
                    const messageEl = document.createElement('div');
                    // Gaya umum untuk semua gelembung pesan
                    messageEl.style.display = 'flex';
                    messageEl.style.marginBottom = '1rem';
                    
                    const textEl = document.createElement('p');
                    textEl.textContent = msg.text;
                    // Gaya umum untuk teks
                    textEl.style.maxWidth = '80%';
                    textEl.style.padding = '0.75rem 1rem';
                    textEl.style.borderRadius = '18px';
                    textEl.style.lineHeight = '1.5';
                    textEl.style.margin = '0';

                    if (msg.senderId === user.uid) {
                        messageEl.style.justifyContent = 'flex-end';
                        textEl.style.backgroundColor = '#007AFF';
                        textEl.style.color = 'white';
                        textEl.style.borderBottomRightRadius = '4px';
                    } else {
                        messageEl.style.justifyContent = 'flex-start';
                        textEl.style.backgroundColor = '#FFFFFF';
                        textEl.style.color = '#1D2A39';
                        textEl.style.border = '1px solid #EAEBF0';
                        textEl.style.borderBottomLeftRadius = '4px';
                    }
                    
                    messageEl.appendChild(textEl);
                    chatMessagesContainer.appendChild(messageEl);
                });
            } else {
                chatMessagesContainer.innerHTML = '<p style="text-align: center; color: #697586;">Belum ada pesan.</p>';
            }
            // Selalu scroll ke pesan paling bawah
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        });
    }
};