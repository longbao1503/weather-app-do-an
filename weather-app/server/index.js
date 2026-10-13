import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Redis } from '@upstash/redis';

const { OWM_KEY, UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token, PORT = 3001, CACHE_TTL = 900 } = process.env;

/* ---------- Lớp cache: Upstash Redis (fallback RAM khi chưa cấu hình) ---------- */
const redis = url && token ? new Redis({ url, token }) : null;
const mem = new Map();
const cacheGet = async (k) => {
  if (redis) return redis.get(k);
  const e = mem.get(k);
  return e && e.exp > Date.now() ? e.v : null;
};
const cacheSet = async (k, v, ttl = +CACHE_TTL) =>
  redis ? redis.set(k, v, { ex: ttl }) : mem.set(k, { v, exp: Date.now() + ttl * 1000 });

const getJson = async (u, retries = 1) => {
  for (let i = 0; i <= retries; i++) {
    const r = await fetch(u);
    if (r.status === 429 && i < retries) {
      await new Promise((res) => setTimeout(res, 1000));
      continue;
    }
    if (!r.ok) throw new Error(`API lỗi ${r.status}: ${u.split('?')[0]}`);
    return r.json();
  }
};

/* ---------- Tiện ích ---------- */
const WMO = (c) => c === 0 ? 'Trời quang' : c <= 3 ? 'Có mây' : c <= 48 ? 'Sương mù' : c <= 57 ? 'Mưa phùn'
  : c <= 67 ? 'Mưa' : c <= 77 ? 'Tuyết' : c <= 82 ? 'Mưa rào' : c <= 86 ? 'Tuyết rơi' : 'Dông';
const r1 = (n) => Math.round(n * 10) / 10;

/* ---------- Hệ thống gợi ý hoạt động phong phú (đúng 6 mục đối xứng) ---------- */
function suggest(c, today) {
  const rainy = (c.id >= 300 && c.id < 600) || (today?.rain || 0) >= 3;
  const isThunder = c.id >= 200 && c.id < 300;
  const isHot = c.temp >= 34;
  const isCold = c.temp < 19;

  const out = [];

  if (isThunder) {
    out.push('Ở trong nhà kiên cố, tránh xa cửa sổ và khu vực trũng ngập');
    out.push('Tạm hoãn hoạt động đi biển, leo núi hoặc chèo thuyền');
    out.push('Xem phim hoặc thưởng thức chương trình giải trí trong nhà');
    out.push('Giao lưu boardgame hoặc trò chuyện ấm cúng cùng người thân');
    out.push('Đọc sách thư giãn và nghỉ ngơi phục hồi năng lượng');
    out.push('Kiểm tra an toàn các thiết bị điện và cửa sổ trong nhà');
    return out;
  }
  
  if (rainy) {
    out.push('Thưởng thức lẩu nóng hoặc món nướng đặc sản ấm cúng');
    out.push('Tham quan workshop làm gốm, vẽ tranh sáng tạo');
    out.push('Xem phim bom tấn rạp chiếu phim công nghệ mới');
    out.push('Thư giãn massage đá nóng hoặc xông hơi thảo mộc');
    out.push('Tự nấu ăn tại nhà sum vầy cùng gia đình');
    out.push('Trang bị áo mưa chuẩn chống thấm và giữ khoảng cách lái xe an toàn');
    return out;
  }
  
  if (isHot) {
    out.push('Bơi lội giải nhiệt hoặc tắm biển sáng sớm và sau 16h30');
    out.push('Thưởng thức trà trái cây nhiệt đới giải nhiệt cơ thể');
    out.push('Xem phim rạp hoặc tham quan triển lãm nghệ thuật mát mẻ');
    out.push('Tập gym, yoga hoặc thể thao trong phòng tập máy lạnh');
    out.push('Khám phá chợ đêm ẩm thực khi trời dịu mát về tối');
    out.push('Tránh ra nắng gắt từ 11h-15h, thoa kem chống nắng SPF 50+');
    return out;
  }
  
  if (isCold) {
    out.push('Thưởng thức tô phở nóng hổi hoặc nồi lẩu nghi ngút khói');
    out.push('Tản bộ ngắm cảnh se lạnh và uống trà gừng mật ong');
    out.push('Workshop nghệ thuật thủ công hoặc rạp chiếu phim ấm cúng');
    out.push('Giao lưu boardgame hoặc cafe acoustic thư giãn');
    out.push('Tập yoga kéo giãn cơ hoặc rèn luyện thể lực trong nhà');
    out.push('Mặc áo khoác giữ ấm ngực cổ và đội mũ len khi ra gió');
    return out;
  }

  // Tiết trời đẹp / râm mát / thoáng đãng
  out.push('Chèo SUP, lặn biển hoặc khám phá thiên nhiên');
  out.push('Thưởng thức ẩm thực đường phố và trà chiều thư thái');
  out.push('Tham gia workshop nghệ thuật hoặc dạo bảo tàng di sản');
  out.push('Chạy bộ, đạp xe rèn luyện sức bền ven công viên hoặc ven biển');
  out.push('Cắm trại dã ngoại và tiệc nướng BBQ ngoài trời');
  out.push('Tận hưởng không khí trong lành, thoa kem chống nắng bảo vệ da');
  return out;
}

