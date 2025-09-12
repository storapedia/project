import { db, storage } from '../firebase-init.js';

export async function fetchAllPublicData() {
    const refs = {
        locations: db.ref('storageLocations'),
        vouchers: db.ref('vouchers'),
        reviews: db.ref('reviews'),
        settings: db.ref('settings'),
        faqs: db.ref('faqs'),
        easySteps: db.ref('easySteps'),
        shopProducts: db.ref('shopProducts')
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
            body: `Booking ID: ${requestData.id} - User ${requestData.userId}`,
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

export function listenForInventory(bookingId, callback) {
    const inventoryRef = db.ref(`inventories/${bookingId}`);
    inventoryRef.on('value', (snapshot) => {
        callback(snapshot.val());
    });
    return inventoryRef;
}

export async function addCategoryToInventory(bookingId, categoryName, sortOrder) {
    const categoryRef = db.ref(`inventories/${bookingId}/categories`).push();
    await categoryRef.set({
        name: categoryName,
        sortOrder: sortOrder,
        items: {}
    });
    return categoryRef.key;
}

export async function addItemToCategory(bookingId, categoryId, itemData) {
    const itemRef = db.ref(`inventories/${bookingId}/categories/${categoryId}/items`).push();
    await itemRef.set(itemData);
    await db.ref(`inventories/${bookingId}`).update({ lastUpdatedAt: Date.now() });
}

export async function removeItemFromCategory(bookingId, categoryId, itemId) {
    const itemRef = db.ref(`inventories/${bookingId}/categories/${categoryId}/items/${itemId}`);
    await itemRef.remove();
    await db.ref(`inventories/${bookingId}`).update({ lastUpdatedAt: Date.now() });
}

export async function removeCategory(bookingId, categoryId) {
    const categoryRef = db.ref(`inventories/${bookingId}/categories/${categoryId}`);
    await categoryRef.remove();
    await db.ref(`inventories/${bookingId}`).update({ lastUpdatedAt: Date.now() });
}

export async function updateSortOrder(bookingId, updates) {
    const inventoryRef = db.ref(`inventories/${bookingId}`);
    await inventoryRef.update(updates);
    await inventoryRef.update({ lastUpdatedAt: Date.now() });
}

export const addInventoryItem = async (bookingId, inventoryItem) => {
    try {
        const inventoriesRef = db.ref(`bookings/${bookingId}/inventories`);
        await inventoriesRef.push(inventoryItem);
    } catch (error) {
        console.error("Error adding inventory item:", error);
        throw error;
    }
};

export const uploadInventoryImage = async (imageFile) => {
    try {
        const formData = new FormData();
        formData.append('file', imageFile);

        const response = await fetch('/.netlify/functions/imageupload', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Gagal mengunggah gambar ke Netlify');
        }

        const result = await response.json();
        return result.url;
    } catch (error) {
        console.error("Error uploading image to Netlify:", error);
        throw error;
    }
};

export async function sendMessageToCourierAndAdmin(userId, courierId, messageText) {
  try {
    const userChatRef = db.ref(`chats/${userId}`).push();
    await userChatRef.set({
      sender: 'user',
      text: messageText,
      timestamp: Date.now(),
      read: true
    });

    const courierChatRef = db.ref(`chats/couriers/${courierId}`).push();
    await courierChatRef.set({
      sender: 'user',
      userId: userId,
      text: messageText,
      timestamp: Date.now(),
      read: false
    });

    const adminChatRef = db.ref('chats/admins/global').push();
    await adminChatRef.set({
      sender: 'user',
      userId: userId,
      courierId: courierId,
      text: messageText,
      timestamp: Date.now(),
      read: false
    });

    return true;

  } catch (error) {
    console.error("Error sending message to courier and admin:", error);
    throw error;
  }
}

export async function getDataFromPath(path) {
    if (!path) return null;
    try {
        const snapshot = await db.ref(path).once('value');
        return snapshot;
    } catch (error) {
        console.error(`Error fetching data from path ${path}:`, error);
        throw error;
    }
}