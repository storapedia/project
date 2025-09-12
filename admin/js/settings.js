// =====================================================================
// SETTINGS LOGIC
// =====================================================================

const settingEventListeners = {};

async function fetchAndRenderSettings() {
    const settingsSnap = await db.ref('settings').once('value');
    const settings = settingsSnap.val() || {};

    const faqsSnap = await db.ref('faqs').once('value');
    const faqs = faqsSnap.val() || {};

    const tncSnap = await db.ref('tnc').once('value');
    const tnc = tncSnap.val() || [];

    const refundPolicySnap = await db.ref('refundPolicy').once('value');
    const refundPolicy = refundPolicySnap.val() || [];

    for (const event in settingEventListeners) {
        document.getElementById(event)?.removeEventListener('click', settingEventListeners[event]);
    }

    document.getElementById('website-settings-form').innerHTML = `
        <div class="tabs-container">
            <div class="tab-buttons flex border-b border-gray-200">
                <button type="button" class="tab-button px-4 py-2 text-sm font-medium text-center text-gray-500 border-b-2 border-transparent hover:text-blue-600 hover:border-blue-300 active-tab" data-tab-name="general">General</button>
                <button type="button" class="tab-button px-4 py-2 text-sm font-medium text-center text-gray-500 border-b-2 border-transparent hover:text-blue-600 hover:border-blue-300" data-tab-name="policies">Policies</button>
                <button type="button" class="tab-button px-4 py-2 text-sm font-medium text-center text-gray-500 border-b-2 border-transparent hover:text-blue-600 hover:border-blue-300" data-tab-name="info-pages">Info Pages</button>
                <button type="button" class="tab-button px-4 py-2 text-sm font-medium text-center text-gray-500 border-b-2 border-transparent hover:text-blue-600 hover:border-blue-300" data-tab-name="links">Links</button>
            </div>
            
            <div id="tab-content-container" class="mt-4">
                <div id="general" class="tab-content active">
                    <h4 class="font-bold text-xl mb-4">Homepage Banner</h4>
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
                    <hr class="my-6">
                    <h4 class="font-bold text-xl mb-4">Service Fees</h4>
                    <div class="setting-content space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Pickup Fee ($) (Flat Rate)</label>
                            <input id="setting-pricing-pickupFee" type="number" class="swal2-input border border-gray-300 rounded-lg focus:ring-primary-500" placeholder="Pickup Fee" value="${settings.pricing?.pickupFee || 0}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Per Km Fee ($)</label>
                            <input id="setting-pricing-kmFee" type="number" class="swal2-input border border-gray-300 rounded-lg focus:ring-primary-500" placeholder="Per Km Fee" value="${settings.pricing?.kmFee || 0}">
                        </div>
                    </div>
                    <hr class="my-6">
                    <h4 class="font-bold text-xl mb-4">Steps to Order</h4>
                    <div id="easy-steps-container" class="setting-content space-y-4"></div>
                    <button type="button" id="add-easy-step-btn" class="mt-4 text-blue-600 text-sm font-semibold hover:underline"><i class="fas fa-plus mr-1"></i>Add New Step</button>
                </div>
                
                <div id="policies" class="tab-content hidden">
                    <h4 class="font-bold text-xl mb-4">Terms and Conditions</h4>
                    <div id="tnc-container" class="setting-content space-y-4"></div>
                    <button type="button" id="add-tnc-btn" class="mt-4 text-blue-600 text-sm font-semibold hover:underline"><i class="fas fa-plus mr-1"></i>Add New T&C</button>
                    <hr class="my-6">
                    <h4 class="font-bold text-xl mb-4">Refund Policy</h4>
                    <div id="refund-policy-container" class="setting-content space-y-4"></div>
                    <button type="button" id="add-refund-policy-btn" class="mt-4 text-blue-600 text-sm font-semibold hover:underline"><i class="fas fa-plus mr-1"></i>Add New Refund Policy</button>
                </div>

                <div id="info-pages" class="tab-content hidden">
                    <h4 class="font-bold text-xl mb-4">FAQs</h4>
                    <div class="flex justify-end items-center mb-4">
                        <button type="button" id="add-faq-category-btn" class="bg-primary-600 text-black font-bold py-2 px-4 rounded-full shadow-md hover:from-primary-600 hover:to-primary-700 transition flex items-center justify-center gap-2">
                           <i class="fas fa-plus mr-1"></i> Add FAQ Category
                        </button>
                    </div>
                    <div id="faq-category-tabs" class="flex border-b border-gray-200"></div>
                    <div id="faq-category-contents" class="mt-4 space-y-6"></div>
                </div>

                <div id="links" class="tab-content hidden">
                    <h4 class="font-bold text-xl mb-4">Footer Links</h4>
                    <div id="footer-links-container" class="setting-content space-y-4"></div>
                    <button type="button" id="add-footer-link-btn" class="mt-4 text-blue-600 text-sm font-semibold hover:underline"><i class="fas fa-plus mr-1"></i>Add Footer Link</button>
                    <hr class="my-6">
                    <h4 class="font-bold text-xl mb-4">Social Media</h4>
                    <div id="social-media-container" class="setting-content space-y-4"></div>
                    <button type="button" id="add-social-media-btn" class="mt-4 text-blue-600 text-sm font-semibold hover:underline"><i class="fas fa-plus mr-1"></i>Add Social Media Account</button>
                </div>
            </div>
        </div>
        <div class="border-t pt-6 mt-8 flex justify-end">
            <button type="submit" class="bg-gradient-to-r from-primary-600 to-primary-700 text-black font-bold py-2 px-8 rounded-full shadow-md hover:from-primary-700 hover:to-primary-800 transition">Save All Settings</button>
        </div>
    `;

    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const switchTab = (tabName) => {
        tabButtons.forEach(button => {
            if (button.dataset.tabName === tabName) {
                button.classList.add('active-tab');
                button.classList.remove('border-transparent');
                button.classList.add('border-blue-600');
            } else {
                button.classList.remove('active-tab');
                button.classList.remove('border-blue-600');
                button.classList.add('border-transparent');
            }
        });
        tabContents.forEach(content => {
            if (content.id === tabName) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        });
    };
    tabButtons.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tabName));
    });

    const easyStepsContainer = document.getElementById('easy-steps-container');
    if (settings.easySteps) {
        Object.values(settings.easySteps).sort((a, b) => a.order - b.order).forEach(step => addEasyStepRow(easyStepsContainer, step.text, step.icon));
    }
    document.getElementById('add-easy-step-btn').addEventListener('click', () => addEasyStepRow(easyStepsContainer));

    const tncContainer = document.getElementById('tnc-container');
    (tnc || []).forEach(policy => addPolicyRow(tncContainer, 'tnc', policy.title, policy.content));
    document.getElementById('add-tnc-btn').addEventListener('click', () => addPolicyRow(tncContainer, 'tnc'));
    
    const refundPolicyContainer = document.getElementById('refund-policy-container');
    (refundPolicy || []).forEach(policy => addPolicyRow(refundPolicyContainer, 'refundPolicy', policy.title, policy.content));
    document.getElementById('add-refund-policy-btn').addEventListener('click', () => addPolicyRow(refundPolicyContainer, 'refundPolicy'));

    const faqCategoryTabs = document.getElementById('faq-category-tabs');
    const faqCategoryContents = document.getElementById('faq-category-contents');

    const renderFaqTabs = () => {
        faqCategoryTabs.innerHTML = '';
        faqCategoryContents.innerHTML = '';
        const categoryIds = Object.keys(faqs);
        if (categoryIds.length > 0) {
            categoryIds.forEach((id, index) => {
                const category = faqs[id];
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `px-4 py-2 text-sm font-medium text-center text-gray-500 border-b-2 border-transparent hover:text-blue-600 hover:border-blue-300 faq-tab-button ${index === 0 ? 'active-tab border-blue-600' : ''}`;
                button.dataset.tabTarget = `faq-tab-${id}`;
                button.textContent = category.title;
                faqCategoryTabs.appendChild(button);

                const content = document.createElement('div');
                content.id = `faq-tab-${id}`;
                content.className = `faq-category-content ${index === 0 ? '' : 'hidden'}`;
                content.innerHTML = `
                    <div class="faq-category-card p-4 border rounded-lg bg-gray-50" id="${id}">
                        <div class="flex justify-between items-center border-b pb-3 mb-3">
                            <h5 class="font-bold text-lg text-primary-600">Category: ${category.title}</h5>
                            <button type="button" class="text-red-600 hover:text-red-800" onclick="removeFaqCategory('${id}')"><i class="fas fa-trash-alt"></i></button>
                        </div>
                        <div class="space-y-3">
                            <input type="text" class="swal2-input faq-category-title" placeholder="Category Title" value="${category.title}">
                            <textarea class="swal2-textarea faq-category-subtitle" placeholder="Category Subtitle">${category.subtitle || ''}</textarea>
                        </div>
                        <div class="faq-items-container mt-4 space-y-2" id="items-${id}"></div>
                        <button type="button" class="mt-4 text-blue-600 text-sm font-semibold hover:underline add-faq-item-btn" data-target-container="items-${id}"><i class="fas fa-plus mr-1"></i>Add Q&A</button>
                    </div>
                `;
                faqCategoryContents.appendChild(content);

                const itemsContainer = document.getElementById(`items-${id}`);
                Object.entries(category.items || {}).forEach(([itemId, item]) => addFaqRow(itemsContainer, itemId, item.q, item.a));
            });

            document.querySelectorAll('.faq-tab-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    document.querySelectorAll('.faq-tab-button').forEach(b => {
                        b.classList.remove('active-tab', 'border-blue-600');
                        b.classList.add('border-transparent');
                    });
                    document.querySelectorAll('.faq-category-content').forEach(c => c.classList.add('hidden'));

                    e.target.classList.add('active-tab', 'border-blue-600');
                    e.target.classList.remove('border-transparent');
                    const targetContent = document.getElementById(e.target.dataset.tabTarget);
                    if (targetContent) targetContent.classList.remove('hidden');
                });
            });

            document.querySelectorAll('.add-faq-item-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetContainerId = btn.dataset.targetContainer;
                    addFaqRow(document.getElementById(targetContainerId));
                });
            });

        } else {
            faqCategoryContents.innerHTML = '<p class="text-gray-500 text-center p-4">No FAQ categories found. Use the button above to add one.</p>';
        }
    };

    window.removeFaqCategory = (id) => {
        delete faqs[id];
        renderFaqTabs();
    };

    renderFaqTabs();
    document.getElementById('add-faq-category-btn').addEventListener('click', () => {
        const newId = `category-${Date.now()}`;
        faqs[newId] = { title: 'New Category', subtitle: '', items: {} };
        renderFaqTabs();
        document.querySelector(`[data-tab-target="faq-tab-${newId}"]`)?.click();
    });
    
    const footerLinksContainer = document.getElementById('footer-links-container');
    if (settings.footerLinks) {
        Object.entries(settings.footerLinks).forEach(([category, links]) => {
            links.forEach(link => addFooterLinkRow(footerLinksContainer, category, link.text, link.url));
        });
    }
    document.getElementById('add-footer-link-btn').addEventListener('click', () => addFooterLinkRow(footerLinksContainer));
    
    const socialMediaContainer = document.getElementById('social-media-container');
    (settings.social_media || []).forEach(sm => addSocialMediaRow(socialMediaContainer, sm.platform, sm.url));
    document.getElementById('add-social-media-btn').addEventListener('click', () => addSocialMediaRow(socialMediaContainer));
    
    document.getElementById('website-settings-form').addEventListener('submit', handleWebsiteSettingsSubmit);

    document.getElementById('setting-banner-preview').addEventListener('click', () => document.getElementById('setting-banner-image-upload').click());
    
    let selectedBannerFile = null;
    
    document.getElementById('setting-banner-image-upload').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            selectedBannerFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('setting-banner-preview').src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
    document.getElementById('setting-banner-imageUrl').addEventListener('input', (e) => {
        if (e.target.value) {
            document.getElementById('setting-banner-preview').src = e.target.value;
            selectedBannerFile = null;
        }
    });
}

