let quillInstances = {};
let locationMapInstance = null;
let locationMarkerInstance = null;
let cropper;
let currentSizeImagePreview;

// --- FUNGSI UNTUK CROP GAMBAR ---
function openCropperModal(file) {
    const modal = document.getElementById('cropper-modal');
    const image = document.getElementById('cropper-image');
    const reader = new FileReader();

    reader.onload = function (e) {
        image.src = e.target.result;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        if (cropper) {
            cropper.destroy();
        }

        cropper = new Cropper(image, {
            aspectRatio: 16 / 10,
            viewMode: 1,
            autoCropArea: 0.95,
            responsive: true,
            background: false,
        });
    };
    reader.readAsDataURL(file);
}

document.getElementById('cropper-save-btn').addEventListener('click', async () => {
    if (!cropper || !currentSizeImagePreview) return;
    
    Swal.fire({ title: 'Processing Image...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    cropper.getCroppedCanvas({ width: 800 }).toBlob(async (blob) => {
        try {
            const { uploadImage } = await import('./uploader.js');
            const fileName = `size-image-${Date.now()}.png`;
            const imageFile = new File([blob], fileName, { type: 'image/png' });

            const imageUrl = await uploadImage(imageFile);
            
            const imgElement = currentSizeImagePreview.querySelector('img');
            const iconElement = currentSizeImagePreview.querySelector('.placeholder-icon');
            imgElement.src = imageUrl;
            imgElement.classList.remove('hidden');
            iconElement.classList.add('hidden');
            
            currentSizeImagePreview.dataset.imageUrl = imageUrl;

            document.getElementById('cropper-modal').classList.add('hidden');
            cropper.destroy();
            Swal.close();

        } catch (error) {
            Swal.fire('Upload Failed', error.message, 'error');
        }
    }, 'image/png');
});

document.getElementById('cropper-cancel-btn').addEventListener('click', () => {
    document.getElementById('cropper-modal').classList.add('hidden');
    if (cropper) {
        cropper.destroy();
    }
});

// --- FUNGSI RENDER UTAMA ---
window.renderLocationsTable = function(locations) {
    const tbody = document.getElementById('locations-table-body');
    const cardView = document.getElementById('locations-card-view');

    if (!tbody || !cardView) return;

    tbody.innerHTML = '';
    cardView.innerHTML = '';

    if (!locations || locations.length === 0) {
        const noResultsHtml = `<tr><td colspan="4" class="text-center p-8">No locations found.</td></tr>`;
        tbody.innerHTML = noResultsHtml;
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
                <button class="text-gray-500 hover:text-green-600" title="Edit Location" onclick="showPage('edit-location', { locationId: '${loc.id}' })"><i class="fas fa-edit"></i></button>
                <button class="text-gray-500 hover:text-red-600" title="Delete Location" onclick="deleteItem('storageLocations', '${loc.id}', 'location')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);

        const card = document.createElement('div');
        card.className = 'data-card md:hidden';
        card.innerHTML = `
            <div class="card-row"><span class="card-label">Name:</span><span class="card-value font-semibold">${loc.name || 'N/A'}</span></div>
            <div class="card-row"><span class="card-label">Address:</span><span class="card-value text-xs">${loc.address || 'N/A'}</span></div>
            <div class="card-row"><span class="card-label">Capacity:</span><span class="card-value">${typeof loc.totalCapacity === 'number' ? loc.totalCapacity + ' units' : 'N/A'}</span></div>
            <div class="card-actions">
                <button class="text-gray-500 hover:text-green-600" onclick="showPage('edit-location', { locationId: '${loc.id}' })"><i class="fas fa-edit"></i> Edit</button>
                <button class="text-gray-500 hover:text-red-600" onclick="deleteItem('storageLocations', '${loc.id}', 'location')"><i class="fas fa-trash"></i> Delete</button>
            </div>
        `;
        cardView.appendChild(card);
    });
};

