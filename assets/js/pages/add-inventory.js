const AddInventory = {
    render: async () => {
        return `
            <div id="add-inventory-container" style="display: block; padding: 1rem; background-color: #F9FAFB; box-sizing: border-box; height: 100%; min-height: 100vh;">
                <style>
                    @media (min-width: 1024px) {
                        #add-inventory-content-wrapper { 
                            display: grid; 
                            grid-template-columns: 1fr 1fr; 
                            gap: 1.5rem; 
                        }
                    }
                    .inventory-table th, .inventory-table td { 
                        padding: 0.75rem; 
                        text-align: left; 
                        border-bottom: 1px solid #E5E7EB; 
                    }
                    .inventory-item-image { 
                        width: 60px; 
                        height: 60px; 
                        -o-object-fit: cover; 
                        object-fit: cover; 
                        border-radius: 0.5rem; 
                    }
                    .booking-status-badge {
                        display: inline-block;
                        padding: 4px 10px;
                        border-radius: 9999px;
                        font-size: 0.75rem;
                        font-weight: 600;
                        text-transform: uppercase;
                        white-space: nowrap;
                        color: white;
                        line-height: 1;
                        margin-left: 0.5rem;
                    }
                    .status-active { background-color: #00BEFC; }
                    .status-checked_in { background-color: #10B981; }
                    .status-completed, .status-cancelled { background-color: #9CA3AF; }
                    .form-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 1rem;
                    }
                    @media (min-width: 640px) {
                        .form-grid { grid-template-columns: 1fr 1fr; }
                    }
                    /* SweetAlert2 custom styles */
                    .swal2-popup {
                        font-family: 'Montserrat', sans-serif !important;
                        border-radius: 0.5rem !important;
                        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
                    }
                    .swal2-title { font-weight: 700 !important; color: #111827 !important; }
                    .swal2-html-container { color: #374151 !important; }
                    .swal2-confirm.swal2-styled {
                        background-color: #00BEFC !important;
                        border-color: #00BEFC !important;
                        border-radius: 9999px !important;
                    }
                    .swal2-cancel.swal2-styled {
                        background-color: #E5E7EB !important;
                        color: #1F2937 !important;
                        border-radius: 9999px !important;
                    }
                </style>
                <div style="display: -webkit-box; display: -ms-flexbox; display: flex; -webkit-box-pack: justify; -ms-flex-pack: justify; justify-content: space-between; -webkit-box-align: center; -ms-flex-align: center; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #E5E7EB; padding-bottom: 0.5rem;">
                    <h2 style="font-size: 1.5rem; font-weight: 800; color: #111827; margin: 0;">Manage Inventory</h2>
                </div>

                <div id="add-inventory-content-wrapper" style="display: -webkit-box; display: -ms-flexbox; display: flex; -webkit-box-orient: vertical; -webkit-box-direction: normal; -ms-flex-direction: column; flex-direction: column; gap: 1rem;">
                    <div id="inventory-list-card" style="background-color: white; border-radius: 0.75rem; -webkit-box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); padding: 1.5rem; -webkit-box-sizing: border-box; box-sizing: border-box; min-height: 250px;">
                        <div style="display: -webkit-box; display: -ms-flexbox; display: flex; -webkit-box-pack: justify; -ms-flex-pack: justify; justify-content: space-between; -webkit-box-align: center; -ms-flex-align: center; align-items: center; margin-bottom: 1.5rem;">
                            <h4 style="font-size: 1.25rem; font-weight: 700; color: #1F2937; margin: 0;">Inventory List</h4>
                            <div style="display: -webkit-box; display: -ms-flexbox; display: flex; -webkit-box-align: center; -ms-flex-align: center; align-items: center;">
                                <span id="booking-status-badge"></span>
                                <button id="check-in-out-btn" style="padding: 0.75rem 1.5rem; border-radius: 9999px; font-weight: 600; border: 1px solid transparent; color: white; background-color: #00BEFC; cursor: pointer; -webkit-transition: all 0.3s ease; -o-transition: all 0.3s ease; transition: all 0.3s ease;">Check-in</button>
                            </div>
                        </div>
                        <div style="display: -webkit-box; display: -ms-flexbox; display: flex; -webkit-box-orient: vertical; -webkit-box-direction: normal; -ms-flex-direction: column; flex-direction: column; gap: 0.5rem; font-size: 0.875rem; color: #374151; margin-bottom: 1rem;">
                            <div style="display: -webkit-box; display: -ms-flexbox; display: flex; -webkit-box-pack: justify; -ms-flex-pack: justify; justify-content: space-between;"><strong style="color: #111827;">Check-in Time:</strong> <span id="check-in-date">N/A</span></div>
                            <div style="display: -webkit-box; display: -ms-flexbox; display: flex; -webkit-box-pack: justify; -ms-flex-pack: justify; justify-content: space-between;"><strong style="color: #111827;">Check-out Time:</strong> <span id="check-out-date">N/A</span></div>
                        </div>
                        <div style="overflow-x: auto;">
                            <table class="inventory-table" style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr>
                                        <th style="background-color: #F3F4F6; color: #1F2937; font-size: 0.85rem; text-transform: uppercase; font-weight: 600;">Image</th>
                                        <th style="background-color: #F3F4F6; color: #1F2937; font-size: 0.85rem; text-transform: uppercase; font-weight: 600;">Details</th>
                                        <th style="background-color: #F3F4F6; color: #1F2937; font-size: 0.85rem; text-transform: uppercase; font-weight: 600;">Code</th>
                                    </tr>
                                </thead>
                                <tbody id="inventory-list-table-body">
                                    <tr class="empty-list-message" style="display: none;">
                                        <td colspan="3" style="text-align: center; color: #374151; padding: 1rem;">No items added yet.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div id="add-new-items-card" style="background-color: white; border-radius: 0.75rem; -webkit-box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); padding: 1.5rem; -webkit-box-sizing: border-box; box-sizing: border-box; min-height: 250px;">
                        <h4 style="font-size: 1.25rem; font-weight: 700; color: #1F2937; margin-bottom: 1.5rem;">Add New Items</h4>
                        <form id="inventory-form">
                            </form>
                        <div style="display: -webkit-box; display: -ms-flexbox; display: flex; -webkit-box-pack: justify; -ms-flex-pack: justify; justify-content: space-between; -webkit-box-align: center; -ms-flex-align: center; align-items: center; margin-top: 1.5rem;">
                            <button id="add-another-item-btn" style="padding: 0.5rem 1rem; border-radius: 9999px; font-weight: 600; border: 1px solid #D1D5DB; color: #1F2937; background-color: #F3F4F6; cursor: pointer; -webkit-transition: all 0.3s ease; -o-transition: all 0.3s ease; transition: all 0.3s ease;">Add Another Item</button>
                            <button id="submit-inventory-btn" disabled style="padding: 0.75rem 1.5rem; border-radius: 9999px; font-weight: 600; border: 1px solid transparent; color: white; background-color: #00BEFC; cursor: pointer; -webkit-transition: all 0.3s ease; -o-transition: all 0.3s ease; transition: all 0.3s ease;">Submit Inventory</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    afterRender: async () => {
        const neutral200 = '#E5E7EB';
        const neutral300 = '#D1D5DB';
        const neutral400 = '#9CA3AF';
        const neutral800 = '#1F2937';
        const danger500 = '#EF4444';
        const success500 = '#10B981';

        const inputStyle = `
            width: 100%;
            padding: 0.75rem 1rem;
            border: 1px solid ${neutral300};
            border-radius: 9999px;
            font-size: 1rem;
            color: ${neutral800};
            background-color: white;
            box-sizing: border-box;
            -webkit-transition: border-color 0.3s ease, box-shadow 0.3s ease;
            -o-transition: border-color 0.3s ease, box-shadow 0.3s ease;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
        `;

        const buttonDangerStyle = `
            padding: 0.25rem 0.75rem;
            font-size: 0.875rem;
            border-radius: 9999px;
            border: 1px solid transparent;
            color: white;
            background-color: ${danger500};
            cursor: pointer;
            -webkit-transition: all 0.3s ease;
            -o-transition: all 0.3s ease;
            transition: all 0.3s ease;
        `;

        const inventoryForm = document.getElementById('inventory-form');
        const addAnotherItemBtn = document.getElementById('add-another-item-btn');
        const inventoryListTableBody = document.getElementById('inventory-list-table-body');
        const submitInventoryBtn = document.getElementById('submit-inventory-btn');
        const checkInOutBtn = document.getElementById('check-in-out-btn');
        const statusBadge = document.getElementById('booking-status-badge');
        const checkInDateInput = document.getElementById('check-in-date');
        const checkOutDateInput = document.getElementById('check-out-date');
        const bookingId = 'dummy_booking_5';

        let inventoryItems = [];
        let itemIdCounter = 0;

        function showPopup(title, text, icon) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: title,
                    text: text,
                    icon: icon,
                    confirmButtonText: 'OK',
                    showClass: {
                        popup: 'animate__animated animate__fadeInDown'
                    },
                    hideClass: {
                        popup: 'animate__animated animate__fadeOutUp'
                    }
                });
            } else {
                alert(text);
            }
        }

        function fetchBookingData() {
            const bookingRef = firebase.database().ref(`bookings/${bookingId}`);
            bookingRef.on('value', (snapshot) => {
                const booking = snapshot.val();
                if (booking) {
                    inventoryItems = booking.inventories ? Object.values(booking.inventories) : [];
                    updateInventoryList();
                    updateBookingStatusUI(booking);
                }
            });
        }

        function updateInventoryList() {
            inventoryListTableBody.innerHTML = '';
            const emptyListMessage = document.querySelector('.empty-list-message');
            if (inventoryItems.length === 0) {
                if (emptyListMessage) emptyListMessage.style.display = 'table-row';
            } else {
                if (emptyListMessage) emptyListMessage.style.display = 'none';
                inventoryItems.forEach((item) => {
                    const itemHtml = `
                        <tr>
                            <td style="padding: 0.5rem; vertical-align: top; border-bottom: 1px solid #e5e7eb;">
                                ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}" style="width: 60px; height: 60px; -o-object-fit: cover; object-fit: cover; border-radius: 0.5rem;">` : 'N/A'}
                            </td>
                            <td style="padding: 0.5rem; vertical-align: top; border-bottom: 1px solid #e5e7eb;">
                                <div style="font-weight: 600;">${item.name}</div>
                                <div style="font-size: 0.875rem; color: #4b5563;">${item.description}</div>
                                <div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">Category: ${item.category}</div>
                            </td>
                            <td style="padding: 0.5rem; vertical-align: top; border-bottom: 1px solid #e5e7eb; font-size: 0.875rem;">
                                ${item.uniqueCode}
                            </td>
                        </tr>
                    `;
                    inventoryListTableBody.insertAdjacentHTML('beforeend', itemHtml);
                });
            }
        }

        function updateBookingStatusUI(booking) {
            if (!booking) return;

            const status = booking.bookingStatus;
            const checkInTime = booking.checkInTime ? new Date(booking.checkInTime).toLocaleString() : 'N/A';
            const checkOutTime = booking.checkOutTime ? new Date(booking.checkOutTime).toLocaleString() : 'N/A';
            
            checkInDateInput.value = checkInTime;
            checkOutDateInput.value = checkOutTime;
            
            if (statusBadge) {
                statusBadge.textContent = status.replace(/_/g, ' ');
                statusBadge.className = `booking-status-badge status-${status}`;
            }
            
            if (status === 'checked_in') {
                checkInOutBtn.textContent = 'Check-out';
                checkInOutBtn.style.backgroundColor = danger500;
                checkInOutBtn.disabled = false;
            } else if (status === 'completed' || status === 'cancelled') {
                checkInOutBtn.textContent = 'Done';
                checkInOutBtn.style.backgroundColor = neutral400;
                checkInOutBtn.disabled = true;
            } else { // active or other status
                checkInOutBtn.textContent = 'Check-in';
                checkInOutBtn.style.backgroundColor = success500;
                checkInOutBtn.disabled = false;
            }
        }

        checkInOutBtn.addEventListener('click', async () => {
            const bookingRef = firebase.database().ref(`bookings/${bookingId}`);
            const currentStatus = (await bookingRef.once('value')).val().bookingStatus;
            
            if (currentStatus === 'active') {
                try {
                    await bookingRef.update({
                        bookingStatus: 'checked_in',
                        checkInTime: firebase.database.ServerValue.TIMESTAMP
                    });
                    showPopup('Check-in Berhasil!', 'Status booking telah diperbarui menjadi "Checked-in".', 'success');
                } catch (error) {
                    console.error('Error during check-in:', error);
                    showPopup('Gagal Check-in', 'Terjadi kesalahan saat memperbarui status booking.', 'error');
                }
            } else if (currentStatus === 'checked_in') {
                try {
                    await bookingRef.update({
                        bookingStatus: 'completed',
                        checkOutTime: firebase.database.ServerValue.TIMESTAMP
                    });
                    showPopup('Check-out Berhasil!', 'Status booking telah diperbarui menjadi "Completed".', 'success');
                } catch (error) {
                    console.error('Error during check-out:', error);
                    showPopup('Gagal Check-out', 'Terjadi kesalahan saat memperbarui status booking.', 'error');
                }
            }
        });

        addAnotherItemBtn.addEventListener('click', (e) => {
            e.preventDefault();
            addInventoryItemForm();
        });

        function addInventoryItemForm() {
            itemIdCounter++;
            const uniqueItemId = `item-${Date.now()}-${itemIdCounter}`;

            const formItemHtml = `
                <div class="inventory-item-form-group" data-id="${uniqueItemId}" style="border-bottom: 1px solid ${neutral200}; padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
                    <h5 style="font-weight: 600; font-size: 1.125rem; margin-bottom: 1rem;">Item #${itemIdCounter}</h5>
                    <div class="form-grid">
                        <div style="grid-column: 1 / -1;">
                            <label for="item-category-${uniqueItemId}" style="display: block; font-size: 0.9rem; color: #374151; margin-bottom: 0.25rem; font-weight: 500;">Item Category</label>
                            <input type="text" class="input-field" id="item-category-${uniqueItemId}" name="item-category" placeholder="e.g., Electronics" style="${inputStyle}">
                        </div>
                        <div>
                            <label for="item-name-${uniqueItemId}" style="display: block; font-size: 0.9rem; color: #374151; margin-bottom: 0.25rem; font-weight: 500;">Item Name</label>
                            <input type="text" class="input-field" id="item-name-${uniqueItemId}" name="item-name" placeholder="e.g., MacBook Laptop" style="${inputStyle}">
                        </div>
                        <div>
                            <label for="item-description-${uniqueItemId}" style="display: block; font-size: 0.9rem; color: #374151; margin-bottom: 0.25rem; font-weight: 500;">Description</label>
                            <textarea class="input-field" id="item-description-${uniqueItemId}" name="item-description" rows="1" placeholder="e.g., Silver MacBook Pro, a few scratches on the lid." style="${inputStyle} border-radius: 0.5rem;"></textarea>
                        </div>
                    </div>
                    <div style="margin-top: 1rem;">
                        <label for="item-photos-${uniqueItemId}" style="display: block; font-size: 0.9rem; color: #374151; margin-bottom: 0.25rem; font-weight: 500;">Photos</label>
                        <input type="file" class="input-field" id="item-photos-${uniqueItemId}" name="item-photos" accept="image/*" multiple style="display: block; width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 9999px; font-size: 1rem; color: #1f2937;">
                        <div class="photo-preview-container" style="display: -webkit-box; display: -ms-flexbox; display: flex; gap: 0.5rem; margin-top: 0.5rem; -ms-flex-wrap: wrap; flex-wrap: wrap;"></div>
                    </div>
                    <div style="display: -webkit-box; display: -ms-flexbox; display: flex; -webkit-box-pack: end; -ms-flex-pack: end; justify-content: flex-end; margin-top: 0.5rem;">
                        <button type="button" class="btn btn-danger btn-sm remove-item-btn" style="${buttonDangerStyle}">Remove</button>
                    </div>
                </div>
            `;
            inventoryForm.insertAdjacentHTML('beforeend', formItemHtml);

            const newItemForm = inventoryForm.querySelector(`[data-id="${uniqueItemId}"]`);
            const removeBtn = newItemForm.querySelector('.remove-item-btn');
            const photoInput = newItemForm.querySelector(`#item-photos-${uniqueItemId}`);
            const previewContainer = newItemForm.querySelector('.photo-preview-container');

            removeBtn.addEventListener('click', () => {
                if (inventoryForm.children.length > 1) {
                    newItemForm.remove();
                    reIndexItems();
                } else {
                    showPopup('Minimal Satu Item', 'Anda harus memiliki setidaknya satu item inventaris.', 'warning');
                }
            });

            photoInput.addEventListener('change', (event) => {
                previewContainer.innerHTML = '';
                Array.from(event.target.files).forEach(file => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = document.createElement('img');
                        img.src = e.target.result;
                        img.style.cssText = 'width: 6rem; height: 6rem; -o-object-fit: cover; object-fit: cover; border-radius: 0.5rem; border: 1px solid #d1d5db;';
                        previewContainer.appendChild(img);
                    };
                    reader.readAsDataURL(file);
                });
            });
            updateSubmitButtonStatus();
        }

        function reIndexItems() {
            itemIdCounter = 0;
            const itemForms = inventoryForm.querySelectorAll('.inventory-item-form-group');
            itemForms.forEach((itemForm) => {
                itemIdCounter++;
                const title = itemForm.querySelector('h5');
                if (title) title.textContent = `Item #${itemIdCounter}`;
            });
            updateSubmitButtonStatus();
        }
        
        function updateSubmitButtonStatus() {
            const hasItems = inventoryForm.children.length > 0;
            submitInventoryBtn.disabled = !hasItems;
        }

        submitInventoryBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const inventoriesRef = firebase.database().ref(`bookings/${bookingId}/inventories`);
            const itemForms = inventoryForm.querySelectorAll('.inventory-item-form-group');
            let formIsValid = true;
            
            const uploadPromises = [];
            
            itemForms.forEach(itemForm => {
                const category = itemForm.querySelector('input[name="item-category"]').value;
                const name = itemForm.querySelector('input[name="item-name"]').value;
                const description = itemForm.querySelector('textarea[name="item-description"]').value;
                const photos = itemForm.querySelector('input[name="item-photos"]').files;

                if (!name || !category || !description) {
                    formIsValid = false;
                }

                if (formIsValid) {
                    const newInventoryRef = inventoriesRef.push();
                    const uniqueCode = newInventoryRef.key;

                    let newItemData = {
                        category,
                        name,
                        description,
                        uniqueCode,
                        imageUrl: '',
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    };

                    if (photos.length > 0) {
                        const photoFile = photos[0];
                        const storageRef = firebase.storage().ref(`inventories/${bookingId}/${newInventoryRef.key}-${photoFile.name}`);
                        const uploadTask = storageRef.put(photoFile).then(snapshot => snapshot.ref.getDownloadURL());
                        uploadPromises.push(uploadTask.then(url => {
                            newItemData.imageUrl = url;
                            return newItemData;
                        }));
                    } else {
                        uploadPromises.push(Promise.resolve(newItemData));
                    }
                }
            });

            if (!formIsValid) {
                showPopup('Data Tidak Lengkap', 'Mohon lengkapi semua field untuk setiap item.', 'error');
                return;
            }

            try {
                const uploadedItems = await Promise.all(uploadPromises);
                const updates = {};
                uploadedItems.forEach(item => {
                    updates[item.uniqueCode] = item;
                });
                inventoriesRef.update(updates);
                showPopup('Inventaris Berhasil Ditambah!', 'Item inventaris Anda telah berhasil ditambahkan.', 'success');
                resetForm();
            } catch (error) {
                console.error("Error adding inventory:", error);
                showPopup('Gagal Menambah Inventaris', 'Terjadi kesalahan saat menambahkan item inventaris.', 'error');
            }
        });

        function resetForm() {
            inventoryForm.innerHTML = '';
            itemIdCounter = 0;
            addInventoryItemForm();
            updateSubmitButtonStatus();
        }
        
        fetchBookingData();
        addInventoryItemForm();
    }
};

export default AddInventory;