/* ---------- Hệ thống cảnh báo thời tiết nguy hiểm ---------- */
function alerts(c, daily) {
  const out = [];
  if (c.id >= 200 && c.id < 300) out.push({ level: 'danger', title: 'Có dông', msg: 'Đang có dông sét, hạn chế ra ngoài trời.' });
  if (c.wind >= 62) out.push({ level: 'danger', title: 'Gió rất mạnh (cấp 8 trở lên)', msg: `Gió ${c.wind} km/h.` });
  else if (c.wind >= 39) out.push({ level: 'warn', title: 'Gió mạnh', msg: `Gió ${c.wind} km/h.` });
  daily.slice(0, 3).forEach((d, i) => {
    const when = i === 0 ? 'Hôm nay' : `Ngày ${d.date.slice(5)}`;
    if (d.rain >= 100) out.push({ level: 'danger', title: 'Mưa rất to', msg: `${when}: dự báo ${d.rain} mm.` });
    else if (d.rain >= 50) out.push({ level: 'warn', title: 'Mưa to', msg: `${when}: dự báo ${d.rain} mm.` });
    if (d.max >= 37) out.push({ level: 'warn', title: 'Nắng nóng', msg: `${when}: tối đa ${d.max}°C.` });
    if (d.wind >= 62) out.push({ level: 'danger', title: 'Nguy cơ bão / gió giật mạnh', msg: `${when}: gió tối đa ${d.wind} km/h.` });
  });
  return out;
}

const windDir = (deg) => deg == null ? '' : ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc'][Math.round(deg / 45) % 8];