async function renderLocationEditor(container, locationId) {
    quillInstances = {};
    let selectedImageFile = null;

    container.innerHTML = `<div class="text-center p-10"><i class="fas fa-spinner fa-spin text-3xl"></i></div>`;

    try {
        let loc = {};
        const isEdit = !!locationId;
        if (isEdit) {
            const snapshot = await db.ref(`storageLocations/${locationId}`).once('value');
            loc = snapshot.val() || {};
        }

        if (!window.allStorageTypes || Object.keys(window.allStorageTypes).length === 0) {
            const typesSnapshot = await db.ref('settings/storageTypes').once('value');
            window.allStorageTypes = typesSnapshot.val() || {};
        }
        
        const storageTypeTabsHtml = Object.keys(allStorageTypes).length > 0
            ? Object.entries(allStorageTypes).map(([id, type]) => `<button type="button" class="storage-type-tab" data-category-id="${id}">${type.name}</button>`).join('')
            : '<p class="text-sm text-gray-500 p-2">No storage types defined. Please add them in the settings.</p>';

        const openingHoursHtml = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => `
            <div class="grid grid-cols-3 gap-2 items-center">
                <label class="font-semibold text-sm text-gray-600">${day}</label>
                <input type="time" id="open-${day.toLowerCase()}" class="input-field text-sm p-2" value="${loc.openingHours?.[day.toLowerCase()]?.open || ''}">
                <input type="time" id="close-${day.toLowerCase()}" class="input-field text-sm p-2" value="${loc.openingHours?.[day.toLowerCase()]?.close || ''}">
            </div>`).join('');

        container.innerHTML = `
            <div class="bg-white p-6 rounded-xl shadow-md">
                <div class="flex justify-between items-center mb-4 border-b pb-4">
                    <button onclick="showPage('locations')" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> Back to Locations</button>
                    <h3 class="text-xl font-bold">${isEdit ? 'Edit Location' : 'Add New Location'}</h3>
                    <button id="save-location-btn" class="btn btn-primary"><i class="fas fa-save"></i> Save Changes</button>
                </div>

                <div class="tabs-container">
                    <div class="tab-buttons flex border-b mb-4 flex-wrap">
                        <button type="button" class="tab-button px-3 py-2 text-xs font-medium text-center border-b-2 active-tab" data-tab-name="basic">Basic Info</button>
                        <button type="button" class="tab-button px-3 py-2 text-xs font-medium text-center border-b-2 border-transparent" data-tab-name="address">Address & Map</button>
                        <button type="button" class="tab-button px-3 py-2 text-xs font-medium text-center border-b-2 border-transparent" data-tab-name="media">Media & Features</button>
                        <button type="button" class="tab-button px-3 py-2 text-xs font-medium text-center border-b-2 border-transparent" data-tab-name="storage">Storage Variants</button>
                        <button type="button" class="tab-button px-3 py-2 text-xs font-medium text-center border-b-2 border-transparent" data-tab-name="hours">Opening Hours</button>
                    </div>
                    <form id="location-form" class="text-left">
                        <div id="basic" class="tab-content space-y-3">
                             <div>
                                <label class="form-label">Location Name</label>
                                <input id="loc-name" class="input-field" placeholder="e.g., Storapedia Gudang Jakarta" value="${loc.name || ''}">
                             </div>
                             <div>
                                <label class="form-label">Description</label>
                                <div id="loc-desc-editor"></div>
                             </div>
                        </div>
                        <div id="address" class="tab-content hidden space-y-3">
                            <input id="loc-address-search" class="input-field" placeholder="Search Address..." value="${loc.address || ''}">
                            <div id="location-map" style="height: 250px; border-radius: 0.5rem;" class="mt-2"></div>
                            <div class="grid md:grid-cols-2 gap-3">
                                <input id="loc-lat" class="input-field" placeholder="Latitude" value="${loc.geolocation?.latitude || ''}">
                                <input id="loc-lng" class="input-field" placeholder="Longitude" value="${loc.geolocation?.longitude || ''}">
                            </div>
                        </div>
                        <div id="media" class="tab-content hidden space-y-3">
                             <div id="loc-image-preview" class="relative w-full h-48 border rounded-lg flex items-center justify-center cursor-pointer bg-gray-50">
                                <img id="loc-image-img" src="${loc.imageUrl || ''}" class="absolute w-full h-full object-cover rounded-lg ${loc.imageUrl ? '' : 'hidden'}"/>
                                <div id="loc-image-placeholder" class="text-center text-gray-400 ${loc.imageUrl ? 'hidden' : ''}">
                                    <i class="fas fa-image text-4xl"></i>
                                    <p class="mt-2 text-sm">Click to upload main image</p>
                                </div>
                            </div>
                            <input id="loc-image-upload" type="file" class="hidden" accept="image/*">
                            <hr class="my-4"/>
                            <h4 class="font-semibold text-sm">Features</h4>
                            <div id="features-container" class="flex flex-wrap gap-2"></div>
                            <button type="button" id="add-feature-btn" class="btn btn-secondary btn-sm"><i class="fas fa-plus"></i> Add Feature</button>
                        </div>
                        <div id="storage" class="tab-content hidden space-y-4">
                            <div class="w-full">
                                <label class="form-label">Available Storage Types</label>
                                <div class="storage-type-tabs-container">
                                    ${storageTypeTabsHtml}
                                </div>
                                <div id="storage-type-content-container" class="mt-4"></div>
                            </div>
                            <div class="mt-6 border-t pt-4">
                                <label class="form-label">Total Capacity</label>
                                <input type="number" id="loc-total-capacity" class="input-field" placeholder="Total units available at this location" value="${loc.totalCapacity || ''}">
                            </div>
                        </div>
                        <div id="hours" class="tab-content hidden">
                            <h4 class="font-semibold mb-2">Opening Hours</h4>
                            <div class="space-y-2">${openingHoursHtml}</div>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        initializeEditorComponents(loc);

        document.getElementById('save-location-btn').addEventListener('click', async () => {
            const { uploadImage } = await import('./uploader.js');
            const form = document.getElementById('location-form');
            const getValue = (id) => form.querySelector(`#${id}`)?.value || '';

            Swal.fire({ title: 'Saving Location...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            let mainImageUrl = loc.imageUrl || '';
            if (selectedImageFile) {
                try {
                    mainImageUrl = await uploadImage(selectedImageFile);
                } catch (error) {
                    return Swal.fire('Upload Failed', `Failed to upload main location image: ${error.message}`, 'error');
                }
            }
            
            const categoriesData = Array.from(form.querySelectorAll('.storage-type-form-container')).map(formContainer => {
                const categoryId = formContainer.dataset.categoryId;
                const categoryData = allStorageTypes[categoryId];
                if (!categoryData) return null;

                const sizes = Array.from(formContainer.querySelectorAll('.size-group')).map(sizeGroup => {
                    const name = sizeGroup.querySelector('.size-name')?.value;
                    if (!name) return null;
                    return {
                        name: name,
                        imageUrl: sizeGroup.querySelector('.size-image-preview')?.dataset.imageUrl || '',
                        description: quillInstances[sizeGroup.querySelector('.quill-editor-container')?.id]?.root.innerHTML || '',
                        capacity: parseInt(sizeGroup.querySelector('.size-capacity')?.value, 10) || 0,
                        rates: Array.from(sizeGroup.querySelectorAll('.rate-row')).map(rateRow => ({
                            duration: rateRow.querySelector('.rate-duration')?.value,
                            price: parseFloat((rateRow.querySelector('.rate-price')?.value || '0').replace(',', '.')) || 0
                        })).filter(r => r.duration && r.price > 0)
                    }
                }).filter(Boolean);
                
                if (sizes.length === 0) return null;

                return { id: categoryId, name: categoryData.name, sizes, totalCapacity: sizes.reduce((acc, size) => acc + (size.capacity || 0), 0) };
            }).filter(Boolean);

            const updatedData = {
                name: getValue('loc-name'),
                address: getValue('loc-address-search'),
                description: quillInstances['main_desc']?.root.innerHTML || '',
                imageUrl: mainImageUrl,
                geolocation: {
                    latitude: parseFloat(getValue('loc-lat')) || 0,
                    longitude: parseFloat(getValue('loc-lng')) || 0,
                },
                features: Array.from(form.querySelectorAll('.feature-row')).map(row => ({
                    name: row.querySelector('.feature-name')?.value,
                    icon: row.querySelector('.feature-icon-display')?.className.split(' ').slice(1).join(' ')
                })).filter(f => f.name && f.icon),
                categories: categoriesData,
                totalCapacity: parseInt(getValue('loc-total-capacity'), 10) || 0,
                openingHours: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].reduce((acc, day) => {
                    const open = getValue(`open-${day.toLowerCase()}`);
                    const close = getValue(`close-${day.toLowerCase()}`);
                    if (open && close) acc[day.toLowerCase()] = { open, close };
                    return acc;
                }, {})
            };

            if (!updatedData.name) {
                return Swal.fire('Validation Error', 'Location name is required.', 'error');
            }

            const ref = locationId ? db.ref(`storageLocations/${locationId}`) : db.ref('storageLocations').push();
            ref.set(updatedData)
                .then(() => {
                    Swal.fire('Success', `Location ${isEdit ? 'updated' : 'created'}.`, 'success');
                    showPage('locations');
                })
                .catch(err => Swal.fire('Error', err.message, 'error'));
        });
        
        function initializeEditorComponents(locData) {
            quillInstances['main_desc'] = new Quill('#loc-desc-editor', { theme: 'snow', placeholder: 'Location description...' });
            if (locData.description) quillInstances['main_desc'].root.innerHTML = locData.description;

            const tabButtons = document.querySelectorAll('.tab-button');
            const tabContents = document.querySelectorAll('.tab-content');
            tabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const tabName = button.dataset.tabName;
                    tabButtons.forEach(btn => btn.classList.toggle('active-tab', btn.dataset.tabName === tabName));
                    tabContents.forEach(content => content.classList.toggle('hidden', content.id !== tabName));
                    if (tabName === 'address') {
                        initializeLocationModalMap({ lat: parseFloat(locData.geolocation?.latitude), lng: parseFloat(locData.geolocation?.longitude) });
                    }
                });
            });

            const featuresContainer = document.getElementById('features-container');
            (locData.features || []).forEach(f => addFeatureRow(featuresContainer, faIcons, f.name, f.icon));
            document.getElementById('add-feature-btn').addEventListener('click', () => addFeatureRow(featuresContainer, faIcons));

            const storageTabsContainer = document.querySelector('.storage-type-tabs-container');
            const storageContentContainer = document.getElementById('storage-type-content-container');

            storageTabsContainer.addEventListener('click', (e) => {
                if (!e.target.matches('.storage-type-tab')) return;
                const tabButton = e.target;
                const categoryId = tabButton.dataset.categoryId;
                storageTabsContainer.querySelectorAll('.storage-type-tab').forEach(tab => tab.classList.remove('active'));
                tabButton.classList.add('active');
                storageContentContainer.querySelectorAll('.storage-type-content').forEach(content => content.classList.remove('active'));
                let contentDiv = storageContentContainer.querySelector(`.storage-type-content[data-category-id="${categoryId}"]`);
                if (!contentDiv) {
                    contentDiv = document.createElement('div');
                    contentDiv.className = 'storage-type-content';
                    contentDiv.dataset.categoryId = categoryId;
                    storageContentContainer.appendChild(contentDiv);
                    const categoryData = allStorageTypes[categoryId];
                    const existingCategory = (locData.categories || []).find(c => c.id === categoryId);
                    renderStorageTypeForm(contentDiv, categoryData.name, existingCategory || { id: categoryId, name: categoryData.name, sizes: [] });
                }
                contentDiv.classList.add('active');
            });

            let firstTabToActivate = storageTabsContainer.querySelector('.storage-type-tab');
            if (isEdit && locData.categories && locData.categories.length > 0) {
                 firstTabToActivate = storageTabsContainer.querySelector(`.storage-type-tab[data-category-id="${locData.categories[0].id}"]`) || firstTabToActivate;
            }
            if (firstTabToActivate) {
                firstTabToActivate.click();
            }

            const imageInput = document.getElementById('loc-image-upload');
            document.getElementById('loc-image-preview').addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    selectedImageFile = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        document.getElementById('loc-image-img').src = re.target.result;
                        document.getElementById('loc-image-img').classList.remove('hidden');
                        document.getElementById('loc-image-placeholder').classList.add('hidden');
                    };
                    reader.readAsDataURL(selectedImageFile);
                }
            });
        }

    } catch (error) {
        console.error("Error opening location editor:", error);
        container.innerHTML = `<p class="text-red-500 text-center">Failed to load location editor.</p>`;
    }
}

