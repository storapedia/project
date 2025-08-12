window.fetchAndRenderLocations = function() {
    allLocations = [];
    const locFilter = document.getElementById('booking-location-filter');
    locFilter.innerHTML = '<option value="">All Locations</option>';
    db.ref('storageLocations').once('value', snapshot => {
        snapshot.forEach(child => {
            const loc = { id: child.key, ...child.val() };
            allLocations.push(loc);
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.textContent = loc.name;
            locFilter.appendChild(opt);
        });
        renderLocationsTable(allLocations);
    });
};

window.renderLocationsTable = function(locations) {
    const tbody = document.getElementById('locations-table-body');
    const cardView = document.getElementById('locations-card-view');
    tbody.innerHTML = '';
    cardView.innerHTML = '';
    if (!locations || locations.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-8">No locations found.</td></tr>`;
        cardView.innerHTML = `<p class="text-center text-gray-500 p-4">No locations found.</p>`;
        return;
    }
    locations.forEach(loc => {
        const row = document.createElement('tr');
        row.className = 'bg-white border-b hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-6 py-4 font-semibold">${loc.name || 'N/A'}</td>
            <td class="px-6 py-4 text-xs">${loc.address || 'N/A'}</td>
            <td class="px-6 py-4">${typeof loc.totalCapacity === 'number' ? loc.totalCapacity + ' units' : 'N/A'}</td>
            <td class="px-6 py-4 space-x-3">
                <button class="text-gray-500 hover:text-green-600" title="Edit Location" onclick="openLocationModal('${loc.id}')"><i class="fas fa-edit"></i></button>
                <button class="text-gray-500 hover:text-red-600" title="Delete Location" onclick="deleteItem('storageLocations', '${loc.id}', 'location')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
        const card = document.createElement('div');
        card.className = 'data-card md:hidden';
        card.innerHTML = `
            <div class="card-row">
                <span class="card-label">Name:</span>
                <span class="card-value font-semibold">${loc.name || 'N/A'}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Address:</span>
                <span class="card-value text-xs">${loc.address || 'N/A'}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Capacity:</span>
                <span class="card-value">${typeof loc.totalCapacity === 'number' ? loc.totalCapacity + ' units' : 'N/A'}</span>
            </div>
            <div class="card-actions">
                <button class="text-gray-500 hover:text-green-600" onclick="openLocationModal('${loc.id}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="text-gray-500 hover:text-red-600" onclick="deleteItem('storageLocations', '${loc.id}', 'location')"><i class="fas fa-trash"></i> Delete</button>
            </div>
        `;
        cardView.appendChild(card);
    });
};

