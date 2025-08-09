// =====================================================================
// LOCATIONS LOGIC
// =====================================================================

function fetchAndRenderLocations() {
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
}

function renderLocationsTable(locations) {
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
}

async function openLocationModal(locationId = null) {
    try {
        let loc = {};
        if (locationId) {
            const snapshot = await db.ref(`storageLocations/${locationId}`).once('value');
            loc = snapshot.val() || {};
        }
        const isEdit = !!locationId;

        Swal.fire({
            title: isEdit ? 'Edit Location' : 'Add New Location',
            width: '800px',
            html: `
                <style>
                    .swal2-input-grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 1rem;
                    }
                    .swal2-input-grid .swal2-input, .swal2-input-grid .swal2-textarea {
                        margin: 0 !important;
                    }
                    .category-group, .size-group {
                        border: 1px solid #e5e7eb;
                        border-radius: 0.5rem;
                        padding: 1rem;
                        margin-bottom: 1rem;
                        position: relative;
                    }
                    .category-group .remove-btn, .size-group .remove-btn {
                        position: absolute;
                        top: 0.5rem;
                        right: 0.5rem;
                    }
                    .rates-list .rate-row {
                         display: grid;
                         grid-template-columns: 1fr 1fr 24px;
                         gap: 0.5rem;
                         align-items: center;
                    }
                    .rates-list .rate-row .swal2-input {
                        margin: 0;
                    }
                    .swal2-input-label {
                        text-align: left;
                        display: block;
                        font-size: 0.9rem;
                        font-weight: 600;
                        color: var(--neutral-700);
                        margin-bottom: 0.2rem;
                    }
                    .swal2-actions button {
                        margin: 0.5em !important;
                    }
                </style>
                <form id="location-form" class="text-left space-y-4">
                    <h4 class="font-bold text-xl mb-2">Basic Info</h4>
                    <input id="swal-loc-name" class="swal2-input" placeholder="Location Name" value="${loc.name || ''}">
                    <textarea id="swal-loc-desc" class="swal2-textarea" placeholder="Description">${loc.description || ''}</textarea>
                    
                    <h4 class="font-bold text-lg mb-2 mt-4">Address & Geolocation</h4>
                    <input id="swal-loc-address-search" class="swal2-input" placeholder="Search Address" value="${loc.address || ''}">
                    <div id="swal-map" class="w-full h-48 bg-gray-200 my-2 rounded-lg"></div>
                    <div class="swal2-input-grid">
                        <div>
                           <label class="swal2-input-label">Latitude</label>
                           <input id="swal-loc-lat" class="swal2-input" placeholder="Latitude" value="${loc.geolocation?.latitude || ''}">
                        </div>
                        <div>
                           <label class="swal2-input-label">Longitude</label>
                           <input id="swal-loc-lng" class="swal2-input" placeholder="Longitude" value="${loc.geolocation?.longitude || ''}">
                        </div>
                    </div>
                    
                    <h4 class="font-bold text-lg mb-2 mt-4">Images</h4>
                    <input id="swal-loc-image" class="swal2-input" placeholder="Location Image URL" value="${loc.imageUrl || ''}">
                    <input id="swal-loc-image-upload" type="file" class="swal2-file" accept="image/*">
                    
                    <h4 class="font-bold text-lg mb-2 mt-4">General Features</h4>
                    <div id="features-container" class="space-y-2"></div>
                    <button type="button" id="add-feature-btn" class="text-sm font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Feature</button>
                    
                    <h4 class="font-bold text-lg mb-2 mt-4">Pricing Categories</h4>
                    <div id="categories-container" class="space-y-4"></div>
                    <button type="button" id="add-category-btn" class="text-sm font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Category</button>
                </form>
            `,
            showCancelButton: true,
            confirmButtonText: isEdit ? 'Save Changes' : 'Create Location',
            didOpen: () => {
                const initialCoordsForMap = { lat: loc.geolocation?.latitude, lng: loc.geolocation?.longitude };
                initializeLocationModalMap(initialCoordsForMap);

                const featuresContainer = document.getElementById('features-container');
                (loc.features || []).forEach(f => addFeatureRow(featuresContainer, faIcons, f.name, f.icon));
                document.getElementById('add-feature-btn').addEventListener('click', () => addFeatureRow(featuresContainer, faIcons));

                const categoriesContainer = document.getElementById('categories-container');
                (loc.categories || []).forEach(cat => addCategoryGroup(categoriesContainer, cat));
                document.getElementById('add-category-btn').addEventListener('click', () => addCategoryGroup(categoriesContainer));
            },
            preConfirm: async () => {
                Swal.showLoading();
                const imageFile = document.getElementById('swal-loc-image-upload').files[0];
                let imageUrl = document.getElementById('swal-loc-image').value;
                if (imageFile) {
                    const filePath = `locations/${Date.now()}-${imageFile.name}`;
                    const snapshot = await storage.ref(filePath).put(imageFile);
                    imageUrl = await snapshot.ref.getDownloadURL();
                }

                const features = Array.from(document.querySelectorAll('#features-container .feature-row')).map(row => ({
                    name: row.querySelector('.feature-name').value,
                    icon: row.querySelector('.feature-icon-display').className.split(' ').slice(1).join(' ')
                })).filter(f => f.name && f.icon);

                const categories = Array.from(document.querySelectorAll('#categories-container .category-group')).map(group => {
                    const sizes = Array.from(group.querySelectorAll('.size-group')).map(sizeGroup => ({
                        name: sizeGroup.querySelector('.size-name').value,
                        description: sizeGroup.querySelector('.size-description').value,
                        capacity: parseInt(sizeGroup.querySelector('.size-capacity').value) || 0,
                        rates: Array.from(sizeGroup.querySelectorAll('.rate-row')).map(rateRow => ({
                            duration: rateRow.querySelector('.rate-duration').value,
                            price: parseFloat(rateRow.querySelector('.rate-price').value.replace(',', '.')) || 0,
                        })).filter(r => r.duration && r.price > 0)
                    })).filter(s => s.name);

                    const categoryName = group.querySelector('.category-name').value;
                    const categoryDescription = group.querySelector('.category-description').value;
                    const categoryFeatures = Array.from(group.querySelectorAll('.category-feature-row')).map(row => ({
                        name: row.querySelector('.category-feature-name').value,
                        icon: row.querySelector('.category-feature-icon-display').className.split(' ').slice(1).join(' ')
                    })).filter(f => f.name && f.icon);

                    return {
                        name: categoryName,
                        description: categoryDescription,
                        features: categoryFeatures,
                        sizes: sizes
                    };
                }).filter(cat => cat.name);
                
                const totalCapacity = categories.reduce((sum, cat) => {
                    const categoryCapacity = cat.sizes.reduce((sizeSum, size) => sizeSum + size.capacity, 0);
                    return sum + categoryCapacity;
                }, 0);

                return {
                    name: document.getElementById('swal-loc-name').value,
                    address: document.getElementById('swal-loc-address-search').value,
                    description: document.getElementById('swal-loc-desc').value,
                    imageUrl,
                    geolocation: {
                        latitude: parseFloat(document.getElementById('swal-loc-lat').value),
                        longitude: parseFloat(document.getElementById('swal-loc-lng').value)
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
}

// Global variables for Google Map instance
let locationMapInstance = null;
let locationMarkerInstance = null;

function initializeLocationModalMap(initialCoords = {}) {
    const defaultCenter = { lat: -8.6702, lng: 115.2124 };
    const center = (initialCoords.lat && initialCoords.lng) ? initialCoords : defaultCenter;
    
    const mapElement = document.getElementById('swal-map');
    if (!mapElement) return;

    if (locationMapInstance) {
        mapElement.innerHTML = '';
        locationMapInstance = null;
        locationMarkerInstance = null;
    }

    const mapCenterLatLng = new google.maps.LatLng(center.lat, center.lng);
    locationMapInstance = new google.maps.Map(mapElement, { center: mapCenterLatLng, zoom: 12 });
    locationMarkerInstance = new google.maps.Marker({ map: locationMapInstance, position: mapCenterLatLng, draggable: true });
    
    const searchInput = document.getElementById('swal-loc-address-search');
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
}

function updateLatLngInputs(position) {
    const lat = typeof position.lat === 'function' ? position.lat() : position.lat;
    const lng = typeof position.lng === 'function' ? position.lng() : position.lng;
    
    document.getElementById('swal-loc-lat').value = lat.toFixed(6);
    document.getElementById('swal-loc-lng').value = lng.toFixed(6);
}

// =====================================================================
// DYNAMIC MODAL HELPERS
// =====================================================================
function addCategoryGroup(container, category = { name: '', description: '', features: [], sizes: [] }) {
    const groupId = `category-group-${Date.now()}`;
    const group = document.createElement('div');
    group.className = 'category-group p-4 border rounded-lg space-y-4';
    group.id = groupId;
    group.innerHTML = `
        <div class="flex items-center gap-2">
            <input type="text" class="category-name flex-grow swal2-input" placeholder="Category Name (e.g., General Storage)" value="${category.name}">
            <button type="button" class="remove-btn text-red-600 hover:text-red-800" onclick="document.getElementById('${groupId}').remove()" title="Delete Category"><i class="fas fa-trash-alt"></i></button>
        </div>
        <textarea class="category-description swal2-textarea" placeholder="Category Description">${category.description}</textarea>
        <div class="category-features-container space-y-2">
            <h5 class="font-semibold text-sm">Category Features:</h5>
            <div class="category-features-list space-y-2"></div>
            <button type="button" class="add-category-feature-btn text-xs font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Feature</button>
        </div>
        <div class="sizes-container space-y-2">
            <h5 class="font-semibold text-sm">Storage Sizes:</h5>
            <div class="sizes-list space-y-2"></div>
            <button type="button" class="add-size-btn text-xs font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Size</button>
        </div>
    `;
    container.appendChild(group);

    const featuresList = group.querySelector('.category-features-list');
    (category.features || []).forEach(f => addCategoryFeatureRow(featuresList, faIcons, f.name, f.icon));
    group.querySelector('.add-category-feature-btn').addEventListener('click', () => addCategoryFeatureRow(featuresList, faIcons));

    const sizesList = group.querySelector('.sizes-list');
    (category.sizes || []).forEach(size => addSizeGroup(sizesList, size));
    group.querySelector('.add-size-btn').addEventListener('click', () => addSizeGroup(sizesList));
}

function addCategoryFeatureRow(container, iconList, name = '', icon = 'fas fa-check') {
    const rowId = `category-feature-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'category-feature-row flex items-center gap-2';
    row.id = rowId;
    row.innerHTML = `
        <button type="button" class="feature-icon-btn p-2 border rounded"><i class="category-feature-icon-display ${icon}"></i></button>
        <input type="text" class="category-feature-name flex-grow px-2 py-1 border rounded" placeholder="Feature Name" value="${name}">
        <button type="button" class="remove-btn" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
    row.querySelector('.feature-icon-btn').addEventListener('click', (e) => openIconPicker(e.currentTarget, iconList, 'category-feature-icon-display'));
}

function addSizeGroup(container, size = { name: '', description: '', capacity: 0, rates: [] }) {
    const groupId = `size-group-${Date.now()}`;
    const group = document.createElement('div');
    group.className = 'size-group p-3 border rounded-lg space-y-2';
    group.id = groupId;
    group.innerHTML = `
        <div class="flex items-center gap-2">
            <input type="text" class="size-name w-1/3 swal2-input" placeholder="Size Name (e.g., Luggage Box)" value="${size.name}">
            <input type="number" class="size-capacity w-1/4 swal2-input" placeholder="Capacity" value="${size.capacity}">
            <button type="button" class="remove-btn text-red-600 hover:text-red-800" onclick="document.getElementById('${groupId}').remove()" title="Delete Size"><i class="fas fa-trash-alt"></i></button>
        </div>
        <textarea class="size-description swal2-textarea" placeholder="Size Description">${size.description}</textarea>
        <div class="rates-container space-y-2">
            <h6 class="font-semibold text-sm">Rates:</h6>
            <div class="rates-list space-y-2"></div>
            <button type="button" class="add-rate-btn text-xs font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Rate</button>
        </div>
    `;
    container.appendChild(group);

    const ratesList = group.querySelector('.rates-list');
    (size.rates || []).forEach(rate => addPricingRateRow(ratesList, rate.duration, String(rate.price).replace('.', ',')));
    group.querySelector('.add-rate-btn').addEventListener('click', () => addPricingRateRow(ratesList));
}

function addPricingRateRow(container, duration = '', price = '') {
    const rowId = `rate-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'rate-row grid grid-cols-rate-row items-center gap-2';
    row.id = rowId;
    row.innerHTML = `
        <input type="text" class="rate-duration swal2-input" placeholder="Duration (e.g., Daily)" value="${duration}">
        <input type="text" class="rate-price swal2-input" placeholder="Price (e.g., 5.50)" value="${price}">
        <button type="button" class="remove-btn text-red-600 hover:text-red-800" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-times-circle"></i></button>
    `;
    container.appendChild(row);
}

function addFeatureRow(container, iconList, name = '', icon = 'fas fa-check') {
    const rowId = `feature-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'feature-row flex items-center gap-2';
    row.id = rowId;
    row.innerHTML = `
        <button type="button" class="feature-icon-btn p-2 border rounded"><i class="feature-icon-display ${icon}"></i></button>
        <input type="text" class="feature-name flex-grow px-2 py-1 border rounded" placeholder="Feature Name" value="${name}">
        <button type="button" class="remove-btn" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
    row.querySelector('.feature-icon-btn').addEventListener('click', (e) => openIconPicker(e.currentTarget, iconList));
}

function openIconPicker(button, iconList) {
    Swal.fire({
        title: 'Select Icon',
        html: `<input type="text" id="icon-search" placeholder="Search icon..." class="swal2-input"><div id="icon-grid" class="max-h-64 overflow-y-auto grid grid-cols-8 gap-2 mt-4"></div>`,
        showConfirmButton: false,
        didOpen: () => {
            const grid = document.getElementById('icon-grid');
            const search = document.getElementById('icon-search');
            const renderIcons = (filter = '') => {
                grid.innerHTML = iconList.filter(i => i.includes(filter)).map(icon => `<div class="p-2 text-center text-xl cursor-pointer hover:bg-gray-200 rounded" data-icon="${icon}"><i class="${icon}"></i></div>`).join('');
                grid.querySelectorAll('.p-2').forEach(el => el.addEventListener('click', () => {
                    button.querySelector('i').className = `feature-icon-display ${el.dataset.icon}`;
                    Swal.close();
                }));
            };
            search.addEventListener('input', () => renderIcons(search.value));
            renderIcons();
        }
    });
}