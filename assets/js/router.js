import Home from './pages/home.js';
import Map from './pages/map.js';
import Bookings from './pages/bookings.js';
import Profile from './pages/profile.js';
import Auth from './pages/auth.js';
import Inbox from './pages/inbox.js';
import Notifications from './pages/notifications.js';
import AddInventory from './pages/add-inventory.js';
import LuggageStorage from './pages/luggagestorage.js';
import SelfStorage from './pages/selfstorage.js';
import SurfboardStorage from './pages/surfboardstorage.js';
import LuggageTaxi from './pages/luggagetaxi.js';
import Terms from './pages/terms.js';
import Privacy from './pages/privacy.js';
import Shop from './pages/shop.js';
import Help from './pages/help.js';

const routes = {};

export function registerRoute(path, module) {
  routes[path] = module;
}

registerRoute('/', Home);
registerRoute('/map', Map);
registerRoute('/shop', Shop);
registerRoute('/bookings', Bookings);
registerRoute('/profile', Profile);
registerRoute('/auth', Auth);
registerRoute('/inbox', Inbox);
registerRoute('/notifications', Notifications);
registerRoute('/add-inventory', AddInventory);
registerRoute('/luggage-storage', LuggageStorage);
registerRoute('/self-storage', SelfStorage);
registerRoute('/surfboard-storage', SurfboardStorage);
registerRoute('/luggage-taxi', LuggageTaxi);
registerRoute('/terms', Terms);
registerRoute('/privacy', Privacy);
registerRoute('/help', Help);

registerRoute('/404', {
  render: async () => `<div class="page-header"><h2 class="page-title">Page Not Found</h2></div>`
});

function parseRequestURL() {
  const url = location.hash.slice(1).toLowerCase() || '/';
  return {
    path: url,
  };
}

export async function router() {
  const pageContainer = document.getElementById('page-container');
  if (!pageContainer) {
    return;
  }
  
  const request = parseRequestURL();
  const pageModule = routes[request.path] || routes['/404'];

  if (pageModule && typeof pageModule.render === 'function') {
    pageContainer.innerHTML = await pageModule.render();
    if (typeof pageModule.afterRender === 'function') {
      await pageModule.afterRender();
    }
    updateActiveNav(request.path);
  } else {
    pageContainer.innerHTML = '<h2>404 - Page Not Found</h2>';
  }
}

function updateActiveNav(currentPath) {
  const navButtons = document.querySelectorAll('.nav-btn');
  const pathMap = {
    '/': 'home',
    '/map': 'map',
    '/bookings': 'bookings',
    '/profile': 'profile',
  };
  const currentPage = pathMap[currentPath] || '';

  navButtons.forEach(btn => {
    btn.dataset.page === currentPage ? btn.classList.add('active') : btn.classList.remove('active');
  });
}

export function initializeRouter() {
  window.addEventListener('hashchange', router);
}