function addFaqRow(container, id = null, q = '', a = '') {
    const rowId = id || `faq-item-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'faq-item-row p-3 border rounded-lg space-y-2 relative bg-white';
    row.id = rowId;
    row.dataset.id = id;
    row.innerHTML = `
        <input type="text" class="faq-q swal2-input" placeholder="Question" value="${q}">
        <textarea class="faq-a swal2-textarea" placeholder="Answer">${a}</textarea>
        <button type="button" class="remove-btn text-red-600 hover:text-red-800" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-trash-alt"></i></button>
    `;
    container.appendChild(row);
}

function toggleSection(element) {
    // Fungsi ini tidak lagi dibutuhkan untuk tab
}

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

function addPolicyRow(container, type, title = '', content = '') {
    const rowId = `${type}-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'policy-row p-3 border rounded-lg space-y-2 relative';
    row.id = rowId;
    row.innerHTML = `
        <input type="text" class="policy-title swal2-input" placeholder="Policy Title" value="${title}">
        <textarea class="policy-content swal2-textarea" placeholder="Policy Content">${content}</textarea>
        <button type="button" class="remove-btn text-red-600 hover:text-red-800" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-trash-alt"></i></button>
    `;
    container.appendChild(row);
}


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

async function handleWebsiteSettingsSubmit(e) {
    e.preventDefault();
    const { uploadImage } = await import('./uploader.js');
    
    let imageUrl = document.getElementById('setting-banner-imageUrl').value;
    const imageFile = document.getElementById('setting-banner-image-upload').files[0];

    if (imageFile) {
        Swal.fire({
            title: 'Uploading image...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });
        try {
            imageUrl = await uploadImage(imageFile);
            Swal.close();
        } catch (error) {
            console.error("Banner image upload failed:", error);
            Swal.fire('Upload Failed', error.message, 'error');
            return;
        }
    }
    
    Swal.fire({
        title: 'Saving settings...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });
    
    const settings = {
        banner: {
            title: document.getElementById('setting-banner-title').value,
            subtitle: document.getElementById('setting-banner-subtitle').value,
            imageUrl: imageUrl,
        },
        pricing: {
            pickupFee: parseFloat(document.getElementById('setting-pricing-pickupFee').value) || 0,
            kmFee: parseFloat(document.getElementById('setting-pricing-kmFee').value) || 0,
        },
        easySteps: {},
        footerLinks: { company: [], resources: [] },
        social_media: [],
    };
    const faqs = {};
    const tnc = [];
    const refundPolicy = [];

    let stepOrder = 1;
    document.querySelectorAll('.easy-step-row').forEach(row => {
        const icon = row.querySelector('.step-icon').value;
        const text = row.querySelector('.step-text').value;
        if (text) {
            settings.easySteps[`step${stepOrder}`] = { icon, text, order: stepOrder };
            stepOrder++;
        }
    });
    
    document.querySelectorAll('.faq-category-content .faq-category-card').forEach(categoryEl => {
        const categoryId = categoryEl.id;
        const categoryTitle = categoryEl.querySelector('.faq-category-title').value;
        const categorySubtitle = categoryEl.querySelector('.faq-category-subtitle').value;
        const items = {};

        categoryEl.querySelectorAll('.faq-item-row').forEach(itemEl => {
            const itemId = itemEl.id;
            const q = itemEl.querySelector('.faq-q').value;
            const a = itemEl.querySelector('.faq-a').value;
            if (q && a) {
                items[itemId] = { q, a };
            }
        });

        if (categoryTitle && Object.keys(items).length > 0) {
            faqs[categoryId] = {
                title: categoryTitle,
                subtitle: categorySubtitle,
                items: items
            };
        }
    });

    document.querySelectorAll('#tnc-container .policy-row').forEach(row => {
        const title = row.querySelector('.policy-title').value;
        const content = row.querySelector('.policy-content').value;
        if (title && content) tnc.push({ title, content });
    });
    
    document.querySelectorAll('#refund-policy-container .policy-row').forEach(row => {
        const title = row.querySelector('.policy-title').value;
        const content = row.querySelector('.policy-content').value;
        if (title && content) refundPolicy.push({ title, content });
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
    
    const updates = {};
    updates['/settings'] = settings;
    updates['/faqs'] = faqs;
    updates['/tnc'] = tnc;
    updates['/refundPolicy'] = refundPolicy;

    try {
        await db.ref().update(updates);
        Swal.fire('Success!', 'Website settings saved successfully.', 'success');
        fetchAndRenderSettings();
    } catch (error) {
        console.error("Settings update failed:", error);
        Swal.fire('Error', error.message, 'error');
    }
}