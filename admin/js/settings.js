// =====================================================================
// SETTINGS LOGIC
// =====================================================================

// Container untuk menyimpan event listener
const settingEventListeners = {};

// Fungsi utama untuk mengambil dan merender semua pengaturan
async function fetchAndRenderSettings() {
    const settingsSnap = await db.ref('settings').once('value');
    const settings = settingsSnap.val() || {};

    const faqsSnap = await db.ref('faqs').once('value');
    const faqs = faqsSnap.val() || {};
    
    const tncSnap = await db.ref('tnc').once('value');
    const tnc = tncSnap.val() || [];

    // Hapus event listener lama
    for (const event in settingEventListeners) {
        document.getElementById(event)?.removeEventListener('click', settingEventListeners[event]);
    }
    
    document.getElementById('website-settings-form').innerHTML = `
        <div class="setting-section">
            <h4 class="font-bold text-xl mb-4 cursor-pointer" onclick="toggleSection(this)">&#9660; Homepage Banner</h4>
            <div class="setting-content space-y-4">
                <div class="flex items-center gap-4 mb-4">
                    <img id="setting-banner-preview" src="${settings.banner?.imageUrl || 'https://placehold.co/200x100'}" class="w-48 h-auto rounded-lg shadow-md cursor-pointer">
                    <div>
                        <label for="setting-banner-image-upload" class="cursor-pointer bg-blue-500 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-blue-600">
                            Upload Image
                        </label>
                        <input id="setting-banner-image-upload" type="file" class="hidden" accept="image/*">
                        <p class="text-xs text-gray-500 mt-2">Or paste an image URL below.</p>
                    </div>
                </div>
                <input id="setting-banner-title" class="swal2-input mb-3 border border-gray-300 rounded-lg focus:ring-primary-500" placeholder="Banner Title" value="${settings.banner?.title || ''}">
                <textarea id="setting-banner-subtitle" class="swal2-textarea border border-gray-300 rounded-lg focus:ring-primary-500" placeholder="Banner Subtitle">${settings.banner?.subtitle || ''}</textarea>
                <input id="setting-banner-imageUrl" class="swal2-input border border-gray-300 rounded-lg focus:ring-primary-500" placeholder="Banner Image URL" value="${settings.banner?.imageUrl || ''}">
            </div>
        </div>

        <hr>
        <div class="setting-section">
            <h4 class="font-bold text-xl mb-4 cursor-pointer" onclick="toggleSection(this)">&#9660; Service Fees</h4>
            <div class="setting-content space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Pickup Fee ($) (Flat Rate)</label>
                    <input id="setting-pricing-pickupFee" type="text" class="swal2-input border border-gray-300 rounded-lg focus:ring-primary-500" placeholder="Pickup Fee" value="${String(settings.pricing?.pickupFee || 0).replace('.', ',')}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Per Km Fee ($)</label>
                    <input id="setting-pricing-kmFee" type="text" class="swal2-input border border-gray-300 rounded-lg focus:ring-primary-500" placeholder="Per Km Fee" value="${String(settings.pricing?.kmFee || 0).replace('.', ',')}">
                </div>
            </div>
        </div>

        <hr>
        <div class="setting-section">
            <h4 class="font-bold text-xl mb-4 cursor-pointer" onclick="toggleSection(this)">&#9660; Steps to Order</h4>
            <div id="easy-steps-container" class="setting-content space-y-4"></div>
            <button type="button" id="add-easy-step-btn" class="mt-4 text-blue-600 text-sm font-semibold hover:underline"><i class="fas fa-plus mr-1"></i>Add New Step</button>
        </div>

        <hr>
        <div class="setting-section">
            <h4 class="font-bold text-xl mb-4 cursor-pointer" onclick="toggleSection(this)">&#9660; FAQs</h4>
            <div id="faqs-container" class="setting-content space-y-4"></div>
            <button type="button" id="add-faq-btn-settings" class="mt-4 text-blue-600 text-sm font-semibold hover:underline"><i class="fas fa-plus mr-1"></i>Add New FAQ</button>
        </div>
        
        <hr>
        <div class="setting-section">
            <h4 class="font-bold text-xl mb-4 cursor-pointer" onclick="toggleSection(this)">&#9660; Policies (T&C, Refund, etc)</h4>
            <div id="policies-container" class="setting-content space-y-4"></div>
            <button type="button" id="add-policy-btn" class="mt-4 text-blue-600 text-sm font-semibold hover:underline"><i class="fas fa-plus mr-1"></i>Add New Policy</button>
        </div>

        <hr>
        <div class="setting-section">
            <h4 class="font-bold text-xl mb-4 cursor-pointer" onclick="toggleSection(this)">&#9660; Footer Links</h4>
            <div id="footer-links-container" class="setting-content space-y-4"></div>
            <button type="button" id="add-footer-link-btn" class="mt-4 text-blue-600 text-sm font-semibold hover:underline"><i class="fas fa-plus mr-1"></i>Add Footer Link</button>
        </div>

        <hr>
        <div class="setting-section">
            <h4 class="font-bold text-xl mb-4 cursor-pointer" onclick="toggleSection(this)">&#9660; Social Media</h4>
            <div id="social-media-container" class="setting-content space-y-4"></div>
            <button type="button" id="add-social-media-btn" class="mt-4 text-blue-600 text-sm font-semibold hover:underline"><i class="fas fa-plus mr-1"></i>Add Social Media Account</button>
        </div>
    `;

    // Initialize event listeners and content for new sections
    // Banner
    document.getElementById('setting-banner-preview').addEventListener('click', () => document.getElementById('setting-banner-image-upload').click());
    document.getElementById('setting-banner-image-upload').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('setting-banner-preview').src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
    document.getElementById('setting-banner-imageUrl').addEventListener('input', (e) => {
        if (e.target.value) document.getElementById('setting-banner-preview').src = e.target.value;
    });

    // Easy Steps
    const easyStepsContainer = document.getElementById('easy-steps-container');
    if (settings.easySteps) {
        Object.values(settings.easySteps).sort((a,b) => a.order - b.order).forEach(step => addEasyStepRow(easyStepsContainer, step.text, step.icon));
    }
    document.getElementById('add-easy-step-btn').addEventListener('click', () => addEasyStepRow(easyStepsContainer));

    // FAQs
    const faqsContainer = document.getElementById('faqs-container');
    Object.entries(faqs).forEach(([id, faq]) => addFaqRow(faqsContainer, id, faq.q, faq.a));
    document.getElementById('add-faq-btn-settings').addEventListener('click', () => addFaqRow(faqsContainer));

    // Policies (TNC)
    const policiesContainer = document.getElementById('policies-container');
    (tnc || []).forEach(policy => addPolicyRow(policiesContainer, policy.title, policy.content));
    document.getElementById('add-policy-btn').addEventListener('click', () => addPolicyRow(policiesContainer));

    // Footer Links
    const footerLinksContainer = document.getElementById('footer-links-container');
    if (settings.footerLinks) {
        Object.entries(settings.footerLinks).forEach(([category, links]) => {
            links.forEach(link => addFooterLinkRow(footerLinksContainer, category, link.text, link.url));
        });
    }
    document.getElementById('add-footer-link-btn').addEventListener('click', () => addFooterLinkRow(footerLinksContainer));
    
    // Social Media
    const socialMediaContainer = document.getElementById('social-media-container');
    (settings.social_media || []).forEach(sm => addSocialMediaRow(socialMediaContainer, sm.platform, sm.url));
    document.getElementById('add-social-media-btn').addEventListener('click', () => addSocialMediaRow(socialMediaContainer));

    // Tombol Save
    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'bg-gradient-to-r from-primary-600 to-primary-700 text-black font-bold py-2 px-8 rounded-full shadow-md hover:from-primary-700 hover:to-primary-800 transition mt-8';
    saveBtn.textContent = 'Save All Settings';
    document.getElementById('website-settings-form').appendChild(saveBtn);
    
    // Attach form submission handler
    document.getElementById('website-settings-form').addEventListener('submit', handleWebsiteSettingsSubmit);
}

