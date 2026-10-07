/* ─── Helpers dùng chung ─── */

export const fmtDay = (d) =>
  new Date(d).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });

export const fmtHour = (t) =>
  new Date(t * 1000).toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit' });

export const fmtTimeOnly = (t) =>
  t ? new Date(t * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';

export const weatherEmoji = (text) => {
  if (!text) return '🌤️';
  const t = text.toLowerCase();
  if (t.includes('dông') || t.includes('sét')) return '⛈️';
  if (t.includes('mưa rào') || t.includes('mưa to')) return '🌧️';
  if (t.includes('mưa phùn') || t.includes('mưa nhẹ') || t.includes('mưa')) return '🌦️';
  if (t.includes('sương')) return '🌫️';
  if (t.includes('tuyết')) return '❄️';
  if (t.includes('mây') || t.includes('có mây')) return '⛅';
  if (t.includes('quang') || t.includes('nắng')) return '☀️';
  return '🌤️';
};

export const getUvInfo = (uv) => {
  if (uv == null) return { level: 'Chưa có', color: '#64748b', pct: 20 };
  if (uv < 3) return { level: 'Thấp', color: '#22c55e', pct: (uv / 12) * 100 };
  if (uv < 6) return { level: 'Trung bình', color: '#eab308', pct: (uv / 12) * 100 };
  if (uv < 8) return { level: 'Cao', color: '#f97316', pct: (uv / 12) * 100 };
  if (uv < 11) return { level: 'Rất cao', color: '#ef4444', pct: Math.min((uv / 12) * 100, 100) };
  return { level: 'Cực kỳ nguy hại', color: '#a855f7', pct: 100 };
};

export const getAqiInfo = (aqi) => {
  if (aqi == null) return { status: 'Đang cập nhật', color: '#64748b', pct: 20 };
  if (aqi <= 50) return { status: 'Tốt', color: '#22c55e', pct: (aqi / 300) * 100 };
  if (aqi <= 100) return { status: 'Trung bình', color: '#eab308', pct: (aqi / 300) * 100 };
  if (aqi <= 150) return { status: 'Kém', color: '#f97316', pct: (aqi / 300) * 100 };
  if (aqi <= 200) return { status: 'Xấu', color: '#ef4444', pct: (aqi / 300) * 100 };
  if (aqi <= 300) return { status: 'Rất xấu', color: '#a855f7', pct: (aqi / 300) * 100 };
  return { status: 'Nguy hại', color: '#7c2d12', pct: 100 };
};

export const QUICK_LOCATIONS = [
  { name: 'Nha Trang', lat: 12.2388, lon: 109.1967 },
  { name: 'Cam Ranh', lat: 11.9214, lon: 109.1591 },
  { name: 'Ninh Hòa', lat: 12.4965, lon: 109.1306 },
  { name: 'Đà Lạt', lat: 11.9404, lon: 108.4583 },
  { name: 'TP. Hồ Chí Minh', lat: 10.8231, lon: 106.6297 },
  { name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
  { name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  { name: 'Huế', lat: 16.4637, lon: 107.5909 },
];
