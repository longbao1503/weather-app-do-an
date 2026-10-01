import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';

const DEFAULT = { name: 'Nha Trang, Khánh Hòa', lat: 12.2388, lon: 109.1967 };
const fmtDay = (d) => new Date(d).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtHour = (t) => new Date(t * 1000).toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit' });

/* Chart.js bọc trong 1 component: tạo lại biểu đồ khi dữ liệu đổi */
function ChartBox({ config }) {
  const ref = useRef();
  useEffect(() => {
    const c = new Chart(ref.current, config);
    return () => c.destroy();
  }, [config]);
  return <div className="chart"><canvas ref={ref} /></div>;
}

export default function App() {
  const [place, setPlace] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [favs, setFavs] = useState(() => JSON.parse(localStorage.getItem('favs') || '[]'));

  // Geolocation tự động khi mở trang
  useEffect(() => {
    if (!navigator.geolocation) return setPlace(DEFAULT);
    navigator.geolocation.getCurrentPosition(
      (p) => setPlace({ name: 'Vị trí của bạn', lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setPlace(DEFAULT), { timeout: 8000 });
  }, []);

  // Tải dữ liệu, tự làm mới mỗi 10 phút
  useEffect(() => {
    if (!place) return;
    let off = false;
    const load = () => fetch(`https://weather-app-backend-335r.onrender.com/api/weather?lat=${place.lat}&lon=${place.lon}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j.error)))))
      .then((j) => !off && (setData(j), setErr('')))
      .catch((e) => !off && setErr(e.message));
    setData(null); load();
    const id = setInterval(load, 600000);
    return () => { off = true; clearInterval(id); };
  }, [place]);

  const search = async (e) => {
    e.preventDefault();
    setResults(await fetch(`https://weather-app-backend-335r.onrender.com/api/geocode?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => []));
  };
  const pick = (p) => { setPlace(p); setResults([]); setQ(''); };
  const isFav = place && favs.some((f) => f.lat === place.lat && f.lon === place.lon);
  const toggleFav = () => {
    const next = isFav ? favs.filter((f) => f.lat !== place.lat || f.lon !== place.lon) : [...favs, place];
    setFavs(next); localStorage.setItem('favs', JSON.stringify(next));
  };

  const c = data?.current;
  const hourCfg = data && {
    type: 'line',
    data: { labels: data.hourly.map((h) => fmtHour(h.t)), datasets: [
      { label: 'Nhiệt độ (°C)', data: data.hourly.map((h) => h.temp), borderColor: '#e8892b', backgroundColor: '#e8892b33', fill: true, tension: .35, yAxisID: 'y' },
      { label: 'Khả năng mưa (%)', data: data.hourly.map((h) => h.pop), borderColor: '#2b7fa6', borderDash: [4, 4], tension: .35, yAxisID: 'y1' }] },
    options: { maintainAspectRatio: false, scales: { y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false } } } },
  };
  const dayCfg = data && {
    data: { labels: data.daily.map((d) => fmtDay(d.date)), datasets: [
      { type: 'bar', label: 'Lượng mưa (mm)', data: data.daily.map((d) => d.rain), backgroundColor: '#2b7fa655', yAxisID: 'y1' },
      { type: 'line', label: 'Cao nhất (°C)', data: data.daily.map((d) => d.max), borderColor: '#d2452b', tension: .3, yAxisID: 'y' },
      { type: 'line', label: 'Thấp nhất (°C)', data: data.daily.map((d) => d.min), borderColor: '#e8892b', tension: .3, yAxisID: 'y' }] },
    options: { maintainAspectRatio: false, scales: { y1: { position: 'right', grid: { drawOnChartArea: false } } } },
  };

  return (
    <main>
      <header className="top">
        <form onSubmit={search}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm thành phố, ví dụ: Cam Ranh" aria-label="Tìm địa điểm" />
          <button>Tìm</button>
        </form>
        {results.length > 0 && <ul className="results">{results.map((r, i) => <li key={i}><button onClick={() => pick(r)}>{r.name}</button></li>)}</ul>}
        {favs.length > 0 && <div className="favs">{favs.map((f, i) => <button key={i} onClick={() => pick(f)}>{f.name}</button>)}</div>}
      </header>

      {err && <p className="err" role="alert">Không tải được dữ liệu: {err}</p>}
      {!data && !err && <p className="muted">Đang tải thời tiết…</p>}

      {data && <>
        <section className="hero">
          <div>
            <h1>{place.name === 'Vị trí của bạn' ? c.name || place.name : place.name}</h1>
            <p className="desc">{c.desc}</p>
            <button className="fav" onClick={toggleFav}>{isFav ? 'Bỏ khỏi yêu thích' : 'Lưu vị trí yêu thích'}</button>
          </div>
          <div className="temp"><img src={`https://openweathermap.org/img/wn/${c.icon}@2x.png`} alt="" />{Math.round(c.temp)}°</div>
          <dl>
            <div><dt>Cảm giác như</dt><dd>{Math.round(c.feels)}°C</dd></div>
            <div><dt>Độ ẩm</dt><dd>{c.humidity}%</dd></div>
            <div><dt>Gió</dt><dd>{c.wind} km/h</dd></div>
            <div><dt>Áp suất</dt><dd>{c.pressure} hPa</dd></div>
          </dl>
        </section>

        {data.alerts.length > 0
          ? <section className="alerts">{data.alerts.map((a, i) => <div key={i} className={`alert ${a.level}`}><b>{a.title}</b> {a.msg}</div>)}</section>
          : <p className="ok">Không có cảnh báo thời tiết nguy hiểm trong 3 ngày tới.</p>}

        <section className="card"><h2>Gợi ý cho hôm nay</h2><ul className="tips">{data.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></section>
        <section className="card"><h2>Nhiệt độ và khả năng mưa 48 giờ tới</h2><ChartBox config={hourCfg} /></section>
        <section className="card"><h2>Dự báo 14 ngày</h2><ChartBox config={dayCfg} /></section>

        <section className="card">
          <h2>So sánh hai nguồn dự báo</h2>
          <div className="scroll"><table>
            <thead><tr><th>Ngày</th><th>OpenWeatherMap</th><th>Open-Meteo</th><th>Chênh nhiệt độ cao nhất</th></tr></thead>
            <tbody>{data.daily.filter((d) => d.owm).map((d) => (
              <tr key={d.date}><td>{fmtDay(d.date)}</td>
                <td>{d.owm.min}–{d.owm.max}°C, mưa {d.owm.rain} mm</td>
                <td>{d.min}–{d.max}°C, mưa {d.rain} mm</td>
                <td>{(d.owm.max - d.max).toFixed(1)}°C</td></tr>))}</tbody>
          </table></div>
        </section>

        <footer className="muted">
          Cập nhật {new Date(data.updatedAt).toLocaleTimeString('vi-VN')} · Cache {data.meta.cache} ({data.meta.store}) · {data.meta.ms} ms
        </footer>
      </>}
    </main>
  );
}