// Fungsi untuk memperluas/menyembunyikan bagian pengaturan
function toggleSection(element) {
    const content = element.nextElementSibling;
    if (content) {
        content.classList.toggle('hidden');
        element.innerHTML = content.classList.contains('hidden') ? '&#9658; ' + element.textContent.substring(1) : '&#9660; ' + element.textContent.substring(1);
    }
}

// Fungsi untuk menambahkan baris Easy Step
function addEasyStepRow(container, text = '', icon = '') {
    const rowId = `easy-step-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'easy-step-row flex gap-2 items-center';
    row.id = rowId;
    row.innerHTML = `
        <input type="text" class="step-icon w-1/4 px-2 py-1 border rounded" placeholder="Icon Class (e.g. fas fa-box-open)" value="${icon}">
        <input type="text" class="step-text flex-grow px-2 py-1 border rounded" placeholder="Step Description" value="${text}">
        <button type="button" class="remove-btn text-red-600 hover:text-red-800" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
}

// Fungsi untuk menambahkan baris FAQ
function addFaqRow(container, id = null, q = '', a = '') {
    const rowId = id || `faq-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'faq-row p-3 border rounded-lg space-y-2 relative';
    row.id = rowId;
    row.innerHTML = `
        <input type="text" class="faq-q swal2-input" placeholder="Question" value="${q}">
        <textarea class="faq-a swal2-textarea" placeholder="Answer">${a}</textarea>
        <button type="button" class="remove-btn text-red-600 hover:text-red-800" onclick="deleteItem('faqs', '${id}', 'FAQ')"><i class="fas fa-trash-alt"></i></button>
    `;
    container.appendChild(row);
}

// Fungsi untuk menambahkan baris kebijakan (T&C, Refund)
function addPolicyRow(container, title = '', content = '') {
    const rowId = `policy-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'policy-row p-3 border rounded-lg space-y-2 relative';
    row.id = rowId;
    row.innerHTML = `
        <input type="text" class="policy-title swal2-input" placeholder="Policy Title (e.g., Terms of Service)" value="${title}">
        <textarea class="policy-content swal2-textarea" placeholder="Policy Content">${content}</textarea>
        <button type="button" class="remove-btn text-red-600 hover:text-red-800" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-trash-alt"></i></button>
    `;
    container.appendChild(row);
}