/* ---------- Gọi API gốc (chỉ chạy khi cache MISS) ---------- */
async function fetchAll(lat, lon) {
  const [cur, fc, om, aq] = await Promise.all([
    getJson(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=vi&appid=${OWM_KEY}`),
    getJson(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=vi&appid=${OWM_KEY}`),
    getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&forecast_days=14&timezone=auto&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,uv_index_max`).catch((err) => {
      console.warn('Open-Meteo 429 rate limit - Fallback sang OpenWeatherMap:', err.message);
      return null;
    }),
    getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&timezone=auto`).catch(() => null),
  ]);

  // Gộp dự báo 3 giờ của OpenWeatherMap thành theo ngày
  const owmDaily = {};
  for (const i of fc.list) {
    const d = new Date((i.dt + fc.city.timezone) * 1000).toISOString().slice(0, 10);
    const o = (owmDaily[d] ??= {
      max: -99,
      min: 99,
      rain: 0,
      text: i.weather?.[0]?.description || 'Có mây',
      wind: (i.wind?.speed || 0) * 3.6,
    });
    o.max = Math.max(o.max, i.main.temp_max);
    o.min = Math.min(o.min, i.main.temp_min);
    o.rain += i.rain?.['3h'] || 0;
  }

  let daily = [];
  if (om?.daily?.time) {
    const D = om.daily;
    daily = D.time.map((date, i) => ({
      date,
      text: WMO(D.weathercode[i]),
      max: D.temperature_2m_max[i],
      min: D.temperature_2m_min[i],
      rain: D.precipitation_sum[i],
      wind: D.windspeed_10m_max[i],
      uv: D.uv_index_max?.[i] != null ? r1(D.uv_index_max[i]) : null,
      owm: owmDaily[date]
        ? { max: r1(owmDaily[date].max), min: r1(owmDaily[date].min), rain: r1(owmDaily[date].rain) }
        : null,
    }));
  } else {
    // Fallback: Sử dụng dữ liệu dự báo ngày từ OpenWeatherMap khi Open-Meteo bị 429 rate limit
    daily = Object.entries(owmDaily).map(([date, o]) => ({
      date,
      text: o.text,
      max: r1(o.max),
      min: r1(o.min),
      rain: r1(o.rain),
      wind: r1(o.wind),
      uv: 5,
      owm: { max: r1(o.max), min: r1(o.min), rain: r1(o.rain) },
    }));
  }

  const uvToday = om?.daily?.uv_index_max?.[0] != null
    ? r1(om.daily.uv_index_max[0])
    : (cur.clouds?.all > 70 ? 3 : 6);

  const current = {
    id: cur.weather[0].id,
    desc: cur.weather[0].description,
    icon: cur.weather[0].icon,
    temp: r1(cur.main.temp),
    feels: r1(cur.main.feels_like),
    humidity: cur.main.humidity,
    wind: r1(cur.wind.speed * 3.6),
    windDir: windDir(cur.wind?.deg),
    pressure: cur.main.pressure,
    visibility: cur.visibility ? r1(cur.visibility / 1000) : 10,
    clouds: cur.clouds?.all ?? 0,
    sunrise: cur.sys?.sunrise,
    sunset: cur.sys?.sunset,
    uv: uvToday,
    name: cur.name,
    country: cur.sys?.country,
  };
  const hourly = fc.list.slice(0, 16).map((i) => ({
    t: i.dt, temp: r1(i.main.temp), pop: Math.round((i.pop || 0) * 100),
    icon: i.weather?.[0]?.icon || '02d', desc: i.weather?.[0]?.description || '',
    wind: r1(i.wind?.speed * 3.6),
  }));

  const airQuality = aq?.current ? {
    aqi: aq.current.us_aqi,
    pm25: r1(aq.current.pm2_5),
    pm10: r1(aq.current.pm10),
    o3: r1(aq.current.ozone),
    no2: r1(aq.current.nitrogen_dioxide),
  } : null;

  return { current, hourly, daily, airQuality, alerts: alerts(current, daily), suggestions: suggest(current, daily[0]), updatedAt: Date.now() };
}

/* ---------- API ---------- */
const app = express();
app.use(cors(), express.json());

app.get('/api/weather', async (req, res) => {
  const t0 = Date.now();
  const lat = +req.query.lat, lon = +req.query.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'Thiếu hoặc sai lat/lon' });
  if (!OWM_KEY) return res.status(500).json({ error: 'Chưa cấu hình OWM_KEY trong server/.env' });
  const key = `wx:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  try {
    let data = await cacheGet(key);
    const hit = !!data;
    if (!hit) { data = await fetchAll(lat, lon); await cacheSet(key, data); }
    res.json({ ...data, meta: { cache: hit ? 'HIT' : 'MISS', ms: Date.now() - t0, store: redis ? 'upstash' : 'memory' } });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const key = `geo:${q.toLowerCase()}`;
  try {
    let list = await cacheGet(key);
    if (!list) {
      const g = await getJson(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=5&appid=${OWM_KEY}`);
      list = g.map((x) => ({ name: [x.name, x.state, x.country].filter(Boolean).join(', '), lat: x.lat, lon: x.lon }));
      await cacheSet(key, list, 86400);
    }
    res.json(list);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT} | cache: ${redis ? 'Upstash Redis' : 'RAM (chưa cấu hình Upstash)'}`));
