// admin/js/vouchers.js

function renderVouchersTable(vouchers) {
    const tbody = document.getElementById('vouchers-table-body');
    const cardView = document.getElementById('vouchers-card-view');
    
    tbody.innerHTML = '';
    cardView.innerHTML = '';

    if (!vouchers || vouchers.length === 0) {
        const noResultsHtml = `<tr><td colspan="6" class="text-center p-8">No vouchers found.</td></tr>`;
        tbody.innerHTML = noResultsHtml;
        cardView.innerHTML = `<p class="text-center text-gray-500 p-4">No vouchers found.</p>`;
        return;
    }

    vouchers.forEach(v => {
        let appliesTo = 'All Locations';
        if (v.appliesTo === 'specific' && v.locations) { appliesTo = `${Object.keys(v.locations).length} specific locations`; }

        // Gunakan fungsi get-photo untuk menampilkan gambar
        const imageUrl = v.imageUrl 
            ? `/.netlify/functions/get-photo?key=${encodeURIComponent(v.imageUrl.split('key=')[1] || v.imageUrl)}` 
            : 'https://placehold.co/100x60/e2e8f0/64748b?text=Voucher';

        const row = document.createElement('tr');
        row.className = 'bg-white border-b hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-6 py-4"><img src="${imageUrl}" class="w-24 h-auto rounded-md object-cover"></td>
            <td class="px-6 py-4 font-semibold">${v.code || 'N/A'}</td>
            <td class="px-6 py-4">${v.discount_percent || '0'}%</td>
            <td class="px-6 py-4 text-xs">${appliesTo}</td>
            <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${v.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${v.active ? 'Active' : 'Inactive'}</span></td>
            <td class="px-6 py-4 space-x-2">
                <button class="text-blue-600 hover:text-blue-900" onclick="openVoucherModal('${v.id}')"><i class="fas fa-edit"></i></button>
                <button class="text-red-600 hover:text-red-900" onclick="deleteItem('vouchers', '${v.id}', 'voucher')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);

        const card = document.createElement('div');
        card.className = 'data-card';
        card.innerHTML = `
            <div class="card-row">
                <span class="card-label">Code:</span>
                <span class="card-value font-semibold">${v.code || 'N/A'}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Discount:</span>
                <span class="card-value">${v.discount_percent || '0'}%</span>
            </div>
            <div class="card-row">
                <span class="card-label">Applies To:</span>
                <span class="card-value text-xs">${appliesTo}</span>
            </div>
            <div class="card-row">
                <span class="card-label">Status:</span>
                <span class="card-value"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${v.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${v.active ? 'Active' : 'Inactive'}</span></span>
            </div>
            <div class="card-actions">
                <button class="text-blue-600 hover:text-blue-900" onclick="openVoucherModal('${v.id}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="text-red-600 hover:text-red-900" onclick="deleteItem('vouchers', '${v.id}', 'voucher')"><i class="fas fa-trash"></i> Delete</button>
            </div>
        `;
        cardView.appendChild(card);
    });
}

async function openVoucherModal(voucherId = null) {
    const { uploadImage } = await import('./uploader.js');
    let v = {};
    let selectedVoucherImageFile = null;
    const isEdit = !!voucherId;

    if (isEdit) {
        const snapshot = await db.ref(`vouchers/${voucherId}`).once('value');
        v = { id: voucherId, ...snapshot.val() };
    }

    const locationOptions = allLocations.map(l => `<label class="flex items-center gap-2"><input type="checkbox" class="specific-location-cb" value="${l.id}" ${v.locations?.[l.id] ? 'checked' : ''}> ${l.name}</label>`).join('');
    
    // URL gambar default jika tidak ada
    const existingImageUrl = v.imageUrl 
        ? `/.netlify/functions/get-photo?key=${encodeURIComponent(v.imageUrl.split('key=')[1] || v.imageUrl)}` 
        : '';

    Swal.fire({
        title: isEdit ? 'Edit Voucher' : 'Add New Voucher',
        html: `
            <form id="voucher-form" class="text-left space-y-4">
                <div id="voucher-image-preview" class="relative w-full h-32 border rounded-lg flex items-center justify-center cursor-pointer bg-gray-50">
                    <img id="voucher-image-img" src="${existingImageUrl}" class="absolute w-full h-full object-cover rounded-lg ${existingImageUrl ? '' : 'hidden'}"/>
                    <div id="voucher-image-placeholder" class="text-center text-gray-400 ${existingImageUrl ? 'hidden' : ''}">
                        <i class="fas fa-image text-3xl"></i>
                        <p class="mt-1 text-xs">Click to upload</p>
                    </div>
                </div>
                <input id="voucher-image-upload" type="file" class="hidden" accept="image/*">

                <input id="swal-voucher-code" class="swal2-input" placeholder="Voucher Code (e.g., DISCOUNT10)" value="${v.code || ''}">
                <input id="swal-voucher-discount" type="number" class="swal2-input" placeholder="Discount (%)" value="${v.discount_percent || ''}">
                <label class="block text-sm font-medium text-gray-700">Voucher Status</label>
                <select id="swal-voucher-status" class="swal2-input">
                    <option value="true" ${v.active !== false ? 'selected' : ''}>Active</option>
                    <option value="false" ${v.active === false ? 'selected' : ''}>Inactive</option>
                </select>
                
                <div class="p-3 border rounded-lg">
                    <h4 class="font-semibold mb-2">Applies To</h4>
                    <label class="flex items-center gap-2"><input type="radio" name="appliesTo" value="all" ${v.appliesTo !== 'specific' ? 'checked' : ''}> All Locations</label>
                    <label class="flex items-center gap-2"><input type="radio" name="appliesTo" value="specific" ${v.appliesTo === 'specific' ? 'checked' : ''}> Specific Locations</label>
                    <div id="specific-locations-container" class="mt-2 pl-6 space-y-2 ${v.appliesTo !== 'specific' ? 'hidden' : ''}">${locationOptions}</div>
                </div>
            </form>
        `,
        didOpen: () => {
            const specificCheckbox = document.querySelector('input[name="appliesTo"][value="specific"]');
            const allCheckbox = document.querySelector('input[name="appliesTo"][value="all"]');
            const specificContainer = document.getElementById('specific-locations-container');
            specificCheckbox.addEventListener('change', () => specificContainer.classList.remove('hidden'));
            allCheckbox.addEventListener('change', () => specificContainer.classList.add('hidden'));

            const imageInput = document.getElementById('voucher-image-upload');
            document.getElementById('voucher-image-preview').addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    selectedVoucherImageFile = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        document.getElementById('voucher-image-img').src = re.target.result;
                        document.getElementById('voucher-image-img').classList.remove('hidden');
                        document.getElementById('voucher-image-placeholder').classList.add('hidden');
                    };
                    reader.readAsDataURL(selectedVoucherImageFile);
                }
            });
        },
        showCancelButton: true,
        confirmButtonText: 'Save',
        preConfirm: async () => {
            let imageUrl = v.imageUrl || ''; // Mulai dengan URL yang ada
            if (selectedVoucherImageFile) {
                Swal.showLoading();
                try {
                    imageUrl = await uploadImage(selectedVoucherImageFile);
                } catch (error) {
                    Swal.showValidationMessage(`Upload Failed: ${error.message}`);
                    return false;
                }
            }

            const code = document.getElementById('swal-voucher-code').value.toUpperCase();
            const discount_percent = parseInt(document.getElementById('swal-voucher-discount').value);
            const active = document.getElementById('swal-voucher-status').value === 'true';
            const appliesTo = document.querySelector('input[name="appliesTo"]:checked').value;
            let locations = null;
            if (appliesTo === 'specific') {
                locations = {};
                document.querySelectorAll('.specific-location-cb:checked').forEach(cb => locations[cb.value] = true);
            }
            
            // Gabungkan data lama dan baru
            const updatedData = {
                ...v, // Ambil semua data lama
                code,
                discount_percent,
                active,
                imageUrl,
                appliesTo,
                locations
            };
            
            return updatedData;
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const data = result.value;
            if (!data.code || isNaN(data.discount_percent)) {
                return Swal.fire('Error', 'Code and Discount (%) are required.', 'error');
            }

            // Jika kode voucher diubah, hapus yang lama dan buat yang baru
            if (isEdit && voucherId !== data.code) {
                await db.ref(`vouchers/${voucherId}`).remove();
            }
            
            // Gunakan ID asli jika tidak diedit, atau kode baru jika diedit/baru
            const finalId = data.id && !isEdit ? data.id : data.code;
            
            // Hapus ID dari data sebelum menyimpan untuk menghindari duplikasi
            const dataToSave = { ...data };
            delete dataToSave.id;

            db.ref(`vouchers/${finalId}`).set(dataToSave)
                .then(() => Swal.fire('Success', 'Voucher saved.', 'success'))
                .catch(err => Swal.fire('Error', err.message, 'error'));
        }
    });
}