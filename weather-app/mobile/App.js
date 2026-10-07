import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, FlatList, Image, ImageBackground, RefreshControl, Animated,
  StatusBar, Platform, Dimensions, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchWeather, fetchGeocode } from './src/api';
import {
  fmtDay, fmtHour, fmtTimeOnly, weatherEmoji,
  getUvInfo, getAqiInfo, QUICK_LOCATIONS,
} from './src/utils';
import { getWeatherBannerData } from './src/provinces';

const { width: SCREEN_W } = Dimensions.get('window');

/* ─── Bảng màu cao cấp (Deep Cyber & Coastal Dark) ─── */
const C = {
  bg: '#080e1a',
  bgCard: 'rgba(15, 25, 45, 0.75)',
  cardBorder: 'rgba(255, 255, 255, 0.1)',
  cardBorderHighlight: 'rgba(56, 189, 248, 0.35)',
  textMain: '#f8fafc',
  textSub: '#94a3b8',
  textMuted: '#64748b',
  accent: '#38bdf8',
  accentBlue: '#0284c7',
  accentTemp: '#fbbf24',
  accentRain: '#38bdf8',
  danger: '#ef4444',
  warn: '#f59e0b',
  success: '#22c55e',
  purple: '#a855f7',
};

export default function App() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [location, setLocation] = useState(null); // { lat, lon, name }
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'forecast' | 'search'
  const [selectedDay, setSelectedDay] = useState(null); // modal chi tiết ngày
  const searchTimer = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  /* ─── Tải thời tiết ─── */
  const loadWeather = useCallback(async (loc, isRefresh = false) => {
    if (!loc) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await fetchWeather(loc.lat, loc.lon);
      setWeather(data);
      await AsyncStorage.setItem('lastWeather', JSON.stringify({ data, loc, ts: Date.now() }));
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    } catch (e) {
      setError(e.message);
      try {
        const cached = await AsyncStorage.getItem('lastWeather');
        if (cached) {
          const { data, loc: cachedLoc } = JSON.parse(cached);
          setWeather(data);
          setLocation(cachedLoc);
        }
      } catch {}
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fadeAnim]);

  /* ─── Lấy vị trí GPS ─── */
  const getGpsLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        const def = { lat: 12.2388, lon: 109.1967, name: 'Nha Trang, Khánh Hòa' };
        setLocation(def);
        loadWeather(def);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lon } = pos.coords;
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      const name = geo?.[0]?.city || geo?.[0]?.region || geo?.[0]?.subregion || 'Vị trí hiện tại';
      const loc = { lat, lon, name };
      setLocation(loc);
      loadWeather(loc);
    } catch (e) {
      const def = { lat: 12.2388, lon: 109.1967, name: 'Nha Trang, Khánh Hòa' };
      setLocation(def);
      loadWeather(def);
    }
  }, [loadWeather]);

  /* ─── Khởi động app ─── */
  useEffect(() => {
    AsyncStorage.getItem('lastWeather').then((cached) => {
      if (cached) {
        try {
          const { data, loc } = JSON.parse(cached);
          setWeather(data);
          setLocation(loc);
          fadeAnim.setValue(1);
        } catch {}
      }
    });
    getGpsLocation();
  }, []);

  /* ─── Search debounce ─── */
  useEffect(() => {
    if (searchText.length < 2) { setSuggestions([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchGeocode(searchText);
        setSuggestions(res);
      } catch {}
      setSearching(false);
    }, 400);
  }, [searchText]);

  const selectLocation = (loc) => {
    setLocation(loc);
    setSearchText('');
    setSuggestions([]);
    setActiveTab('home');
    fadeAnim.setValue(0);
    loadWeather(loc);
  };

  const onRefresh = () => loadWeather(location, true);

  /* Banner cảnh quan thực tế theo tỉnh thành */
  const bannerData = useMemo(() => {
    return getWeatherBannerData(location?.name || 'Nha Trang');
  }, [location?.name]);

  /* Đánh giá độ đồng thuận 2 mô hình (OWM vs Open-Meteo) */
  const consensusRating = useMemo(() => {
    if (!weather?.daily) return null;
    const diffs = weather.daily.filter((d) => d.owm).map((d) => Math.abs(d.owm.max - d.max));
    if (diffs.length === 0) return null;
    const avgDiff = (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1);
    if (avgDiff <= 1.5) {
      return { text: 'Rất cao (Đồng thuận 95%)', desc: `Chênh lệch trung bình giữa OWM và Open-Meteo chỉ ${avgDiff}°C. Độ tin cậy rất cao.`, color: '#22c55e' };
    }
    if (avgDiff <= 3.0) {
      return { text: 'Trung bình (Đồng thuận 80%)', desc: `Chênh lệch trung bình ${avgDiff}°C giữa 2 mô hình. Xu hướng chung ổn định.`, color: '#eab308' };
    }
    return { text: 'Biến động cao', desc: `Chênh lệch trung bình ${avgDiff}°C giữa 2 nguồn do thời tiết chuyển mùa nhanh.`, color: '#f97316' };
  }, [weather?.daily]);

  /* ─── HEADER ĐỒ ÁN CHUYÊN NGÀNH TBD ─── */
  const renderAcademicHeader = () => (
    <View style={styles.tbdBar}>
      <View style={styles.tbdLeft}>
        <View style={styles.tbdShield}>
          <Text style={styles.tbdShieldText}>TBD</Text>
        </View>
        <View>
          <Text style={styles.tbdUniName}>ĐH THÁI BÌNH DƯƠNG</Text>
          <Text style={styles.tbdFaculty}>Khoa CNTT & Bán dẫn · Đồ án Chuyên ngành</Text>
        </View>
      </View>
      <View style={styles.tbdRight}>
        <Text style={styles.tbdAuthor}>SV: <Text style={{ color: '#fff', fontWeight: '700' }}>Trần Long Bảo</Text></Text>
        <Text style={styles.tbdTeacher}>GVHD: TS. Phan Thanh Sơn</Text>
      </View>
    </View>
  );

  /* ─── THANH ĐỊA ĐIỂM HIỆN TẠI & GPS ─── */
  const renderLocationBar = () => (
    <View style={styles.locationBar}>
      <View style={styles.locationInfo}>
        <View style={styles.locationRow}>
          <Text style={styles.locationPin}>📍</Text>
          <Text style={styles.locationName} numberOfLines={1}>
            {location?.name || 'Đang xác định vị trí...'}
          </Text>
        </View>
        <Text style={styles.locationUpdated}>
          {weather?.updatedAt
            ? `Cập nhật lúc ${new Date(weather.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
            : 'Đang tải dữ liệu thời gian thực...'}
        </Text>
      </View>

      <TouchableOpacity onPress={getGpsLocation} style={styles.gpsButton} activeOpacity={0.75}>
        <LinearGradient colors={['#0284c7', '#0369a1']} style={styles.gpsGradient}>
          <Text style={styles.gpsIcon}>🎯</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  /* ─── TAB TRANG CHỦ ─── */
  const renderHomeTab = () => {
    if (loading && !weather) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loadingText}>Đang nạp dữ liệu thời tiết thời gian thực...</Text>
        </View>
      );
    }
    if (error && !weather) {
      return (
        <View style={styles.centerContainer}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>⚠️</Text>
          <Text style={styles.errorText}>Không thể kết nối máy chủ: {error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadWeather(location)}>
            <Text style={styles.retryBtnText}>Thử lại ngay</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (!weather) return null;

    const c = weather.current;
    const uvInfo = getUvInfo(c.uv);
    const aqiInfo = getAqiInfo(weather.airQuality?.aqi);

    return (
      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={styles.homeScrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Cảnh báo thời tiết xấu nếu có */}
        {weather.alerts && weather.alerts.length > 0 && (
          <View style={styles.alertsContainer}>
            {weather.alerts.map((a, i) => (
              <LinearGradient
                key={i}
                colors={a.level === 'danger' ? ['rgba(239, 68, 68, 0.25)', 'rgba(153, 27, 27, 0.3)'] : ['rgba(245, 158, 11, 0.25)', 'rgba(180, 83, 9, 0.3)']}
                style={[styles.alertCard, { borderLeftColor: a.level === 'danger' ? C.danger : C.warn }]}
              >
                <Text style={styles.alertTitle}>{a.level === 'danger' ? '🚨' : '⚠️'} {a.title}</Text>
                <Text style={styles.alertMsg}>{a.msg}</Text>
              </LinearGradient>
            ))}
          </View>
        )}

        {/* HERO BANNER CẢNH QUAN 2K THỰC TẾ (NHA TRANG / TỈNH THÀNH) */}
        <View style={styles.heroCardWrapper}>
          <ImageBackground
            source={{ uri: bannerData.url }}
            style={styles.heroImageBg}
            imageStyle={{ borderRadius: 24 }}
          >
            <LinearGradient
              colors={['rgba(8, 14, 26, 0.45)', 'rgba(8, 14, 26, 0.8)', '#080e1a']}
              style={styles.heroOverlayGradient}
            >
              {/* Badge danh thắng cảnh */}
              <View style={styles.scenicBadge}>
                <Text style={styles.scenicBadgeText}>📸 {bannerData.title}</Text>
              </View>

              {/* Nhiệt độ và Icon */}
              <View style={styles.heroMainWeatherRow}>
                <View>
                  <Text style={styles.heroTempValue}>{Math.round(c.temp)}°</Text>
                  <Text style={styles.heroDescText}>{c.desc}</Text>
                </View>
                <View style={styles.heroIconBox}>
                  <Text style={styles.heroEmojiIcon}>{weatherEmoji(c.desc)}</Text>
                </View>
              </View>

              {/* Cảm giác như & Biên độ nhiệt hôm nay */}
              <View style={styles.heroSubStatsRow}>
                <View style={styles.heroStatChip}>
                  <Text style={styles.heroStatChipLabel}>Cảm giác như</Text>
                  <Text style={styles.heroStatChipVal}>{Math.round(c.feels)}°C</Text>
                </View>
                {weather.daily?.[0] && (
                  <View style={styles.heroStatChip}>
                    <Text style={styles.heroStatChipLabel}>Hôm nay</Text>
                    <Text style={styles.heroStatChipVal}>
                      {Math.round(weather.daily[0].max)}° / {Math.round(weather.daily[0].min)}°
                    </Text>
                  </View>
                )}
                <View style={styles.heroStatChip}>
                  <Text style={styles.heroStatChipLabel}>Độ ẩm</Text>
                  <Text style={styles.heroStatChipVal}>{c.humidity}%</Text>
                </View>
              </View>

              {/* Bình minh & Hoàng hôn */}
              <View style={styles.sunTimesRow}>
                <Text style={styles.sunTimeText}>🌅 Bình minh: <Text style={{ color: '#fff', fontWeight: '700' }}>{fmtTimeOnly(c.sunrise)}</Text></Text>
                <Text style={styles.sunTimeDivider}>•</Text>
                <Text style={styles.sunTimeText}>🌇 Hoàng hôn: <Text style={{ color: '#fff', fontWeight: '700' }}>{fmtTimeOnly(c.sunset)}</Text></Text>
              </View>
            </LinearGradient>
          </ImageBackground>
        </View>

        {/* LƯỚI THÔNG SỐ CHUYÊN SÂU (GLASSMORPHIC CARDS) */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>💧</Text>
            <Text style={styles.metricLabel}>Độ ẩm</Text>
            <Text style={styles.metricVal}>{c.humidity}%</Text>
            <Text style={styles.metricSub}>Mức dễ chịu</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>💨</Text>
            <Text style={styles.metricLabel}>Gió</Text>
            <Text style={styles.metricVal}>{c.wind} <Text style={{ fontSize: 11, fontWeight: '400' }}>km/h</Text></Text>
            <Text style={styles.metricSub}>{c.windDir || 'Ổn định'}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>☀️</Text>
            <Text style={styles.metricLabel}>Chỉ số UV</Text>
            <Text style={[styles.metricVal, { color: uvInfo.color }]}>{c.uv ?? '--'}</Text>
            <Text style={[styles.metricSub, { color: uvInfo.color, fontWeight: '700' }]}>{uvInfo.level}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>👁️</Text>
            <Text style={styles.metricLabel}>Tầm nhìn</Text>
            <Text style={styles.metricVal}>{c.visibility} <Text style={{ fontSize: 11, fontWeight: '400' }}>km</Text></Text>
            <Text style={styles.metricSub}>Thông thoáng</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>🧭</Text>
            <Text style={styles.metricLabel}>Áp suất</Text>
            <Text style={styles.metricVal}>{c.pressure} <Text style={{ fontSize: 11, fontWeight: '400' }}>hPa</Text></Text>
            <Text style={styles.metricSub}>Bình thường</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>☁️</Text>
            <Text style={styles.metricLabel}>Mây che phủ</Text>
            <Text style={styles.metricVal}>{c.clouds}%</Text>
            <Text style={styles.metricSub}>Bầu trời thoáng</Text>
          </View>
        </View>

        {/* DỰ BÁO THEO TỪNG GIỜ (APPLE WEATHER STYLE SLIDER) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>⏱️ Dự báo chi tiết theo giờ</Text>
          <Text style={styles.sectionSubHeading}>48 giờ tới</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourlyScrollView}>
          {weather.hourly.map((h, i) => (
            <View key={i} style={[styles.hourlyCard, i === 0 && styles.hourlyCardNow]}>
              <Text style={styles.hourlyTimeText}>{i === 0 ? 'Bây giờ' : fmtHour(h.t)}</Text>
              <Text style={styles.hourlyEmoji}>{weatherEmoji(h.desc)}</Text>
              <Text style={styles.hourlyTempText}>{Math.round(h.temp)}°</Text>
              {h.pop > 0 ? (
                <View style={styles.hourlyPopBadge}>
                  <Text style={styles.hourlyPopText}>💧{h.pop}%</Text>
                </View>
              ) : (
                <Text style={styles.hourlyPopEmpty}>—</Text>
              )}
            </View>
          ))}
        </ScrollView>

        {/* ĐÁNH GIÁ CHẤT LƯỢNG KHÔNG KHÍ (AQI) */}
        {weather.airQuality && (
          <View style={styles.contentCard}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardTitle}>🌬️ Chất lượng không khí (AQI)</Text>
              <View style={[styles.statusPill, { backgroundColor: aqiInfo.color + '26', borderColor: aqiInfo.color }]}>
                <Text style={[styles.statusPillText, { color: aqiInfo.color }]}>{aqiInfo.status}</Text>
              </View>
            </View>

            <View style={styles.aqiScoreRow}>
              <Text style={[styles.aqiBigScore, { color: aqiInfo.color }]}>
                {weather.airQuality.aqi ?? '--'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.aqiAdviceText}>{aqiInfo.desc}</Text>
              </View>
            </View>

            {/* Thanh đo AQI */}
            <View style={styles.progressBarTrack}>
              <LinearGradient
                colors={['#22c55e', '#eab308', '#f97316', '#ef4444']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressBarFill, { width: `${Math.min(aqiInfo.pct, 100)}%` }]}
              />
            </View>

            {/* Chi tiết nồng độ bụi */}
            <View style={styles.pollutantsGrid}>
              <View style={styles.pollutantPill}>
                <Text style={styles.pollutantName}>PM2.5</Text>
                <Text style={styles.pollutantVal}>{weather.airQuality.pm25} μg/m³</Text>
              </View>
              <View style={styles.pollutantPill}>
                <Text style={styles.pollutantName}>PM10</Text>
                <Text style={styles.pollutantVal}>{weather.airQuality.pm10} μg/m³</Text>
              </View>
              <View style={styles.pollutantPill}>
                <Text style={styles.pollutantName}>O₃</Text>
                <Text style={styles.pollutantVal}>{weather.airQuality.o3} μg/m³</Text>
              </View>
              <View style={styles.pollutantPill}>
                <Text style={styles.pollutantName}>NO₂</Text>
                <Text style={styles.pollutantVal}>{weather.airQuality.no2} μg/m³</Text>
              </View>
            </View>
          </View>
        )}

        {/* CHỈ SỐ UV & LỜI KHUYÊN SỨC KHỎE */}
        <View style={styles.contentCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle}>☀️ Tia cực tím (UV Index)</Text>
            <View style={[styles.statusPill, { backgroundColor: uvInfo.color + '26', borderColor: uvInfo.color }]}>
              <Text style={[styles.statusPillText, { color: uvInfo.color }]}>{uvInfo.level}</Text>
            </View>
          </View>

          <View style={styles.aqiScoreRow}>
            <Text style={[styles.aqiBigScore, { color: uvInfo.color }]}>{c.uv ?? '--'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.aqiAdviceText}>{uvInfo.advice}</Text>
            </View>
          </View>

          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${Math.min(uvInfo.pct, 100)}%`, backgroundColor: uvInfo.color }]} />
          </View>
        </View>

        {/* ĐỒNG THUẬN DỰ BÁO 2 NGUỒN ĐỘC LẬP */}
        {consensusRating && (
          <View style={[styles.contentCard, { borderLeftWidth: 4, borderLeftColor: consensusRating.color }]}>
            <Text style={styles.cardTitle}>⚖️ So sánh đối chiếu 2 nguồn dữ liệu</Text>
            <Text style={[styles.consensusBadge, { color: consensusRating.color }]}>
              Độ đồng thuận: {consensusRating.text}
            </Text>
            <Text style={styles.consensusDesc}>{consensusRating.desc}</Text>
          </View>
        )}

        {/* DỰ BÁO 7 NGÀY TỚI VỚI NÚT XEM CHI TIẾT */}
        <View style={styles.contentCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle}>📅 Dự báo 7 ngày tới</Text>
            <TouchableOpacity onPress={() => setActiveTab('forecast')}>
              <Text style={styles.viewMoreLink}>Xem 14 ngày ▶</Text>
            </TouchableOpacity>
          </View>

          {weather.daily.slice(0, 7).map((d, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.dailyRow, i > 0 && styles.dailyRowBorder]}
              onPress={() => setSelectedDay(d)}
              activeOpacity={0.7}
            >
              <Text style={styles.dailyDayCol}>{i === 0 ? 'Hôm nay' : fmtDay(d.date)}</Text>
              <Text style={styles.dailyEmojiCol}>{weatherEmoji(d.text)}</Text>
              <Text style={styles.dailyDescCol} numberOfLines={1}>{d.text}</Text>
              
              <View style={styles.dailyTempRangeCol}>
                <Text style={styles.dailyMaxText}>{Math.round(d.max)}°</Text>
                <View style={styles.dailyBar}>
                  <LinearGradient
                    colors={['#38bdf8', '#fbbf24', '#ef4444']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ flex: 1, borderRadius: 3 }}
                  />
                </View>
                <Text style={styles.dailyMinText}>{Math.round(d.min)}°</Text>
              </View>

              {d.rain > 0 ? (
                <Text style={styles.dailyRainBadge}>💧{d.rain}m</Text>
              ) : (
                <Text style={styles.dailyRainEmpty}>—</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* GỢI Ý HOẠT ĐỘNG THÔNG MINH */}
        {weather.suggestions && weather.suggestions.length > 0 && (
          <View style={styles.contentCard}>
            <Text style={styles.cardTitle}>💡 Gợi ý sinh hoạt hôm nay</Text>
            {weather.suggestions.map((s, i) => (
              <View key={i} style={styles.suggestionRow}>
                <Text style={styles.suggestionBullet}>•</Text>
                <Text style={styles.suggestionText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    );
  };

  /* ─── TAB DỰ BÁO 14 NGÀY CHI TIẾT ─── */
  const renderForecastTab = () => {
    if (!weather) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Chưa có dữ liệu dự báo</Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.forecastContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.forecastHeader}>
          <Text style={styles.forecastPageTitle}>📈 Xu hướng thời tiết 14 ngày tới</Text>
          <Text style={styles.forecastPageSub}>Bấm vào bất kỳ ngày nào để xem phân tích chi tiết</Text>
        </View>

        {weather.daily.map((d, i) => (
          <TouchableOpacity
            key={i}
            style={styles.forecastCard}
            onPress={() => setSelectedDay(d)}
            activeOpacity={0.8}
          >
            <View style={styles.forecastCardTop}>
              <View>
                <Text style={styles.forecastDayTitle}>
                  {i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : fmtDay(d.date)}
                </Text>
                <Text style={styles.forecastWeatherDesc}>
                  {weatherEmoji(d.text)} {d.text}
                </Text>
              </View>
              <View style={styles.forecastTempBlock}>
                <Text style={styles.forecastHighTemp}>{Math.round(d.max)}°</Text>
                <Text style={styles.forecastLowTemp}> / {Math.round(d.min)}°</Text>
              </View>
            </View>

            <View style={styles.forecastStatsPillRow}>
              {d.rain > 0 && (
                <View style={styles.forecastStatPill}>
                  <Text style={styles.forecastStatPillText}>💧 Mưa {d.rain} mm</Text>
                </View>
              )}
              <View style={styles.forecastStatPill}>
                <Text style={styles.forecastStatPillText}>💨 Gió {d.wind} km/h</Text>
              </View>
              {d.uv != null && (
                <View style={styles.forecastStatPill}>
                  <Text style={styles.forecastStatPillText}>☀️ UV {d.uv}</Text>
                </View>
              )}
              {d.owm && (
                <View style={styles.forecastStatPill}>
                  <Text style={styles.forecastStatPillText}>⚖️ OWM {Math.round(d.owm.max)}°</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  /* ─── TAB TÌM KIẾM ĐỊA PHƯƠNG ─── */
  const renderSearchTab = () => (
    <View style={styles.searchPageContainer}>
      {/* Ô tìm kiếm */}
      <View style={styles.searchBarBox}>
        <Text style={styles.searchBarIcon}>🔍</Text>
        <TextInput
          style={styles.searchBarInput}
          placeholder="Nhập tên thành phố (Nha Trang, Đà Lạt, Hà Nội...)"
          placeholderTextColor={C.textMuted}
          value={searchText}
          onChangeText={setSearchText}
          autoFocus
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchText(''); setSuggestions([]); }}>
            <Text style={styles.searchClearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {searching && <ActivityIndicator color={C.accent} style={{ marginVertical: 14 }} />}

      {/* Kết quả tìm kiếm */}
      {suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(_, i) => String(i)}
          style={styles.suggestionListBox}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.suggestionItemRow} onPress={() => selectLocation(item)}>
              <Text style={styles.suggestionPin}>📍</Text>
              <Text style={styles.suggestionTitle}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Danh sách địa phương nhanh */}
      <Text style={styles.quickLocationsTitle}>📌 Địa điểm gợi ý nhanh (Khánh Hòa & Tỉnh thành)</Text>
      <FlatList
        data={QUICK_LOCATIONS}
        keyExtractor={(_, i) => String(i)}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => {
          const isSelected = location?.name?.includes(item.name);
          return (
            <TouchableOpacity
              style={[styles.quickLocationButton, isSelected && styles.quickLocationButtonActive]}
              onPress={() => selectLocation(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickLocationText, isSelected && styles.quickLocationTextActive]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  /* ─── MODAL CHI TIẾT NGÀY DỰ BÁO ─── */
  const renderDayModal = () => {
    if (!selectedDay) return null;

    return (
      <Modal visible={!!selectedDay} transparent animationType="fade" onRequestClose={() => setSelectedDay(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardWindow}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalDateTitle}>{fmtDay(selectedDay.date)}</Text>
                <Text style={styles.modalWeatherCondition}>
                  {weatherEmoji(selectedDay.text)} {selectedDay.text}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedDay(null)} style={styles.modalCloseCircle}>
                <Text style={styles.modalCloseX}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Thống kê 2x3 */}
            <View style={styles.modalStatsGrid}>
              <View style={styles.modalStatCell}>
                <Text style={styles.modalCellLabel}>Nhiệt độ cao nhất</Text>
                <Text style={[styles.modalCellVal, { color: '#ef4444' }]}>{Math.round(selectedDay.max)}°C</Text>
              </View>
              <View style={styles.modalStatCell}>
                <Text style={styles.modalCellLabel}>Nhiệt độ thấp nhất</Text>
                <Text style={[styles.modalCellVal, { color: '#fbbf24' }]}>{Math.round(selectedDay.min)}°C</Text>
              </View>
              <View style={styles.modalStatCell}>
                <Text style={styles.modalCellLabel}>Lượng mưa dự kiến</Text>
                <Text style={[styles.modalCellVal, { color: '#38bdf8' }]}>{selectedDay.rain} mm</Text>
              </View>
              <View style={styles.modalStatCell}>
                <Text style={styles.modalCellLabel}>Tốc độ gió tối đa</Text>
                <Text style={styles.modalCellVal}>{selectedDay.wind} km/h</Text>
              </View>
              <View style={styles.modalStatCell}>
                <Text style={styles.modalCellLabel}>Chỉ số UV</Text>
                <Text style={styles.modalCellVal}>{selectedDay.uv ?? '--'}</Text>
              </View>
              <View style={styles.modalStatCell}>
                <Text style={styles.modalCellLabel}>Nguồn OpenWeather</Text>
                <Text style={styles.modalCellVal}>
                  {selectedDay.owm ? `${Math.round(selectedDay.owm.min)}–${Math.round(selectedDay.owm.max)}°` : 'Không có'}
                </Text>
              </View>
            </View>

            {/* Lời khuyên */}
            <View style={styles.modalAdviceCard}>
              <Text style={styles.modalAdviceTitle}>💡 Lời khuyên cho ngày này:</Text>
              <Text style={styles.modalAdviceContent}>
                {selectedDay.rain >= 10
                  ? 'Nên mang áo mưa hoặc ô dù, hạn chế lịch trình đi biển và leo núi.'
                  : selectedDay.max >= 34
                  ? 'Trời nắng gắt, phù hợp tắm biển sáng sớm hoặc chiều mát. Nhớ bôi kem chống nắng.'
                  : 'Thời tiết thuận lợi cho các hoạt động tham quan, dạo phố và sinh hoạt ngoài trời.'}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  /* ─── THANH ĐIỀU HƯỚNG DƯỚI CÙNG (FLOATING TAB BAR) ─── */
  const tabs = [
    { id: 'home', icon: '🏠', label: 'Trang chủ' },
    { id: 'forecast', icon: '📅', label: '14 Ngày' },
    { id: 'search', icon: '🔍', label: 'Tìm kiếm' },
  ];

  return (
    <View style={styles.appContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#060b14" />
      
      {/* 1. Academic Header TBD */}
      {renderAcademicHeader()}

      {/* 2. Current Location Bar */}
      {renderLocationBar()}

      {/* 3. Main Views */}
      <View style={styles.viewContainer}>
        {activeTab === 'home' && renderHomeTab()}
        {activeTab === 'forecast' && renderForecastTab()}
        {activeTab === 'search' && renderSearchTab()}
      </View>

      {/* 4. Modal chi tiết ngày */}
      {renderDayModal()}

      {/* 5. Bottom Tab Bar */}
      <View style={styles.bottomTabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabButtonItem}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.tabIconWrap, isActive && styles.tabIconWrapActive]}>
                <Text style={styles.tabIconSymbol}>{tab.icon}</Text>
              </View>
              <Text style={[styles.tabLabelText, isActive && styles.tabLabelTextActive]}>
                {tab.label}
              </Text>
              {isActive && <View style={styles.activePillIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/* ─── BỘ STYLES CHUYÊN NGHIỆP HIỆN ĐẠI (PREMIUM DESIGN SYSTEM) ─── */
const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: C.bg,
  },
  viewContainer: {
    flex: 1,
  },

  /* Academic Bar */
  tbdBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 50,
    paddingBottom: 10,
    backgroundColor: '#060b14',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  tbdLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tbdShield: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  tbdShieldText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  tbdUniName: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tbdFaculty: {
    color: '#94a3b8',
    fontSize: 9.5,
    marginTop: 1,
  },
  tbdRight: {
    alignItems: 'flex-end',
  },
  tbdAuthor: {
    color: '#94a3b8',
    fontSize: 10,
  },
  tbdTeacher: {
    color: '#64748b',
    fontSize: 9.5,
    marginTop: 1,
  },

  /* Location Bar */
  locationBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(15, 25, 45, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  locationInfo: {
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationPin: {
    fontSize: 15,
  },
  locationName: {
    color: C.textMain,
    fontSize: 16,
    fontWeight: '700',
  },
  locationUpdated: {
    color: C.textSub,
    fontSize: 11,
    marginTop: 2,
    marginLeft: 20,
  },
  gpsButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  gpsGradient: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  gpsIcon: {
    fontSize: 15,
  },

  /* Scroll container */
  homeScrollContent: {
    padding: 16,
    paddingBottom: 20,
  },

  /* Alerts */
  alertsContainer: {
    marginBottom: 14,
    gap: 8,
  },
  alertCard: {
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
  },
  alertTitle: {
    color: C.textMain,
    fontSize: 13,
    fontWeight: '700',
  },
  alertMsg: {
    color: C.textSub,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },

  /* Hero Card with 2K Landscape Photography */
  heroCardWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: '#0f1d33',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  heroImageBg: {
    width: '100%',
  },
  heroOverlayGradient: {
    padding: 20,
    paddingTop: 16,
  },
  scenicBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  scenicBadgeText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  heroMainWeatherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTempValue: {
    color: '#fff',
    fontSize: 68,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 74,
  },
  heroDescText: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '700',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  heroIconBox: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmojiIcon: {
    fontSize: 64,
  },
  heroSubStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  heroStatChip: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  heroStatChipLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
  },
  heroStatChipVal: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  sunTimesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: 10,
  },
  sunTimeText: {
    color: '#94a3b8',
    fontSize: 11.5,
  },
  sunTimeDivider: {
    color: '#64748b',
    fontSize: 12,
  },

  /* Metrics 6-Card Grid */
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    width: (SCREEN_W - 32 - 10) / 2,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 16,
    padding: 12,
  },
  metricIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  metricLabel: {
    color: C.textSub,
    fontSize: 11.5,
    fontWeight: '600',
  },
  metricVal: {
    color: C.textMain,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  metricSub: {
    color: C.textMuted,
    fontSize: 11,
    marginTop: 2,
  },

  /* Section Header */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
    marginTop: 6,
  },
  sectionHeading: {
    color: C.textMain,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionSubHeading: {
    color: C.textSub,
    fontSize: 12,
    fontWeight: '600',
  },

  /* Hourly Forecast Slider */
  hourlyScrollView: {
    marginBottom: 16,
  },
  hourlyCard: {
    width: 76,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginRight: 10,
  },
  hourlyCardNow: {
    borderColor: C.accent,
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
  },
  hourlyTimeText: {
    color: C.textSub,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  hourlyEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  hourlyTempText: {
    color: C.textMain,
    fontSize: 16,
    fontWeight: '800',
  },
  hourlyPopBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  hourlyPopText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
  },
  hourlyPopEmpty: {
    color: 'rgba(255, 255, 255, 0.2)',
    fontSize: 10,
    marginTop: 6,
  },

  /* Content Cards */
  contentCard: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    color: C.textMain,
    fontSize: 14.5,
    fontWeight: '800',
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  viewMoreLink: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },

  /* AQI / UV layout */
  aqiScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  aqiBigScore: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1,
  },
  aqiAdviceText: {
    color: C.textSub,
    fontSize: 12,
    lineHeight: 17,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  pollutantsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pollutantPill: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  pollutantName: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  pollutantVal: {
    color: C.textMain,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },

  /* Consensus Rating */
  consensusBadge: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 4,
  },
  consensusDesc: {
    color: C.textSub,
    fontSize: 12,
    lineHeight: 16,
  },

  /* 7-Day Rows */
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  dailyRowBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  dailyDayCol: {
    width: 65,
    color: C.textMain,
    fontSize: 13,
    fontWeight: '700',
  },
  dailyEmojiCol: {
    fontSize: 20,
    marginRight: 6,
  },
  dailyDescCol: {
    flex: 1,
    color: C.textSub,
    fontSize: 12,
  },
  dailyTempRangeCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 100,
    gap: 6,
  },
  dailyMaxText: {
    color: C.textMain,
    fontWeight: '700',
    fontSize: 13,
    width: 24,
    textAlign: 'right',
  },
  dailyBar: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  dailyMinText: {
    color: C.textMuted,
    fontSize: 12,
    width: 24,
  },
  dailyRainBadge: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    width: 44,
    textAlign: 'right',
  },
  dailyRainEmpty: {
    color: 'rgba(255, 255, 255, 0.15)',
    fontSize: 11,
    width: 44,
    textAlign: 'right',
  },

  /* Suggestions */
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  suggestionBullet: {
    color: C.accent,
    fontSize: 16,
    lineHeight: 18,
  },
  suggestionText: {
    flex: 1,
    color: C.textSub,
    fontSize: 12.5,
    lineHeight: 18,
  },

  /* 14-Day Forecast Page */
  forecastContainer: {
    padding: 16,
  },
  forecastHeader: {
    marginBottom: 14,
  },
  forecastPageTitle: {
    color: C.textMain,
    fontSize: 18,
    fontWeight: '800',
  },
  forecastPageSub: {
    color: C.textSub,
    fontSize: 12,
    marginTop: 2,
  },
  forecastCard: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  forecastCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  forecastDayTitle: {
    color: C.textMain,
    fontSize: 14.5,
    fontWeight: '800',
  },
  forecastWeatherDesc: {
    color: C.textSub,
    fontSize: 12.5,
    marginTop: 2,
  },
  forecastTempBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  forecastHighTemp: {
    color: C.textMain,
    fontSize: 20,
    fontWeight: '800',
  },
  forecastLowTemp: {
    color: C.textMuted,
    fontSize: 14,
  },
  forecastStatsPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  forecastStatPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  forecastStatPillText: {
    color: C.textSub,
    fontSize: 11,
    fontWeight: '600',
  },

  /* Search Page */
  searchPageContainer: {
    flex: 1,
    padding: 16,
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.cardBorderHighlight,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 14,
  },
  searchBarIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchBarInput: {
    flex: 1,
    color: C.textMain,
    fontSize: 14,
  },
  searchClearBtn: {
    color: C.textSub,
    fontSize: 16,
    paddingHorizontal: 6,
  },
  suggestionListBox: {
    backgroundColor: C.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    maxHeight: 200,
    marginBottom: 16,
  },
  suggestionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  suggestionPin: {
    fontSize: 14,
  },
  suggestionTitle: {
    color: C.textMain,
    fontSize: 13.5,
    fontWeight: '600',
  },
  quickLocationsTitle: {
    color: C.textSub,
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 12,
  },
  quickLocationButton: {
    flex: 1,
    backgroundColor: C.bgCard,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  quickLocationButtonActive: {
    borderColor: C.accent,
    backgroundColor: 'rgba(2, 132, 199, 0.2)',
  },
  quickLocationText: {
    color: C.textSub,
    fontSize: 13,
    fontWeight: '600',
  },
  quickLocationTextActive: {
    color: '#fff',
    fontWeight: '800',
  },

  /* Modal Window */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCardWindow: {
    width: '100%',
    backgroundColor: '#0c1626',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalDateTitle: {
    color: C.textMain,
    fontSize: 18,
    fontWeight: '800',
  },
  modalWeatherCondition: {
    color: C.textSub,
    fontSize: 13,
    marginTop: 2,
  },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseX: {
    color: C.textMain,
    fontSize: 14,
    fontWeight: '700',
  },
  modalStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  modalStatCell: {
    width: (SCREEN_W - 40 - 40 - 8) / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalCellLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  modalCellVal: {
    color: C.textMain,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  modalAdviceCard: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  modalAdviceTitle: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  modalAdviceContent: {
    color: '#cbd5e1',
    fontSize: 11.5,
    lineHeight: 16,
  },

  /* Bottom Tab Bar */
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#060b14',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
  },
  tabButtonItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  tabIconWrap: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  tabIconWrapActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  tabIconSymbol: {
    fontSize: 17,
  },
  tabLabelText: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabLabelTextActive: {
    color: '#38bdf8',
    fontWeight: '800',
  },
  activePillIndicator: {
    position: 'absolute',
    bottom: -6,
    width: 16,
    height: 3,
    backgroundColor: '#38bdf8',
    borderRadius: 2,
  },

  /* Loading & Error */
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: C.textSub,
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: C.danger,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 14,
  },
  retryBtn: {
    backgroundColor: C.accentBlue,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
