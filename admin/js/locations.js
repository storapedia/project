let quillInstances = {};
let locationMapInstance = null;
let locationMarkerInstance = null;

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
    const { uploadImage } = await import('./uploader.js');
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

        const storageTypeOptionsHtml = Object.entries(allStorageTypes).map(([id, type]) => {
            const isChecked = Array.isArray(loc.categories) && loc.categories.some(cat => cat.id === id);
            return `<div class="p-2 border-b last:border-b-0"><label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="storage-type-cb" data-id="${id}" ${isChecked ? 'checked' : ''}><span class="font-semibold text-sm">${type.name}</span></label></div>`;
        }).join('');

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
                        <button type="button" class="tab-button px-3 py-2 text-xs font-medium text-center border-b-2 border-transparent" data-tab-name="address">Address</button>
                        <button type="button" class="tab-button px-3 py-2 text-xs font-medium text-center border-b-2 border-transparent" data-tab-name="media">Media & Features</button>
                        <button type="button" class="tab-button px-3 py-2 text-xs font-medium text-center border-b-2 border-transparent" data-tab-name="storage">Storage</button>
                        <button type="button" class="tab-button px-3 py-2 text-xs font-medium text-center border-b-2 border-transparent" data-tab-name="hours">Opening Hours</button>
                    </div>
                    <form id="location-form" class="text-left">
                        <div id="basic" class="tab-content space-y-3">
                            <input id="loc-name" class="input-field" placeholder="Location Name" value="${loc.name || ''}">
                            <div id="loc-desc-editor"></div>
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
                                    <p class="mt-2 text-sm">Click to upload</p>
                                </div>
                            </div>
                            <input id="loc-image-upload" type="file" class="hidden" accept="image/*">
                            <hr class="my-4"/>
                            <h4 class="font-semibold text-sm">Features</h4>
                            <div id="features-container" class="flex flex-wrap gap-2"></div>
                            <button type="button" id="add-feature-btn" class="btn btn-secondary btn-sm"><i class="fas fa-plus"></i> Add Feature</button>
                        </div>
                        <div id="storage" class="tab-content hidden space-y-4">
                            <div class="grid md:grid-cols-2 gap-4">
                                <div>
                                    <h4 class="font-semibold mb-2">Available Storage Types</h4>
                                    <div id="categories-container" class="border rounded-lg max-h-60 overflow-y-auto">${storageTypeOptionsHtml}</div>
                                </div>
                                <div>
                                    <h4 class="font-semibold mb-2">Total Capacity</h4>
                                    <input type="number" id="loc-total-capacity" class="input-field" placeholder="Total units" value="${loc.totalCapacity || ''}">
                                </div>
                            </div>
                            <div id="sizes-container" class="mt-4 flex flex-col gap-4"></div>
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
            const existingData = isEdit ? (await db.ref(`storageLocations/${locationId}`).once('value')).val() : {};
            let imageUrl = existingData.imageUrl || '';
            if (selectedImageFile) {
                Swal.fire({ title: 'Uploading Image...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                try {
                    imageUrl = await uploadImage(selectedImageFile);
                } catch (error) {
                    Swal.fire('Upload Failed', error.message, 'error');
                    return;
                }
            }

            const form = document.getElementById('location-form');
            const getValue = (id) => form.querySelector(`#${id}`)?.value || '';

            const updatedData = {
                ...existingData,
                name: getValue('loc-name'),
                address: getValue('loc-address-search'),
                description: quillInstances['main_desc']?.root.innerHTML || '',
                imageUrl,
                geolocation: {
                    latitude: parseFloat(getValue('loc-lat')) || existingData.geolocation?.latitude || 0,
                    longitude: parseFloat(getValue('loc-lng')) || existingData.geolocation?.longitude || 0,
                },
                features: Array.from(form.querySelectorAll('.feature-row')).map(row => ({
                    name: row.querySelector('.feature-name')?.value,
                    icon: row.querySelector('.feature-icon-display')?.className.split(' ').slice(1).join(' ')
                })).filter(f => f.name && f.icon),
                categories: Array.from(form.querySelectorAll('.storage-type-cb:checked')).map(cb => {
                    const categoryId = cb.dataset.id;
                    const categoryData = allStorageTypes[categoryId];
                    const categoryForm = form.querySelector(`#storage-type-form-${categoryId}`);
                    if (!categoryForm) return null;
                    const sizes = Array.from(categoryForm.querySelectorAll('.size-group')).map(sizeGroup => ({
                        name: sizeGroup.querySelector('.size-name')?.value,
                        description: quillInstances[sizeGroup.querySelector('.quill-editor-container')?.id]?.root.innerHTML || '',
                        capacity: parseInt(sizeGroup.querySelector('.size-capacity')?.value, 10) || 0,
                        rates: Array.from(sizeGroup.querySelectorAll('.rate-row')).map(rateRow => ({
                            duration: rateRow.querySelector('.rate-duration')?.value,
                            price: parseFloat(rateRow.querySelector('.rate-price')?.value.replace(',', '.')) || 0
                        })).filter(r => r.duration && r.price > 0)
                    })).filter(s => s.name);
                    return { id: categoryId, name: categoryData.name, sizes, totalCapacity: sizes.reduce((acc, size) => acc + (size.capacity || 0), 0) };
                }).filter(Boolean),
                totalCapacity: parseInt(getValue('loc-total-capacity'), 10) || 0,
                openingHours: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].reduce((acc, day) => {
                    const open = getValue(`open-${day.toLowerCase()}`);
                    const close = getValue(`close-${day.toLowerCase()}`);
                    if (open && close) acc[day.toLowerCase()] = { open, close };
                    return acc;
                }, {})
            };

            if (!updatedData.name) {
                Swal.fire('Validation Error', 'Location name is required.', 'error');
                return;
            }

            Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
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

            const categoriesContainer = document.getElementById('categories-container');
            const sizesContainer = document.getElementById('sizes-container');
            categoriesContainer.addEventListener('change', (e) => {
                if (e.target.matches('.storage-type-cb')) {
                    const cb = e.target;
                    const categoryId = cb.dataset.id;
                    const category = allStorageTypes[categoryId];
                    const formContainerId = `storage-type-form-${categoryId}`;
                    let formContainer = document.getElementById(formContainerId);
                    if (cb.checked) {
                        if (!formContainer) {
                            formContainer = document.createElement('div');
                            formContainer.id = formContainerId;
                            sizesContainer.appendChild(formContainer);
                            const existingData = locData.categories?.find(c => c.id === categoryId);
                            renderStorageTypeForm(formContainer, category.name, existingData || { id: categoryId, name: category.name });
                        }
                    } else {
                        if (formContainer) formContainer.remove();
                    }
                }
            });

            if (Array.isArray(locData.categories)) {
                locData.categories.forEach(cat => {
                    const cb = categoriesContainer.querySelector(`input[data-id="${cat.id}"]`);
                    if (cb?.checked) {
                        const formContainer = document.createElement('div');
                        formContainer.id = `storage-type-form-${cat.id}`;
                        sizesContainer.appendChild(formContainer);
                        renderStorageTypeForm(formContainer, cat.name, cat);
                    }
                });
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

window.initializeLocationModalMap = function(initialCoords = {}) {
    if (typeof google === 'undefined' || !google.maps) {
        console.error("Google Maps script not loaded.");
        return;
    }

    const defaultCenter = { lat: -8.6702, lng: 115.2124 };
    const center = (initialCoords.lat && initialCoords.lng) ? initialCoords : defaultCenter;
    const mapElement = document.getElementById('location-map');

    if (!mapElement) return;

    locationMapInstance = new google.maps.Map(mapElement, {
        center,
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
    });

    locationMarkerInstance = new google.maps.Marker({
        position: center,
        map: locationMapInstance,
        draggable: true,
    });

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

function renderStorageTypeForm(container, categoryName, locationCategory = {}) {
    const sizes = locationCategory.sizes || [{ name: '', description: '', capacity: 0, rates: [] }];
    const sizesHtml = sizes.map(size => addSizeGroupHtml(size)).join('');

    container.innerHTML = `
        <div class="p-3 border rounded-lg bg-gray-50">
            <h5 class="font-semibold text-base">${categoryName} Sizes</h5>
            <div class="sizes-container space-y-3 mt-2">${sizesHtml}</div>
            <button type="button" class="add-size-btn text-sm font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Size</button>
        </div>`;

    const sizesContainer = container.querySelector('.sizes-container');
    container.querySelector('.add-size-btn').addEventListener('click', () => addSizeGroup(sizesContainer));

    sizesContainer.querySelectorAll('.remove-size-btn').forEach(btn => btn.addEventListener('click', (e) => e.target.closest('.size-group').remove()));
    sizesContainer.querySelectorAll('.add-rate-btn').forEach(btn => btn.addEventListener('click', (e) => addPricingRateRow(e.target.previousElementSibling)));
    sizesContainer.querySelectorAll('.quill-editor-container').forEach(editorDiv => {
        const editorId = editorDiv.id;
        quillInstances[editorId] = new Quill(editorDiv, { theme: 'snow', placeholder: 'Size description...' });
        quillInstances[editorId].root.innerHTML = editorDiv.dataset.initialValue || '';
    });
}

function addSizeGroupHtml(size = {}) {
    const editorId = `size-desc-${Date.now()}-${Math.random()}`;
    const ratesHtml = (size.rates || []).map(rate => addPricingRateRowHtml(rate)).join('');
    return `
        <div class="size-group border p-3 rounded-md bg-white">
            <div class="flex justify-between items-center mb-2">
                <input type="text" class="size-name input-field" placeholder="Size Name" value="${size.name || ''}">
                <button type="button" class="remove-size-btn text-red-600"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div id="${editorId}" class="quill-editor-container" data-initial-value="${size.description || ''}"></div>
            <div class="mt-2"><label class="form-label-sm">Capacity</label>
                <input type="number" class="size-capacity input-field" placeholder="Units" value="${size.capacity || ''}">
            </div>
            <div class="mt-2">
                <h6 class="font-semibold text-xs">Rates:</h6>
                <div class="rates-list space-y-2 mt-1">${ratesHtml}</div>
                <button type="button" class="add-rate-btn text-xs font-semibold text-blue-600 mt-2"><i class="fas fa-plus mr-1"></i>Add Rate</button>
            </div>
        </div>`;
}

function addPricingRateRowHtml(rate = {}) {
    return `
        <div class="rate-row grid grid-cols-3 gap-2 items-center">
            <input type="text" class="rate-duration input-field text-sm p-2" placeholder="Duration" value="${rate.duration || ''}">
            <input type="number" class="rate-price input-field text-sm p-2" placeholder="Price" value="${rate.price || ''}">
            <button type="button" class="remove-rate-btn text-red-600" onclick="this.closest('.rate-row').remove()"><i class="fas fa-times-circle"></i></button>
        </div>`;
}

function addSizeGroup(container) {
    const newHtml = addSizeGroupHtml();
    container.insertAdjacentHTML('beforeend', newHtml);
    const newSizeGroup = container.lastElementChild;
    const editorId = newSizeGroup.querySelector('.quill-editor-container').id;
    quillInstances[editorId] = new Quill(`#${editorId}`, { theme: 'snow', placeholder: 'Size description...' });
    newSizeGroup.querySelector('.remove-size-btn').addEventListener('click', (e) => e.target.closest('.size-group').remove());
    newSizeGroup.querySelector('.add-rate-btn').addEventListener('click', (e) => addPricingRateRow(e.target.previousElementSibling));
}

function addPricingRateRow(container) {
    container.insertAdjacentHTML('beforeend', addPricingRateRowHtml());
}

let currentIconButton = null;
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

async function openEditStorageTypeModal(id, type) {
    const { uploadImage } = await import('./uploader.js');
    let selectedTypeImageFile = null;

    const { value: formValues } = await Swal.fire({
        title: `Edit: ${type.name}`,
        html: `
            <div class="text-left space-y-3">
                <div>
                    <label for="swal-edit-type-name" class="form-label">Type Name</label>
                    <input id="swal-edit-type-name" class="swal2-input" value="${type.name || ''}">
                </div>
                <div>
                    <label for="swal-edit-type-desc" class="form-label">Description</label>
                    <textarea id="swal-edit-type-desc" class="swal2-textarea">${type.description || ''}</textarea>
                </div>
                <div>
                    <label for="swal-edit-type-image-upload" class="form-label">Change Image</label>
                    <input id="swal-edit-type-image-upload" type="file" class="swal2-file" accept="image/*">
                    <img id="swal-edit-type-image-preview" src="${type.image || 'https://placehold.co/100x100/e2e8f0/64748b?text=Img'}" class="mt-2 w-24 h-24 object-cover rounded-md mx-auto"/>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        didOpen: () => {
            const imageInput = document.getElementById('swal-edit-type-image-upload');
            const imagePreview = document.getElementById('swal-edit-type-image-preview');
            imageInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    selectedTypeImageFile = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (re) => { imagePreview.src = re.target.result; };
                    reader.readAsDataURL(selectedTypeImageFile);
                }
            });
        },
        preConfirm: async () => {
            const name = document.getElementById('swal-edit-type-name').value;
            if (!name) {
                Swal.showValidationMessage('Type name is required.');
                return false;
            }

            let imageUrl = type.image || '';
            if (selectedTypeImageFile) {
                Swal.showLoading();
                try {
                    imageUrl = await uploadImage(selectedTypeImageFile);
                } catch (error) {
                    Swal.showValidationMessage(`Image Upload Failed: ${error.message}`);
                    return false;
                }
            }
            return {
                name,
                description: document.getElementById('swal-edit-type-desc').value,
                image: imageUrl
            };
        }
    });

    if (formValues) {
        db.ref(`settings/storageTypes/${id}`).update(formValues)
            .then(() => Swal.fire('Success!', 'Storage type updated.', 'success'))
            .catch(err => Swal.fire('Error', err.message, 'error'));
    }
}

window.openManageStorageTypesModal = async function() {
    const { uploadImage } = await import('./uploader.js');
    let selectedTypeImageFile = null;

    const renderTypeList = () => {
        if (!window.allStorageTypes || Object.keys(window.allStorageTypes).length === 0) {
            return '<p class="text-center text-gray-500 my-4">No storage types defined.</p>';
        }
        return Object.entries(window.allStorageTypes).map(([id, type]) => `
            <div class="storage-type-item flex justify-between items-center p-3 border-b" data-id="${id}">
                <div class="flex items-center gap-4">
                    <img src="${type.image || 'https://placehold.co/60x60/e2e8f0/64748b?text=Img'}" class="w-16 h-16 object-cover rounded-md">
                    <div>
                        <p class="font-bold text-gray-800">${type.name}</p>
                        <p class="text-xs text-gray-500">${type.description || ''}</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button class="text-blue-600 hover:text-blue-900 edit-type-btn"><i class="fas fa-edit"></i></button>
                    <button class="text-red-600 hover:text-red-900 delete-type-btn"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    };

    const { value: formValues } = await Swal.fire({
        title: 'Manage Storage Types',
        html: `
            <div id="storage-types-list" class="max-h-96 overflow-y-auto mb-4">${renderTypeList()}</div>
            <h3 class="font-bold text-lg border-t pt-4">Add New Type</h3>
            <div class="text-left space-y-3 mt-2">
                <div>
                    <label for="swal-type-name" class="form-label">Type Name</label>
                    <input id="swal-type-name" class="swal2-input" placeholder="e.g., Small Box">
                </div>
                <div>
                    <label for="swal-type-desc" class="form-label">Description</label>
                    <textarea id="swal-type-desc" class="swal2-textarea" placeholder="Brief description"></textarea>
                </div>
                 <div>
                    <label for="swal-type-image-upload" class="form-label">Image</label>
                    <input id="swal-type-image-upload" type="file" class="swal2-file" accept="image/*">
                    <img id="swal-type-image-preview" src="#" class="hidden mt-2 w-24 h-24 object-cover rounded-md mx-auto"/>
                </div>
            </div>
        `,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: 'Add New Type',
        didOpen: () => {
            const imageInput = document.getElementById('swal-type-image-upload');
            const imagePreview = document.getElementById('swal-type-image-preview');
            imageInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    selectedTypeImageFile = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        imagePreview.src = re.target.result;
                        imagePreview.classList.remove('hidden');
                    };
                    reader.readAsDataURL(selectedTypeImageFile);
                }
            });

            document.querySelectorAll('.edit-type-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.closest('.storage-type-item').dataset.id;
                    const type = window.allStorageTypes[id];
                    Swal.close();
                    openEditStorageTypeModal(id, type);
                });
            });

            document.querySelectorAll('.delete-type-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.closest('.storage-type-item').dataset.id;
                    Swal.fire({
                        title: 'Are you sure?',
                        text: "You won't be able to revert this!",
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#d33',
                        confirmButtonText: 'Yes, delete it!'
                    }).then((result) => {
                        if (result.isConfirmed) {
                            db.ref(`settings/storageTypes/${id}`).remove()
                                .then(() => {
                                    Swal.fire('Deleted!', 'The storage type has been deleted.', 'success');
                                    document.getElementById('storage-types-list').innerHTML = renderTypeList();
                                })
                                .catch(err => Swal.fire('Error', err.message, 'error'));
                        }
                    });
                });
            });
        },
        preConfirm: async () => {
            const name = document.getElementById('swal-type-name').value;
            const description = document.getElementById('swal-type-desc').value;
            if (!name) {
                Swal.showValidationMessage('Type name is required.');
                return false;
            }

            let imageUrl = '';
            if (selectedTypeImageFile) {
                Swal.showLoading();
                try {
                    imageUrl = await uploadImage(selectedTypeImageFile);
                } catch (error) {
                    Swal.showValidationMessage(`Image Upload Failed: ${error.message}`);
                    return false;
                }
            }
            return { name, description, image: imageUrl };
        }
    });

    if (formValues) {
        const { name, description, image } = formValues;
        const newTypeRef = db.ref('settings/storageTypes').push();
        newTypeRef.set({ name, description, image })
            .then(() => Swal.fire('Success!', 'New storage type added.', 'success'))
            .catch(err => Swal.fire('Error', err.message, 'error'));
    }
}