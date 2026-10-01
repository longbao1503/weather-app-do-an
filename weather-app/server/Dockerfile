# Sử dụng môi trường Node.js nhẹ nhất
FROM node:18-alpine

# Tạo thư mục làm việc trong container
WORKDIR /app

# Copy 2 file cấu hình vào trước để cài đặt thư viện
COPY package*.json ./
RUN npm install --production

# Copy toàn bộ code gốc vào container
COPY . .

# Mở cổng 10000 (cổng mà bạn đang dùng)
EXPOSE 10000

# Lệnh khởi động máy chủ
CMD ["node", "index.js"]