function renderStorageTypeForm(container, categoryName, locationCategory = {}) {
    const sizes = (locationCategory.sizes && locationCategory.sizes.length > 0) ? locationCategory.sizes : [{ name: '', description: '', capacity: 0, rates: [] }];
    const sizesHtml = sizes.map(size => addSizeGroupHtml(size)).join('');

    container.innerHTML = `
        <div class="p-4 border rounded-lg bg-gray-50/50 storage-type-form-container" data-category-id="${locationCategory.id}">
             <div class="flex justify-between items-center mb-4">
                <h5 class="font-semibold text-lg text-gray-800">${categoryName} Variants</h5>
                <p class="text-xs text-gray-500">Add at least one variant to offer this storage type.</p>
            </div>
            <div class="sizes-container space-y-4">${sizesHtml}</div>
            <button type="button" class="add-size-btn text-sm font-semibold text-blue-600 hover:text-blue-800 mt-4"><i class="fas fa-plus mr-1"></i>Add another Variant</button>
        </div>`;

    const sizesContainer = container.querySelector('.sizes-container');
    container.querySelector('.add-size-btn').addEventListener('click', () => addSizeGroup(sizesContainer));
    
    sizesContainer.querySelectorAll('.quill-editor-container').forEach(editorDiv => {
        const editorId = editorDiv.id;
        quillInstances[editorId] = new Quill(editorDiv, { theme: 'snow', placeholder: 'Describe this variant...' });
        if(editorDiv.dataset.initialValue) {
           quillInstances[editorId].root.innerHTML = editorDiv.dataset.initialValue;
        }
    });
    
    sizesContainer.addEventListener('click', function(e) {
        if (e.target.closest('.remove-size-btn')) {
            const sizeGroup = e.target.closest('.size-group');
            if (sizesContainer.querySelectorAll('.size-group').length > 1) {
                sizeGroup.remove();
            } else {
                Swal.fire('Info', 'At least one variant form is required. You can leave it empty to exclude it from saving.', 'info');
            }
        }
        if (e.target.closest('.add-rate-btn')) {
            addPricingRateRow(e.target.closest('.add-rate-btn').previousElementSibling);
        }
        if (e.target.closest('.size-image-preview')) {
            currentSizeImagePreview = e.target.closest('.size-image-preview');
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = (event) => {
                const file = event.target.files[0];
                if (file) {
                    openCropperModal(file);
                }
            };
            fileInput.click();
        }
    });
}

