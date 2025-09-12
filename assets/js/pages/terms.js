import { getDataFromPath } from '../services/firebase-api.js';

export default {
  render: async () => {
    const snapshot = await getDataFromPath('tnc/0');
    if (!snapshot || !snapshot.exists()) return `<div class="content-wrapper"><p>Content could not be loaded.</p></div>`;
    
    const data = snapshot.val();
    const formattedContent = data.content.replace(/\n/g, '<br>');
    
    return `
        <div class="content-wrapper static-page-container">
          <div class="page-header">
            <h2 class="page-title">${data.title}</h2>
            <p class="page-subtitle">Last Updated: August 10, 2025</p>
          </div>
          <div class="static-content-card">${formattedContent}</div>
        </div>`;
  },
  afterRender: async () => {}
};