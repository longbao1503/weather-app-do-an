# Ứng dụng dự báo thời tiết thông minh (Đồ án chuyên ngành)

React + Node.js/Express + Redis (Upstash) + OpenWeatherMap + Open-Meteo + Chart.js.

## Luồng dữ liệu (đúng lưu đồ trong đề cương)
Frontend lấy Geolocation -> `/api/weather` -> kiểm tra Redis (TTL 15 phút) -> HIT: trả ngay / MISS: gọi API gốc, lưu Redis, trả về.
Mỗi phản hồi có `meta.cache` (HIT/MISS) và `meta.ms` để đo hiệu năng cho Chương 3.

## Chạy local
1. Lấy key OpenWeatherMap (openweathermap.org, mục API keys) và tạo database Redis ở upstash.com (copy REST URL + Token).
2. `cp server/.env.example server/.env` rồi điền giá trị.
3. `npm run install:all`
4. Terminal 1: `npm run dev:server`  |  Terminal 2: `npm run dev:client` -> mở http://localhost:5173

## Deploy (GitHub -> Render)
1. Đẩy code lên GitHub.
2. Render -> New Web Service -> chọn repo.
   - Build Command: `npm run install:all && npm run build`
   - Start Command: `npm start`
   - Environment: `OWM_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
3. Server tự phục vụ bản build React, chỉ cần 1 service.

## Đo hiệu năng cache (Chương 3)
Gọi `/api/weather?lat=12.24&lon=109.20` hai lần liên tiếp: lần 1 `MISS` (vài trăm ms), lần 2 `HIT` (vài chục ms). Ghi lại nhiều lần để lấy trung bình.
Để so sánh "không cache", đặt `CACHE_TTL=1`.