window.openLocationModal = async function(locationId = null) {
    try {
        let loc = {};
        if (locationId) {
            const snapshot = await db.ref(`storageLocations/${locationId}`).once('value');
            loc = snapshot.val() || {};
        }
        const isEdit = !!locationId;
    
        const storageTypeOptionsHtml = Object.entries(allStorageTypes).map(([id, type]) => {
            const isChecked = loc.categories && loc.categories.some(cat => cat.id === id);
            return `
                <div style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">
                    <label style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="checkbox" class="locations-admin-storapedia-storage-type-cb" data-id="${id}" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
                        <span style="font-weight: 600;">${type.name}</span>
                    </label>
                </div>
            `;
        }).join('');
    
        const initialSizesHtml = loc.categories?.map(cat => renderStorageTypeFormHtml(cat.name, cat)).join('') || '';
    
        Swal.fire({
            title: isEdit ? 'Edit Location' : 'Add New Location',
            width: '800px',
            html: `
                <style>
                    .locations-admin-storapedia-input-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
                    @media (max-width: 767px) {
                        .locations-admin-storapedia-input-grid { grid-template-columns: 1fr; }
                    }
                    .locations-admin-storapedia-input-label { text-align: left; display: block; font-size: 0.9rem; font-weight: 600; color: #374151; margin-bottom: 0.2rem; }
                    .locations-admin-storapedia-size-group { border: 1px solid #e5e7eb; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem; background-color: #f9fafb; }
                    .locations-admin-storapedia-rates-list .locations-admin-storapedia-rate-row { display: grid; grid-template-columns: 1fr 1fr 24px; gap: 0.5rem; align-items: center; }
                    .swal2-input, .swal2-textarea {
                        width: 100% !important;
                        margin: 0 !important;
                        box-sizing: border-box;
                    }
                </style>
                <form id="locations-admin-storapedia-form" style="text-align: left; display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <h4 style="font-weight: bold; font-size: 1.25rem; margin-bottom: 0.5rem;">Basic Info</h4>
                        <div class="locations-admin-storapedia-input-grid">
                            <input id="locations-admin-storapedia-loc-name" class="swal2-input" placeholder="Location Name" value="${loc.name || ''}">
                            <textarea id="locations-admin-storapedia-loc-desc" class="swal2-textarea" placeholder="Description" style="height: 100px;">${loc.description || ''}</textarea>
                        </div>
                    </div>
                    
                    <div>
                        <h4 style="font-weight: bold; font-size: 1rem; margin-bottom: 0.5rem;">Address & Geolocation</h4>
                        <div class="locations-admin-storapedia-input-grid">
                            <input id="locations-admin-storapedia-loc-address-search" class="swal2-input" placeholder="Search Address" value="${loc.address || ''}">
                            <div>
                                <label class="locations-admin-storapedia-input-label">Latitude</label>
                                <input id="locations-admin-storapedia-loc-lat" class="swal2-input" placeholder="Latitude" value="${loc.geolocation?.latitude || ''}">
                            </div>
                            <div>
                                <label class="locations-admin-storapedia-input-label">Longitude</label>
                                <input id="locations-admin-storapedia-loc-lng" class="swal2-input" placeholder="Longitude" value="${loc.geolocation?.longitude || ''}">
                            </div>
                        </div>
                        <div id="locations-admin-storapedia-swal-map" style="width: 100%; height: 200px; background-color: #e5e7eb; margin-top: 0.5rem; border-radius: 0.5rem;"></div>
                    </div>
                    
                    <div>
                        <h4 style="font-weight: bold; font-size: 1rem; margin-bottom: 0.5rem;">Images</h4>
                        <div class="locations-admin-storapedia-input-grid">
                            <input id="locations-admin-storapedia-loc-image" class="swal2-input" placeholder="Location Image URL" value="${loc.imageUrl || ''}">
                            <input id="locations-admin-storapedia-loc-image-upload" type="file" class="swal2-file" accept="image/*">
                        </div>
                    </div>
                    
                    <div>
                        <h4 style="font-weight: bold; font-size: 1rem; margin-bottom: 0.5rem;">General Features</h4>
                        <div id="locations-admin-storapedia-features-container" style="display: flex; flex-wrap: wrap; gap: 0.5rem;"></div>
                        <button type="button" id="locations-admin-storapedia-add-feature-btn" style="color: #2563eb; font-weight: 600; margin-top: 0.5rem;"><i class="fas fa-plus mr-1"></i>Add Feature</button>
                    </div>

                    <div>
                        <h4 style="font-weight: bold; font-size: 1.25rem; margin-bottom: 0.5rem;">Storage Categories</h4>
                        <div id="locations-admin-storapedia-categories-container" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.5rem;">
                            ${storageTypeOptionsHtml}
                        </div>
                        <div style="margin-top: 1rem;">
                            <h4 style="font-weight: bold; font-size: 1rem; margin-bottom: 0.5rem;">Total Capacity</h4>
                            <input type="number" id="locations-admin-storapedia-loc-total-capacity" class="swal2-input" placeholder="Total Capacity" value="${loc.totalCapacity || ''}">
                        </div>
                    </div>
                    
                    <div>
                        <h4 style="font-weight: bold; font-size: 1.25rem; margin-bottom: 0.5rem;">Sizes and Rates</h4>
                        <div id="locations-admin-storapedia-sizes-container" style="display: flex; flex-direction: column; gap: 1rem;">
                            ${initialSizesHtml}
                        </div>
                    </div>
                </form>
            `,
            showCancelButton: true,
            confirmButtonText: isEdit ? 'Save Changes' : 'Create Location',
            didOpen: () => {
                const initialCoordsForMap = { lat: loc.geolocation?.latitude, lng: loc.geolocation?.longitude };
                initializeLocationModalMap(initialCoordsForMap);
                const featuresContainer = document.getElementById('locations-admin-storapedia-features-container');
                (loc.features || []).forEach(f => addFeatureRow(featuresContainer, faIcons, f.name, f.icon));
                document.getElementById('locations-admin-storapedia-add-feature-btn').addEventListener('click', () => addFeatureRow(featuresContainer, faIcons));

                const categoriesContainer = document.getElementById('locations-admin-storapedia-categories-container');
                const sizesContainer = document.getElementById('locations-admin-storapedia-sizes-container');

                loc.categories?.forEach(cat => {
                    const formContainer = document.createElement('div');
                    formContainer.id = `locations-admin-storapedia-storage-type-form-${cat.id}`;
                    formContainer.classList.add('locations-admin-storapedia-storage-type-form-container');
                    sizesContainer.appendChild(formContainer);
                    renderStorageTypeForm(formContainer, cat.name, cat);
                });

                categoriesContainer.addEventListener('change', (e) => {
                    if (e.target.classList.contains('locations-admin-storapedia-storage-type-cb')) {
                        const categoryId = e.target.dataset.id;
                        const category = allStorageTypes[categoryId];
                        const containerId = `locations-admin-storapedia-storage-type-form-${categoryId}`;
                        let formContainer = document.getElementById(containerId);
                        
                        if (e.target.checked) {
                            if (!formContainer) {
                                formContainer = document.createElement('div');
                                formContainer.id = containerId;
                                formContainer.classList.add('locations-admin-storapedia-storage-type-form-container');
                                sizesContainer.appendChild(formContainer);
                            }
                            const existingCategory = loc.categories?.find(c => c.id === categoryId);
                            renderStorageTypeForm(formContainer, category.name, existingCategory);
                        } else {
                            if (formContainer) {
                                formContainer.remove();
                            }
                        }
                    }
                });
            },
            preConfirm: async () => {
                Swal.showLoading();
                const imageFile = document.getElementById('locations-admin-storapedia-loc-image-upload').files[0];
                let imageUrl = document.getElementById('locations-admin-storapedia-loc-image').value;
                if (imageFile) {
                    const filePath = `locations/${Date.now()}-${imageFile.name}`;
                    const snapshot = await storage.ref(filePath).put(imageFile);
                    imageUrl = await snapshot.ref.getDownloadURL();
                }
                const features = Array.from(document.querySelectorAll('#locations-admin-storapedia-features-container .locations-admin-storapedia-feature-row')).map(row => ({
                    name: row.querySelector('.locations-admin-storapedia-feature-name').value,
                    icon: row.querySelector('.locations-admin-storapedia-feature-icon-display').className.split(' ').slice(1).join(' ')
                })).filter(f => f.name && f.icon);

                const categories = [];
                let totalCapacity = 0;
                document.querySelectorAll('.locations-admin-storapedia-storage-type-cb:checked').forEach(cb => {
                    const categoryId = cb.dataset.id;
                    const categoryData = allStorageTypes[categoryId];
                    const form = document.getElementById(`locations-admin-storapedia-storage-type-form-${categoryId}`);
                    if (!form) return;
                    const categoryName = categoryData.name;
                    const categoryDescription = categoryData.description;
                    const sizes = [];
                    let categoryCapacity = 0;
                    form.querySelectorAll('.locations-admin-storapedia-size-group').forEach(sizeGroup => {
                        const sizeName = sizeGroup.querySelector('.locations-admin-storapedia-size-name').value;
                        const sizeDescription = sizeGroup.querySelector('.locations-admin-storapedia-size-description').value;
                        const sizeCapacity = parseInt(sizeGroup.querySelector('.locations-admin-storapedia-size-capacity').value) || 0;
                        const rates = Array.from(sizeGroup.querySelectorAll('.locations-admin-storapedia-rate-row')).map(rateRow => ({
                            duration: rateRow.querySelector('.locations-admin-storapedia-rate-duration').value,
                            price: parseFloat(rateRow.querySelector('.locations-admin-storapedia-rate-price').value.replace(',', '.')) || 0,
                        })).filter(r => r.duration && r.price > 0);
                        if (sizeName) {
                            sizes.push({ name: sizeName, description: sizeDescription, capacity: sizeCapacity, rates });
                            categoryCapacity += sizeCapacity;
                        }
                    });
                    if (sizes.length > 0) {
                        categories.push({ id: categoryId, name: categoryName, description: categoryDescription, features: [], sizes, totalCapacity: categoryCapacity });
                        totalCapacity += categoryCapacity;
                    }
                });

                return {
                    name: document.getElementById('locations-admin-storapedia-loc-name').value,
                    address: document.getElementById('locations-admin-storapedia-loc-address-search').value,
                    description: document.getElementById('locations-admin-storapedia-loc-desc').value,
                    imageUrl,
                    geolocation: {
                        latitude: parseFloat(document.getElementById('locations-admin-storapedia-loc-lat').value),
                        longitude: parseFloat(document.getElementById('locations-admin-storapedia-loc-lng').value)
                    },
                    features,
                    categories,
                    totalCapacity
                };
            }
        }).then(result => {
            if (result.isConfirmed) {
                const data = result.value;
                const ref = locationId ? db.ref(`storageLocations/${locationId}`) : db.ref('storageLocations').push();
                ref.set(data)
                    .then(() => Swal.fire('Success', `Location ${isEdit ? 'updated' : 'created'}.`, 'success'))
                    .catch(err => Swal.fire('Error', err.message, 'error'));
            }
        });
    } catch (error) {
        console.error("Error opening location modal:", error);
        Swal.fire('Error', 'Could not open location manager.', 'error');
    }
};

