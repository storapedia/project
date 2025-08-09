// storapedia/assets/js/services/firebase-api.js

import { db, storage } from '../firebase-init.js';

export async function fetchAllPublicData() {
    const refs = {
        locations: db.ref('storageLocations'),
        vouchers: db.ref('vouchers'),
        reviews: db.ref('reviews'),
        settings: db.ref('settings'),
        faqs: db.ref('faqs'),
        easySteps: db.ref('easySteps')
    };
    try {
        const snapshots = await Promise.all(Object.values(refs).map(ref => ref.once('value')));
        const data = Object.keys(refs).reduce((acc, key, index) => {
            acc[key] = snapshots[index].val() || {};
            return acc;
        }, {});
        return data;
    } catch (error) {
        console.error("Error fetching public data from Firebase:", error);
        return {};
    }
}

export function listenForUserBookings(userId, callback) {
    if (!userId) {
        callback([]);
        return;
    }
    const bookingsRef = db.ref('bookings').orderByChild('userId').equalTo(userId);
    bookingsRef.on('value', (snapshot) => {
        const bookingsData = snapshot.val();
        if (!bookingsData) {
            callback([]);
            return;
        }
        const bookingsArray = Object.keys(bookingsData).map(key => ({ id: key, ...bookingsData[key] }));
        callback(bookingsArray.sort((a, b) => b.createdAt - a.createdAt));
    });
    return bookingsRef;
}

export async function fetchUserData(userId) {
    if (!userId) return null;
    try {
        const snapshot = await db.ref(`users/${userId}`).once('value');
        return snapshot.val();
    } catch(error) {
        console.error("Error fetching user data:", error);
        return null;
    }
}

export async function getBookingById(bookingId) {
    if (!bookingId) return null;
    try {
        const snapshot = await db.ref(`bookings/${bookingId}`).once('value');
        if (snapshot.exists()) {
            return { id: snapshot.key, ...snapshot.val() };
        }
        return null;
    } catch (error) {
        console.error("Error fetching booking by ID:", error);
        throw error;
    }
}