// Fungsi untuk menambahkan baris footer link
function addFooterLinkRow(container, category = 'company', text = '', url = '') {
    const rowId = `footer-link-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'footer-link-row flex gap-2';
    row.id = rowId;
    row.innerHTML = `
        <select class="link-category px-2 py-1 border rounded" style="width:120px;">
            <option value="company" ${category === 'company' ? 'selected' : ''}>Company</option>
            <option value="resources" ${category === 'resources' ? 'selected' : ''}>Resources</option>
        </select>
        <input type="text" class="link-text flex-grow px-2 py-1 border rounded" placeholder="Link Text" value="${text}">
        <input type="text" class="link-url flex-grow px-2 py-1 border rounded" placeholder="Link URL" value="${url}">
        <button type="button" class="remove-btn text-red-600 hover:text-red-800" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-trash-alt"></i></button>
    `;
    container.appendChild(row);
}

// Fungsi untuk menambahkan baris social media
function addSocialMediaRow(container, platform = '', url = '') {
    const rowId = `social-media-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'social-media-row flex gap-2';
    row.id = rowId;
    row.innerHTML = `
        <input type="text" class="social-platform flex-grow px-2 py-1 border rounded" placeholder="Platform (e.g., facebook)" value="${platform}">
        <input type="text" class="social-url flex-grow px-2 py-1 border rounded" placeholder="Profile URL" value="${url}">
        <button type="button" class="remove-btn text-red-600 hover:text-red-800" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-trash-alt"></i></button>
    `;
    container.appendChild(row);
}