function addSizeGroupHtml(size = {}) {
    const editorId = `size-desc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const ratesHtml = (size.rates && size.rates.length > 0) 
        ? size.rates.map(rate => addPricingRateRowHtml(rate)).join('')
        : addPricingRateRowHtml();

    const hasImage = !!size.imageUrl;
    
    return `
        <div class="size-group border p-4 rounded-lg bg-white shadow-sm relative">
            <button type="button" class="remove-size-btn absolute -top-2 -right-2 text-red-500 bg-white rounded-full h-6 w-6 flex items-center justify-center border shadow hover:bg-red-500 hover:text-white transition-colors"><i class="fas fa-times text-xs"></i></button>
            
            <div class="grid grid-cols-1 md:grid-cols-5 gap-6">
                
                <div class="md:col-span-2">
                    <label class="form-label">Variant Image</label>
                    <div class="size-image-preview" data-image-url="${size.imageUrl || ''}">
                        <img src="${size.imageUrl || ''}" class="w-full h-full object-cover ${hasImage ? '' : 'hidden'}">
                        <i class="fas fa-image placeholder-icon ${hasImage ? 'hidden' : ''}"></i>
                        <div class="change-image-overlay">Click to upload/change</div>
                    </div>
                </div>

                <div class="md:col-span-3 space-y-4">
                    <div>
                        <label class="form-label">Variant Name / Size</label>
                        <input type="text" class="size-name input-field" placeholder="e.g., 2m x 3m Unit" value="${size.name || ''}">
                    </div>
                    <div>
                        <label class="form-label">Description</label>
                        <div id="${editorId}" class="quill-editor-container" data-initial-value="${size.description || ''}"></div>
                    </div>
                    <div>
                        <label class="form-label">Capacity (Units)</label>
                        <input type="number" class="size-capacity input-field" placeholder="Number of units for this variant" value="${size.capacity || ''}">
                    </div>
                </div>
            </div>

            <div class="mt-4 border-t pt-4">
                <h6 class="font-semibold text-sm mb-2">Pricing</h6>
                <div class="rates-list space-y-2">${ratesHtml}</div>
                <button type="button" class="add-rate-btn text-xs font-semibold text-blue-600 hover:text-blue-800 mt-2"><i class="fas fa-plus mr-1"></i>Add Rate</button>
            </div>
        </div>`;
}

function addPricingRateRowHtml(rate = {}) {
    const options = ['Daily', 'Weekly', 'Monthly'];
    const durationOptionsHtml = options.map(opt => 
        `<option value="${opt}" ${rate.duration === opt ? 'selected' : ''}>${opt}</option>`
    ).join('');

    return `
        <div class="rate-row grid grid-cols-10 gap-2 items-center">
            <div class="col-span-4">
                 <select class="rate-duration input-field text-sm p-2 w-full">${durationOptionsHtml}</select>
            </div>
            <div class="col-span-5">
                <input type="text" class="rate-price input-field text-sm p-2 w-full" placeholder="e.g., 500,000" value="${rate.price || ''}">
            </div>
            <div class="col-span-1 text-right">
                <button type="button" class="remove-rate-btn text-gray-400 hover:text-red-600" onclick="this.closest('.rate-row').remove()"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`;
}

function addSizeGroup(container) {
    const newHtml = addSizeGroupHtml();
    container.insertAdjacentHTML('beforeend', newHtml);
    const newSizeGroup = container.lastElementChild;
    const editorDiv = newSizeGroup.querySelector('.quill-editor-container');
    const editorId = editorDiv.id;
    quillInstances[editorId] = new Quill(editorDiv, { theme: 'snow', placeholder: 'Size description...' });
}

function addPricingRateRow(container) {
    container.insertAdjacentHTML('beforeend', addPricingRateRowHtml());
}

window.initializeLocationModalMap = function(initialCoords = {}) {
    if (typeof google === 'undefined' || !google.maps) { return; }
    const defaultCenter = { lat: -8.6702, lng: 115.2124 };
    const center = (initialCoords.lat && initialCoords.lng) ? initialCoords : defaultCenter;
    const mapElement = document.getElementById('location-map');
    if (!mapElement) return;
    locationMapInstance = new google.maps.Map(mapElement, { center, zoom: 13, disableDefaultUI: true, zoomControl: true });
    locationMarkerInstance = new google.maps.Marker({ position: center, map: locationMapInstance, draggable: true });
    const searchInput = document.getElementById('loc-address-search');
    const autocomplete = new google.maps.places.Autocomplete(searchInput);
    autocomplete.bindTo('bounds', locationMapInstance);
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry) {
            locationMapInstance.setCenter(place.geometry.location);
            locationMapInstance.setZoom(17);
            locationMarkerInstance.setPosition(place.geometry.location);
            updateLatLngInputs(place.geometry.location.toJSON());
            document.getElementById('loc-address-search').value = place.formatted_address || '';
        }
    });
    locationMarkerInstance.addListener('dragend', (e) => {
        const position = e.latLng.toJSON();
        updateLatLngInputs(position);
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: position }, (results, status) => {
            if (status === 'OK' && results[0]) {
                document.getElementById('loc-address-search').value = results[0].formatted_address;
            }
        });
    });
    updateLatLngInputs(center);
};

window.updateLatLngInputs = function(position) {
    document.getElementById('loc-lat').value = position.lat.toFixed(6);
    document.getElementById('loc-lng').value = position.lng.toFixed(6);
};

function addFeatureRow(container, iconList, name = '', icon = 'fas fa-check') {
    const rowId = `feature-${Date.now()}`;
    const row = document.createElement('div');
    row.className = 'feature-row flex items-center gap-2';
    row.id = rowId;
    row.innerHTML = `<button type="button" class="feature-icon-btn p-2 border rounded"><i class="feature-icon-display ${icon}"></i></button><input type="text" class="feature-name flex-grow px-2 py-1 border rounded text-sm" placeholder="Feature Name" value="${name}"><button type="button" class="remove-btn" onclick="document.getElementById('${rowId}').remove()"><i class="fas fa-trash"></i></button>`;
    container.appendChild(row);
    row.querySelector('.feature-icon-btn').addEventListener('click', (e) => openIconPicker(e.currentTarget));
}

window.openIconPicker = function(button) {
    currentIconButton = button;
    const modal = document.getElementById('icon-picker-modal');
    const grid = document.getElementById('icon-picker-grid');
    const search = document.getElementById('icon-picker-search');
    const renderIcons = (filter = '') => {
        grid.innerHTML = faIcons
            .filter(i => i.toLowerCase().includes(filter.toLowerCase()))
            .map(icon => `<div class="p-2 text-center text-xl cursor-pointer hover:bg-gray-200 rounded" data-icon="${icon}"><i class="${icon}"></i></div>`)
            .join('');
        grid.querySelectorAll('[data-icon]').forEach(el => {
            el.addEventListener('click', (e) => {
                if (currentIconButton) {
                    currentIconButton.querySelector('i').className = `feature-icon-display ${el.dataset.icon}`;
                }
                modal.classList.remove('visible');
            });
        });
    };
    search.oninput = () => renderIcons(search.value);
    document.getElementById('icon-picker-close-btn').onclick = () => modal.classList.remove('visible');
    renderIcons();
    modal.classList.add('visible');
};

window.openManageStorageTypesModal = async function() {
    const { uploadImage } = await import('./uploader.js');

    const renderTabContent = (id, type = { name: '', description: '', image: '' }) => {
        const isNew = !id;
        const title = isNew ? 'Add New Storage Type' : `Edit: ${type.name}`;
        const buttonText = isNew ? 'Create & Save' : 'Save Changes';
        const deleteButtonHtml = isNew ? '' : '<button type="button" id="delete-storage-type-btn" class="btn btn-danger">Delete</button>';

        return `
            <div class="storage-type-content active" data-id="${id || 'new'}">
                <h3 class="font-bold text-xl mb-4">${title}</h3>
                <form class="storage-type-form space-y-4">
                    <div>
                        <label class="form-label">Type Name</label>
                        <input type="text" class="input-field type-name" placeholder="e.g., Small Box" value="${type.name || ''}">
                    </div>
                    <div>
                        <label class="form-label">Description</label>
                        <textarea class="textarea-field type-description" placeholder="Brief description">${type.description || ''}</textarea>
                    </div>
                    <div>
                        <label class="form-label">Image</label>
                        <div class="storage-type-image-preview">
                            <img src="${type.image || ''}" class="${type.image ? '' : 'hidden'}">
                            <i class="fas fa-image placeholder-icon ${type.image ? 'hidden' : ''}"></i>
                        </div>
                        <input type="file" class="type-image-input hidden" accept="image/*">
                    </div>
                    <div class="storage-type-actions">
                        ${deleteButtonHtml}
                        <button type="button" class="btn btn-primary ml-auto save-storage-type-btn">${buttonText}</button>
                    </div>
                </form>
            </div>
        `;
    };

    const renderAllTabs = () => {
        let tabsHtml = '';
        if (window.allStorageTypes && Object.keys(window.allStorageTypes).length > 0) {
            tabsHtml = Object.entries(window.allStorageTypes).map(([id, type]) =>
                `<button type="button" class="storage-type-tab-item" data-id="${id}">${type.name}</button>`
            ).join('');
        }
        return tabsHtml + '<button type="button" class="storage-type-tab-item add-new" data-id="new"><i class="fas fa-plus mr-2"></i>Add New Type</button>';
    };

    await Swal.fire({
        html: `
            <div class="manage-storage-modal-container">
                <div class="manage-storage-modal-header">Manage Storage Types</div>
                <div class="manage-storage-modal-body">
                    <div class="storage-type-sidebar">${renderAllTabs()}</div>
                    <div class="storage-type-content-panel"></div>
                </div>
            </div>
        `,
        customClass: { popup: 'manage-storage-types-modal' },
        showConfirmButton: false,
        showCancelButton: false,
        didOpen: () => {
            const sidebar = Swal.getPopup().querySelector('.storage-type-sidebar');
            const contentPanel = Swal.getPopup().querySelector('.storage-type-content-panel');
            let currentFile = null;

            const activateTab = (tabEl) => {
                if (!tabEl) return;
                
                sidebar.querySelectorAll('.storage-type-tab-item.active').forEach(t => t.classList.remove('active'));
                tabEl.classList.add('active');

                const id = tabEl.dataset.id;
                const typeData = id === 'new' ? undefined : window.allStorageTypes[id];
                contentPanel.innerHTML = renderTabContent(id === 'new' ? null : id, typeData);
                
                const currentContent = contentPanel.querySelector('.storage-type-content');
                currentFile = null;

                currentContent.querySelector('.storage-type-image-preview').addEventListener('click', (e) => {
                    e.currentTarget.nextElementSibling.click();
                });
                
                currentContent.querySelector('.type-image-input').addEventListener('change', (e) => {
                    if (e.target.files && e.target.files[0]) {
                        currentFile = e.target.files[0];
                        const reader = new FileReader();
                        reader.onload = (re) => {
                            const previewImg = currentContent.querySelector('.storage-type-image-preview img');
                            previewImg.src = re.target.result;
                            previewImg.classList.remove('hidden');
                            currentContent.querySelector('.storage-type-image-preview .placeholder-icon').classList.add('hidden');
                        };
                        reader.readAsDataURL(currentFile);
                    }
                });

                currentContent.querySelector('.save-storage-type-btn').addEventListener('click', async (e) => {
                    e.preventDefault();
                    const name = currentContent.querySelector('.type-name').value;
                    const description = currentContent.querySelector('.type-description').value;

                    if (!name) {
                        Swal.showValidationMessage('Type name is required.');
                        return;
                    }
                    
                    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                    let imageUrl = currentContent.querySelector('.storage-type-image-preview img').src;
                    if (currentFile) {
                        try {
                            imageUrl = await uploadImage(currentFile);
                        } catch (error) {
                            return Swal.fire('Error', `Image upload failed: ${error.message}`, 'error');
                        }
                    }

                    const data = { name, description, image: imageUrl };
                    const ref = id === 'new' ? db.ref('settings/storageTypes').push() : db.ref(`settings/storageTypes/${id}`);
                    
                    await ref.set(data);
                    
                    await db.ref('settings/storageTypes').once('value', snapshot => {
                        window.allStorageTypes = snapshot.val() || {};
                        sidebar.innerHTML = renderAllTabs();
                        const newActiveTabId = id === 'new' ? ref.key : id;
                        const newActiveTab = sidebar.querySelector(`.storage-type-tab-item[data-id="${newActiveTabId}"]`);
                        
                        if (newActiveTab) {
                            activateTab(newActiveTab);
                        }
                        
                        Swal.fire('Success', 'Storage type saved!', 'success');
                    });
                });
                
                const deleteBtn = currentContent.querySelector('#delete-storage-type-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => {
                         Swal.fire({
                            title: 'Are you sure?',
                            text: "This will permanently delete this storage type.",
                            icon: 'warning',
                            showCancelButton: true,
                            confirmButtonColor: '#d33',
                            confirmButtonText: 'Yes, delete it!'
                        }).then(async (result) => {
                            if (result.isConfirmed) {
                                await db.ref(`settings/storageTypes/${id}`).remove();
                                await db.ref('settings/storageTypes').once('value', snapshot => {
                                    window.allStorageTypes = snapshot.val() || {};
                                    sidebar.innerHTML = renderAllTabs();
                                    const firstTab = sidebar.querySelector('.storage-type-tab-item:not(.add-new)');
                                    activateTab(firstTab || sidebar.querySelector('.add-new'));
                                    Swal.fire('Deleted!', 'The storage type has been deleted.', 'success');
                                });
                            }
                        });
                    });
                }
            };
            
            sidebar.addEventListener('click', (e) => {
                const tabItem = e.target.closest('.storage-type-tab-item');
                if(tabItem) {
                    activateTab(tabItem);
                }
            });

            const firstTab = sidebar.querySelector('.storage-type-tab-item:not(.add-new)');
            activateTab(firstTab || sidebar.querySelector('.add-new'));
        }
    });
};