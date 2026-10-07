/* ─── Helpers dùng chung cho Mobile App ─── */

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
  if (uv == null) return { level: 'Chưa có', advice: 'Theo dõi chỉ số khi có nắng', color: '#94a3b8', pct: 20 };
  if (uv < 3) return { level: 'Thấp (An toàn)', advice: 'Thoải mái hoạt động ngoài trời, không cần che chắn đặc biệt.', color: '#22c55e', pct: (uv / 12) * 100 };
  if (uv < 6) return { level: 'Trung bình', advice: 'Nên đeo kính râm, đội mũ và bôi kem chống nắng khi ở ngoài lâu.', color: '#eab308', pct: (uv / 12) * 100 };
  if (uv < 8) return { level: 'Cao', advice: 'Cần bôi kem chống nắng SPF 30+, mặc áo chống nắng, hạn chế ra trời trưa.', color: '#f97316', pct: (uv / 12) * 100 };
  if (uv < 11) return { level: 'Rất cao', advice: 'Nguy cơ bỏng da và hại mắt. Tránh tiếp xúc trực tiếp nắng gắt 11h-15h.', color: '#ef4444', pct: Math.min((uv / 12) * 100, 100) };
  return { level: 'Cực kỳ nguy hại', advice: 'Ở trong bóng râm, bảo vệ da và mắt tối đa nếu phải ra ngoài.', color: '#a855f7', pct: 100 };
};

export const getAqiInfo = (aqi) => {
  if (aqi == null) return { status: 'Đang cập nhật', color: '#94a3b8', pct: 20, desc: 'Đang theo dõi dữ liệu cảm biến không khí...' };
  if (aqi <= 50) return { status: 'Tốt (Trong lành)', color: '#22c55e', pct: (aqi / 300) * 100, desc: 'Chất lượng không khí lý tưởng, rất tốt cho sức khỏe và thể thao ngoài trời.' };
  if (aqi <= 100) return { status: 'Trung bình', color: '#eab308', pct: (aqi / 300) * 100, desc: 'Không khí ở mức chấp nhận được. Người cực kỳ nhạy cảm cần lưu ý nhẹ.' };
  if (aqi <= 150) return { status: 'Kém cho nhóm nhạy cảm', color: '#f97316', pct: (aqi / 300) * 100, desc: 'Trẻ em, người già và người bệnh hô hấp nên giảm thời gian vận động mạnh ngoài trời.' };
  if (aqi <= 200) return { status: 'Xấu (Ô nhiễm)', color: '#ef4444', pct: (aqi / 300) * 100, desc: 'Bắt đầu ảnh hưởng sức khỏe chung. Nên đeo khẩu trang chống bụi mịn khi ra ngoài.' };
  if (aqi <= 300) return { status: 'Rất xấu', color: '#a855f7', pct: (aqi / 300) * 100, desc: 'Cảnh báo sức khỏe nghiêm trọng. Toàn bộ người dân nên hạn chế tối đa ra đường.' };
  return { status: 'Nguy hại', color: '#78350f', pct: 100, desc: 'Khẩn cấp sức khỏe toàn diện.' };
};

export const QUICK_LOCATIONS = [
  { name: 'Nha Trang', lat: 12.2388, lon: 109.1967 },
  { name: 'Cam Ranh', lat: 11.9214, lon: 109.1591 },
  { name: 'Ninh Hòa', lat: 12.4965, lon: 109.1306 },
  { name: 'Vạn Ninh', lat: 12.6931, lon: 109.2312 },
  { name: 'Đà Lạt', lat: 11.9404, lon: 108.4583 },
  { name: 'TP. Hồ Chí Minh', lat: 10.8231, lon: 106.6297 },
  { name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
  { name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  { name: 'Huế', lat: 16.4637, lon: 107.5909 },
  { name: 'Quy Nhơn', lat: 13.7820, lon: 109.2192 },
];
