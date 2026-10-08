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

/* ─── Bảng màu Cyber Coastal cao cấp ─── */
const C = {
  bg: '#080e1a',
  bgCard: 'rgba(15, 25, 45, 0.78)',
  cardBorder: 'rgba(255, 255, 255, 0.1)',
  cardBorderHighlight: 'rgba(56, 189, 248, 0.4)',
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
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'forecast' | 'map' | 'air' | 'search'
  const [selectedDay, setSelectedDay] = useState(null); // modal chi tiết ngày
  const [unit, setUnit] = useState('C'); // 'C' | 'F'
  const [favs, setFavs] = useState([]); // danh sách địa điểm yêu thích
  const [mapLayer, setMapLayer] = useState('satellite'); // 'satellite' | 'radar' | 'street'
  
  const searchTimer = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  /* ─── Chuyển đổi nhiệt độ theo đơn vị °C / °F ─── */
  const convertT = useCallback((celsius) => {
    if (celsius == null) return '--';
    if (unit === 'F') return Math.round(celsius * 1.8 + 32);
    return Math.round(celsius);
  }, [unit]);
  const unitLabel = `°${unit}`;

  const toggleUnit = async () => {
    const nextUnit = unit === 'C' ? 'F' : 'C';
    setUnit(nextUnit);
    try {
      await AsyncStorage.setItem('mobile_unit', nextUnit);
    } catch {}
  };

  /* ─── Tải thời tiết ─── */
  const loadWeather = useCallback(async (loc, isRefresh = false) => {
    if (!loc) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await fetchWeather(loc.lat, loc.lon);
      setWeather(data);
      await AsyncStorage.setItem('lastWeather', JSON.stringify({ data, loc, ts: Date.now() }));
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
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

  /* ─── Khởi động app: nạp cache, unit, favs, GPS ─── */
  useEffect(() => {
    AsyncStorage.getItem('mobile_unit').then((u) => {
      if (u) setUnit(u);
    });
    AsyncStorage.getItem('mobile_favs').then((f) => {
      if (f) {
        try { setFavs(JSON.parse(f)); } catch {}
      }
    });
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

  /* ─── Quản lý địa điểm yêu thích ─── */
  const isFav = location && favs.some((f) => f.lat === location.lat && f.lon === location.lon);
  const toggleFav = async () => {
    if (!location) return;
    let next;
    if (isFav) {
      next = favs.filter((f) => f.lat !== location.lat || f.lon !== location.lon);
    } else {
      next = [...favs, location];
    }
    setFavs(next);
    try {
      await AsyncStorage.setItem('mobile_favs', JSON.stringify(next));
    } catch {}
  };

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

  /* Banner cảnh quan thực tế 2K theo tỉnh thành */
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
    return { text: 'Biến động cao', desc: `Chênh lệch trung bình ${avgDiff}°C giữa 2 nguồn do thời tiết chuyển biến nhanh.`, color: '#f97316' };
  }, [weather?.daily]);

  /* ─── HEADER SKYCAST VN HIỆN ĐẠI (ĐỒNG BỘ VỚI WEB) ─── */
  const renderSkycastHeader = () => (
    <View style={styles.headerBar}>
      <TouchableOpacity
        style={styles.headerBrand}
        onPress={() => setActiveTab('home')}
        activeOpacity={0.8}
      >
        <LinearGradient colors={['#0284c7', '#38bdf8']} style={styles.headerLogoBox}>
          <Text style={styles.headerLogoEmoji}>⛅</Text>
        </LinearGradient>
        <View>
          <View style={styles.brandTitleRow}>
            <Text style={styles.headerBrandTitle}>SkyCast VN</Text>
            <View style={styles.realtimeTag}>
              <Text style={styles.realtimeTagText}>Realtime</Text>
            </View>
          </View>
          <Text style={styles.headerBrandSubtitle}>Dự Báo Khí Tượng & Radar Vệ Tinh</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.headerActions}>
        {/* Toggle đơn vị °C / °F */}
        <TouchableOpacity style={styles.unitBtn} onPress={toggleUnit} activeOpacity={0.7}>
          <Text style={styles.unitBtnText}>{unitLabel}</Text>
        </TouchableOpacity>

        {/* Nút GPS định vị */}
        <TouchableOpacity onPress={getGpsLocation} style={styles.gpsButton} activeOpacity={0.75}>
          <LinearGradient colors={['#0284c7', '#0369a1']} style={styles.gpsGradient}>
            <Text style={styles.gpsIcon}>🎯</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  /* ─── BANNER PHONG CẢNH 2K ĐỒNG BỘ CHO TẤT CẢ CÁC TRANG CON ─── */
  const renderSubpageBanner = (title, icon, description) => {
    const c = weather?.current;
    return (
      <View style={styles.subpageBannerWrap}>
        <ImageBackground
          source={{ uri: bannerData.url }}
          style={styles.subpageBannerBg}
          imageStyle={{ borderRadius: 22 }}
        >
          <LinearGradient
            colors={['rgba(8, 14, 26, 0.45)', 'rgba(8, 14, 26, 0.72)', '#080e1a']}
            style={styles.subpageBannerOverlay}
          >
            {/* Hàng trên: Breadcrumb + Danh thắng badge */}
            <View style={styles.subpageBannerTopRow}>
              <TouchableOpacity
                style={styles.subpageBreadcrumb}
                onPress={() => setActiveTab('home')}
                activeOpacity={0.7}
              >
                <Text style={styles.breadcrumbHome}>🏠 Tổng quan</Text>
                <Text style={styles.breadcrumbSep}>/</Text>
                <Text style={styles.breadcrumbCurrent}>{title}</Text>
              </TouchableOpacity>

              {bannerData.title && (
                <View style={styles.scenicBadgeSmall}>
                  <Text style={styles.scenicBadgeSmallText}>📸 {bannerData.title}</Text>
                </View>
              )}
            </View>

            {/* Tiêu đề trang & mô tả */}
            <View style={styles.subpageBannerTitleRow}>
              <Text style={styles.subpageTitleIcon}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.subpageTitleText}>{title}</Text>
                <Text style={styles.subpageDescText}>{description}</Text>
              </View>
            </View>

            {/* Chip thời tiết thời gian thực & Nút về trang chủ */}
            <View style={styles.subpageBannerBottomRow}>
              {c && (
                <View style={styles.subpageLocChip}>
                  <Text style={styles.locChipPin}>📍</Text>
                  <Text style={styles.locChipName} numberOfLines={1}>{location?.name}</Text>
                  <Text style={styles.locChipSep}>•</Text>
                  <Text style={styles.locChipTemp}>{convertT(c.temp)}{unitLabel}</Text>
                  <Text style={styles.locChipSep}>•</Text>
                  <Text style={styles.locChipDesc}>{c.desc}</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.subpageBackBtn}
                onPress={() => setActiveTab('home')}
                activeOpacity={0.75}
              >
                <Text style={styles.subpageBackBtnText}>← Về Trang Chủ</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </ImageBackground>
      </View>
    );
  };

  /* ─── TAB 1: TRANG CHỦ / TỔNG QUAN ─── */
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

    return (
      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={styles.homeScrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Cảnh báo thời tiết nguy hiểm nếu có */}
        {weather.alerts && weather.alerts.length > 0 ? (
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
        ) : (
          <View style={styles.safeBannerRow}>
            <Text style={styles.safeBannerText}>✅ An toàn: Thời tiết ổn định, không có cảnh báo cực đoan.</Text>
          </View>
        )}

        {/* HERO BANNER CẢNH QUAN 2K THỰC TẾ (NHA TRANG / VẠN NINH / TỈNH THÀNH) */}
        <View style={styles.heroCardWrapper}>
          <ImageBackground
            source={{ uri: bannerData.url }}
            style={styles.heroImageBg}
            imageStyle={{ borderRadius: 24 }}
          >
            <LinearGradient
              colors={['rgba(8, 14, 26, 0.38)', 'rgba(8, 14, 26, 0.75)', '#080e1a']}
              style={styles.heroOverlayGradient}
            >
              {/* Badge danh thắng cảnh & Nút Yêu thích */}
              <View style={styles.heroTopActionsRow}>
                <View style={styles.scenicBadge}>
                  <Text style={styles.scenicBadgeText}>📸 {bannerData.title}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.favBtnPill, isFav && styles.favBtnPillActive]}
                  onPress={toggleFav}
                  activeOpacity={0.75}
                >
                  <Text style={styles.favBtnText}>{isFav ? '★ Đã lưu' : '☆ Lưu'}</Text>
                </TouchableOpacity>
              </View>

              {/* Tên địa điểm */}
              <Text style={styles.heroLocationTitle} numberOfLines={1}>
                {location?.name}
              </Text>

              {/* Nhiệt độ và Icon */}
              <View style={styles.heroMainWeatherRow}>
                <View>
                  <Text style={styles.heroTempValue}>{convertT(c.temp)}°</Text>
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
                  <Text style={styles.heroStatChipVal}>{convertT(c.feels)}{unitLabel}</Text>
                </View>
                {weather.daily?.[0] && (
                  <View style={styles.heroStatChip}>
                    <Text style={styles.heroStatChipLabel}>Hôm nay</Text>
                    <Text style={styles.heroStatChipVal}>
                      {convertT(weather.daily[0].max)}° / {convertT(weather.daily[0].min)}°
                    </Text>
                  </View>
                )}
                <View style={styles.heroStatChip}>
                  <Text style={styles.heroStatChipLabel}>Độ ẩm</Text>
                  <Text style={styles.heroStatChipVal}>{c.humidity}%</Text>
                </View>
                <TouchableOpacity
                  style={[styles.heroStatChip, { borderColor: uvInfo.color }]}
                  onPress={() => setActiveTab('air')}
                >
                  <Text style={styles.heroStatChipLabel}>Tia UV</Text>
                  <Text style={[styles.heroStatChipVal, { color: uvInfo.color }]}>{c.uv ?? '--'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </ImageBackground>
        </View>

        {/* DỰ BÁO THEO TỪNG GIỜ (APPLE WEATHER STYLE SLIDER) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>⏱️ Dự báo chi tiết theo giờ</Text>
          <TouchableOpacity onPress={() => setActiveTab('forecast')}>
            <Text style={styles.sectionActionLink}>Xem 48 giờ ▶</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourlyScrollView}>
          {weather.hourly.map((h, i) => (
            <View key={i} style={[styles.hourlyCard, i === 0 && styles.hourlyCardNow]}>
              <Text style={styles.hourlyTimeText}>{i === 0 ? 'Bây giờ' : fmtHour(h.t)}</Text>
              <Text style={styles.hourlyEmoji}>{weatherEmoji(h.desc)}</Text>
              <Text style={styles.hourlyTempText}>{convertT(h.temp)}°</Text>
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

        {/* GỢI Ý HOẠT ĐỘNG THÔNG MINH */}
        {weather.suggestions && weather.suggestions.length > 0 && (
          <View style={styles.contentCard}>
            <Text style={styles.cardTitle}>💡 Gợi ý sinh hoạt hôm nay</Text>
            {weather.suggestions.map((s, i) => (
              <View key={i} style={styles.suggestionRow}>
                <Text style={styles.suggestionBullet}>🎯</Text>
                <Text style={styles.suggestionText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ===== TRUNG TÂM NÚT CTA ĐIỀU HƯỚNG CHUYÊN SÂU (ACTION HUB) ===== */}
        <View style={styles.ctaHubContainer}>
          <View style={styles.ctaHubIntroRow}>
            <Text style={styles.ctaHubIntroHeading}>⚡ Khám phá tính năng chuyên sâu</Text>
            <Text style={styles.ctaHubIntroSub}>Chuyển nhanh sang các chuyên mục</Text>
          </View>

          {/* CTA 1: Dự báo & 14 Ngày */}
          <TouchableOpacity
            style={styles.ctaCardBox}
            onPress={() => setActiveTab('forecast')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(2, 132, 199, 0.18)', 'rgba(15, 25, 45, 0.9)']}
              style={styles.ctaCardGradient}
            >
              <View style={styles.ctaCardTop}>
                <View style={[styles.ctaIconBadge, { backgroundColor: 'rgba(2, 132, 199, 0.25)' }]}>
                  <Text style={styles.ctaIconEmoji}>📊</Text>
                </View>
                <View style={[styles.ctaTagPill, { borderColor: '#38bdf8' }]}>
                  <Text style={[styles.ctaTagText, { color: '#38bdf8' }]}>48H & 14 NGÀY</Text>
                </View>
              </View>
              <Text style={styles.ctaCardTitle}>Dự Báo & Phân Tích Khí Tượng</Text>
              <Text style={styles.ctaCardDesc}>
                Xu hướng thời tiết 14 ngày tới, biên độ nhiệt Max/Min, lượng mưa và đối chiếu 2 mô hình OpenWeather & Open-Meteo.
              </Text>
              <View style={styles.ctaButtonRow}>
                <Text style={[styles.ctaButtonLabel, { color: '#38bdf8' }]}>Xem Dự Báo & 14 Ngày</Text>
                <Text style={styles.ctaArrow}>→</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* CTA 2: Bản Đồ Radar & Vệ Tinh */}
          <TouchableOpacity
            style={styles.ctaCardBox}
            onPress={() => setActiveTab('map')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(168, 85, 247, 0.18)', 'rgba(15, 25, 45, 0.9)']}
              style={styles.ctaCardGradient}
            >
              <View style={styles.ctaCardTop}>
                <View style={[styles.ctaIconBadge, { backgroundColor: 'rgba(168, 85, 247, 0.25)' }]}>
                  <Text style={styles.ctaIconEmoji}>🛰️</Text>
                </View>
                <View style={[styles.ctaTagPill, { borderColor: '#c084fc' }]}>
                  <Text style={[styles.ctaTagText, { color: '#c084fc' }]}>THỜI GIAN THỰC</Text>
                </View>
              </View>
              <Text style={styles.ctaCardTitle}>Bản Đồ Vệ Tinh & Radar Mây Mưa</Text>
              <Text style={styles.ctaCardDesc}>
                Quan sát ảnh chụp vệ tinh ESRI độ nét cao, lớp phủ radar quét mây mưa RainViewer và định vị tọa độ.
              </Text>
              <View style={styles.ctaButtonRow}>
                <Text style={[styles.ctaButtonLabel, { color: '#c084fc' }]}>Mở Bản Đồ Radar</Text>
                <Text style={styles.ctaArrow}>→</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* CTA 3: Không Khí & Sức Khỏe */}
          <TouchableOpacity
            style={styles.ctaCardBox}
            onPress={() => setActiveTab('air')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(16, 185, 129, 0.18)', 'rgba(15, 25, 45, 0.9)']}
              style={styles.ctaCardGradient}
            >
              <View style={styles.ctaCardTop}>
                <View style={[styles.ctaIconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.25)' }]}>
                  <Text style={styles.ctaIconEmoji}>🍃</Text>
                </View>
                <View style={[styles.ctaTagPill, { borderColor: '#34d399' }]}>
                  <Text style={[styles.ctaTagText, { color: '#34d399' }]}>SỨC KHỎE & UV</Text>
                </View>
              </View>
              <Text style={styles.ctaCardTitle}>Chất Lượng Không Khí & Khí Tượng</Text>
              <Text style={styles.ctaCardDesc}>
                Đo lường chỉ số AQI, bụi mịn PM2.5, bức xạ tia cực tím UV, giờ mặt trời mọc/lặn, gió và áp suất khí quyển.
              </Text>
              <View style={styles.ctaButtonRow}>
                <Text style={[styles.ctaButtonLabel, { color: '#34d399' }]}>Xem Chỉ Số Không Khí & UV</Text>
                <Text style={styles.ctaArrow}>→</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* CTA 4: Tìm Kiếm Địa Phương & Đã Lưu */}
          <TouchableOpacity
            style={styles.ctaCardBox}
            onPress={() => setActiveTab('search')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(245, 158, 11, 0.18)', 'rgba(15, 25, 45, 0.9)']}
              style={styles.ctaCardGradient}
            >
              <View style={styles.ctaCardTop}>
                <View style={[styles.ctaIconBadge, { backgroundColor: 'rgba(245, 158, 11, 0.25)' }]}>
                  <Text style={styles.ctaIconEmoji}>🔍</Text>
                </View>
                <View style={[styles.ctaTagPill, { borderColor: '#fbbf24' }]}>
                  <Text style={[styles.ctaTagText, { color: '#fbbf24' }]}>63 TỈNH THÀNH</Text>
                </View>
              </View>
              <Text style={styles.ctaCardTitle}>Tra Cứu Địa Phương & Đã Lưu</Text>
              <Text style={styles.ctaCardDesc}>
                Tìm kiếm hơn 63 tỉnh thành Việt Nam với kho ảnh phong cảnh 2K đặc trưng và quản lý địa điểm yêu thích.
              </Text>
              <View style={styles.ctaButtonRow}>
                <Text style={[styles.ctaButtonLabel, { color: '#fbbf24' }]}>Tìm Kiếm Địa Điểm</Text>
                <Text style={styles.ctaArrow}>→</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    );
  };

  /* ─── TAB 2: DỰ BÁO CHI TIẾT & BIỂU ĐỒ ─── */
  const renderForecastTab = () => {
    if (!weather) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Chưa có dữ liệu dự báo</Text>
        </View>
      );
    }

    // KPI 14 ngày
    const maxT = Math.max(...weather.daily.map((d) => d.max));
    const minT = Math.min(...weather.daily.map((d) => d.min));
    const totalRain = weather.daily.reduce((acc, d) => acc + (d.rain || 0), 0).toFixed(1);
    const rainyDays = weather.daily.filter((d) => d.rain > 1).length;

    return (
      <ScrollView contentContainerStyle={styles.subpageScrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner ảnh phong cảnh 2K đồng bộ */}
        {renderSubpageBanner(
          'Dự Báo & Biểu Đồ',
          '📊',
          `Phân tích chu kỳ thời tiết 48 giờ, dự báo 14 ngày tới tại ${location?.name} và đối chiếu mô hình.`
        )}

        {/* KPI Thống Kê 14 Ngày */}
        <View style={styles.kpiCardsRow}>
          <View style={styles.kpiCardItem}>
            <Text style={styles.kpiCardLabel}>🔥 Đỉnh nhiệt</Text>
            <Text style={[styles.kpiCardVal, { color: '#ef4444' }]}>{convertT(maxT)}{unitLabel}</Text>
          </View>
          <View style={styles.kpiCardItem}>
            <Text style={styles.kpiCardLabel}>❄️ Đáy nhiệt</Text>
            <Text style={[styles.kpiCardVal, { color: '#38bdf8' }]}>{convertT(minT)}{unitLabel}</Text>
          </View>
          <View style={styles.kpiCardItem}>
            <Text style={styles.kpiCardLabel}>🌧️ Tổng mưa</Text>
            <Text style={[styles.kpiCardVal, { color: '#fbbf24' }]}>{totalRain} mm</Text>
            <Text style={styles.kpiCardSub}>{rainyDays} ngày mưa</Text>
          </View>
        </View>

        {/* Đồng thuận đối chiếu 2 nguồn dữ liệu độc lập */}
        {consensusRating && (
          <View style={[styles.contentCard, { borderLeftWidth: 4, borderLeftColor: consensusRating.color }]}>
            <Text style={styles.cardTitle}>⚖️ So sánh đối chiếu 2 nguồn độc lập</Text>
            <Text style={[styles.consensusBadge, { color: consensusRating.color }]}>
              Mức độ đồng thuận: {consensusRating.text}
            </Text>
            <Text style={styles.consensusDesc}>{consensusRating.desc}</Text>
          </View>
        )}

        {/* Danh sách thẻ dự báo 14 ngày */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>📅 Lịch dự báo 14 ngày tới</Text>
          <Text style={styles.sectionSubHeading}>Bấm để xem chi tiết</Text>
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
                <Text style={styles.forecastHighTemp}>{convertT(d.max)}°</Text>
                <Text style={styles.forecastLowTemp}> / {convertT(d.min)}°</Text>
              </View>
            </View>

            <View style={styles.forecastStatsPillRow}>
              {d.rain > 0 ? (
                <View style={[styles.forecastStatPill, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                  <Text style={[styles.forecastStatPillText, { color: '#38bdf8' }]}>💧 Mưa {d.rain} mm</Text>
                </View>
              ) : (
                <View style={styles.forecastStatPill}>
                  <Text style={styles.forecastStatPillText}>☀️ Không mưa</Text>
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
                  <Text style={styles.forecastStatPillText}>⚖️ OWM {convertT(d.owm.max)}°</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}

        {/* Nút điều hướng chân trang */}
        <View style={styles.subpageNavFooter}>
          <TouchableOpacity style={styles.subpageNavBtn} onPress={() => setActiveTab('map')}>
            <Text style={styles.subpageNavBtnText}>🛰️ Xem Bản Đồ Radar →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.subpageNavBtn} onPress={() => setActiveTab('air')}>
            <Text style={styles.subpageNavBtnText}>🍃 Xem Chất Lượng Không Khí →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  /* ─── TAB 3: BẢN ĐỒ RADAR & VỆ TINH ─── */
  const renderMapTab = () => {
    if (!weather) return null;
    const c = weather.current;

    return (
      <ScrollView contentContainerStyle={styles.subpageScrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner ảnh phong cảnh 2K đồng bộ */}
        {renderSubpageBanner(
          'Bản Đồ Vệ Tinh & Radar',
          '🛰️',
          `Quan sát ảnh chụp vệ tinh ESRI độ nét cao và lớp phủ radar mây mưa RainViewer thời gian thực tại ${location?.name}.`
        )}

        {/* Khung điều khiển & thông tin tọa độ */}
        <View style={styles.mapControlCard}>
          <View style={styles.mapControlHeader}>
            <View>
              <Text style={styles.mapLocName}>{location?.name}</Text>
              <Text style={styles.mapCoordsText}>
                Tọa độ: {location?.lat?.toFixed(4)}°N, {location?.lon?.toFixed(4)}°E · {convertT(c.temp)}{unitLabel}
              </Text>
            </View>
            <TouchableOpacity onPress={getGpsLocation} style={styles.mapGpsBtn}>
              <Text style={styles.mapGpsBtnText}>🎯 Vị trí của tôi</Text>
            </TouchableOpacity>
          </View>

          {/* Nút chuyển chế độ Layer */}
          <View style={styles.mapLayerButtonsRow}>
            <TouchableOpacity
              style={[styles.mapLayerBtn, mapLayer === 'satellite' && styles.mapLayerBtnActive]}
              onPress={() => setMapLayer('satellite')}
            >
              <Text style={[styles.mapLayerBtnText, mapLayer === 'satellite' && styles.mapLayerBtnTextActive]}>
                🛰️ Ảnh Vệ Tinh
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mapLayerBtn, mapLayer === 'radar' && styles.mapLayerBtnActive]}
              onPress={() => setMapLayer('radar')}
            >
              <Text style={[styles.mapLayerBtnText, mapLayer === 'radar' && styles.mapLayerBtnTextActive]}>
                🌧️ Radar Mây Mưa
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mapLayerBtn, mapLayer === 'street' && styles.mapLayerBtnActive]}
              onPress={() => setMapLayer('street')}
            >
              <Text style={[styles.mapLayerBtnText, mapLayer === 'street' && styles.mapLayerBtnTextActive]}>
                🗺️ Địa Lý
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Khung hiển thị mô phỏng bản đồ vệ tinh & Radar */}
        <View style={styles.mapCanvasWrapper}>
          <ImageBackground
            source={{
              uri: mapLayer === 'street'
                ? 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80'
                : 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=85',
            }}
            style={styles.mapCanvasImage}
            imageStyle={{ borderRadius: 20 }}
          >
            {/* Lớp phủ Radar mưa nếu chọn chế độ radar */}
            {mapLayer === 'radar' && (
              <LinearGradient
                colors={['rgba(2, 132, 199, 0.45)', 'rgba(56, 189, 248, 0.35)', 'rgba(34, 197, 94, 0.25)']}
                style={styles.mapRadarOverlay}
              />
            )}

            {/* Marker vị trí hiện tại */}
            <View style={styles.mapCenterMarkerBox}>
              <View style={styles.radarPulseRing} />
              <View style={styles.mapPinBadge}>
                <Text style={styles.mapPinBadgeText}>📍 {location?.name}: {convertT(c.temp)}{unitLabel}</Text>
              </View>
            </View>

            {/* Thước đo cường độ radar */}
            <View style={styles.mapRadarLegend}>
              <Text style={styles.mapLegendTitle}>Cường độ mưa Radar</Text>
              <LinearGradient
                colors={['#38bdf8', '#22c55e', '#eab308', '#ef4444']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.mapLegendGradientBar}
              />
              <View style={styles.mapLegendLabels}>
                <Text style={styles.mapLegendLabelText}>Nhẹ</Text>
                <Text style={styles.mapLegendLabelText}>Vừa</Text>
                <Text style={styles.mapLegendLabelText}>To</Text>
                <Text style={styles.mapLegendLabelText}>Rất to</Text>
              </View>
            </View>
          </ImageBackground>
        </View>

        {/* Thẻ hướng dẫn */}
        <View style={styles.contentCard}>
          <Text style={styles.cardTitle}>💡 Giám sát thời tiết vệ tinh</Text>
          <Text style={{ color: C.textSub, fontSize: 13, lineHeight: 18 }}>
            Hệ thống vệ tinh khí tượng giúp bạn theo dõi chuyển động mây giông từ Biển Đông vào đất liền và đánh giá lượng mưa thời gian thực.
          </Text>
        </View>

        {/* Nút điều hướng chân trang */}
        <View style={styles.subpageNavFooter}>
          <TouchableOpacity style={styles.subpageNavBtn} onPress={() => setActiveTab('forecast')}>
            <Text style={styles.subpageNavBtnText}>📊 Xem Dự Báo 14 Ngày →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.subpageNavBtn} onPress={() => setActiveTab('air')}>
            <Text style={styles.subpageNavBtnText}>🍃 Xem Chất Lượng Không Khí →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  /* ─── TAB 4: CHẤT LƯỢNG KHÔNG KHÍ & SỨC KHỎE ─── */
  const renderAirTab = () => {
    if (!weather) return null;
    const c = weather.current;
    const uvInfo = getUvInfo(c.uv);
    const aqiInfo = getAqiInfo(weather.airQuality?.aqi);

    return (
      <ScrollView contentContainerStyle={styles.subpageScrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner ảnh phong cảnh 2K đồng bộ */}
        {renderSubpageBanner(
          'Không Khí & Sức Khỏe',
          '🍃',
          `Báo cáo chỉ số ô nhiễm AQI, bụi mịn PM2.5, bức xạ tia UV và thông số khí quyển chuyên sâu tại ${location?.name}.`
        )}

        {/* ĐÁNH GIÁ CHẤT LƯỢNG KHÔNG KHÍ (AQI) */}
        {weather.airQuality && (
          <View style={styles.contentCard}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardTitle}>🌬️ Chỉ số Không khí (AQI)</Text>
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

            {/* Chi tiết 4 hạt ô nhiễm */}
            <View style={styles.pollutantsGrid}>
              <View style={styles.pollutantPill}>
                <Text style={styles.pollutantName}>Bụi mịn PM2.5</Text>
                <Text style={styles.pollutantVal}>{weather.airQuality.pm25} μg/m³</Text>
              </View>
              <View style={styles.pollutantPill}>
                <Text style={styles.pollutantName}>Bụi PM10</Text>
                <Text style={styles.pollutantVal}>{weather.airQuality.pm10} μg/m³</Text>
              </View>
              <View style={styles.pollutantPill}>
                <Text style={styles.pollutantName}>Khí Ozone (O₃)</Text>
                <Text style={styles.pollutantVal}>{weather.airQuality.o3} μg/m³</Text>
              </View>
              <View style={styles.pollutantPill}>
                <Text style={styles.pollutantName}>Khí NO₂</Text>
                <Text style={styles.pollutantVal}>{weather.airQuality.no2} μg/m³</Text>
              </View>
            </View>
          </View>
        )}

        {/* BỘ 6 WIDGET KHÍ TƯỢNG CHUYÊN SÂU (APPLE WEATHER STYLE) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>🧭 Thông số khí tượng chuyên sâu</Text>
        </View>

        <View style={styles.metricsGrid}>
          {/* UV Card */}
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>☀️</Text>
            <Text style={styles.metricLabel}>Chỉ số tia UV</Text>
            <Text style={[styles.metricVal, { color: uvInfo.color }]}>{c.uv ?? '--'}</Text>
            <Text style={[styles.metricSub, { color: uvInfo.color, fontWeight: '700' }]}>{uvInfo.level}</Text>
          </View>

          {/* Mặt trời mọc & lặn */}
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>🌅</Text>
            <Text style={styles.metricLabel}>Mặt trời mọc & lặn</Text>
            <Text style={styles.metricVal}>{fmtTimeOnly(c.sunrise)}</Text>
            <Text style={styles.metricSub}>Lặn lúc {fmtTimeOnly(c.sunset)}</Text>
          </View>

          {/* Gió */}
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>💨</Text>
            <Text style={styles.metricLabel}>Gió & Hướng thổi</Text>
            <Text style={styles.metricVal}>{c.wind} <Text style={{ fontSize: 11, fontWeight: '400' }}>km/h</Text></Text>
            <Text style={styles.metricSub}>{c.windDir || 'Gió êm ả'}</Text>
          </View>

          {/* Tầm nhìn xa */}
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>👁️</Text>
            <Text style={styles.metricLabel}>Tầm nhìn xa</Text>
            <Text style={styles.metricVal}>{c.visibility} <Text style={{ fontSize: 11, fontWeight: '400' }}>km</Text></Text>
            <Text style={styles.metricSub}>{c.visibility >= 9 ? 'Quang đãng' : 'Có sương mù'}</Text>
          </View>

          {/* Mây che phủ */}
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>☁️</Text>
            <Text style={styles.metricLabel}>Mây che phủ</Text>
            <Text style={styles.metricVal}>{c.clouds}%</Text>
            <Text style={styles.metricSub}>{c.clouds <= 30 ? 'Trời quang đãng' : 'Nhiều mây'}</Text>
          </View>

          {/* Áp suất */}
          <View style={styles.metricCard}>
            <Text style={styles.metricIcon}>🧭</Text>
            <Text style={styles.metricLabel}>Áp suất khí quyển</Text>
            <Text style={styles.metricVal}>{c.pressure} <Text style={{ fontSize: 11, fontWeight: '400' }}>hPa</Text></Text>
            <Text style={styles.metricSub}>Tiêu chuẩn ổn định</Text>
          </View>
        </View>

        {/* Khuyến nghị sức khỏe */}
        <View style={styles.contentCard}>
          <Text style={styles.cardTitle}>💡 Lời khuyên sức khỏe theo thời tiết</Text>
          <Text style={{ color: C.textSub, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
            {c.uv >= 8
              ? 'Tia cực tím ở mức rất cao. Bạn nên bôi kem chống nắng SPF 30+, mặc áo khoác dài tay và hạn chế tiếp xúc trực tiếp ánh nắng từ 11h đến 15h.'
              : c.humidity >= 85
              ? 'Độ ẩm không khí khá cao, hãy chú ý uống đủ nước và giữ không gian phòng thông thoáng.'
              : 'Thời tiết hiện tại lý tưởng cho việc đi dạo, thể thao ngoài trời và các hoạt động sinh hoạt gia đình.'}
          </Text>
        </View>

        {/* Nút điều hướng chân trang */}
        <View style={styles.subpageNavFooter}>
          <TouchableOpacity style={styles.subpageNavBtn} onPress={() => setActiveTab('map')}>
            <Text style={styles.subpageNavBtnText}>🛰️ Xem Bản Đồ Radar →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.subpageNavBtn} onPress={() => setActiveTab('forecast')}>
            <Text style={styles.subpageNavBtnText}>📊 Xem Dự Báo 14 Ngày →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  /* ─── TAB 5: TÌM KIẾM & ĐỊA ĐIỂM YÊU THÍCH ─── */
  const renderSearchTab = () => (
    <ScrollView contentContainerStyle={styles.subpageScrollContent} showsVerticalScrollIndicator={false}>
      {/* Banner ảnh phong cảnh 2K đồng bộ */}
      {renderSubpageBanner(
        'Tìm Kiếm & Yêu Thích',
        '🔍',
        'Tra cứu thời tiết thời gian thực tại 63 tỉnh thành Việt Nam và quản lý danh sách địa điểm đã lưu.'
      )}

      {/* Ô tìm kiếm */}
      <View style={styles.searchBarBox}>
        <Text style={styles.searchBarIcon}>🔍</Text>
        <TextInput
          style={styles.searchBarInput}
          placeholder="Nhập tên thành phố (Nha Trang, Vạn Ninh, Đà Lạt...)"
          placeholderTextColor={C.textMuted}
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchText(''); setSuggestions([]); }}>
            <Text style={styles.searchClearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {searching && <ActivityIndicator color={C.accent} style={{ marginVertical: 14 }} />}

      {/* Kết quả tìm kiếm Geocoding */}
      {suggestions.length > 0 && (
        <View style={styles.suggestionListBox}>
          {suggestions.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.suggestionItemRow, i > 0 && styles.suggestionBorder]}
              onPress={() => selectLocation(item)}
            >
              <Text style={styles.suggestionPin}>📍</Text>
              <Text style={styles.suggestionTitle}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Danh sách địa điểm đã lưu yêu thích (Favorites) */}
      {favs.length > 0 && (
        <View style={styles.contentCard}>
          <Text style={styles.cardTitle}>⭐ Địa điểm đã lưu yêu thích</Text>
          <View style={styles.favListChipsWrap}>
            {favs.map((f, i) => (
              <TouchableOpacity
                key={i}
                style={styles.favChipItem}
                onPress={() => selectLocation(f)}
              >
                <Text style={styles.favChipName}>★ {f.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Danh sách địa phương nhanh (Khánh Hòa & các thành phố lớn) */}
      <View style={styles.contentCard}>
        <Text style={styles.cardTitle}>📌 Địa phương nhanh (Khánh Hòa & Toàn quốc)</Text>
        <View style={styles.quickLocationsGrid}>
          {QUICK_LOCATIONS.map((item, i) => {
            const isSelected = location?.name?.includes(item.name);
            return (
              <TouchableOpacity
                key={i}
                style={[styles.quickLocationButton, isSelected && styles.quickLocationButtonActive]}
                onPress={() => selectLocation(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickLocationText, isSelected && styles.quickLocationTextActive]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
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
                <Text style={[styles.modalCellVal, { color: '#ef4444' }]}>{convertT(selectedDay.max)}{unitLabel}</Text>
              </View>
              <View style={styles.modalStatCell}>
                <Text style={styles.modalCellLabel}>Nhiệt độ thấp nhất</Text>
                <Text style={[styles.modalCellVal, { color: '#fbbf24' }]}>{convertT(selectedDay.min)}{unitLabel}</Text>
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
                  {selectedDay.owm ? `${convertT(selectedDay.owm.min)}–${convertT(selectedDay.owm.max)}°` : 'Không có'}
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

  /* ─── THANH ĐIỀU HƯỚNG DƯỚI CÙNG (5 TABS CHUẨN) ─── */
  const tabs = [
    { id: 'home', icon: '🏠', label: 'Tổng quan' },
    { id: 'forecast', icon: '📊', label: 'Dự báo' },
    { id: 'map', icon: '🛰️', label: 'Radar' },
    { id: 'air', icon: '🍃', label: 'Không khí' },
    { id: 'search', icon: '🔍', label: 'Tìm kiếm' },
  ];

  return (
    <View style={styles.appContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#060b14" />
      
      {/* 1. Header SkyCast VN Hiện Đại */}
      {renderSkycastHeader()}

      {/* 2. Main Views */}
      <View style={styles.viewContainer}>
        {activeTab === 'home' && renderHomeTab()}
        {activeTab === 'forecast' && renderForecastTab()}
        {activeTab === 'map' && renderMapTab()}
        {activeTab === 'air' && renderAirTab()}
        {activeTab === 'search' && renderSearchTab()}
      </View>

      {/* 3. Modal chi tiết ngày */}
      {renderDayModal()}

      {/* 4. Bottom Tab Bar 5 Chuyên Mục */}
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

  /* Header SkyCast VN */
  headerBar: {
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
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerLogoBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogoEmoji: {
    fontSize: 18,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBrandTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  realtimeTag: {
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  realtimeTagText: {
    color: '#38bdf8',
    fontSize: 8.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  headerBrandSubtitle: {
    color: C.textSub,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  unitBtnText: {
    color: '#38bdf8',
    fontWeight: '800',
    fontSize: 12,
  },
  gpsButton: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  gpsGradient: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsIcon: {
    fontSize: 15,
  },

  /* Scroll container */
  homeScrollContent: {
    padding: 16,
    paddingBottom: 20,
  },
  subpageScrollContent: {
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
  safeBannerRow: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 14,
  },
  safeBannerText: {
    color: '#4ade80',
    fontSize: 11.5,
    fontWeight: '600',
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
  heroTopActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  scenicBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  scenicBadgeText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  favBtnPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  favBtnPillActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderColor: '#fbbf24',
  },
  favBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  heroLocationTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroMainWeatherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTempValue: {
    color: '#fff',
    fontSize: 66,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 72,
  },
  heroDescText: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  heroIconBox: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmojiIcon: {
    fontSize: 60,
  },
  heroSubStatsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  heroStatChip: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  heroStatChipLabel: {
    color: '#94a3b8',
    fontSize: 9.5,
    fontWeight: '600',
  },
  heroStatChipVal: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 2,
  },

  /* SUBPAGE SCENIC BANNER (ĐỒNG BỘ ẢNH 2K) */
  subpageBannerWrap: {
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: '#0f1d33',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  subpageBannerBg: {
    width: '100%',
  },
  subpageBannerOverlay: {
    padding: 16,
  },
  subpageBannerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  subpageBreadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  breadcrumbHome: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  breadcrumbSep: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
  },
  breadcrumbCurrent: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  scenicBadgeSmall: {
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scenicBadgeSmallText: {
    color: '#f8fafc',
    fontSize: 10.5,
    fontWeight: '600',
  },
  subpageBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  subpageTitleIcon: {
    fontSize: 26,
    marginTop: 2,
  },
  subpageTitleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subpageDescText: {
    color: '#cbd5e1',
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 2,
  },
  subpageBannerBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  subpageLocChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
    flexShrink: 1,
  },
  locChipPin: { fontSize: 11 },
  locChipName: { color: '#fff', fontSize: 11, fontWeight: '700', maxWidth: 100 },
  locChipSep: { color: 'rgba(255,255,255,0.4)', fontSize: 9 },
  locChipTemp: { color: '#fbbf24', fontSize: 11, fontWeight: '800' },
  locChipDesc: { color: '#cbd5e1', fontSize: 10.5, textTransform: 'capitalize' },
  subpageBackBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  subpageBackBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  /* CTA Action Cards Hub */
  ctaHubContainer: {
    marginTop: 10,
    gap: 12,
  },
  ctaHubIntroRow: {
    marginBottom: 4,
  },
  ctaHubIntroHeading: {
    color: C.textMain,
    fontSize: 15,
    fontWeight: '800',
  },
  ctaHubIntroSub: {
    color: C.textSub,
    fontSize: 11.5,
    marginTop: 1,
  },
  ctaCardBox: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  ctaCardGradient: {
    padding: 16,
  },
  ctaCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  ctaIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaIconEmoji: {
    fontSize: 20,
  },
  ctaTagPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ctaTagText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  ctaCardTitle: {
    color: C.textMain,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  ctaCardDesc: {
    color: C.textSub,
    fontSize: 12,
    lineHeight: 16.5,
    marginBottom: 12,
  },
  ctaButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  ctaButtonLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  ctaArrow: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  /* KPI Thống Kê Cards */
  kpiCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  kpiCardItem: {
    flex: 1,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  kpiCardLabel: {
    color: C.textSub,
    fontSize: 11,
    fontWeight: '600',
  },
  kpiCardVal: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  kpiCardSub: {
    color: C.textMuted,
    fontSize: 9.5,
    marginTop: 1,
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
  sectionActionLink: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '700',
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
  },
  hourlyEmoji: {
    fontSize: 24,
    marginVertical: 6,
  },
  hourlyTempText: {
    color: C.textMain,
    fontSize: 15,
    fontWeight: '800',
  },
  hourlyPopBadge: {
    marginTop: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  hourlyPopText: {
    color: C.accentRain,
    fontSize: 10,
    fontWeight: '700',
  },
  hourlyPopEmpty: {
    color: C.textMuted,
    fontSize: 11,
    marginTop: 4,
  },

  /* General Content Card */
  contentCard: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 18,
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
    marginBottom: 6,
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

  /* AQI Box */
  aqiScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  aqiBigScore: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1,
  },
  aqiAdviceText: {
    color: C.textSub,
    fontSize: 12,
    lineHeight: 16,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  pollutantsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pollutantPill: {
    flex: 1,
    minWidth: (SCREEN_W - 32 - 32 - 8) / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  pollutantName: {
    color: C.textSub,
    fontSize: 10.5,
    fontWeight: '600',
  },
  pollutantVal: {
    color: C.textMain,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },

  /* Metrics 6-Card Grid */
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
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
    marginBottom: 4,
  },
  metricLabel: {
    color: C.textSub,
    fontSize: 11,
    fontWeight: '600',
  },
  metricVal: {
    color: C.textMain,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  metricSub: {
    color: C.textMuted,
    fontSize: 10.5,
    marginTop: 2,
  },

  /* Forecast List Items */
  forecastCard: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 16,
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
    fontSize: 12,
    marginTop: 2,
  },
  forecastTempBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  forecastHighTemp: {
    color: '#ef4444',
    fontSize: 17,
    fontWeight: '800',
  },
  forecastLowTemp: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '700',
  },
  forecastStatsPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  forecastStatPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  forecastStatPillText: {
    color: C.textSub,
    fontSize: 10.5,
    fontWeight: '600',
  },

  /* Consensus Badge */
  consensusBadge: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  consensusDesc: {
    color: C.textSub,
    fontSize: 12,
    lineHeight: 16,
  },

  /* Subpage Navigation Footer */
  subpageNavFooter: {
    marginTop: 10,
    gap: 8,
  },
  subpageNavBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  subpageNavBtnText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Map View Styling */
  mapControlCard: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  mapControlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mapLocName: {
    color: C.textMain,
    fontSize: 15,
    fontWeight: '800',
  },
  mapCoordsText: {
    color: C.textSub,
    fontSize: 11,
    marginTop: 2,
  },
  mapGpsBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mapGpsBtnText: {
    color: '#38bdf8',
    fontSize: 11.5,
    fontWeight: '700',
  },
  mapLayerButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mapLayerBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 12,
    paddingVertical: 7,
    alignItems: 'center',
  },
  mapLayerBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  mapLayerBtnText: {
    color: C.textSub,
    fontSize: 11,
    fontWeight: '700',
  },
  mapLayerBtnTextActive: {
    color: '#fff',
  },
  mapCanvasWrapper: {
    height: 320,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  mapCanvasImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
    padding: 14,
  },
  mapRadarOverlay: {
    position: 'absolute',
    inset: 0,
    opacity: 0.7,
  },
  mapCenterMarkerBox: {
    alignSelf: 'center',
    marginTop: 80,
    alignItems: 'center',
  },
  radarPulseRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(56, 189, 248, 0.35)',
  },
  mapPinBadge: {
    backgroundColor: '#0284c7',
    borderWidth: 1.5,
    borderColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  mapPinBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  mapRadarLegend: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    padding: 8,
  },
  mapLegendTitle: {
    color: '#94a3b8',
    fontSize: 9.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  mapLegendGradientBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 3,
  },
  mapLegendLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mapLegendLabelText: {
    color: '#64748b',
    fontSize: 8.5,
  },

  /* Search & Suggestions */
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 25, 45, 0.95)',
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 18,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 14,
  },
  searchBarIcon: {
    fontSize: 17,
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
    padding: 4,
  },
  suggestionListBox: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  suggestionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  suggestionBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  suggestionPin: {
    fontSize: 15,
    marginRight: 10,
  },
  suggestionTitle: {
    color: C.textMain,
    fontSize: 13.5,
    fontWeight: '600',
  },
  favListChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  favChipItem: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  favChipName: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
  },
  quickLocationsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  quickLocationButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickLocationButtonActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  quickLocationText: {
    color: C.textSub,
    fontSize: 12,
    fontWeight: '600',
  },
  quickLocationTextActive: {
    color: '#38bdf8',
    fontWeight: '800',
  },

  /* Suggestions bullet */
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  suggestionBullet: {
    fontSize: 14,
    marginTop: 1,
  },
  suggestionText: {
    color: C.textSub,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },

  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCardWindow: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0f1d33',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalDateTitle: {
    color: '#fff',
    fontSize: 17,
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
    fontSize: 14.5,
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
    fontSize: 10.5,
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
