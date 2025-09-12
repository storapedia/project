window.renderShopProductsTable = function() {
    const tbody = document.getElementById('shop-products-table-body');
    const cardView = document.getElementById('shop-products-card-view');
    tbody.innerHTML = '';
    cardView.innerHTML = '';

    if (!allShopProducts || allShopProducts.length === 0) {
        const noResultsHtml = `<tr><td colspan="5" class="text-center p-8">No products found.</td></tr>`;
        tbody.innerHTML = noResultsHtml;
        cardView.innerHTML = `<p class="text-center text-gray-500 p-4">No products found.</p>`;
        return;
    }

    allShopProducts.forEach(p => {
        const imageUrl = p.imageUrl 
            ? `/.netlify/functions/get-photo?key=${encodeURIComponent(p.imageUrl.split('key=')[1] || p.imageUrl)}` 
            : 'https://placehold.co/80x80/e2e8f0/64748b?text=Img';

        const row = document.createElement('tr');
        row.className = 'bg-white border-b hover:bg-gray-50';
        row.innerHTML = `
            <td class="px-6 py-4"><img src="${imageUrl}" class="w-16 h-16 rounded-md object-cover"></td>
            <td class="px-6 py-4 font-semibold">${p.name || 'N/A'}</td>
            <td class="px-6 py-4">${p.description || 'N/A'}</td>
            <td class="px-6 py-4 font-bold">${currencyFormatter.format(p.price || 0)}</td>
            <td class="px-6 py-4 space-x-2">
                <button class="text-blue-600 hover:text-blue-900" onclick="openShopProductModal('${p.id}')"><i class="fas fa-edit"></i></button>
                <button class="text-red-600 hover:text-red-900" onclick="deleteItem('shopProducts', '${p.id}', 'product')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);

        const card = document.createElement('div');
        card.className = 'data-card';
        card.innerHTML = `
            <div class="flex items-center gap-4 mb-2">
                <img src="${imageUrl}" class="w-16 h-16 rounded-md object-cover">
                <div>
                    <div class="font-bold">${p.name || 'N/A'}</div>
                    <div class="text-sm text-gray-600">${currencyFormatter.format(p.price || 0)}</div>
                </div>
            </div>
            <div class="card-row"><span class="card-label">Description:</span><span class="card-value text-xs">${p.description || 'N/A'}</span></div>
            <div class="card-actions">
                <button class="text-blue-600 hover:text-blue-900" onclick="openShopProductModal('${p.id}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="text-red-600 hover:text-red-900" onclick="deleteItem('shopProducts', '${p.id}', 'product')"><i class="fas fa-trash"></i> Delete</button>
            </div>
        `;
        cardView.appendChild(card);
    });
}

window.openShopProductModal = async function(productId = null) {
    const { uploadImage } = await import('./uploader.js');
    let p = {};
    let selectedProductImageFile = null;
    const isEdit = !!productId;

    if (isEdit) {
        const snapshot = await db.ref(`shopProducts/${productId}`).once('value');
        p = { id: productId, ...snapshot.val() };
    }

    const existingImageUrl = p.imageUrl 
        ? `/.netlify/functions/get-photo?key=${encodeURIComponent(p.imageUrl.split('key=')[1] || p.imageUrl)}` 
        : '';

    Swal.fire({
        title: isEdit ? 'Edit Product' : 'Add New Product',
        html: `
            <form id="product-form" class="text-left space-y-4">
                <div id="product-image-preview" class="relative w-full h-40 border rounded-lg flex items-center justify-center cursor-pointer bg-gray-50">
                    <img id="product-image-img" src="${existingImageUrl}" class="absolute w-full h-full object-cover rounded-lg ${existingImageUrl ? '' : 'hidden'}"/>
                    <div id="product-image-placeholder" class="text-center text-gray-400 ${existingImageUrl ? 'hidden' : ''}">
                        <i class="fas fa-image text-3xl"></i><p class="mt-1 text-xs">Click to upload</p>
                    </div>
                </div>
                <input id="product-image-upload" type="file" class="hidden" accept="image/*">
                <input id="swal-product-name" class="swal2-input" placeholder="Product Name (e.g., Gembok)" value="${p.name || ''}">
                <textarea id="swal-product-desc" class="swal2-textarea" placeholder="Description">${p.description || ''}</textarea>
                <input id="swal-product-price" type="number" class="swal2-input" placeholder="Price ($)" value="${p.price || ''}">
            </form>
        `,
        didOpen: () => {
            const imageInput = document.getElementById('product-image-upload');
            document.getElementById('product-image-preview').addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    selectedProductImageFile = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        document.getElementById('product-image-img').src = re.target.result;
                        document.getElementById('product-image-img').classList.remove('hidden');
                        document.getElementById('product-image-placeholder').classList.add('hidden');
                    };
                    reader.readAsDataURL(selectedProductImageFile);
                }
            });
        },
        showCancelButton: true,
        confirmButtonText: 'Save',
        preConfirm: async () => {
            let imageUrl = p.imageUrl || '';
            if (selectedProductImageFile) {
                Swal.showLoading();
                try {
                    imageUrl = await uploadImage(selectedProductImageFile);
                } catch (error) {
                    Swal.showValidationMessage(`Upload Failed: ${error.message}`);
                    return false;
                }
            }
            return {
                name: document.getElementById('swal-product-name').value,
                description: document.getElementById('swal-product-desc').value,
                price: parseFloat(document.getElementById('swal-product-price').value),
                imageUrl: imageUrl,
            };
        }
    }).then(result => {
        if (result.isConfirmed) {
            const data = result.value;
            if (!data.name || isNaN(data.price)) {
                return Swal.fire('Error', 'Product Name and Price are required.', 'error');
            }
            const ref = productId ? db.ref(`shopProducts/${productId}`) : db.ref('shopProducts').push();
            ref.set(data)
                .then(() => Swal.fire('Success', 'Product saved.', 'success'))
                .catch(err => Swal.fire('Error', err.message, 'error'));
        }
    });
}