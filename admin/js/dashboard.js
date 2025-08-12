// =====================================================================
// NEW ADVANCED DASHBOARD LOGIC
// =====================================================================

window.fetchAndRenderDashboard = function() {
    // Stat Cards
    let totalRevenue = 0;
    let activeBookingsCount = 0;
    let totalPaidBookings = 0;
    const now = Date.now();
    const sevenDaysFromNow = now + (7 * 24 * 60 * 60 * 1000);
    let expiringSoonHtml = '';
    let overdueCheckoutHtml = '';

    const monthlyRevenue = {};
    const bookingsByLocation = {};
    const bookingsByType = {};

    (allBookings || []).forEach(booking => {
        if (booking.paymentStatus === 'paid' && typeof booking.totalPrice === 'number') {
            totalRevenue += booking.totalPrice;
            totalPaidBookings++;
            const month = new Date(booking.createdAt).toLocaleString('en-US', { month: 'short', year: 'numeric' });
            monthlyRevenue[month] = (monthlyRevenue[month] || 0) + booking.totalPrice;
        }

        if (['active', 'checked_in'].includes(booking.bookingStatus)) {
            activeBookingsCount++;
            const userName = allUsers[booking.userId]?.name || 'Unknown User';
            
            // Collect data for charts
            bookingsByLocation[booking.locationName] = (bookingsByLocation[booking.locationName] || 0) + 1;
            bookingsByType[booking.storageType] = (bookingsByType[booking.storageType] || 0) + 1;

            if (booking.endDate < sevenDaysFromNow && booking.endDate > now) {
                expiringSoonHtml += `
                    <div class="dashboard-list-item expiring-soon flex-row">
                        <span class="flex-grow"><strong>${userName}</strong> at ${booking.locationName || 'N/A'}</span>
                        <button class="text-blue-500 text-xs font-semibold" onclick="viewBookingDetails('${booking.id}')">View</button>
                    </div>`;
            } else if (booking.endDate < now && booking.bookingStatus === 'checked_in') {
                overdueCheckoutHtml += `
                    <div class="dashboard-list-item overdue-checkout flex-row">
                        <span class="flex-grow"><strong>${userName}</strong> at ${booking.locationName || 'N/A'}</span>
                        <button class="text-blue-500 text-xs font-semibold" onclick="followUpOverdue('${booking.id}')">Follow Up</button>
                    </div>`;
            }
        }
    });

    // Calculate month-over-month growth
    const sortedMonths = Object.keys(monthlyRevenue).sort((a, b) => new Date(a) - new Date(b));
    let revenueGrowth = 0;
    if (sortedMonths.length >= 2) {
        const lastMonthRevenue = monthlyRevenue[sortedMonths[sortedMonths.length - 1]];
        const prevMonthRevenue = monthlyRevenue[sortedMonths[sortedMonths.length - 2]];
        if (prevMonthRevenue > 0) {
            revenueGrowth = ((lastMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100;
        }
    }
    const growthClass = revenueGrowth >= 0 ? 'text-green-500' : 'text-red-500';
    const growthIcon = revenueGrowth >= 0 ? 'fas fa-caret-up' : 'fas fa-caret-down';
    const revenueGrowthHtml = `<span class="${growthClass} text-sm font-semibold"><i class="${growthIcon}"></i> ${revenueGrowth.toFixed(1)}%</span> vs. prev month`;

    document.getElementById('stat-revenue').textContent = currencyFormatter.format(totalRevenue);
    document.getElementById('stat-active-bookings').textContent = activeBookingsCount;
    document.getElementById('stat-paid-bookings').textContent = totalPaidBookings;
    document.getElementById('stat-revenue-growth').innerHTML = revenueGrowthHtml;
    
    document.getElementById('expiring-soon-list').innerHTML = expiringSoonHtml || '<p class="text-gray-500 text-center p-2">No bookings expiring soon.</p>';
    document.getElementById('overdue-checkout-list').innerHTML = overdueCheckoutHtml || '<p class="text-gray-500 text-center p-2">No overdue check-outs.</p>';

    // Charts
    renderRevenueChart(monthlyRevenue);
    renderBookingsByLocationChart(bookingsByLocation);
    renderBookingsByTypeChart(bookingsByType);

    // Dynamic Lists
    renderRecentBookings();
    renderRecentReviews();
    
    // Other stats
    db.ref('users').once('value', snapshot => document.getElementById('stat-total-users').textContent = snapshot.numChildren());
    db.ref('storageLocations').once('value', snapshot => {
        let total = 0;
        snapshot.forEach(child => child.val().categories?.forEach(cat => total += (cat.totalCapacity || 0)));
        document.getElementById('stat-total-capacity').textContent = `${total} Units`;
    });
};

function renderRevenueChart(data) {
    const ctx = document.getElementById('revenue-chart').getContext('2d');
    const labels = Object.keys(data).sort((a, b) => new Date(a) - new Date(b));
    const chartData = labels.map(label => data[label]);

    if (window.revenueChart) window.revenueChart.destroy();
    window.revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue (USD)',
                data: chartData,
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            scales: { y: { beginAtZero: true } },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderBookingsByLocationChart(data) {
    const ctx = document.getElementById('bookings-location-chart').getContext('2d');
    const labels = Object.keys(data);
    const chartData = labels.map(label => data[label]);

    if (window.bookingsLocationChart) window.bookingsLocationChart.destroy();
    window.bookingsLocationChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Bookings by Location',
                data: chartData,
                backgroundColor: 'rgba(139, 92, 246, 0.6)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: { y: { beginAtZero: true } },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderBookingsByTypeChart(data) {
    const ctx = document.getElementById('bookings-type-chart').getContext('2d');
    const labels = Object.keys(data);
    const chartData = labels.map(label => data[label]);

    if (window.bookingsTypeChart) window.bookingsTypeChart.destroy();
    window.bookingsTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                label: 'Bookings by Storage Type',
                data: chartData,
                backgroundColor: [
                    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#0EA5E9'
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderRecentBookings() {
    const container = document.getElementById('recent-bookings-list');
    container.innerHTML = '';
    const recentBookings = allBookings.slice(0, 5); // Get the 5 most recent bookings
    if (recentBookings.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 p-4">No recent bookings.</p>';
        return;
    }
    recentBookings.forEach(b => {
        const user = allUsers[b.userId];
        const userName = user?.name || 'Unknown User';
        const locationName = b.locationName || 'N/A';
        const date = b.createdAt ? new Date(b.createdAt).toLocaleDateString() : 'N/A';
        const price = currencyFormatter.format(b.totalPrice || 0);

        let statusClass = 'bg-gray-200 text-gray-800';
        if (b.bookingStatus === 'active') statusClass = 'bg-blue-100 text-blue-800';
        if (b.bookingStatus === 'checked_in') statusClass = 'bg-green-100 text-green-800';
        if (b.bookingStatus === 'completed') statusClass = 'bg-purple-100 text-purple-800';
        
        const bookingEl = document.createElement('div');
        bookingEl.className = 'dashboard-list-item flex-col cursor-pointer';
        bookingEl.onclick = () => viewBookingDetails(b.id);
        bookingEl.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="font-semibold text-sm">${userName}</span>
                <span class="text-xs ${statusClass} px-2 py-0.5 rounded-full capitalize">${b.bookingStatus?.replace(/_/g, ' ')}</span>
            </div>
            <div class="text-xs text-gray-500 flex justify-between items-center">
                <span>${locationName} (${b.storageType || 'N/A'})</span>
                <span class="font-semibold">${price}</span>
            </div>
        `;
        container.appendChild(bookingEl);
    });
}

function renderRecentReviews() {
    const container = document.getElementById('recent-reviews-list');
    container.innerHTML = '';
    const recentReviews = allReviews.slice(0, 5); // Get the 5 most recent reviews
    if (recentReviews.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 p-4">No recent reviews.</p>';
        return;
    }
    recentReviews.forEach(r => {
        const user = allUsers[r.userId];
        const userName = user?.name || 'Unknown User';
        const locationName = allLocations.find(loc => loc.id === r.locationId)?.name || 'N/A';
        const stars = generateStarsHtml(r.rating);

        const reviewEl = document.createElement('div');
        reviewEl.className = 'dashboard-list-item flex-col';
        reviewEl.innerHTML = `
            <div class="flex justify-between items-center mb-1">
                <div class="font-semibold text-sm">${userName}</div>
                <div class="text-yellow-500 text-xs">${stars}</div>
            </div>
            <p class="text-xs text-gray-500 italic truncate">${r.comment || 'No comment.'}</p>
            <div class="mt-2 text-right">
                <button class="text-blue-500 text-xs font-semibold hover:underline" onclick="handleReviewReply(event, '${r.locationId}', '${r.id}', '${r.userId}')">Reply</button>
            </div>
        `;
        container.appendChild(reviewEl);
    });
}

function showRevenueDetails() {
    const tableBody = allBookings.filter(b => b.paymentStatus === 'paid').map(b => `
        <tr class="border-b">
            <td class="p-2">${allUsers[b.userId]?.name || 'N/A'}</td>
            <td class="p-2">${b.locationName}</td>
            <td class="p-2">${currencyFormatter.format(b.totalPrice)}</td>
        </tr>
    `).join('');
    Swal.fire({
        title: 'Revenue Details',
        html: `<div class="max-h-96 overflow-y-auto"><table class="w-full text-sm text-left"><thead class="bg-gray-100"><tr><th class="p-2">User</th><th class="p-2">Location</th><th class="p-2">Amount</th></tr></thead><tbody>${tableBody}</tbody></table></div>`,
        width: '600px'
    });
}

function showActiveBookingsDetails() {
    const tableBody = allBookings.filter(b => ['active', 'checked_in'].includes(b.bookingStatus)).map(b => `
        <tr class="border-b">
            <td class="p-2">${allUsers[b.userId]?.name || 'N/A'}</td>
            <td class="p-2">${b.locationName}</td>
            <td class="p-2">${b.endDate ? new Date(b.endDate).toLocaleDateString('en-US') : 'N/A'}</td>
        </tr>
    `).join('');
    Swal.fire({
        title: 'Active Booking Details',
        html: `<div class="max-h-96 overflow-y-auto"><table class="w-full text-sm text-left"><thead class="bg-gray-100"><tr><th class="p-2">User</th><th class="p-2">Location</th><th class="p-2">End Date</th></tr></thead><tbody>${tableBody}</tbody></table></div>`,
        width: '600px'
    });
}

function showCapacityDetails() {
    const tableBody = allLocations.map(loc => `
        <tr class="border-b">
            <td class="p-2">${loc.name}</td>
            <td class="p-2">${loc.totalCapacity} units available</td>
        </tr>
    `).join('');
    Swal.fire({
        title: 'Capacity per Location',
        html: `<div class="max-h-96 overflow-y-auto"><table class="w-full text-sm text-left"><thead class="bg-gray-100"><tr><th class="p-2">Location</th><th class="p-2">Available Capacity</th></tr></thead><tbody>${tableBody}</tbody></table></div>`,
        width: '600px'
    });
}

window.showRevenueDetails = showRevenueDetails;
window.showActiveBookingsDetails = showActiveBookingsDetails;
window.showCapacityDetails = showCapacityDetails;