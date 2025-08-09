export const APP_CONFIG = {};

export async function fetchConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error(`Network response was not ok (status: ${response.status})`);
    }
    const configData = await response.json();
    Object.assign(APP_CONFIG, configData);
  } catch (error) {
    document.body.innerHTML = `
      <div style="text-align: center; padding: 50px; font-family: sans-serif; color: #333;">
        <h1>Application Error</h1>
        <p>Could not load essential application settings. Please check your connection and try again later.</p>
      </div>`;
    throw error;
  }
}