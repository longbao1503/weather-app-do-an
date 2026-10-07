// API config — thay bằng URL Render của bạn
// Ví dụ: 'https://weather-app-xxxx.onrender.com'
export const API_BASE = 'https://weather-app-backend-335r.onrender.com';

export const fetchWeather = async (lat, lon) => {
  const res = await fetch(`${API_BASE}/api/weather?lat=${lat}&lon=${lon}`);
  if (!res.ok) throw new Error(`Lỗi API: ${res.status}`);
  return res.json();
};

export const fetchGeocode = async (query) => {
  const res = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Lỗi geocode: ${res.status}`);
  return res.json();
};
