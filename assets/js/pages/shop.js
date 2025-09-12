// assets/js/pages/shop.js

import { showLoader, showToast } from '../ui/ui-helpers.js';
import { publicDataCache } from '../main.js';
import { renderBookingFlowModal } from '../ui/modals.js';

// --- STATE MANAGEMENT ---
let allProducts = [];
let displayedProducts = [];
let categories = ['All'];
let currentFilter = 'All';
let currentSearchTerm = '';

// --- UI RENDERING ---

/**
 * Merender satu kartu produk dengan desain yang lebih menarik.
 * @param {object} product - Data produk yang akan dirender.
 * @returns {string} String HTML untuk kartu produk.
 */
function renderProductCard(product) {
    const imageUrl = product.imageUrl
        ? `/.netlify/functions/get-photo?key=${encodeURIComponent(product.imageUrl.split('key=')[1] || product.imageUrl)}`
        : 'https://placehold.co/300x300/e2e8f0/64748b?text=Item';

    return `
        <div class="location-card" data-product-id="${product.id}" data-product-name="${product.name}" data-product-price="${product.price}">
            <img src="${imageUrl}" alt="${product.name}" class="location-card-img" style="aspect-ratio: 1/1;">
            <div class="location-card-content">
                <div>
                    <p class="text-xs text-gray-500 font-semibold">${product.category || 'General'}</p>
                    <h4 class="location-card-title">${product.name}</h4>
                    <p class="location-card-info">${product.description || ''}</p>
                    <p class="location-card-price-label mt-1">
                        <span class="text-primary-500 font-bold">$${product.price.toFixed(2)}</span>
                    </p>
                </div>
                <button class="btn btn-primary" data-action="add-to-cart">Add to Cart</button>
            </div>
        </div>
    `;
}

/**
 * Merender seluruh daftar kartu produk berdasarkan filter dan pencarian saat ini.
 */
function renderProductGrid() {
    const container = document.getElementById('shop-products-list');
    if (!container) return;

    if (displayedProducts.length === 0) {
        container.innerHTML = '<p class="no-locations-message">No products found matching your criteria.</p>';
        return;
    }

    container.innerHTML = displayedProducts.map(renderProductCard).join('');
}

/**
 * Membuat tombol filter kategori.
 */
function renderCategoryFilters() {
    const filtersContainer = document.getElementById('shop-category-filters');
    if (!filtersContainer) return;

    filtersContainer.innerHTML = categories.map(category => `
        <button class="filter-sort-tab ${currentFilter === category ? 'active' : ''}" data-category="${category}">${category}</button>
    `).join('');
}

// --- LOGIC & EVENT HANDLING ---

/**
 * Memfilter dan mencari produk berdasarkan state saat ini.
 */
function filterAndSearchProducts() {
    let filtered = allProducts;

    // Terapkan filter kategori
    if (currentFilter !== 'All') {
        filtered = filtered.filter(product => product.category === currentFilter);
    }

    // Terapkan pencarian
    if (currentSearchTerm) {
        const searchTerm = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(product =>
            product.name.toLowerCase().includes(searchTerm) ||
            (product.description && product.description.toLowerCase().includes(searchTerm))
        );
    }

    displayedProducts = filtered;
    renderProductGrid();
}

/**
 * Menangani penambahan produk ke objek keranjang global.
 * @param {Event} e - Objek event klik.
 */
function handleAddToCart(e) {
    const card = e.target.closest('.location-card');
    if (!card) return;

    const productId = card.dataset.productId;
    const productName = card.dataset.productName;
    const productPrice = parseFloat(card.dataset.productPrice);

    // Menggunakan lokasi dummy untuk item toko di keranjang
    const shopLocationId = 'shop_location';
    if (!window.globalCart) window.globalCart = {};
    if (!window.globalCart[shopLocationId]) {
        window.globalCart[shopLocationId] = {
            locationData: { id: shopLocationId, name: 'Shop Supplies' },
            items: [],
            supplies: []
        };
    }

    const existingSupply = window.globalCart[shopLocationId].supplies.find(item => item.id === productId);

    if (existingSupply) {
        existingSupply.quantity++;
    } else {
        window.globalCart[shopLocationId].supplies.push({
            id: productId,
            name: productName,
            price: productPrice,
            quantity: 1,
        });
    }

    showToast(`${productName} added to cart!`, 'success');

    // Opsional, buka modal alur pemesanan
    if (Object.keys(window.globalCart).length > 0 && !document.getElementById('main-app-modal')?.classList.contains('active')) {
        renderBookingFlowModal();
    }
}

/**
 * Menginisialisasi semua event listener untuk halaman toko.
 */
function addShopEventListeners() {
    const container = document.getElementById('shop-page-container');
    if (!container) return;

    // Event delegation untuk tombol Add to Cart
    container.addEventListener('click', (e) => {
        if (e.target && e.target.closest('[data-action="add-to-cart"]')) {
            handleAddToCart(e);
        }
    });

    // Listener untuk input pencarian
    const searchInput = document.getElementById('shop-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value;
            filterAndSearchProducts();
        });
    }

    // Listener untuk filter kategori
    const filtersContainer = document.getElementById('shop-category-filters');
    if (filtersContainer) {
        filtersContainer.addEventListener('click', (e) => {
            if (e.target.matches('.filter-sort-tab')) {
                currentFilter = e.target.dataset.category;
                document.querySelectorAll('#shop-category-filters .filter-sort-tab').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                filterAndSearchProducts();
            }
        });
    }
}


// --- PAGE OBJECT ---

export default {
    render: async () => `
        <div id="shop-page-container" class="content-wrapper">
            <div class="category-hero-section" style="background-image: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?q=80&w=2070&auto=format&fit=crop');">
                <h1>Storapedia Shop</h1>
                <p>All the essentials you need for secure and convenient storage.</p>
            </div>

            <div class="locations-container" style="padding: 0 1.5rem;">
                <div class="search-container" style="margin-top: -30px; position: relative; z-index: 20;">
                    <input type="text" id="shop-search-input" placeholder="Search for products...">
                </div>
                <div id="shop-category-filters" class="filter-sort-tabs" style="margin-top: 2rem; margin-bottom: 2rem;">
                    </div>
            </div>

            <div id="shop-products-list" class="grid-view" style="padding: 0 1.5rem;">
                <div class="location-card-skeleton skeleton"></div>
                <div class="location-card-skeleton skeleton"></div>
                <div class="location-card-skeleton skeleton"></div>
            </div>
        </div>
    `,
    afterRender: async () => {
        showLoader(true, 'Loading products...');
        try {
            allProducts = Object.keys(publicDataCache.shopProducts || {}).map(id => ({ id, ...publicDataCache.shopProducts[id] }));
            displayedProducts = allProducts;

            if (allProducts.length > 0) {
                // Buat kategori secara dinamis dari data produk
                const productCategories = new Set(allProducts.map(p => p.category).filter(Boolean));
                categories = ['All', ...Array.from(productCategories)];

                renderCategoryFilters();
                renderProductGrid();
                addShopEventListeners();
            } else {
                const container = document.getElementById('shop-products-list');
                if (container) {
                    container.innerHTML = '<p class="no-locations-message">No products available at the moment.</p>';
                }
            }
        } catch (error) {
            console.error("Error rendering shop:", error);
            showToast('Could not load products.', 'error');
        } finally {
            showLoader(false);
        }
    }
};