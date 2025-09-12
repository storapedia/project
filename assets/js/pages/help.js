import { getDataFromPath } from '../services/firebase-api.js';

export default {
  render: async () => {
    const snapshot = await getDataFromPath('faqs');
    if (!snapshot || !snapshot.exists()) return `<div class="content-wrapper"><p>Content could not be loaded.</p></div>`;
    
    const faqsData = snapshot.val();
    let faqHtml = '';

    for (const categoryId in faqsData) {
        const category = faqsData[categoryId];
        faqHtml += `<h3 class="faq-category-title">${category.title}</h3>`;
        if (category.items) {
          faqHtml += '<div class="accordion">';
          for (const itemId in category.items) {
            const item = category.items[itemId];
            faqHtml += `
              <div class="accordion-item">
                <button class="accordion-header">
                  <span>${item.q}</span>
                  <i class="fas fa-chevron-down"></i>
                </button>
                <div class="accordion-content">
                  <p>${item.a.replace(/\n/g, '<br>')}</p>
                </div>
              </div>`;
          }
          faqHtml += '</div>';
        }
    }

    return `
        <div class="content-wrapper static-page-container">
          <div class="page-header">
            <h2 class="page-title">Help Center</h2>
            <p class="page-subtitle">Finding the answers you need.</p>
          </div>
          ${faqHtml}
        </div>`;
  },
  afterRender: async () => {
    document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => header.parentElement.classList.toggle('active'));
    });
  }
};