export async function fetchStorageLocationData(locationId) {
    if (!locationId) return null;
    try {
        const snapshot = await db.ref(`storageLocations/${locationId}`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error("Error fetching storage location data:", error);
        throw error;
    }
}

export async function fetchCourierData(courierId) {
    if (!courierId) return null;
    try {
        const snapshot = await db.ref(`couriers/${courierId}`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error("Error fetching courier data:", error);
        return null;
    }
}

export async function updateBookingStatus(bookingId, newStatus, updates = {}) {
    if (!bookingId) {
        console.error("Booking ID is required for update.");
        return;
    }
    const bookingRef = db.ref(`bookings/${bookingId}`);
    const updateData = {
        ...updates,
        bookingStatus: newStatus,
        updatedAt: Date.now()
    };
    try {
        await bookingRef.update(updateData);
        console.log(`Booking ${bookingId} updated to status: ${newStatus}`);
    } catch (error) {
        console.error(`Error updating booking ${bookingId} status to ${newStatus}:`, error);
        throw error;
    }
}

export async function createNewBooking(bookingData) {
    try {
        const newBookingRef = db.ref('bookings').push();
        const newBookingId = newBookingRef.key;
        const timestamp = Date.now();
        const bookingToSave = {
            ...bookingData,
            id: newBookingId,
            createdAt: timestamp,
            updatedAt: timestamp
        };
        await newBookingRef.set(bookingToSave);
        console.log(`New booking created with ID: ${newBookingId}`);
        return bookingToSave;
    } catch (error) {
        console.error("Error creating new booking:", error);
        throw error;
    }
}

export async function submitReview(locationId, reviewData) {
    if (!locationId || !reviewData) {
        console.error("Location ID and review data are required.");
        return;
    }
    try {
        const newReviewRef = db.ref(`reviews/${locationId}`).push();
        await newReviewRef.set(reviewData);
        console.log(`New review submitted for location ${locationId}.`);
    } catch (error) {
        console.error(`Error submitting review for location ${locationId}:`, error);
        throw error;
    }
}

export async function requestPickup(locationId, requestData) {
    if (!locationId || !requestData) {
        console.error("Location ID and request data are required.");
        return;
    }
    try {
        const newPickupRequestRef = db.ref(`pickupRequests/${locationId}`).push();
        await newPickupRequestRef.set(requestData);
        console.log(`New pickup request created for location ${locationId}.`);
        const adminNotificationRef = db.ref('notifications/admin').push();
        const notificationData = {
            title: `New Pickup Request for ${requestData.locationName}`,
            body: `Booking ID: ${requestData.bookingId} - User ${requestData.userId}`,
            timestamp: Date.now(),
            read: false,
            type: 'pickupRequest'
        };
        await adminNotificationRef.set(notificationData);
    } catch (error) {
        console.error(`Error creating pickup request for location ${locationId}:`, error);
        throw error;
    }
}

// --- NEW INVENTORY & CATEGORY FUNCTIONS ---

/**
 * Listens for real-time updates to the entire inventory for a specific booking.
 * @param {string} bookingId - The ID of the booking to listen to.
 * @param {function} callback - The function to call with the inventory data.
 * @returns {firebase.database.Reference} The Firebase reference for detaching the listener later.
 */
export function listenForInventory(bookingId, callback) {
    const inventoryRef = db.ref(`inventories/${bookingId}`);
    inventoryRef.on('value', (snapshot) => {
        callback(snapshot.val());
    });
    return inventoryRef;
}

/**
 * Adds a new category to a booking's inventory.
 * @param {string} bookingId - The ID of the booking.
 * @param {string} categoryName - The name for the new category.
 * @param {number} sortOrder - The sort order index for the new category.
 * @returns {Promise<string>} The key of the new category.
 */
export async function addCategoryToInventory(bookingId, categoryName, sortOrder) {
    const categoryRef = db.ref(`inventories/${bookingId}/categories`).push();
    await categoryRef.set({
        name: categoryName,
        sortOrder: sortOrder,
        items: {}
    });
    return categoryRef.key;
}

/**
 * Adds a new item to a specific category within a booking's inventory.
 * @param {string} bookingId - The ID of the booking.
 * @param {string} categoryId - The ID of the category to add the item to.
 * @param {object} itemData - The item data, including name, quantity, addedAt (ISO string), and sortOrder.
 */
export async function addItemToCategory(bookingId, categoryId, itemData) {
    const itemRef = db.ref(`inventories/${bookingId}/categories/${categoryId}/items`).push();
    await itemRef.set(itemData);
    // Update the main lastUpdatedAt timestamp for the inventory
    await db.ref(`inventories/${bookingId}`).update({ lastUpdatedAt: Date.now() });
}

/**
 * Removes a specific item from a category.
 * @param {string} bookingId - The ID of the booking.
 * @param {string} categoryId - The ID of the category containing the item.
 * @param {string} itemId - The ID of the item to remove.
 */
export async function removeItemFromCategory(bookingId, categoryId, itemId) {
    const itemRef = db.ref(`inventories/${bookingId}/categories/${categoryId}/items/${itemId}`);
    await itemRef.remove();
    await db.ref(`inventories/${bookingId}`).update({ lastUpdatedAt: Date.now() });
}

/**
 * Removes an entire category and all items within it.
 * @param {string} bookingId - The ID of the booking.
 * @param {string} categoryId - The ID of the category to remove.
 */
export async function removeCategory(bookingId, categoryId) {
    const categoryRef = db.ref(`inventories/${bookingId}/categories/${categoryId}`);
    await categoryRef.remove();
    await db.ref(`inventories/${bookingId}`).update({ lastUpdatedAt: Date.now() });
}

/**
 * Updates the sort order for categories or items in a single operation.
 * @param {string} bookingId - The ID of the booking.
 * @param {object} updates - An object containing the paths and new values for sortOrder.
 * e.g., { 'categories/cat1/sortOrder': 0, 'categories/cat2/sortOrder': 1 }
 */
export async function updateSortOrder(bookingId, updates) {
    const inventoryRef = db.ref(`inventories/${bookingId}`);
    await inventoryRef.update(updates);
    await inventoryRef.update({ lastUpdatedAt: Date.now() });
}

/**
 * Adds an inventory item to a specific booking.
 * @param {string} bookingId - The ID of the booking.
 * @param {object} inventoryItem - The item data to be added.
 */
export const addInventoryItem = async (bookingId, inventoryItem) => {
    try {
        const inventoriesRef = db.ref(`bookings/${bookingId}/inventories`);
        await inventoriesRef.push(inventoryItem);
    } catch (error) {
        console.error("Error adding inventory item:", error);
        throw error;
    }
};

/**
 * Uploads an inventory image to Firebase Storage.
 * @param {string} bookingId - The ID of the booking.
 * @param {File} imageFile - The image file to upload.
 * @returns {Promise<string>} The download URL of the uploaded image.
 */
export const uploadInventoryImage = async (bookingId, imageFile) => {
    try {
        const storageRef = storage.ref();
        const imagePath = `inventories/${bookingId}/${Date.now()}-${imageFile.name}`;
        const imageRef = storageRef.child(imagePath);

        const snapshot = await imageRef.put(imageFile);
        const downloadUrl = await snapshot.ref.getDownloadURL();
        return downloadUrl;
    } catch (error) {
        console.error("Error uploading inventory image:", error);
        throw error;
    }
};