window.openManageStorageTypesModal = async function() {
    const storageTypesSnap = await db.ref('settings/storageTypes').once('value');
    const storageTypes = storageTypesSnap.val() || {};
    const storageTypesListHtml = Object.entries(storageTypes).map(([id, type]) => `
        <div class="p-3 border-b border-gray-200 flex justify-between items-center">
            <div>
                <h5 class="font-semibold">${type.name}</h5>
                <p class="text-sm text-gray-500">${type.description}</p>
            </div>
            <div class="flex space-x-2">
                <button class="text-blue-600 hover:text-blue-900" onclick="openStorageTypeModal('${id}')"><i class="fas fa-edit"></i></button>
                <button class="text-red-600 hover:text-red-900" onclick="deleteItem('settings/storageTypes', '${id}', 'storage type')"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
    Swal.fire({
        title: 'Manage Storage Types',
        width: '600px',
        html: `
            <div id="locations-admin-storapedia-storage-types-list" class="max-h-96 overflow-y-auto">${storageTypesListHtml}</div>
            <button id="locations-admin-storapedia-add-new-storage-type-btn" class="mt-4 bg-primary-600 text-white font-bold py-2 px-4 rounded-full shadow-md hover:bg-primary-700 transition"><i class="fas fa-plus"></i> Add New Type</button>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: () => {
            document.getElementById('locations-admin-storapedia-add-new-storage-type-btn').addEventListener('click', () => openStorageTypeModal());
        }
    });
};