// Fungsi untuk menangani proses simpan semua pengaturan
async function handleWebsiteSettingsSubmit(e) {
    e.preventDefault();
    Swal.fire({
        title: 'Saving settings...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    // 1. Handle Banner Image Upload
    const imageFile = document.getElementById('setting-banner-image-upload').files[0];
    let imageUrl = document.getElementById('setting-banner-imageUrl').value;
    if (imageFile) {
        try {
            const filePath = `banners/${Date.now()}-${imageFile.name}`;
            const snapshot = await storage.ref(filePath).put(imageFile);
            imageUrl = await snapshot.ref.getDownloadURL();
        } catch (error) {
            console.error("Banner image upload failed:", error);
            Swal.fire('Upload Failed', error.message, 'error');
            return;
        }
    }
    
    // 2. Ambil data dari semua bagian form
    const settings = {
        banner: {
            title: document.getElementById('setting-banner-title').value,
            subtitle: document.getElementById('setting-banner-subtitle').value,
            imageUrl: imageUrl,
        },
        pricing: {
            pickupFee: parseFloat(document.getElementById('setting-pricing-pickupFee').value.replace(',', '.')) || 0,
            kmFee: parseFloat(document.getElementById('setting-pricing-kmFee').value.replace(',', '.')) || 0,
        },
        easySteps: {},
        footerLinks: { company: [], resources: [] },
        social_media: [],
        // Data ini akan diperbarui dari modal
    };
    const faqs = {};
    const tnc = [];

    // 3. Kumpulkan data dari setiap bagian
    let stepOrder = 1;
    document.querySelectorAll('.easy-step-row').forEach(row => {
        const icon = row.querySelector('.step-icon').value;
        const text = row.querySelector('.step-text').value;
        if (text) {
            settings.easySteps[`step${stepOrder}`] = { icon, text, order: stepOrder };
            stepOrder++;
        }
    });
    
    document.querySelectorAll('.faq-row').forEach(row => {
        const q = row.querySelector('.faq-q').value;
        const a = row.querySelector('.faq-a').value;
        if (q && a) {
            const id = row.id.startsWith('faq-') ? db.ref('faqs').push().key : row.id;
            faqs[id] = { q, a, timestamp: firebase.database.ServerValue.TIMESTAMP };
        }
    });

    document.querySelectorAll('.policy-row').forEach(row => {
        const title = row.querySelector('.policy-title').value;
        const content = row.querySelector('.policy-content').value;
        if (title && content) tnc.push({ title, content });
    });
    
    document.querySelectorAll('.footer-link-row').forEach(row => {
        const category = row.querySelector('.link-category').value;
        const text = row.querySelector('.link-text').value;
        const url = row.querySelector('.link-url').value;
        if (text && url) settings.footerLinks[category].push({ text, url });
    });
    
    document.querySelectorAll('.social-media-row').forEach(row => {
        const platform = row.querySelector('.social-platform').value;
        const url = row.querySelector('.social-url').value;
        if (platform && url) settings.social_media.push({ platform, url });
    });
    
    // 4. Simpan semua ke database
    const updates = {};
    updates['/settings'] = settings;
    updates['/faqs'] = faqs;
    updates['/tnc'] = tnc;

    try {
        await db.ref().update(updates);
        Swal.fire('Success!', 'Website settings saved successfully.', 'success');
        // Reload settings to reflect changes
        fetchAndRenderSettings();
    } catch (error) {
        console.error("Settings update failed:", error);
        Swal.fire('Error', error.message, 'error');
    }
}