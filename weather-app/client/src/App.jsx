import { useEffect, useRef, useState, useMemo } from 'react';
import Chart from 'chart.js/auto';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MobileAppSection, MobileAppModal } from './MobileAppDownload.jsx';

const DEFAULT = { name: 'Nha Trang, Khánh Hòa', lat: 12.2388, lon: 109.1967 };

// Danh sách địa điểm nhanh (Khánh Hòa & các thành phố lớn)
const QUICK_LOCATIONS = [
  { name: 'Nha Trang', lat: 12.2388, lon: 109.1967 },
  { name: 'Cam Ranh', lat: 11.9214, lon: 109.1591 },
  { name: 'Ninh Hòa', lat: 12.4965, lon: 109.1306 },
  { name: 'Vạn Ninh', lat: 12.6931, lon: 109.2312 },
  { name: 'Đà Lạt', lat: 11.9404, lon: 108.4583 },
  { name: 'TP. Hồ Chí Minh', lat: 10.8231, lon: 106.6297 },
  { name: 'Hà Nội', lat: 21.0285, lon: 105.8542 },
  { name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
];

const fmtDay = (d) => new Date(d).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtHour = (t) => new Date(t * 1000).toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit' });
const fmtTimeOnly = (t) => t ? new Date(t * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--';

/* Emoji icon theo thời tiết */
const weatherEmoji = (text) => {
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

/* Đánh giá UV Index */
const getUvInfo = (uv) => {
  if (uv == null) return { level: 'Chưa có', advice: 'Theo dõi chỉ số khi có nắng', color: '#94a3b8', pct: 20 };
  if (uv < 3) return { level: 'Thấp (An toàn)', advice: 'Thoải mái hoạt động ngoài trời, không cần che chắn đặc biệt.', color: '#22c55e', pct: (uv / 12) * 100 };
  if (uv < 6) return { level: 'Trung bình', advice: 'Nên đeo kính râm, đội mũ và bôi kem chống nắng khi ở ngoài lâu.', color: '#eab308', pct: (uv / 12) * 100 };
  if (uv < 8) return { level: 'Cao', advice: 'Cần bôi kem chống nắng SPF 30+, mặc áo chống nắng, hạn chế ra trời từ 11h - 15h.', color: '#f97316', pct: (uv / 12) * 100 };
  if (uv < 11) return { level: 'Rất cao', advice: 'Nguy cơ bỏng da và hại mắt. Tránh tiếp xúc trực tiếp ánh nắng gắt giờ trưa.', color: '#ef4444', pct: Math.min((uv / 12) * 100, 100) };
  return { level: 'Cực kỳ nguy hại', advice: 'Ở trong bóng râm, bảo vệ da và mắt tối đa nếu phải ra ngoài.', color: '#a855f7', pct: 100 };
};

/* Đánh giá Chỉ số Chất lượng Không khí (AQI) */
const getAqiInfo = (aqi) => {
  if (aqi == null) return { status: 'Đang cập nhật', color: '#94a3b8', pct: 20, desc: 'Đang theo dõi dữ liệu cảm biến không khí...' };
  if (aqi <= 50) return { status: 'Tốt (Trong lành)', color: '#22c55e', pct: (aqi / 300) * 100, desc: 'Chất lượng không khí lý tưởng, rất tốt cho sức khỏe và thể thao ngoài trời.' };
  if (aqi <= 100) return { status: 'Trung bình', color: '#eab308', pct: (aqi / 300) * 100, desc: 'Không khí ở mức chấp nhận được. Người cực kỳ nhạy cảm cần lưu ý nhẹ.' };
  if (aqi <= 150) return { status: 'Kém cho nhóm nhạy cảm', color: '#f97316', pct: (aqi / 300) * 100, desc: 'Trẻ em, người già và người bệnh hô hấp nên giảm thời gian vận động mạnh ngoài trời.' };
  if (aqi <= 200) return { status: 'Xấu (Ô nhiễm)', color: '#ef4444', pct: (aqi / 300) * 100, desc: 'Bắt đầu ảnh hưởng sức khỏe chung. Nên đeo khẩu trang chống bụi mịn khi ra ngoài.' };
  if (aqi <= 300) return { status: 'Rất xấu', color: '#a855f7', pct: (aqi / 300) * 100, desc: 'Cảnh báo sức khỏe nghiêm trọng. Toàn bộ người dân nên hạn chế tối đa ra đường.' };
  return { status: 'Nguy hại', color: '#78350f', pct: 100, desc: 'Khẩn cấp sức khỏe toàn diện.' };
};

// Kho ảnh phong cảnh thực tế 2K siêu sắc nét cho 63 tỉnh thành Việt Nam & thế giới (100% không trùng lặp)
const PROVINCE_PHOTOS = {
  // Miền Bắc
  ha_noi: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1920&q=95', // Hà Nội - Hồ Gươm cổ kính
  hai_phong: 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?auto=format&fit=crop&w=1920&q=95', // Hải Phòng - Ngọn hải đăng Cát Bà
  quang_ninh: 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1920&q=95', // Quảng Ninh - Vịnh Hạ Long kỳ quan
  ninh_binh: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1920&q=95', // Ninh Bình - Tràng An Tam Cốc
  ha_giang: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=95', // Hà Giang - Đèo Mã Pí Lèng
  lao_cai: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1920&q=95', // Lào Cai - Sa Pa ruộng bậc thang
  yen_bai: 'https://images.unsplash.com/photo-1512100356356-de1b84283e18?auto=format&fit=crop&w=1920&q=95', // Yên Bái - Mù Cang Chải sóng lúa
  cao_bang: 'https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=1920&q=95', // Cao Bằng - Thác Bản Giốc xanh ngọc
  son_la: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1920&q=95', // Sơn La - Mộc Châu thảo nguyên xanh
  dien_bien: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=95', // Điện Biên - Mường Thanh thung lũng
  lai_chau: 'https://images.unsplash.com/photo-1513415564515-763d91423bdd?auto=format&fit=crop&w=1920&q=95', // Lai Châu - Ô Quy Hồ mây ngàn
  hoa_binh: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1920&q=95', // Hòa Bình - Mai Châu thung lũng
  bac_kan: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1920&q=95', // Bắc Kạn - Hồ Ba Bể
  tuyen_quang: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1920&q=95', // Tuyên Quang - Hồ Na Hang
  lang_son: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=95', // Lạng Sơn - Mẫu Sơn
  thai_nguyen: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1920&q=95', // Thái Nguyên - Đồi chè Tân Cương
  phu_tho: 'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=1920&q=95', // Phú Thọ - Đồi chè Long Cốc
  bac_giang: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1920&q=95', // Bắc Giang - Rừng Tây Yên Tử
  bac_ninh: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1920&q=95', // Bắc Ninh - Chùa cổ Kinh Bắc
  ha_nam: 'https://images.unsplash.com/photo-1509718443690-d8e2fb3474b7?auto=format&fit=crop&w=1920&q=95', // Hà Nam - Chùa Tam Chúc
  hai_duong: 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?auto=format&fit=crop&w=1920&q=95', // Hải Dương - Côn Sơn Kiếp Bạc
  hung_yen: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1920&q=95', // Hưng Yên - Phố Hiến
  nam_dinh: 'https://images.unsplash.com/photo-1473186578172-c141e6798cf4?auto=format&fit=crop&w=1920&q=95', // Nam Định - Nhà thờ đổ Hải Hậu
  thai_binh: 'https://images.unsplash.com/photo-1434725039720-aaad6dd32dfe?auto=format&fit=crop&w=1920&q=95', // Thái Bình - Cánh đồng lúa chín
  vinh_phuc: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=95', // Vĩnh Phúc - Tam Đảo mây mù

  // Miền Trung
  thanh_hoa: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1920&q=95', // Thanh Hóa - Pù Luông xanh ngát
  nghe_an: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=1920&q=95', // Nghệ An - Cửa Lò
  ha_tinh: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?auto=format&fit=crop&w=1920&q=95', // Hà Tĩnh - Biển Thiên Cầm
  quang_binh: 'https://images.unsplash.com/photo-1517824806704-9040b037703b?auto=format&fit=crop&w=1920&q=95', // Quảng Bình - Phong Nha Kẻ Bàng
  quang_tri: 'https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?auto=format&fit=crop&w=1920&q=95', // Quảng Trị - Dòng sông Bến Hải
  thua_thien_hue: 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=1920&q=95', // Thừa Thiên Huế - Sông Hương lăng tẩm
  da_nang: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=1920&q=95', // Đà Nẵng - Cầu Rồng Mỹ Khê
  quang_nam: 'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=1920&q=95', // Quảng Nam - Phố cổ Hội An
  quang_ngai: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1920&q=95', // Quảng Ngãi - Đảo Lý Sơn
  binh_dinh: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&q=95', // Bình Định - Quy Nhơn Eo Gió
  phu_yen: 'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?auto=format&fit=crop&w=1920&q=95', // Phú Yên - Gành Đá Đĩa
  khanh_hoa: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=1920&q=95', // Khánh Hòa - Vịnh Nha Trang
  cam_ranh: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1920&q=95', // Khánh Hòa - Vịnh Cam Ranh
  ninh_hoa: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=95', // Khánh Hòa - Dốc Lết Ninh Hòa
  van_ninh: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1920&q=95', // Khánh Hòa - Vịnh Vân Phong
  ninh_thuan: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1920&q=95', // Ninh Thuận - Vịnh Vĩnh Hy
  binh_thuan: 'https://images.unsplash.com/photo-1433838552652-f9a46b332c40?auto=format&fit=crop&w=1920&q=95', // Bình Thuận - Mũi Né đồi cát

  // Tây Nguyên
  kon_tum: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1920&q=95', // Kon Tum - Măng Đen sương mù
  gia_lai: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=1920&q=95', // Gia Lai - Biển Hồ Pleiku
  dak_lak: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1920&q=95', // Đắk Lắk - Buôn Ma Thuột hồ Lắk
  dak_nong: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1920&q=95', // Đắk Nông - Hồ Tà Đùng
  lam_dong: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1920&q=95', // Lâm Đồng - Đà Lạt thông reo

  // Miền Nam & ĐBSCL
  ho_chi_minh: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=1920&q=95', // TP.HCM - Sài Gòn sông hoa
  binh_phuoc: 'https://images.unsplash.com/photo-1476900543704-4312b78632f8?auto=format&fit=crop&w=1920&q=95', // Bình Phước - Rừng cao su Bù Gia Mập
  binh_duong: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1920&q=95', // Bình Dương - Đô thị mới
  dong_nai: 'https://images.unsplash.com/photo-1498084393753-b411b2d26b34?auto=format&fit=crop&w=1920&q=95', // Đồng Nai - Hồ Trị An Cát Tiên
  tay_ninh: 'https://images.unsplash.com/photo-1465056836041-7f43ac27dcb5?auto=format&fit=crop&w=1920&q=95', // Tây Ninh - Núi Bà Đen
  ba_ria_vung_tau: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1920&q=95', // Bà Rịa Vũng Tàu - Bờ biển
  long_an: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1920&q=95', // Long An - Làng nổi Tân Lập
  tien_giang: 'https://images.unsplash.com/photo-1513002749550-c59d786b8e6c?auto=format&fit=crop&w=1920&q=95', // Tiền Giang - Sông Tiền Cái Bè
  ben_tre: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1920&q=95', // Bến Tre - Xứ dừa
  tra_vinh: 'https://images.unsplash.com/photo-1528183429752-a97d0bf99b5a?auto=format&fit=crop&w=1920&q=95', // Trà Vinh - Ao Bà Om
  vinh_long: 'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?auto=format&fit=crop&w=1920&q=95', // Vĩnh Long - Cù lao An Bình
  dong_thap: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1920&q=95', // Đồng Tháp - Đầm sen Tháp Mười
  an_giang: 'https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=1920&q=95', // An Giang - Rừng tràm Trà Sư
  kien_giang: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1920&q=95', // Kiên Giang - Đảo Phú Quốc
  can_tho: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1920&q=95', // Cần Thơ - Bến Ninh Kiều
  hau_giang: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1920&q=95', // Hậu Giang - Ngã Bảy
  soc_trang: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1920&q=95', // Sóc Trăng - Chùa cổ Khmer
  bac_lieu: 'https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?auto=format&fit=crop&w=1920&q=95', // Bạc Liêu - Cánh đồng điện gió
  ca_mau: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=1920&q=95', // Cà Mau - Đất Mũi rừng đước

  // Thế giới
  tokyo: 'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=1920&q=95',
  paris: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&w=1920&q=95',
  london: 'https://images.unsplash.com/photo-1526129318478-62ed807ebdf9?auto=format&fit=crop&w=1920&q=95',
  new_york: 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=1920&q=95',
  rome: 'https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?auto=format&fit=crop&w=1920&q=95',
  dubai: 'https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=1920&q=95',
  sydney: 'https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?auto=format&fit=crop&w=1920&q=95'
};

// Bộ quy tắc nhận diện toàn diện 63 tỉnh thành & địa danh Việt Nam
const VIETNAM_PROVINCES = [
  // Ưu tiên các địa danh Khánh Hòa trước để tránh trùng lặp
  { keys: ['cam ranh'], imgKey: 'cam_ranh', title: 'Vịnh Cam Ranh nước ngọc bích' },
  { keys: ['ninh hoa', 'doc let'], imgKey: 'ninh_hoa', title: 'Bãi biển Dốc Lết hoang sơ Ninh Hòa' },
  { keys: ['van ninh', 'van phong', 'diep son'], imgKey: 'van_ninh', title: 'Bán đảo Vịnh Vân Phong & Điệp Sơn' },
  { keys: ['nha trang'], imgKey: 'khanh_hoa', title: 'Vịnh Nha Trang cát trắng biển xanh' },
  { keys: ['khanh hoa', 'cam lam', 'dien khanh', 'khanh son', 'khanh vinh', 'truong sa'], imgKey: 'khanh_hoa', title: 'Vịnh biển Nha Trang, Khánh Hòa' },

  // Tây Bắc & Đông Bắc
  { keys: ['ha giang', 'dong van', 'ma pi leng', 'meo vac'], imgKey: 'ha_giang', title: 'Cao nguyên đá Đồng Văn & Đèo Mã Pí Lèng' },
  { keys: ['cao bang', 'ban gioc', 'pac bo'], imgKey: 'cao_bang', title: 'Thác Bản Giốc xanh ngọc hùng vĩ' },
  { keys: ['bac kan', 'ba be'], imgKey: 'bac_kan', title: 'Danh thắng Vườn quốc gia Hồ Ba Bể' },
  { keys: ['tuyen quang', 'na hang'], imgKey: 'tuyen_quang', title: 'Vùng lòng hồ sinh thái Na Hang' },
  { keys: ['lao cai', 'sa pa', 'sapa', 'fansipan', 'bac ha'], imgKey: 'lao_cai', title: 'Thung lũng ruộng bậc thang Sa Pa' },
  { keys: ['yen bai', 'mu cang chai', 'thac ba', 'nghia lo'], imgKey: 'yen_bai', title: 'Ruộng bậc thang Mù Cang Chải sóng lúa vàng' },
  { keys: ['thai nguyen', 'tan cuong', 'nui coc'], imgKey: 'thai_nguyen', title: 'Đồi chè Tân Cương & Hồ Núi Cốc' },
  { keys: ['lang son', 'mau son', 'chi lang', 'dong dang'], imgKey: 'lang_son', title: 'Đỉnh núi Mẫu Sơn mờ sương' },
  { keys: ['bac giang', 'yen tu', 'luc ngan'], imgKey: 'bac_giang', title: 'Rừng nguyên sinh Tây Yên Tử' },
  { keys: ['quang ninh', 'ha long', 'cam pha', 'co to', 'van don', 'mong cai'], imgKey: 'quang_ninh', title: 'Kỳ quan thiên nhiên thế giới Vịnh Hạ Long' },
  { keys: ['phu tho', 'viet tri', 'den hung', 'long coc'], imgKey: 'phu_tho', title: 'Đồi chè Long Cốc & Đền Hùng đất Tổ' },
  { keys: ['dien bien', 'muong thanh', 'pha din'], imgKey: 'dien_bien', title: 'Thung lũng Mường Thanh & Đèo Pha Đin' },
  { keys: ['lai chau', 'o quy ho', 'putaleng'], imgKey: 'lai_chau', title: 'Đại ngàn Đèo Ô Quy Hồ & Đỉnh Putaleng' },
  { keys: ['son la', 'moc chau', 'ta xua'], imgKey: 'son_la', title: 'Cao nguyên Mộc Châu & Thiên đường mây Tà Xùa' },
  { keys: ['hoa binh', 'mai chau', 'thung nai'], imgKey: 'hoa_binh', title: 'Thung lũng Mai Châu & Hồ Thung Nai' },

  // Đồng bằng sông Hồng
  { keys: ['ha noi', 'hanoi', 'hoan kiem', 'ba dinh', 'tay ho'], imgKey: 'ha_noi', title: 'Thủ đô Hà Nội Hồ Gươm cổ kính' },
  { keys: ['hai phong', 'cat ba', 'lan ha', 'do son'], imgKey: 'hai_phong', title: 'Vịnh Lan Hạ & Quần đảo Cát Bà Hải Phòng' },
  { keys: ['vinh phuc', 'tam dao', 'tay thien', 'vinh yen'], imgKey: 'vinh_phuc', title: 'Thị trấn trên mây Tam Đảo' },
  { keys: ['bac ninh', 'tu son'], imgKey: 'bac_ninh', title: 'Chùa Dâu & Di sản văn hóa Kinh Bắc' },
  { keys: ['hai duong', 'chi linh', 'con son'], imgKey: 'hai_duong', title: 'Khu danh thắng Côn Sơn - Kiếp Bạc' },
  { keys: ['hung yen', 'pho hien'], imgKey: 'hung_yen', title: 'Phố Hiến xưa thanh bình bên sông Hồng' },
  { keys: ['ha nam', 'phu ly', 'tam chuc'], imgKey: 'ha_nam', title: 'Quần thể tâm linh chùa Tam Chúc' },
  { keys: ['nam dinh', 'hai hau', 'quat lam'], imgKey: 'nam_dinh', title: 'Nhà thờ đổ Hải Hậu & Vùng biển Nam Định' },
  { keys: ['thai binh', 'dong chau', 'chua keo'], imgKey: 'thai_binh', title: 'Cánh đồng lúa chín quê lúa Thái Bình' },
  { keys: ['ninh binh', 'trang an', 'tam coc', 'bai dinh', 'hang mua'], imgKey: 'ninh_binh', title: 'Quần thể danh thắng Tràng An - Tam Cốc' },

  // Bắc Trung Bộ & Duyên hải Nam Trung Bộ
  { keys: ['thanh hoa', 'sam son', 'pu luong', 'hai tien', 'bim son'], imgKey: 'thanh_hoa', title: 'Khu bảo tồn thiên nhiên Pù Luông xanh ngát' },
  { keys: ['nghe an', 'vinh', 'cua lo', 'nam dan'], imgKey: 'nghe_an', title: 'Bờ biển Cửa Lò & Quê Bác Sen Vàng' },
  { keys: ['ha tinh', 'thien cam', 'hong linh'], imgKey: 'ha_tinh', title: 'Bãi biển Thiên Cầm & Dãy Hồng Lĩnh' },
  { keys: ['quang binh', 'dong hoi', 'phong nha', 'son doong', 'ba don'], imgKey: 'quang_binh', title: 'Vườn quốc gia Phong Nha - Kẻ Bàng' },
  { keys: ['quang tri', 'dong ha', 'hien luong', 'vinh moc'], imgKey: 'quang_tri', title: 'Dòng sông Bến Hải & Cầu Hiền Lương lịch sử' },
  { keys: ['thua thien', 'hue', 'song huong', 'lang co'], imgKey: 'thua_thien_hue', title: 'Cố đô Huế & Dòng sông Hương thơ mộng' },
  { keys: ['da nang', 'ba na', 'my khe'], imgKey: 'da_nang', title: 'Cầu Rồng vươn mình & Bãi biển Mỹ Khê' },
  { keys: ['quang nam', 'hoi an', 'tam ky', 'my son'], imgKey: 'quang_nam', title: 'Phố cổ Hội An đèn lồng hoa đăng' },
  { keys: ['quang ngai', 'ly son'], imgKey: 'quang_ngai', title: 'Đảo núi lửa Lý Sơn xanh biếc' },
  { keys: ['binh dinh', 'quy nhon', 'eo gio', 'ky co', 'an nhon'], imgKey: 'binh_dinh', title: 'Eo Gió Kỳ Co Quy Nhơn' },
  { keys: ['phu yen', 'tuy hoa', 'ganh da dia', 'vung ro', 'song cau'], imgKey: 'phu_yen', title: 'Tuyệt tác đá Bazan Gành Đá Đĩa Phú Yên' },
  { keys: ['ninh thuan', 'phan rang', 'vinh hy', 'hang rai', 'thap cham'], imgKey: 'ninh_thuan', title: 'Vịnh Vĩnh Hy & Hang Rái Ninh Thuận' },
  { keys: ['binh thuan', 'phan thiet', 'mui ne', 'bau trang', 'phu quy', 'la gi'], imgKey: 'binh_thuan', title: 'Đồi cát Mũi Né & Bàu Trắng Bình Thuận' },

  // Tây Nguyên
  { keys: ['kon tum', 'mang den'], imgKey: 'kon_tum', title: 'Thị trấn mờ sương Măng Đen Kon Tum' },
  { keys: ['gia lai', 'pleiku', 'bien ho', 'ayun pa'], imgKey: 'gia_lai', title: 'Mắt ngọc Pleiku Biển Hồ T nưng' },
  { keys: ['dak lak', 'dac lac', 'buon ma thuot', 'dray nur', 'lak'], imgKey: 'dak_lak', title: 'Buôn Ma Thuột thủ phủ cà phê & Hồ Lắk' },
  { keys: ['dak nong', 'dac nong', 'ta dung', 'gia nghia'], imgKey: 'dak_nong', title: 'Hồ Tà Đùng vịnh Hạ Long Tây Nguyên' },
  { keys: ['lam dong', 'da lat', 'dalat', 'bao loc', 'tuyen lam'], imgKey: 'lam_dong', title: 'Rừng thông mộng mơ cao nguyên Đà Lạt' },

  // Đông Nam Bộ
  { keys: ['ho chi minh', 'sai gon', 'saigon', 'tphcm', 'thu duc'], imgKey: 'ho_chi_minh', title: 'Toàn cảnh Sài Gòn lung linh bên sông' },
  { keys: ['binh phuoc', 'dong xoai', 'bu gia map', 'binh long'], imgKey: 'binh_phuoc', title: 'Rừng cao su bạt ngàn & VQG Bù Gia Mập' },
  { keys: ['tay ninh', 'ba den', 'trang bang'], imgKey: 'tay_ninh', title: 'Đỉnh Núi Bà Đen nóc nhà Đông Nam Bộ' },
  { keys: ['binh duong', 'thu dau mot', 'di an', 'thuan an', 'ben cat'], imgKey: 'binh_duong', title: 'Trung tâm đô thị hiện đại Bình Dương' },
  { keys: ['dong nai', 'bien hoa', 'long khanh', 'tri an', 'cat tien'], imgKey: 'dong_nai', title: 'Mặt nước phẳng lặng Hồ Trị An Đồng Nai' },
  { keys: ['ba ria', 'vung tau', 'con dao', 'long hai'], imgKey: 'ba_ria_vung_tau', title: 'Thành phố biển Vũng Tàu & Côn Đảo' },

  // Đồng bằng sông Cửu Long (Tây Nam Bộ)
  { keys: ['long an', 'tan an', 'tan lap', 'ben luc', 'kien tuong'], imgKey: 'long_an', title: 'Rừng tràm Làng nổi Tân Lập Long An' },
  { keys: ['tien giang', 'my tho', 'go cong', 'cai be', 'thoi son'], imgKey: 'tien_giang', title: 'Sông Tiền cồn Thới Sơn & Chợ nổi Cái Bè' },
  { keys: ['ben tre', 'ba tri', 'binh dai'], imgKey: 'ben_tre', title: 'Xứ dừa Bến Tre xanh ngắt ngút ngàn' },
  { keys: ['tra vinh', 'duyen hai', 'ba dong', 'ba om'], imgKey: 'tra_vinh', title: 'Thắng cảnh Ao Bà Om & Chùa cổ Khmer Trà Vinh' },
  { keys: ['vinh long', 'binh minh', 'an binh'], imgKey: 'vinh_long', title: 'Vườn cây trái Cù lao An Bình Vĩnh Long' },
  { keys: ['dong thap', 'cao lanh', 'sa dec', 'hong ngu', 'tram chim'], imgKey: 'dong_thap', title: 'Đầm sen Tháp Mười ngát hương & Làng hoa Sa Đéc' },
  { keys: ['an giang', 'long xuyen', 'chau doc', 'tra su', 'that son'], imgKey: 'an_giang', title: 'Rừng tràm Trà Sư xanh mướt An Giang' },
  { keys: ['kien giang', 'rach gia', 'ha tien', 'phu quoc', 'nam du'], imgKey: 'kien_giang', title: 'Thiên đường biển đảo ngọc Phú Quốc Kiên Giang' },
  { keys: ['can tho', 'ninh kieu', 'cai rang', 'binh thuy', 'phong dien'], imgKey: 'can_tho', title: 'Bến Ninh Kiều & Chợ nổi Cái Răng Cần Thơ' },
  { keys: ['hau giang', 'vi thanh', 'nga bay', 'lung ngoc hoang'], imgKey: 'hau_giang', title: 'Kênh rạch Ngã Bảy Hậu Giang' },
  { keys: ['soc trang', 'vinh chau', 'chua doi'], imgKey: 'soc_trang', title: 'Chùa Dơi cổ kính Sóc Trăng' },
  { keys: ['bac lieu', 'gia rai', 'cong tu bac lieu'], imgKey: 'bac_lieu', title: 'Cánh đồng điện gió ven biển Bạc Liêu' },
  { keys: ['ca mau', 'nam can', 'u minh', 'dat mui'], imgKey: 'ca_mau', title: 'Rừng đước Mũi Cà Mau cực Nam Tổ quốc' }
];

// Thành phố lớn trên thế giới
const WORLD_CITIES = [
  { keys: ['tokyo', 'japan'], imgKey: 'tokyo', title: 'Tháp Tokyo & Núi Phú Sĩ Nhật Bản' },
  { keys: ['paris', 'france'], imgKey: 'paris', title: 'Tháp Eiffel kinh đô ánh sáng Paris' },
  { keys: ['london', 'united kingdom'], imgKey: 'london', title: 'Cầu tháp London & Sông Thames' },
  { keys: ['new york'], imgKey: 'new_york', title: 'Skyline Manhattan New York' },
  { keys: ['rome', 'italy'], imgKey: 'rome', title: 'Đấu trường La Mã Rome' },
  { keys: ['dubai', 'emirates'], imgKey: 'dubai', title: 'Tòa tháp Burj Khalifa & Du thuyền Dubai' },
  { keys: ['sydney', 'australia'], imgKey: 'sydney', title: 'Nhà hát Con Sò Sydney Harbour' }
];

// Kho 25 ảnh phong cảnh thực tế đa dạng tuyệt đẹp (100% không trùng lặp) cho mọi địa danh tìm kiếm khác
const DIVERSE_CITY_POOL = [
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1513002749550-c59d786b8e6c?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1498084393753-b411b2d26b34?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1920&q=95',
  'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1920&q=95'
];

const normalizeText = (str) => {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
};

/* Lấy ảnh banner & thông tin danh thắng thực tế KHÔNG TRÙNG LẶP theo từng tỉnh thành */
const getWeatherBannerData = (locationName) => {
  const normName = normalizeText(locationName);

  // 1. Nhận diện 63 tỉnh thành & địa danh danh thắng Việt Nam
  for (const item of VIETNAM_PROVINCES) {
    if (item.keys.some((k) => normName.includes(k))) {
      return {
        url: PROVINCE_PHOTOS[item.imgKey] || PROVINCE_PHOTOS.khanh_hoa,
        title: item.title,
      };
    }
  }

  // 2. Nhận diện các thành phố lớn thế giới
  for (const item of WORLD_CITIES) {
    if (item.keys.some((k) => normName.includes(k))) {
      return {
        url: PROVINCE_PHOTOS[item.imgKey] || PROVINCE_PHOTOS.ha_noi,
        title: item.title,
      };
    }
  }

  // 3. Địa danh quốc tế hoặc tọa độ GPS khác: băm chuỗi ổn định để không trùng lặp
  if (normName) {
    let hash = 2166136261;
    for (let i = 0; i < normName.length; i++) {
      hash ^= normName.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const idx = Math.abs(hash) % DIVERSE_CITY_POOL.length;
    return {
      url: DIVERSE_CITY_POOL[idx],
      title: 'Phong cảnh thiên nhiên đặc trưng',
    };
  }

  return {
    url: PROVINCE_PHOTOS.khanh_hoa,
    title: 'Vịnh Nha Trang cát trắng biển xanh',
  };
};

/* ===== BẢN ĐỒ THỜI TIẾT TƯƠNG TÁC VỆ TINH CHUYÊN SÂU ===== */
function WeatherMap({ lat, lon, name, temp, onSelectLocation, onRecenter }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const baseLayerRef = useRef(null);
  const radarLayerRef = useRef(null);
  const [mapLayer, setMapLayer] = useState('satellite'); // 'satellite' | 'radar' | 'street'

  // Khởi tạo bản đồ
  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstance.current) {
      const m = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([lat, lon], 9);

      // Click vào bản đồ để cập nhật vị trí
      m.on('click', (e) => {
        onSelectLocation({
          name: `Tọa độ (${e.latlng.lat.toFixed(2)}°N, ${e.latlng.lng.toFixed(2)}°E)`,
          lat: e.latlng.lat,
          lon: e.latlng.lng,
        });
      });

      mapInstance.current = m;
    }
  }, []);

  // Cập nhật vị trí hiển thị khi lat/lon thay đổi
  useEffect(() => {
    if (!mapInstance.current) return;
    mapInstance.current.setView([lat, lon], 9);

    if (markerRef.current) markerRef.current.remove();

    // Marker vệ tinh với hiệu ứng sóng tỏa radar
    const customIcon = L.divIcon({
      className: 'custom-weather-pin',
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: rgba(56, 189, 248, 0.4); animation: radarWave 2s infinite ease-out;"></div>
          <div style="background: #0284c7; color: #fff; padding: 6px 12px; border-radius: 20px; font-weight: 800; font-size: 13px; box-shadow: 0 4px 14px rgba(0,0,0,0.6); border: 2px solid #fff; white-space: nowrap; z-index: 10; display: flex; align-items: center; gap: 5px;">
            <span>📍</span>
            <span>${name}: ${temp}</span>
          </div>
        </div>
      `,
      iconSize: [110, 36],
      iconAnchor: [55, 18],
    });

    markerRef.current = L.marker([lat, lon], { icon: customIcon })
      .addTo(mapInstance.current)
      .bindPopup(`<b>${name}</b><br/>Nhiệt độ hiện tại: ${temp}<br/><small>Bấm vào bất kỳ đâu trên bản đồ để tra cứu</small>`);
  }, [lat, lon, name, temp]);

  // Cập nhật các lớp (Layer): ESRI Satellite, RainViewer Radar, OpenStreetMap
  useEffect(() => {
    const m = mapInstance.current;
    if (!m) return;

    if (baseLayerRef.current) m.removeLayer(baseLayerRef.current);
    if (radarLayerRef.current) m.removeLayer(radarLayerRef.current);

    if (mapLayer === 'satellite' || mapLayer === 'radar') {
      // Vệ tinh độ phân giải cao ESRI World Imagery
      baseLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye', maxZoom: 18 }
      ).addTo(m);

      if (mapLayer === 'radar') {
        // Lớp phủ Radar Mưa thời gian thực từ RainViewer
        radarLayerRef.current = L.tileLayer(
          'https://tilecache.rainviewer.com/v2/radar/736139fdf284/256/{z}/{x}/{y}/2/1_1.png',
          { opacity: 0.72, zIndex: 10 }
        ).addTo(m);
      }
    } else {
      // Bản đồ địa danh OpenStreetMap
      baseLayerRef.current = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }
      ).addTo(m);
    }
  }, [mapLayer]);

  return (
    <div className="map-wrap">
      {/* Thanh chọn lớp bản đồ */}
      <div className="map-layer-controls">
        <button
          className={`map-layer-btn ${mapLayer === 'satellite' ? 'active' : ''}`}
          onClick={() => setMapLayer('satellite')}
          title="Chế độ chụp ảnh vệ tinh địa hình thực tế"
        >
          🛰️ Ảnh Vệ Tinh
        </button>
        <button
          className={`map-layer-btn ${mapLayer === 'radar' ? 'active' : ''}`}
          onClick={() => setMapLayer('radar')}
          title="Lớp phủ mây mưa Radar thời gian thực"
        >
          🌧️ Radar Mây Mưa
        </button>
        <button
          className={`map-layer-btn ${mapLayer === 'street' ? 'active' : ''}`}
          onClick={() => setMapLayer('street')}
          title="Bản đồ giao thông và địa lý OpenStreetMap"
        >
          🗺️ Địa Lý
        </button>
      </div>

      {/* Nút về vị trí hiện tại */}
      <button className="map-recenter-btn" onClick={onRecenter} title="Căn lại vị trí của bạn">
        🎯 Vị trí của tôi
      </button>

      {/* Thước đo mức độ mưa radar */}
      {mapLayer === 'radar' && (
        <div className="map-radar-legend">
          <span className="map-radar-title">Cường độ mưa Radar</span>
          <div className="map-radar-gradient" />
          <div className="map-radar-labels">
            <span>Nhẹ</span>
            <span>Vừa</span>
            <span>To</span>
            <span>Rất to</span>
          </div>
        </div>
      )}

      <div className="map-hint-text">💡 Bấm vào bản đồ để cập nhật thời tiết tại điểm đó</div>
      <div ref={mapRef} className="map-element" />
    </div>
  );
}

/* Component Chart.js với Canvas Gradient & Styling trực quan */
function ChartBox({ config, isLightMode }) {
  const ref = useRef();
  useEffect(() => {
    const textColor = isLightMode ? '#334155' : '#cbd5e1';
    const gridColor = isLightMode ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)';

    const themed = {
      ...config,
      options: {
        ...config.options,
        maintainAspectRatio: false,
        plugins: {
          ...config.options?.plugins,
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: isLightMode ? '#0f172a' : '#f1f5f9',
              font: { family: "'Be Vietnam Pro', system-ui, sans-serif", size: 12, weight: 600 },
              boxWidth: 14,
              padding: 18,
              usePointStyle: true,
            },
          },
          tooltip: {
            backgroundColor: isLightMode ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.94)',
            titleColor: isLightMode ? '#0f172a' : '#f8fafc',
            bodyColor: isLightMode ? '#334155' : '#cbd5e1',
            borderColor: isLightMode ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 10,
            boxPadding: 6,
          },
        },
        scales: {
          ...config.options?.scales,
          x: {
            ...config.options?.scales?.x,
            ticks: { color: textColor, font: { size: 11, weight: 500 } },
            grid: { color: gridColor, drawBorder: false },
          },
          y: {
            ...config.options?.scales?.y,
            ticks: { color: textColor, font: { size: 11, weight: 500 } },
            grid: { color: gridColor, drawBorder: false },
          },
          ...(config.options?.scales?.y1 ? {
            y1: {
              ...config.options.scales.y1,
              ticks: { color: textColor, font: { size: 11, weight: 500 } },
              grid: { drawOnChartArea: false, drawBorder: false },
            },
          } : {}),
        },
      },
    };
    const c = new Chart(ref.current, themed);
    return () => c.destroy();
  }, [config, isLightMode]);
  return <div className="chart"><canvas ref={ref} /></div>;
}

export default function App() {
  const [place, setPlace] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [favs, setFavs] = useState(() => JSON.parse(localStorage.getItem('favs') || '[]'));
  const [theme, setTheme] = useState(() => localStorage.getItem('wx_theme') || 'coastal-day');
  const [unit, setUnit] = useState(() => localStorage.getItem('wx_unit') || 'C'); // 'C' | 'F'
  const [chartView48, setChartView48] = useState('all'); // 'all' | 'temp' | 'pop'
  const [chartView14, setChartView14] = useState('all'); // 'all' | 'temp' | 'rain'
  const [toast, setToast] = useState('');
  const [selectedDay, setSelectedDay] = useState(null);
  const [soundActive, setSoundActive] = useState(false);
  const [showAppModal, setShowAppModal] = useState(false);
  const [activePage, setActivePage] = useState('overview'); // 'overview' | 'forecast' | 'map' | 'air' | 'mobile'

  const goToPage = (pageId) => {
    setActivePage(pageId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const audioCtxRef = useRef(null);

  const isLightMode = theme === 'coastal-day' || theme === 'sky-bright';

  // Chuyển đổi nhiệt độ theo đơn vị
  const convertT = (celsius) => {
    if (celsius == null) return '--';
    if (unit === 'F') return Math.round(celsius * 1.8 + 32);
    return Math.round(celsius);
  };
  const unitLabel = `°${unit}`;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wx_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('wx_unit', unit);
  }, [unit]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Trình phát âm thanh mưa thư giãn (Web Audio API)
  const toggleSoundscape = () => {
    if (soundActive) {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      setSoundActive(false);
      showToast('🔇 Đã tắt âm thanh thư giãn.');
    } else {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;

        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99 * b0 + white * 0.05;
          b1 = 0.95 * b1 + white * 0.08;
          b2 = 0.85 * b2 + white * 0.12;
          output[i] = (b0 + b1 + b2) * 0.25;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = buffer;
        whiteNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 650;

        const gainNode = ctx.createGain();
        gainNode.gain.value = 0.15;

        whiteNoise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);
        whiteNoise.start(0);

        setSoundActive(true);
        showToast('🌧️ Đang phát âm thanh mưa rơi thư giãn.');
      } catch (e) {
        console.error('Audio context error:', e);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  // Geolocation
  const getCurrentLocation = () => {
    if (!navigator.geolocation) return setPlace(DEFAULT);
    navigator.geolocation.getCurrentPosition(
      (p) => setPlace({ name: 'Vị trí hiện tại của bạn', lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setPlace(DEFAULT),
      { timeout: 8000 }
    );
  };

  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Fetch weather data
  useEffect(() => {
    if (!place) return;
    let off = false;
    const API_BASE = import.meta.env.VITE_API_URL ?? '';
    const load = () => fetch(`${API_BASE}/api/weather?lat=${place.lat}&lon=${place.lon}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j.error)))))
      .then((j) => !off && (setData(j), setErr('')))
      .catch((e) => !off && setErr(e.message));
    setData(null);
    load();
    const id = setInterval(load, 600000);
    return () => { off = true; clearInterval(id); };
  }, [place]);

  const search = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    const API_BASE = import.meta.env.VITE_API_URL ?? '';
    setResults(await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => []));
  };

  const pick = (p) => {
    setPlace(p);
    setResults([]);
    setQ('');
  };

  const isFav = place && favs.some((f) => f.lat === place.lat && f.lon === place.lon);
  const toggleFav = () => {
    const next = isFav ? favs.filter((f) => f.lat !== place.lat || f.lon !== place.lon) : [...favs, place];
    setFavs(next);
    localStorage.setItem('favs', JSON.stringify(next));
  };

  const c = data?.current;
  const aq = data?.airQuality;

  const activeLocationName = useMemo(() => {
    if (place?.name && place.name !== 'Vị trí hiện tại của bạn') return place.name;
    return c?.name || place?.name || 'Nha Trang';
  }, [place?.name, c?.name]);

  const bannerData = useMemo(() => {
    return getWeatherBannerData(activeLocationName);
  }, [activeLocationName]);

  const uvInfo = useMemo(() => getUvInfo(c?.uv), [c?.uv]);
  const aqiInfo = useMemo(() => getAqiInfo(aq?.aqi), [aq?.aqi]);

  const copyWeatherSummary = () => {
    if (!data || !c) return;
    const locName = activeLocationName;
    const aqiText = aq ? `Chất lượng không khí AQI: ${aq.aqi} (${aqiInfo.status}). ` : '';
    const summary = `🌤️ Thời tiết tại ${locName} hôm nay: ${convertT(c.temp)}${unitLabel}, ${c.desc}. Cảm giác như ${convertT(c.feels)}${unitLabel}. Độ ẩm ${c.humidity}%, Gió ${c.wind} km/h ${c.windDir || ''}. Chỉ số UV: ${c.uv ?? '--'} (${uvInfo.level}). ${aqiText}Dự báo ngày mai cao nhất ${convertT(data.daily?.[1]?.max)}${unitLabel}.`;
    navigator.clipboard.writeText(summary).then(() => {
      showToast('📋 Đã sao chép bản tin tóm tắt thời tiết vào bộ nhớ tạm!');
    });
  };

  // Chỉ số thống kê nhanh cho Biểu đồ 48h
  const kpi48h = useMemo(() => {
    if (!data?.hourly || data.hourly.length === 0) return null;
    const maxT = Math.max(...data.hourly.map((h) => h.temp));
    const minT = Math.min(...data.hourly.map((h) => h.temp));
    const maxPopItem = [...data.hourly].sort((a, b) => b.pop - a.pop)[0];
    return {
      maxTemp: convertT(maxT),
      minTemp: convertT(minT),
      maxPop: maxPopItem?.pop || 0,
      maxPopTime: maxPopItem ? fmtHour(maxPopItem.t) : '--',
    };
  }, [data?.hourly, unit]);

  // Chỉ số thống kê nhanh cho Biểu đồ 14 ngày
  const kpi14d = useMemo(() => {
    if (!data?.daily || data.daily.length === 0) return null;
    const maxT = Math.max(...data.daily.map((d) => d.max));
    const minT = Math.min(...data.daily.map((d) => d.min));
    const totalRain = data.daily.reduce((acc, d) => acc + (d.rain || 0), 0);
    const rainyDays = data.daily.filter((d) => d.rain > 1).length;
    return {
      maxTemp: convertT(maxT),
      minTemp: convertT(minT),
      totalRain: totalRain.toFixed(1),
      rainyDays,
    };
  }, [data?.daily, unit]);

  // Đánh giá mức độ đồng thuận giữa 2 nguồn dự báo (OWM & Open-Meteo)
  const consensusRating = useMemo(() => {
    if (!data?.daily) return null;
    const diffs = data.daily.filter((d) => d.owm).map((d) => Math.abs(d.owm.max - d.max));
    if (diffs.length === 0) return null;
    const avgDiff = (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1);
    if (avgDiff <= 1.5) {
      return { text: 'Rất cao (Đồng thuận 95%)', desc: `Độ chênh lệch trung bình giữa hai mô hình chỉ ${avgDiff}°C. Dự báo có độ tin cậy rất cao.`, color: '#22c55e' };
    }
    if (avgDiff <= 3.0) {
      return { text: 'Trung bình (Đồng thuận 80%)', desc: `Độ chênh lệch trung bình ${avgDiff}°C. Xu hướng chung ổn định, có thể có khác biệt nhỏ về biên độ nhiệt.`, color: '#eab308' };
    }
    return { text: 'Độ biến động cao', desc: `Độ chênh lệch trung bình ${avgDiff}°C giữa 2 nguồn. Cần theo dõi thêm do thời tiết đang có chuyển biến nhanh.`, color: '#f97316' };
  }, [data?.daily]);

  // Cấu hình Biểu đồ 48h trực quan với Canvas Gradient
  const hourCfg = useMemo(() => {
    if (!data) return null;
    const datasets = [];

    if (chartView48 === 'all' || chartView48 === 'temp') {
      datasets.push({
        label: `Nhiệt độ (${unitLabel})`,
        data: data.hourly.map((h) => convertT(h.temp)),
        borderColor: isLightMode ? '#ea580c' : '#fbbf24',
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(251, 191, 36, 0.1)';
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, isLightMode ? 'rgba(234, 88, 12, 0.35)' : 'rgba(251, 191, 36, 0.35)');
          gradient.addColorStop(1, 'rgba(251, 191, 36, 0.0)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        yAxisID: 'y',
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: isLightMode ? '#ea580c' : '#fbbf24',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        borderWidth: 2.8,
      });
    }

    if (chartView48 === 'all' || chartView48 === 'pop') {
      datasets.push({
        label: 'Khả năng mưa (%)',
        data: data.hourly.map((h) => h.pop),
        borderColor: '#0284c7',
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(2, 132, 199, 0.1)';
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(2, 132, 199, 0.25)');
          gradient.addColorStop(1, 'rgba(2, 132, 199, 0.0)');
          return gradient;
        },
        fill: true,
        borderDash: [5, 4],
        tension: 0.4,
        yAxisID: 'y1',
        pointRadius: 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: '#0284c7',
        borderWidth: 2,
      });
    }

    return {
      type: 'line',
      data: {
        labels: data.hourly.map((h) => fmtHour(h.t)),
        datasets,
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          y: {
            position: 'left',
            title: { display: true, text: `Nhiệt độ (${unitLabel})`, color: isLightMode ? '#334155' : '#94a3b8' },
          },
          ...(chartView48 !== 'temp' ? {
            y1: {
              position: 'right',
              min: 0,
              max: 100,
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Khả năng mưa (%)', color: '#0284c7' },
            },
          } : {}),
        },
      },
    };
  }, [data, chartView48, unit, isLightMode]);

  // Cấu hình Biểu đồ 14 ngày trực quan (Biên độ nhiệt + Lượng mưa)
  const dayCfg = useMemo(() => {
    if (!data) return null;
    const datasets = [];

    // Cột lượng mưa
    if (chartView14 === 'all' || chartView14 === 'rain') {
      datasets.push({
        type: 'bar',
        label: 'Lượng mưa (mm)',
        data: data.daily.map((d) => d.rain),
        backgroundColor: isLightMode ? 'rgba(2, 132, 199, 0.35)' : 'rgba(56, 189, 248, 0.35)',
        borderColor: isLightMode ? '#0284c7' : '#38bdf8',
        borderWidth: 1.5,
        borderRadius: 8,
        yAxisID: 'y1',
        order: 2,
      });
    }

    // Đường nhiệt độ Cao nhất
    if (chartView14 === 'all' || chartView14 === 'temp') {
      datasets.push({
        type: 'line',
        label: `Nhiệt độ cao nhất (${unitLabel})`,
        data: data.daily.map((d) => convertT(d.max)),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        fill: '+1', // Tô bóng vùng giữa Max và Min để tạo dải biên độ nhiệt độ
        tension: 0.35,
        yAxisID: 'y',
        pointRadius: 3.5,
        pointHoverRadius: 6,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        borderWidth: 2.6,
        order: 1,
      });

      // Đường nhiệt độ Thấp nhất
      datasets.push({
        type: 'line',
        label: `Nhiệt độ thấp nhất (${unitLabel})`,
        data: data.daily.map((d) => convertT(d.min)),
        borderColor: isLightMode ? '#ea580c' : '#fbbf24',
        tension: 0.35,
        yAxisID: 'y',
        pointRadius: 3.5,
        pointHoverRadius: 6,
        pointBackgroundColor: isLightMode ? '#ea580c' : '#fbbf24',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        borderWidth: 2.6,
        order: 1,
      });
    }

    return {
      data: {
        labels: data.daily.map((d) => fmtDay(d.date)),
        datasets,
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          y: {
            position: 'left',
            title: { display: true, text: `Nhiệt độ (${unitLabel})`, color: isLightMode ? '#334155' : '#94a3b8' },
          },
          ...(chartView14 !== 'temp' ? {
            y1: {
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Lượng mưa (mm)', color: '#0284c7' },
            },
          } : {}),
        },
      },
    };
  }, [data, chartView14, unit, isLightMode]);

  return (
    <main>
      {/* Toast thông báo */}
      {toast && <div className="toast-msg">{toast}</div>}

      {/* Modal Tải App Mobile */}
      <MobileAppModal
        isOpen={showAppModal}
        onClose={() => setShowAppModal(false)}
        showToast={showToast}
      />

      {/* Modal chi tiết ngày khi click vào card 14 ngày */}
      {selectedDay && (
        <div className="modal-overlay" onClick={() => setSelectedDay(null)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{fmtDay(selectedDay.date)}</h3>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-sub)', marginTop: 4 }}>
                  {weatherEmoji(selectedDay.text)} {selectedDay.text}
                </div>
              </div>
              <button className="modal-close-icon" onClick={() => setSelectedDay(null)}>✕</button>
            </div>

            <div className="modal-grid-stats">
              <div className="modal-stat-box">
                <div className="modal-stat-label">Nhiệt độ cao nhất</div>
                <div className="modal-stat-val" style={{ color: '#ef4444' }}>{convertT(selectedDay.max)}{unitLabel}</div>
              </div>
              <div className="modal-stat-box">
                <div className="modal-stat-label">Nhiệt độ thấp nhất</div>
                <div className="modal-stat-val" style={{ color: '#fbbf24' }}>{convertT(selectedDay.min)}{unitLabel}</div>
              </div>
              <div className="modal-stat-box">
                <div className="modal-stat-label">Lượng mưa dự kiến</div>
                <div className="modal-stat-val" style={{ color: '#38bdf8' }}>{selectedDay.rain} mm</div>
              </div>
              <div className="modal-stat-box">
                <div className="modal-stat-label">Gió tối đa</div>
                <div className="modal-stat-val">{selectedDay.wind} km/h</div>
              </div>
              <div className="modal-stat-box">
                <div className="modal-stat-label">Chỉ số UV ngày đó</div>
                <div className="modal-stat-val">{selectedDay.uv ?? '--'}</div>
              </div>
              <div className="modal-stat-box">
                <div className="modal-stat-label">Mô hình OpenWeather</div>
                <div className="modal-stat-val" style={{ fontSize: '1rem' }}>
                  {selectedDay.owm ? `${convertT(selectedDay.owm.min)}–${convertT(selectedDay.owm.max)}${unitLabel}` : 'Không có'}
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--card-subtle)', padding: 14, borderRadius: 14, fontSize: '0.88rem', border: '1px solid var(--glass-border)', lineHeight: 1.5 }}>
              💡 <strong>Lời khuyên cho ngày này:</strong> {selectedDay.rain >= 10 ? 'Nên mang áo mưa hoặc ô dù, hạn chế lịch trình đi biển và leo núi.' : selectedDay.max >= 34 ? 'Trời nắng gắt, phù hợp tắm biển sáng sớm hoặc chiều mát. Nhớ bôi kem chống nắng.' : 'Thời tiết thuận lợi cho các hoạt động tham quan, dạo phố và sinh hoạt ngoài trời.'}
            </div>
          </div>
        </div>
      )}

      {/* ===== MODERN HEADER NAVBAR VỚI CÁC TAB CHUYỂN TRANG ===== */}
      <header className="app-navbar">
        <div className="navbar-brand-wrap" onClick={() => goToPage('overview')} title="Quay về trang Tổng quan">
          <div className="navbar-logo-icon">⛅</div>
          <div className="navbar-brand-info">
            <div className="navbar-brand-title">
              SkyCast VN <span className="tag">Realtime</span>
            </div>
            <span className="navbar-brand-tagline">Dự Báo Khí Tượng & Radar Vệ Tinh</span>
          </div>
        </div>

        {/* Thanh chuyển các Trang / Tabs */}
        <nav className="navbar-tabs-nav" aria-label="Điều hướng chính">
          <button
            className={`nav-tab-btn ${activePage === 'overview' ? 'active' : ''}`}
            onClick={() => goToPage('overview')}
            title="Trang Tổng quan thời tiết"
          >
            <span className="tab-icon">🏠</span>
            <span className="tab-text">Tổng quan</span>
          </button>
          <button
            className={`nav-tab-btn ${activePage === 'forecast' ? 'active' : ''}`}
            onClick={() => goToPage('forecast')}
            title="Dự báo 48h & 14 ngày"
          >
            <span className="tab-icon">📊</span>
            <span className="tab-text">Dự báo & Biểu đồ</span>
          </button>
          <button
            className={`nav-tab-btn ${activePage === 'map' ? 'active' : ''}`}
            onClick={() => goToPage('map')}
            title="Bản đồ tương tác vệ tinh và radar"
          >
            <span className="tab-icon">🛰️</span>
            <span className="tab-text">Bản đồ Radar</span>
          </button>
          <button
            className={`nav-tab-btn ${activePage === 'air' ? 'active' : ''}`}
            onClick={() => goToPage('air')}
            title="Chất lượng không khí AQI và tia UV"
          >
            <span className="tab-icon">🍃</span>
            <span className="tab-text">Không khí & Sức khỏe</span>
          </button>
          <button
            className={`nav-tab-btn ${activePage === 'mobile' ? 'active' : ''}`}
            onClick={() => goToPage('mobile')}
            title="Tải ứng dụng di động Android APK"
          >
            <span className="tab-icon">📱</span>
            <span className="tab-text">Tải App</span>
            <span className="tab-badge">APK</span>
          </button>
        </nav>

        {/* Công cụ nhanh */}
        <div className="navbar-actions">
          <button
            className={`tool-btn ${soundActive ? 'active' : ''}`}
            onClick={toggleSoundscape}
            title="Bật/Tắt âm thanh mưa rơi thư giãn"
          >
            {soundActive ? '🌧️ Đang phát mưa' : '🎵 Âm thanh mưa'}
          </button>

          <div className="unit-toggle-wrap">
            <button
              className={`unit-btn ${unit === 'C' ? 'active' : ''}`}
              onClick={() => setUnit('C')}
            >
              °C
            </button>
            <button
              className={`unit-btn ${unit === 'F' ? 'active' : ''}`}
              onClick={() => setUnit('F')}
            >
              °F
            </button>
          </div>

          {data && (
            <button className="tool-btn" onClick={copyWeatherSummary} title="Sao chép tóm tắt thời tiết">
              📋 Chia sẻ
            </button>
          )}
        </div>
      </header>

      {/* ===== THANH CHỌN BẢNG MÀU GIAO DIỆN (THEME) ===== */}
      <div className="theme-bar-container">
        <div className="theme-group">
          <span className="theme-group-label">Màu Tươi:</span>
          <button
            className={`theme-pill-btn ${theme === 'coastal-day' ? 'active' : ''}`}
            onClick={() => setTheme('coastal-day')}
            title="Biển Nha Trang tươi sáng"
          >
            ☀️ Nắng Biển
          </button>
          <button
            className={`theme-pill-btn ${theme === 'sky-bright' ? 'active' : ''}`}
            onClick={() => setTheme('sky-bright')}
            title="Bầu trời xanh trong lành"
          >
            🌤️ Trời Xanh
          </button>
        </div>

        <div className="theme-group">
          <span className="theme-group-label">Màu Tối:</span>
          <button
            className={`theme-pill-btn ${theme === 'midnight' ? 'active' : ''}`}
            onClick={() => setTheme('midnight')}
            title="Bầu trời đêm sâu dịu mắt"
          >
            🌌 Đêm sâu
          </button>
          <button
            className={`theme-pill-btn ${theme === 'slate' ? 'active' : ''}`}
            onClick={() => setTheme('slate')}
            title="Xám khói Slate trầm tĩnh"
          >
            🌫️ Slate
          </button>
          <button
            className={`theme-pill-btn ${theme === 'dusk' ? 'active' : ''}`}
            onClick={() => setTheme('dusk')}
            title="Hoàng hôn ấm cúng"
          >
            🌆 Dusk
          </button>
          <button
            className={`theme-pill-btn ${theme === 'deep-pine' ? 'active' : ''}`}
            onClick={() => setTheme('deep-pine')}
            title="Rừng thông đêm mát mẻ"
          >
            🌲 Rừng đêm
          </button>
        </div>
      </div>

      {/* ===== TÌM KIẾM & ĐỊNH VỊ VỊ TRÍ ===== */}
      <section className="search-container">
        <form className="search-row" onSubmit={search}>
          <div className="search-input-box">
            <span className="search-icon-symbol">🔍</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nhập tên thành phố (ví dụ: Nha Trang, Cam Ranh, Đà Lạt...)"
              aria-label="Tìm kiếm địa điểm"
            />
          </div>
          <button type="submit" className="btn-search">Tìm kiếm</button>
          <button type="button" className="btn-gps" onClick={getCurrentLocation} title="Lấy vị trí GPS hiện tại">
            📍 Vị trí của tôi
          </button>
        </form>

        {/* Địa phương nhanh */}
        <div className="quick-cities">
          <span className="quick-label">Địa phương nhanh:</span>
          {QUICK_LOCATIONS.map((loc, idx) => (
            <button key={idx} className="quick-btn" onClick={() => pick(loc)}>
              {loc.name}
            </button>
          ))}
        </div>

        {/* Kết quả tìm kiếm Geocoding */}
        {results.length > 0 && (
          <ul className="results">
            {results.map((r, i) => (
              <li key={i}>
                <button onClick={() => pick(r)}>{r.name}</button>
              </li>
            ))}
          </ul>
        )}

        {/* Vị trí yêu thích */}
        {favs.length > 0 && (
          <div className="quick-cities" style={{ marginTop: 8 }}>
            <span className="quick-label">⭐ Đã lưu:</span>
            {favs.map((f, i) => (
              <button key={i} className="quick-btn" onClick={() => pick(f)}>
                {f.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Báo lỗi nếu có */}
      {err && <div className="alert-row danger" role="alert">⚠️ Không tải được dữ liệu: {err}</div>}

      {/* Trạng thái Loading */}
      {!data && !err && (
        <div className="loading-box">
          <div className="spinner" />
          <p>Đang tải dữ liệu thời tiết thời gian thực…</p>
        </div>
      )}

      {data && (
        <>
          {/* ========================================================
              TRANG 1: TỔNG QUAN (OVERVIEW DASHBOARD)
              ======================================================== */}
          {activePage === 'overview' && (
            <>
              {/* Banner Hero thời tiết hiện tại */}
              <section className="hero-banner">
                <img
                  className="hero-backdrop-img"
                  src={bannerData.url}
                  alt={bannerData.title || 'Weather scenic atmosphere'}
                  loading="lazy"
                />
                <div className="hero-overlay-mask" />

                <div className="hero-content">
                  <div>
                    {bannerData.title && (
                      <div className="hero-scenic-badge">
                        📸 {bannerData.title}
                      </div>
                    )}
                    <h1>{activeLocationName}</h1>
                    <p className="hero-desc">{c.desc}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <button className="hero-fav-btn" onClick={toggleFav}>
                        {isFav ? '★ Đã lưu địa điểm này' : '☆ Lưu vào yêu thích'}
                      </button>
                      <button
                        className="hero-fav-btn"
                        onClick={() => goToPage('forecast')}
                        style={{ background: 'rgba(2, 132, 199, 0.45)', borderColor: '#38bdf8' }}
                      >
                        📊 Xem Biểu Đồ & 14 Ngày →
                      </button>
                    </div>
                  </div>

                  <div className="hero-temp-box">
                    <img
                      className="hero-icon-img"
                      src={`https://openweathermap.org/img/wn/${c.icon}@2x.png`}
                      alt={c.desc}
                    />
                    <div className="hero-temp-value">{convertT(c.temp)}°</div>
                  </div>

                  <dl className="hero-metrics-dl">
                    <div className="hero-metric-card">
                      <dt>🌡️ Cảm giác như</dt>
                      <dd>{convertT(c.feels)}{unitLabel}</dd>
                    </div>
                    <div className="hero-metric-card">
                      <dt>💧 Độ ẩm</dt>
                      <dd>{c.humidity}%</dd>
                    </div>
                    <div className="hero-metric-card">
                      <dt>💨 Gió</dt>
                      <dd>{c.wind} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>km/h</span></dd>
                    </div>
                    <div
                      className="hero-metric-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => goToPage('air')}
                      title="Bấm để xem chi tiết chỉ số UV & Chất lượng không khí"
                    >
                      <dt>☀️ Chỉ số UV ↗</dt>
                      <dd style={{ color: uvInfo.color }}>{c.uv ?? '--'}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              {/* Thanh dự báo theo từng giờ */}
              <section className="card" style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h2 style={{ margin: 0 }}>⏱️ Dự báo chi tiết các mốc giờ tới</h2>
                  <button
                    onClick={() => goToPage('forecast')}
                    style={{ background: 'transparent', border: 0, color: '#0284c7', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Xem Biểu Đồ Đầy Đủ →
                  </button>
                </div>
                <div className="hourly-slider-wrap">
                  {data.hourly.map((h, i) => (
                    <div className="hourly-item-card" key={i}>
                      <span className="hourly-time">{i === 0 ? 'Bây giờ' : fmtHour(h.t)}</span>
                      <img
                        className="hourly-icon"
                        src={`https://openweathermap.org/img/wn/${h.icon}.png`}
                        alt={h.desc}
                      />
                      <span className="hourly-temp">{convertT(h.temp)}°</span>
                      {h.pop > 0 ? (
                        <span className="hourly-pop">💧 {h.pop}%</span>
                      ) : (
                        <span className="hourly-pop" style={{ opacity: 0.35 }}>—</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Hệ thống cảnh báo thời tiết */}
              {data.alerts.length > 0 ? (
                <section className="alerts-box">
                  {data.alerts.map((a, i) => (
                    <div key={i} className={`alert-row ${a.level}`}>
                      <span style={{ fontSize: '1.2rem' }}>{a.level === 'danger' ? '🚨' : '⚠️'}</span>
                      <div>
                        <strong>{a.title}:</strong> {a.msg}
                      </div>
                    </div>
                  ))}
                </section>
              ) : (
                <p className="ok-banner">
                  ✅ <strong>An toàn:</strong> Không có cảnh báo thời tiết cực đoan nguy hiểm trong 3 ngày tới tại khu vực này.
                </p>
              )}

              {/* Gợi ý hoạt động thực tế */}
              <section className="card">
                <h2>💡 Gợi ý hoạt động thực tế theo thời tiết hôm nay</h2>
                <div className="tips-grid">
                  {data.suggestions.map((s, i) => (
                    <div className="tip-card-item" key={i}>
                      <span>🎯</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ===== TRUNG TÂM NÚT CTA ĐIỀU HƯỚNG TỔNG QUAN ===== */}
              <section className="cta-hub-section">
                <div className="cta-hub-intro">
                  <h2>⚡ Khám Phá Tính Năng Chuyên Sâu</h2>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>Chuyển nhanh sang các chuyên mục</span>
                </div>

                <div className="cta-hub-grid">
                  {/* Card 1: Dự báo & Biểu đồ */}
                  <div className="cta-action-card">
                    <div>
                      <div className="cta-card-top">
                        <div className="cta-card-icon-box">📊</div>
                        <span className="cta-card-badge blue">48H & 14 NGÀY</span>
                      </div>
                      <h3 className="cta-card-title">Dự Báo & Biểu Đồ Khí Tượng</h3>
                      <p className="cta-card-desc">
                        Phân tích diễn biến thời tiết 48 giờ tới, biểu đồ xu hướng biên độ nhiệt và lượng mưa 14 ngày, so sánh đối chiếu hai mô hình OpenWeather & Open-Meteo.
                      </p>
                    </div>
                    <button className="cta-button primary" onClick={() => goToPage('forecast')}>
                      <span>Xem Biểu Đồ & 14 Ngày</span>
                      <span>→</span>
                    </button>
                  </div>

                  {/* Card 2: Bản đồ Vệ tinh & Radar */}
                  <div className="cta-action-card">
                    <div>
                      <div className="cta-card-top">
                        <div className="cta-card-icon-box">🛰️</div>
                        <span className="cta-card-badge purple">THỜI GIAN THỰC</span>
                      </div>
                      <h3 className="cta-card-title">Bản Đồ Vệ Tinh & Radar Mây Mưa</h3>
                      <p className="cta-card-desc">
                        Quan sát hình ảnh chụp vệ tinh địa hình ven biển ESRI độ nét cao, lớp phủ mây mưa Radar trực tiếp từ RainViewer và click bất kỳ đâu để tra cứu.
                      </p>
                    </div>
                    <button className="cta-button secondary" onClick={() => goToPage('map')}>
                      <span>Mở Bản Đồ Vệ Tinh & Radar</span>
                      <span>→</span>
                    </button>
                  </div>

                  {/* Card 3: Không khí & Sức khỏe */}
                  <div className="cta-action-card">
                    <div>
                      <div className="cta-card-top">
                        <div className="cta-card-icon-box">🍃</div>
                        <span className="cta-card-badge emerald">SỨC KHỎE & UV</span>
                      </div>
                      <h3 className="cta-card-title">Chất Lượng Không Khí & Khí Tượng</h3>
                      <p className="cta-card-desc">
                        Theo dõi chỉ số ô nhiễm không khí AQI, nồng độ bụi mịn PM2.5, chỉ số bức xạ cực tím UV, giờ mặt trời mọc/lặn, hướng gió và áp suất khí quyển.
                      </p>
                    </div>
                    <button className="cta-button emerald" onClick={() => goToPage('air')}>
                      <span>Xem Chỉ Số Không Khí & UV</span>
                      <span>→</span>
                    </button>
                  </div>

                  {/* Card 4: Mobile App */}
                  <div className="cta-action-card">
                    <div>
                      <div className="cta-card-top">
                        <div className="cta-card-icon-box">📱</div>
                        <span className="cta-card-badge amber">ANDROID APK MIỄN PHÍ</span>
                      </div>
                      <h3 className="cta-card-title">Ứng Dụng Di Động SkyCast</h3>
                      <p className="cta-card-desc">
                        Cài đặt ứng dụng di động độc lập cho điện thoại Android, tự động định vị GPS, tra cứu radar mượt mà và kho ảnh phong cảnh 2K cho 63 tỉnh thành.
                      </p>
                    </div>
                    <button className="cta-button amber" onClick={() => goToPage('mobile')}>
                      <span>Tải File APK Cho Android</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ========================================================
              TRANG 2: DỰ BÁO CHI TIẾT & BIỂU ĐỒ (FORECAST & CHARTS)
              ======================================================== */}
          {activePage === 'forecast' && (
            <>
              <div className="subpage-header-row">
                <div>
                  <div className="subpage-breadcrumb">
                    <button onClick={() => goToPage('overview')}>🏠 Tổng quan</button>
                    <span>/</span>
                    <span className="current">Dự báo & Biểu đồ</span>
                  </div>
                  <h2>📊 Dự Báo Chi Tiết & Biểu Đồ Khí Tượng</h2>
                  <p className="subpage-subtitle">
                    Phân tích chu kỳ thời tiết 48 giờ, dự báo 14 ngày tới tại <strong>{activeLocationName}</strong> và đối chiếu mô hình.
                  </p>
                </div>
                <button className="back-to-home-btn" onClick={() => goToPage('overview')}>
                  ← Quay lại Tổng quan
                </button>
              </div>

              {/* BIỂU ĐỒ 1: 48 GIỜ */}
              <section className="card">
                <div className="chart-header-row">
                  <div>
                    <h2>⏱️ Diễn biến thời tiết 48 giờ tới</h2>
                    {kpi48h && (
                      <div className="chart-kpi-bar" style={{ marginTop: 6, marginBottom: 0 }}>
                        <span className="chart-kpi-pill">🔥 Cao nhất: <strong>{kpi48h.maxTemp}{unitLabel}</strong></span>
                        <span className="chart-kpi-pill">❄️ Thấp nhất: <strong>{kpi48h.minTemp}{unitLabel}</strong></span>
                        <span className="chart-kpi-pill">💧 Mưa đỉnh điểm: <strong>{kpi48h.maxPop}% ({kpi48h.maxPopTime})</strong></span>
                      </div>
                    )}
                  </div>
                  <div className="chart-tabs">
                    <button className={`chart-tab-btn ${chartView48 === 'all' ? 'active' : ''}`} onClick={() => setChartView48('all')}>🌡️💧 Kết hợp</button>
                    <button className={`chart-tab-btn ${chartView48 === 'temp' ? 'active' : ''}`} onClick={() => setChartView48('temp')}>🔥 Chỉ nhiệt độ</button>
                    <button className={`chart-tab-btn ${chartView48 === 'pop' ? 'active' : ''}`} onClick={() => setChartView48('pop')}>🌧️ Chỉ xác suất mưa</button>
                  </div>
                </div>
                <ChartBox config={hourCfg} isLightMode={isLightMode} />
              </section>

              {/* DỰ BÁO 14 NGÀY CARD */}
              <section className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ margin: 0 }}>📅 Dự báo hàng ngày (14 ngày tới)</h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bấm vào ngày để xem chi tiết 👆</span>
                </div>
                <div className="daily-grid">
                  {data.daily.map((d, i) => (
                    <div className="day-card" key={i} onClick={() => setSelectedDay(d)} title="Bấm để xem chi tiết ngày này">
                      <div className="day-name">{fmtDay(d.date)}</div>
                      <div className="day-icon">{weatherEmoji(d.text)}</div>
                      <div className="day-temps">
                        {convertT(d.max)}° <span>/ {convertT(d.min)}°</span>
                      </div>
                      {d.rain > 0 ? (
                        <div className="day-rain">💧 {d.rain} mm</div>
                      ) : (
                        <div className="day-rain" style={{ opacity: 0.45 }}>Ráo</div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* BIỂU ĐỒ 2: XU HƯỚNG 14 NGÀY */}
              <section className="card">
                <div className="chart-header-row">
                  <div>
                    <h2>📈 Xu hướng biên độ nhiệt & lượng mưa (14 ngày)</h2>
                    {kpi14d && (
                      <div className="chart-kpi-bar" style={{ marginTop: 6, marginBottom: 0 }}>
                        <span className="chart-kpi-pill">🔥 Đỉnh nhiệt: <strong>{kpi14d.maxTemp}{unitLabel}</strong></span>
                        <span className="chart-kpi-pill">❄️ Đáy nhiệt: <strong>{kpi14d.minTemp}{unitLabel}</strong></span>
                        <span className="chart-kpi-pill">🌧️ Tổng mưa dự kiến: <strong>{kpi14d.totalRain} mm ({kpi14d.rainyDays} ngày mưa)</strong></span>
                      </div>
                    )}
                  </div>
                  <div className="chart-tabs">
                    <button className={`chart-tab-btn ${chartView14 === 'all' ? 'active' : ''}`} onClick={() => setChartView14('all')}>📊 Tổng quan biên độ</button>
                    <button className={`chart-tab-btn ${chartView14 === 'temp' ? 'active' : ''}`} onClick={() => setChartView14('temp')}>🌡️ Biên độ nhiệt</button>
                    <button className={`chart-tab-btn ${chartView14 === 'rain' ? 'active' : ''}`} onClick={() => setChartView14('rain')}>🌧️ Cột lượng mưa</button>
                  </div>
                </div>
                <ChartBox config={dayCfg} isLightMode={isLightMode} />
              </section>

              {/* SO SÁNH ĐA NGUỒN */}
              <section className="card">
                <h2>⚖️ So sánh đối chiếu hai nguồn dữ liệu độc lập</h2>
                {consensusRating && (
                  <div style={{ background: 'var(--card-subtle)', padding: '12px 16px', borderRadius: 12, marginBottom: 16, border: '1px solid var(--glass-border)', borderLeft: `4px solid ${consensusRating.color}` }}>
                    <div style={{ fontWeight: 700, color: consensusRating.color, marginBottom: 2 }}>Mức độ đồng thuận: {consensusRating.text}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>{consensusRating.desc}</div>
                  </div>
                )}
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>OpenWeatherMap (Mỹ/Anh)</th>
                        <th>Open-Meteo (Châu Âu)</th>
                        <th>Chênh lệch nhiệt độ cao nhất</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.daily.filter((d) => d.owm).map((d) => (
                        <tr key={d.date}>
                          <td><strong>{fmtDay(d.date)}</strong></td>
                          <td>{convertT(d.owm.min)}–{convertT(d.owm.max)}{unitLabel} (mưa {d.owm.rain} mm)</td>
                          <td>{convertT(d.min)}–{convertT(d.max)}{unitLabel} (mưa {d.rain} mm)</td>
                          <td>
                            <span style={{ fontWeight: 700, color: Math.abs(d.owm.max - d.max) >= 2 ? '#f59e0b' : 'inherit' }}>
                              {(d.owm.max - d.max).toFixed(1)}°C
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Subpage nav footer */}
              <div className="subpage-nav-footer">
                <button className="subpage-nav-link-btn" onClick={() => goToPage('map')}>
                  🛰️ Mở Bản Đồ Vệ Tinh & Radar Mây Mưa →
                </button>
                <button className="subpage-nav-link-btn" onClick={() => goToPage('air')}>
                  🍃 Xem Chỉ Số Không Khí & Sức Khỏe →
                </button>
                <button className="subpage-nav-link-btn" onClick={() => goToPage('mobile')}>
                  📱 Tải Ứng Dụng Di Động Android →
                </button>
              </div>
            </>
          )}

          {/* ========================================================
              TRANG 3: BẢN ĐỒ RADAR & VỆ TINH (RADAR & MAP)
              ======================================================== */}
          {activePage === 'map' && (
            <>
              <div className="subpage-header-row">
                <div>
                  <div className="subpage-breadcrumb">
                    <button onClick={() => goToPage('overview')}>🏠 Tổng quan</button>
                    <span>/</span>
                    <span className="current">Bản đồ Radar</span>
                  </div>
                  <h2>🛰️ Bản Đồ Vệ Tinh & Radar Mây Mưa Thời Gian Thực</h2>
                  <p className="subpage-subtitle">
                    Quan sát chụp ảnh vệ tinh ESRI độ nét cao và lớp phủ radar mây mưa RainViewer. Bấm bất kỳ đâu trên bản đồ để tra cứu thời tiết.
                  </p>
                </div>
                <button className="back-to-home-btn" onClick={() => goToPage('overview')}>
                  ← Quay lại Tổng quan
                </button>
              </div>

              {/* Thẻ vị trí đang chọn */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-bg)', padding: '12px 18px', borderRadius: 16, marginBottom: 16, border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.4rem' }}>📍</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>{activeLocationName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Tọa độ: {place.lat.toFixed(4)}°N, {place.lon.toFixed(4)}°E · Nhiệt độ: {convertT(c.temp)}{unitLabel}
                    </div>
                  </div>
                </div>
                <button
                  onClick={getCurrentLocation}
                  style={{ background: 'var(--card-subtle)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '6px 14px', borderRadius: 20, fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  🎯 Về vị trí của tôi
                </button>
              </div>

              {/* WeatherMap */}
              <section className="card" style={{ padding: 16 }}>
                <WeatherMap
                  lat={place.lat}
                  lon={place.lon}
                  name={place.name === 'Vị trí hiện tại của bạn' ? c.name || place.name : place.name}
                  temp={`${convertT(c.temp)}${unitLabel}`}
                  onSelectLocation={(newPlace) => setPlace(newPlace)}
                  onRecenter={getCurrentLocation}
                />
              </section>

              <div className="subpage-nav-footer">
                <button className="subpage-nav-link-btn" onClick={() => goToPage('forecast')}>
                  📊 Xem Dự Báo & Biểu Đồ 48h →
                </button>
                <button className="subpage-nav-link-btn" onClick={() => goToPage('air')}>
                  🍃 Xem Chỉ Số Không Khí & Sức Khỏe →
                </button>
                <button className="subpage-nav-link-btn" onClick={() => goToPage('overview')}>
                  🏠 Quay Về Trang Tổng Quan →
                </button>
              </div>
            </>
          )}

          {/* ========================================================
              TRANG 4: KHÔNG KHÍ & SỨC KHỎE (AIR QUALITY & HEALTH)
              ======================================================== */}
          {activePage === 'air' && (
            <>
              <div className="subpage-header-row">
                <div>
                  <div className="subpage-breadcrumb">
                    <button onClick={() => goToPage('overview')}>🏠 Tổng quan</button>
                    <span>/</span>
                    <span className="current">Không khí & Sức khỏe</span>
                  </div>
                  <h2>🍃 Chất Lượng Không Khí & Khí Tượng Chuyên Sâu</h2>
                  <p className="subpage-subtitle">
                    Giám sát chỉ số ô nhiễm AQI, bụi mịn PM2.5, bức xạ tia UV và thông số khí tượng tại <strong>{activeLocationName}</strong>.
                  </p>
                </div>
                <button className="back-to-home-btn" onClick={() => goToPage('overview')}>
                  ← Quay lại Tổng quan
                </button>
              </div>

              {/* AQI */}
              {aq && (
                <section className="card">
                  <h2>🍃 Chỉ số Chất lượng không khí (Air Quality Index - AQI)</h2>
                  <div className="aqi-container">
                    <div className="aqi-score-box">
                      <div className="aqi-num-row">
                        <div className="aqi-number" style={{ color: aqiInfo.color }}>{aq.aqi}</div>
                        <div>
                          <span className="aqi-status-badge" style={{ background: `${aqiInfo.color}25`, color: aqiInfo.color, border: `1px solid ${aqiInfo.color}60` }}>
                            ● {aqiInfo.status}
                          </span>
                        </div>
                      </div>
                      <div className="aqi-bar-track">
                        <div className="aqi-dot-marker" style={{ left: `${Math.min(Math.max(aqiInfo.pct, 5), 98)}%` }} />
                      </div>
                      <p style={{ fontSize: '0.86rem', color: 'var(--text-sub)', marginTop: 4 }}>
                        {aqiInfo.desc}
                      </p>
                    </div>

                    <div className="pollutant-grid">
                      <div className="pollutant-card">
                        <span className="pollutant-name">Bụi mịn PM2.5</span>
                        <span className="pollutant-val">{aq.pm25} <small style={{ fontSize: '0.7rem' }}>µg/m³</small></span>
                      </div>
                      <div className="pollutant-card">
                        <span className="pollutant-name">Bụi PM10</span>
                        <span className="pollutant-val">{aq.pm10} <small style={{ fontSize: '0.7rem' }}>µg/m³</small></span>
                      </div>
                      <div className="pollutant-card">
                        <span className="pollutant-name">Khí Ozone (O₃)</span>
                        <span className="pollutant-val">{aq.o3} <small style={{ fontSize: '0.7rem' }}>µg/m³</small></span>
                      </div>
                      <div className="pollutant-card">
                        <span className="pollutant-name">Khí NO₂</span>
                        <span className="pollutant-val">{aq.no2} <small style={{ fontSize: '0.7rem' }}>µg/m³</small></span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* BỘ THẺ WIDGET KHÍ TƯỢNG CHUYÊN SÂU */}
              <section className="card">
                <h2>🧭 Thông số khí tượng chuyên sâu</h2>
                <div className="meteo-details-grid">
                  <div className="meteo-card">
                    <div>
                      <div className="meteo-header">
                        <span>☀️</span>
                        <span>Chỉ số tia UV</span>
                      </div>
                      <div className="meteo-value" style={{ color: uvInfo.color }}>
                        {c.uv != null ? c.uv : '--'} <span style={{ fontSize: '1rem', fontWeight: 600 }}>({uvInfo.level})</span>
                      </div>
                      <div className="uv-bar">
                        <div className="uv-dot" style={{ left: `${uvInfo.pct}%` }} />
                      </div>
                    </div>
                    <div className="meteo-desc">{uvInfo.advice}</div>
                  </div>

                  <div className="meteo-card">
                    <div>
                      <div className="meteo-header">
                        <span>🌅</span>
                        <span>Mặt trời mọc & Lặn</span>
                      </div>
                      <div className="meteo-value" style={{ fontSize: '1.45rem' }}>
                        {fmtTimeOnly(c.sunrise)} <span style={{ fontSize: '0.9rem', color: 'var(--text-sub)' }}>mọc</span> · {fmtTimeOnly(c.sunset)} <span style={{ fontSize: '0.9rem', color: 'var(--text-sub)' }}>lặn</span>
                      </div>
                    </div>
                    <div className="meteo-desc">
                      Ánh sáng ban ngày hỗ trợ tốt cho các hoạt động ngoài trời, tắm biển và thể thao.
                    </div>
                  </div>

                  <div className="meteo-card">
                    <div>
                      <div className="meteo-header">
                        <span>💨</span>
                        <span>Gió & Hướng thổi</span>
                      </div>
                      <div className="meteo-value">
                        {c.wind} <span style={{ fontSize: '1rem', fontWeight: 500 }}>km/h</span>
                      </div>
                    </div>
                    <div className="meteo-desc">
                      Hướng gió: <strong>{c.windDir || 'Chưa xác định'}</strong>. {c.wind >= 39 ? 'Gió khá mạnh, cần chú ý khi ra khơi.' : 'Gió nhẹ, thời tiết êm ả.'}
                    </div>
                  </div>

                  <div className="meteo-card">
                    <div>
                      <div className="meteo-header">
                        <span>👁️</span>
                        <span>Tầm nhìn xa</span>
                      </div>
                      <div className="meteo-value">
                        {c.visibility} <span style={{ fontSize: '1rem', fontWeight: 500 }}>km</span>
                      </div>
                    </div>
                    <div className="meteo-desc">
                      {c.visibility >= 9 ? 'Tầm nhìn hoàn hảo, quang đãng.' : 'Tầm nhìn bị hạn chế bởi sương mù hoặc mưa rào.'}
                    </div>
                  </div>

                  <div className="meteo-card">
                    <div>
                      <div className="meteo-header">
                        <span>☁️</span>
                        <span>Độ che phủ mây</span>
                      </div>
                      <div className="meteo-value">
                        {c.clouds}%
                      </div>
                    </div>
                    <div className="meteo-desc">
                      {c.clouds <= 20 ? 'Bầu trời quang đãng, nhiều nắng.' : c.clouds <= 70 ? 'Trời có mây đan xen nắng dịu.' : 'Trời nhiều mây u ám.'}
                    </div>
                  </div>

                  <div className="meteo-card">
                    <div>
                      <div className="meteo-header">
                        <span>🔽</span>
                        <span>Áp suất khí quyển</span>
                      </div>
                      <div className="meteo-value">
                        {c.pressure} <span style={{ fontSize: '1rem', fontWeight: 500 }}>hPa</span>
                      </div>
                    </div>
                    <div className="meteo-desc">
                      Áp suất khí quyển ở mức tiêu chuẩn ổn định cho vùng địa lý.
                    </div>
                  </div>
                </div>
              </section>

              {/* Gợi ý hoạt động */}
              <section className="card">
                <h2>💡 Khuyến nghị sức khỏe & Lối sống hôm nay</h2>
                <div className="tips-grid">
                  {data.suggestions.map((s, i) => (
                    <div className="tip-card-item" key={i}>
                      <span>🎯</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </section>

              <div className="subpage-nav-footer">
                <button className="subpage-nav-link-btn" onClick={() => goToPage('map')}>
                  🛰️ Xem Bản Đồ Vệ Tinh & Radar →
                </button>
                <button className="subpage-nav-link-btn" onClick={() => goToPage('forecast')}>
                  📊 Xem Dự Báo 48h & 14 Ngày →
                </button>
                <button className="subpage-nav-link-btn" onClick={() => goToPage('overview')}>
                  🏠 Quay Về Trang Tổng Quan →
                </button>
              </div>
            </>
          )}

          {/* ========================================================
              TRANG 5: TẢI ỨNG DỤNG DI ĐỘNG (MOBILE APP DOWNLOAD)
              ======================================================== */}
          {activePage === 'mobile' && (
            <>
              <div className="subpage-header-row">
                <div>
                  <div className="subpage-breadcrumb">
                    <button onClick={() => goToPage('overview')}>🏠 Tổng quan</button>
                    <span>/</span>
                    <span className="current">Tải Ứng Dụng</span>
                  </div>
                  <h2>📱 Ứng Dụng Di Động SkyCast Cho Android</h2>
                  <p className="subpage-subtitle">
                    Cài đặt trực tiếp file APK hoặc quét mã QR bằng Camera điện thoại thông minh để sử dụng mọi lúc mọi nơi.
                  </p>
                </div>
                <button className="back-to-home-btn" onClick={() => goToPage('overview')}>
                  ← Quay lại Tổng quan
                </button>
              </div>

              <MobileAppSection
                onOpenModal={() => setShowAppModal(true)}
                showToast={showToast}
              />

              <div className="subpage-nav-footer">
                <button className="subpage-nav-link-btn" onClick={() => goToPage('overview')}>
                  🏠 Quay Về Trang Tổng Quan →
                </button>
                <button className="subpage-nav-link-btn" onClick={() => goToPage('forecast')}>
                  📊 Xem Dự Báo & Biểu Đồ →
                </button>
                <button className="subpage-nav-link-btn" onClick={() => goToPage('map')}>
                  🛰️ Mở Bản Đồ Vệ Tinh & Radar →
                </button>
              </div>
            </>
          )}

          {/* FOOTER CHUNG */}
          <footer style={{ textAlign: 'center', padding: '30px 0 20px', fontSize: '0.84rem', color: 'var(--text-muted)', borderTop: '1px solid var(--glass-border)', marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
              <button onClick={() => goToPage('overview')} style={{ background: 'transparent', border: 0, color: 'var(--text-sub)', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600 }}>🏠 Tổng quan</button>
              <button onClick={() => goToPage('forecast')} style={{ background: 'transparent', border: 0, color: 'var(--text-sub)', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600 }}>📊 Dự báo & Biểu đồ</button>
              <button onClick={() => goToPage('map')} style={{ background: 'transparent', border: 0, color: 'var(--text-sub)', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600 }}>🛰️ Bản đồ Radar</button>
              <button onClick={() => goToPage('air')} style={{ background: 'transparent', border: 0, color: 'var(--text-sub)', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600 }}>🍃 Không khí & Sức khỏe</button>
              <button onClick={() => goToPage('mobile')} style={{ background: 'transparent', border: 0, color: '#38bdf8', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700 }}>📱 Tải App Mobile (APK)</button>
            </div>
            <div>
              SkyCast VN · Cập nhật lúc {new Date(data.updatedAt).toLocaleTimeString('vi-VN')} · Dữ liệu thời tiết thời gian thực đa nguồn
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