window.openStorageTypeModal = async function(storageTypeId = null) {
    let storageType = {};
    if (storageTypeId) {
        const snapshot = await db.ref(`settings/storageTypes/${storageTypeId}`).once('value');
        storageType = snapshot.val() || {};
    }
    const isEdit = !!storageTypeId;
    Swal.fire({
        title: isEdit ? 'Edit Storage Type' : 'Add New Storage Type',
        html: `
            <input id="locations-admin-storapedia-storage-type-name" class="swal2-input" placeholder="Type Name" value="${storageType.name || ''}">
            <textarea id="locations-admin-storapedia-storage-type-desc" class="swal2-textarea" placeholder="Description">${storageType.description || ''}</textarea>
            <div id="locations-admin-storapedia-rates-container" class="mt-4 space-y-2">
                <h6 class="font-semibold">Default Rates:</h6>
                <div id="locations-admin-storapedia-default-rates-list" class="space-y-2"></div>
                <button type="button" id="locations-admin-storapedia-add-default-rate-btn" class="text-sm font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Rate</button>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save',
        didOpen: () => {
            const ratesContainer = document.getElementById('locations-admin-storapedia-default-rates-list');
            (storageType.rates || []).forEach(rate => addPricingRateRow(ratesContainer, rate.duration, rate.price));
            document.getElementById('locations-admin-storapedia-add-default-rate-btn').addEventListener('click', () => addPricingRateRow(ratesContainer));
        },
        preConfirm: () => {
            const name = document.getElementById('locations-admin-storapedia-storage-type-name').value;
            const description = document.getElementById('locations-admin-storapedia-storage-type-desc').value;
            const rates = Array.from(document.querySelectorAll('#locations-admin-storapedia-default-rates-list .locations-admin-storapedia-rate-row')).map(row => ({
                duration: row.querySelector('.locations-admin-storapedia-rate-duration').value,
                price: parseFloat(row.querySelector('.locations-admin-storapedia-rate-price').value) || 0,
            })).filter(r => r.duration && r.price > 0);
            if (!name) { Swal.showValidationMessage('Name is required.'); return false; }
            return { name, description, rates };
        }
    }).then(result => {
        if (result.isConfirmed) {
            const data = result.value;
            const ref = storageTypeId ? db.ref(`settings/storageTypes/${storageTypeId}`) : db.ref('settings/storageTypes').push();
            ref.set(data)
                .then(() => Swal.fire('Success', 'Storage type saved.', 'success'))
                .catch(err => Swal.fire('Error', err.message, 'error'));
        }
    });
};

window.editStorageType = function(storageTypeId) {
    openStorageTypeModal(storageTypeId);
};

window.deleteStorageType = function(storageTypeId) {
    deleteItem('settings/storageTypes', storageTypeId, 'storage type');
};

function renderStorageTypeFormHtml(categoryName, locationCategory) {
    const sizesHtml = (locationCategory.sizes || []).map(size => addSizeGroupHtml(categoryName, size)).join('');
    
    return `
        <div class="locations-admin-storapedia-storage-type-group">
            <h5 class="font-semibold text-base mt-4">${categoryName} Sizes</h5>
            <div id="locations-admin-storapedia-sizes-container-${categoryName.replace(/\s/g, '-')}" class="space-y-4">
                ${sizesHtml}
            </div>
            <button type="button" class="locations-admin-storapedia-add-size-btn text-sm font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Size</button>
        </div>
    `;
}

function renderStorageTypeForm(container, categoryName, locationCategory = null) {
    const sizes = locationCategory?.sizes || [{ name: '', description: '', capacity: 0, rates: [] }];
    const sizesHtml = sizes.map(size => addSizeGroupHtml(categoryName, size)).join('');
    
    container.innerHTML = `
        <div class="locations-admin-storapedia-storage-type-group">
            <h5 class="font-semibold text-base mt-4">${categoryName} Sizes</h5>
            <div id="locations-admin-storapedia-sizes-container-${categoryName.replace(/\s/g, '-')}" class="space-y-4">
                ${sizesHtml}
            </div>
            <button type="button" class="locations-admin-storapedia-add-size-btn text-sm font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Size</button>
        </div>
    `;

    const sizesContainer = document.getElementById(`locations-admin-storapedia-sizes-container-${categoryName.replace(/\s/g, '-')}`);
    container.querySelector('.locations-admin-storapedia-add-size-btn').addEventListener('click', () => addSizeGroup(sizesContainer, categoryName));
    
    container.querySelectorAll('.locations-admin-storapedia-remove-size-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.locations-admin-storapedia-size-group').remove());
    });
};

function addSizeGroupHtml(categoryName, size = { name: '', description: '', capacity: 0, rates: [] }) {
    const ratesHtml = (size.rates || []).map(rate => `
        <div class="locations-admin-storapedia-rate-row">
            <input type="text" class="locations-admin-storapedia-rate-duration swal2-input" placeholder="Duration (e.g., Daily)" value="${rate.duration}">
            <input type="number" class="locations-admin-storapedia-rate-price swal2-input" placeholder="Price (e.g., 5.50)" value="${rate.price}">
            <button type="button" class="locations-admin-storapedia-remove-rate-btn text-red-600 hover:text-red-800" onclick="this.closest('.locations-admin-storapedia-rate-row').remove()"><i class="fas fa-times-circle"></i></button>
        </div>
    `).join('');
    
    return `
        <div class="locations-admin-storapedia-size-group">
            <div class="flex justify-between items-center mb-2">
                <input type="text" class="locations-admin-storapedia-size-name swal2-input" placeholder="Size Name (e.g., S)" value="${size.name}">
                <button type="button" class="locations-admin-storapedia-remove-size-btn text-red-600 hover:text-red-800"><i class="fas fa-trash-alt"></i></button>
            </div>
            <textarea class="locations-admin-storapedia-size-description swal2-textarea" placeholder="Description">${size.description}</textarea>
            <div class="mt-2">
                <label class="locations-admin-storapedia-input-label">Capacity</label>
                <input type="number" class="locations-admin-storapedia-size-capacity swal2-input" placeholder="Capacity" value="${size.capacity}">
            </div>
            <div class="mt-2 locations-admin-storapedia-rates-list">
                <h6 class="font-semibold text-sm">Rates:</h6>
                ${ratesHtml}
                <button type="button" class="locations-admin-storapedia-add-rate-btn text-xs font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Rate</button>
            </div>
        </div>
    `;
}

function addSizeGroup(container, categoryName, size = { name: '', description: '', capacity: 0, rates: [] }) {
    const newHtml = addSizeGroupHtml(categoryName, size);
    container.insertAdjacentHTML('beforeend', newHtml);
    const newSizeGroup = container.lastElementChild;
    newSizeGroup.querySelector('.locations-admin-storapedia-remove-size-btn').addEventListener('click', (e) => e.target.closest('.locations-admin-storapedia-size-group').remove());
    const addRateBtn = newSizeGroup.querySelector('.locations-admin-storapedia-add-rate-btn');
    if(addRateBtn) {
        addRateBtn.addEventListener('click', (e) => addPricingRateRow(e.target.previousElementSibling));
    }
}

function addPricingRateRow(container, duration = '', price = '') {
    const rowId = `locations-admin-storapedia-rate-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'locations-admin-storapedia-rate-row';
    row.id = rowId;
    row.innerHTML = `
        <input type="text" class="locations-admin-storapedia-rate-duration swal2-input" placeholder="Duration (e.g., Daily)" value="${duration}">
        <input type="number" class="locations-admin-storapedia-rate-price swal2-input" placeholder="Price (e.g., 5.50)" value="${price}">
        <button type="button" class="locations-admin-storapedia-remove-rate-btn text-red-600 hover:text-red-800" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-times-circle"></i></button>
    `;
    container.appendChild(row);
}

let locationMapInstance = null;
let locationMarkerInstance = null;

window.initializeLocationModalMap = function(initialCoords = {}) {
    const defaultCenter = { lat: -8.6702, lng: 115.2124 };
    const center = (initialCoords.lat && initialCoords.lng) ? initialCoords : defaultCenter;
    const mapElement = document.getElementById('locations-admin-storapedia-swal-map');
    if (!mapElement) return;
    if (locationMapInstance) {
        mapElement.innerHTML = '';
        locationMapInstance = null;
        locationMarkerInstance = null;
    }
    const mapCenterLatLng = new google.maps.LatLng(center.lat, center.lng);
    locationMapInstance = new google.maps.Map(mapElement, { center: mapCenterLatLng, zoom: 12 });
    locationMarkerInstance = new google.maps.Marker({ map: locationMapInstance, position: mapCenterLatLng, draggable: true });
    const searchInput = document.getElementById('locations-admin-storapedia-loc-address-search');
    if (searchInput) {
        const locationAutocomplete = new google.maps.places.Autocomplete(searchInput);
        locationAutocomplete.bindTo('bounds', locationMapInstance);
        locationAutocomplete.addListener('place_changed', () => {
            const place = locationAutocomplete.getPlace();
            if (!place.geometry) return;
            locationMapInstance.setCenter(place.geometry.location);
            locationMapInstance.setZoom(17);
            locationMarkerInstance.setPosition(place.geometry.location);
            updateLatLngInputs(place.geometry.location);
        });
    }
    locationMarkerInstance.addListener('dragend', () => updateLatLngInputs(locationMarkerInstance.getPosition()));
    updateLatLngInputs(mapCenterLatLng);
};

window.updateLatLngInputs = function(position) {
    const lat = typeof position.lat === 'function' ? position.lat() : position.lat;
    const lng = typeof position.lng === 'function' ? position.lng() : position.lng;
    document.getElementById('locations-admin-storapedia-loc-lat').value = lat.toFixed(6);
    document.getElementById('locations-admin-storapedia-loc-lng').value = lng.toFixed(6);
};

window.addFeatureRow = function(container, iconList, name = '', icon = 'fas fa-check') {
    const rowId = `locations-admin-storapedia-feature-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'locations-admin-storapedia-feature-row flex items-center gap-2';
    row.id = rowId;
    row.innerHTML = `
        <button type="button" class="locations-admin-storapedia-feature-icon-btn p-2 border rounded"><i class="locations-admin-storapedia-feature-icon-display ${icon}"></i></button>
        <input type="text" class="locations-admin-storapedia-feature-name flex-grow px-2 py-1 border rounded" placeholder="Feature Name" value="${name}">
        <button type="button" class="locations-admin-storapedia-remove-btn" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
    row.querySelector('.locations-admin-storapedia-feature-icon-btn').addEventListener('click', (e) => openIconPicker(e.currentTarget, iconList));
};

window.openIconPicker = function(button, iconList) {
    Swal.fire({
        title: 'Select Icon',
        html: `<input type="text" id="locations-admin-storapedia-icon-search" placeholder="Search icon..." class="swal2-input"><div id="locations-admin-storapedia-icon-grid" class="max-h-64 overflow-y-auto grid grid-cols-8 gap-2 mt-4"></div>`,
        showConfirmButton: false,
        didOpen: () => {
            const grid = document.getElementById('locations-admin-storapedia-icon-grid');
            const search = document.getElementById('locations-admin-storapedia-icon-search');
            const renderIcons = (filter = '') => {
                grid.innerHTML = iconList.filter(i => i.includes(filter)).map(icon => `<div class="p-2 text-center text-xl cursor-pointer hover:bg-gray-200 rounded" data-icon="${icon}"><i class="${icon}"></i></div>`).join('');
                grid.querySelectorAll('.p-2').forEach(el => el.addEventListener('click', () => {
                    button.querySelector('i').className = `locations-admin-storapedia-feature-icon-display ${el.dataset.icon}`;
                    Swal.close();
                }));
            };
            search.addEventListener('input', () => renderIcons(search.value));
            renderIcons();
        }
    });
};