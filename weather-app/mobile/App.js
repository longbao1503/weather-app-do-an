import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, FlatList, Image, RefreshControl, Animated,
  StatusBar, Platform, Dimensions, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { fetchWeather, fetchGeocode } from './src/api';
import {
  fmtDay, fmtHour, fmtTimeOnly, weatherEmoji,
  getUvInfo, getAqiInfo, QUICK_LOCATIONS,
} from './src/utils';

const { width: SCREEN_W } = Dimensions.get('window');

/* ─── Màu sắc ─── */
const C = {
  bg: '#0b1120',
  card: 'rgba(255,255,255,0.07)',
  cardBorder: 'rgba(255,255,255,0.12)',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  accent: '#38bdf8',
  accentDark: '#0ea5e9',
  danger: '#f87171',
  warn: '#fbbf24',
  success: '#34d399',
  gradTop: '#0f2044',
  gradBot: '#0b1120',
};

/* ─── Component Card ─── */
const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

/* ─── Thanh stat nhỏ ─── */
const StatItem = ({ icon, label, value }) => (
  <View style={styles.statItem}>
    <Text style={styles.statIcon}>{icon}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

/* ─── Progress bar ─── */
const ProgressBar = ({ pct, color }) => (
  <View style={styles.progressBg}>
    <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
  </View>
);

/* ─── Alert Banner ─── */
const AlertBanner = ({ alerts }) => {
  if (!alerts || alerts.length === 0) return null;
  return (
    <View style={styles.alertsWrap}>
      {alerts.map((a, i) => (
        <View key={i} style={[styles.alertRow, { borderLeftColor: a.level === 'danger' ? C.danger : C.warn }]}>
          <Text style={styles.alertTitle}>{a.level === 'danger' ? '🚨' : '⚠️'} {a.title}</Text>
          <Text style={styles.alertMsg}>{a.msg}</Text>
        </View>
      ))}
    </View>
  );
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
      // Cache lại
      await AsyncStorage.setItem('lastWeather', JSON.stringify({ data, loc, ts: Date.now() }));
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    } catch (e) {
      setError(e.message);
      // Load cache nếu lỗi
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
        // Dùng Nha Trang làm mặc định
        const def = { lat: 12.2388, lon: 109.1967, name: 'Nha Trang' };
        setLocation(def);
        loadWeather(def);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lon } = pos.coords;
      // Reverse geocode
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      const name = geo?.[0]?.city || geo?.[0]?.region || 'Vị trí của bạn';
      const loc = { lat, lon, name };
      setLocation(loc);
      loadWeather(loc);
    } catch (e) {
      const def = { lat: 12.2388, lon: 109.1967, name: 'Nha Trang' };
      setLocation(def);
      loadWeather(def);
    }
  }, [loadWeather]);

  /* ─── Khởi động ─── */
  useEffect(() => {
    // Thử load cache trước
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

  /* ─── Render: Header ─── */
  const renderHeader = () => (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerCity}>
          📍 {location?.name || 'Đang tải...'}
        </Text>
        {weather && (
          <Text style={styles.headerUpdated}>
            Cập nhật: {new Date(weather.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={getGpsLocation} style={styles.gpsBtn}>
        <Text style={styles.gpsBtnText}>🎯</Text>
      </TouchableOpacity>
    </View>
  );

  /* ─── Render: Home Tab ─── */
  const renderHome = () => {
    if (loading && !weather) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loadingText}>Đang tải thời tiết...</Text>
        </View>
      );
    }
    if (error && !weather) {
      return (
        <View style={styles.errorWrap}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadWeather(location)}>
            <Text style={styles.retryBtnText}>Thử lại</Text>
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
        contentContainerStyle={styles.homeContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Cảnh báo */}
        <AlertBanner alerts={weather.alerts} />

        {/* Thẻ thời tiết chính */}
        <View style={styles.mainCard}>
          <Text style={styles.mainEmoji}>{weatherEmoji(c.desc)}</Text>
          <Text style={styles.mainTemp}>{c.temp}°C</Text>
          <Text style={styles.mainDesc}>{c.desc}</Text>
          <Text style={styles.mainFeels}>Cảm giác như {c.feels}°C</Text>
          <View style={styles.sunRow}>
            <Text style={styles.sunText}>🌅 {fmtTimeOnly(c.sunrise)}</Text>
            <Text style={styles.sunText}>🌇 {fmtTimeOnly(c.sunset)}</Text>
          </View>
        </View>

        {/* Stats grid */}
        <Card style={styles.statsCard}>
          <StatItem icon="💧" label="Độ ẩm" value={`${c.humidity}%`} />
          <StatItem icon="💨" label="Gió" value={`${c.wind} km/h ${c.windDir}`} />
          <StatItem icon="👁️" label="Tầm nhìn" value={`${c.visibility} km`} />
          <StatItem icon="🌡️" label="Áp suất" value={`${c.pressure} hPa`} />
          <StatItem icon="☁️" label="Mây che" value={`${c.clouds}%`} />
          <StatItem icon="🌞" label="UV Index" value={c.uv != null ? c.uv : '--'} />
        </Card>

        {/* Dự báo theo giờ */}
        <Text style={styles.sectionTitle}>⏰ Dự báo theo giờ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourlyScroll}>
          {weather.hourly.map((h, i) => (
            <View key={i} style={styles.hourlyItem}>
              <Text style={styles.hourlyTime}>{fmtHour(h.t)}</Text>
              <Text style={styles.hourlyEmoji}>{weatherEmoji(h.desc)}</Text>
              <Text style={styles.hourlyTemp}>{h.temp}°</Text>
              <Text style={styles.hourlyPop}>💧{h.pop}%</Text>
            </View>
          ))}
        </ScrollView>

        {/* Dự báo 7 ngày tóm tắt */}
        <Text style={styles.sectionTitle}>📅 7 ngày tới</Text>
        <Card>
          {weather.daily.slice(0, 7).map((d, i) => (
            <View key={i} style={[styles.dailyRow, i > 0 && styles.dailyRowBorder]}>
              <Text style={styles.dailyDay}>{i === 0 ? 'Hôm nay' : fmtDay(d.date)}</Text>
              <Text style={styles.dailyEmoji}>{weatherEmoji(d.text)}</Text>
              <View style={styles.dailyRight}>
                <Text style={styles.dailyHigh}>{d.max}°</Text>
                <Text style={styles.dailyLow}> / {d.min}°</Text>
                {d.rain > 0 && <Text style={styles.dailyRain}> 💧{d.rain}mm</Text>}
              </View>
            </View>
          ))}
        </Card>

        {/* UV Index */}
        <Text style={styles.sectionTitle}>🌞 UV Index</Text>
        <Card>
          <View style={styles.uvRow}>
            <Text style={styles.uvValue}>{c.uv ?? '--'}</Text>
            <Text style={[styles.uvLevel, { color: uvInfo.color }]}>{uvInfo.level}</Text>
          </View>
          <ProgressBar pct={uvInfo.pct} color={uvInfo.color} />
        </Card>

        {/* Chất lượng không khí */}
        {weather.airQuality && (
          <>
            <Text style={styles.sectionTitle}>🌬️ Chất lượng không khí (AQI)</Text>
            <Card>
              <View style={styles.uvRow}>
                <Text style={styles.uvValue}>{weather.airQuality.aqi ?? '--'}</Text>
                <Text style={[styles.uvLevel, { color: aqiInfo.color }]}>{aqiInfo.status}</Text>
              </View>
              <ProgressBar pct={aqiInfo.pct} color={aqiInfo.color} />
              <View style={styles.aqiGrid}>
                <Text style={styles.aqiItem}>PM2.5: {weather.airQuality.pm25} μg/m³</Text>
                <Text style={styles.aqiItem}>PM10: {weather.airQuality.pm10} μg/m³</Text>
                <Text style={styles.aqiItem}>O₃: {weather.airQuality.o3} μg/m³</Text>
                <Text style={styles.aqiItem}>NO₂: {weather.airQuality.no2} μg/m³</Text>
              </View>
            </Card>
          </>
        )}

        {/* Gợi ý hoạt động */}
        {weather.suggestions && weather.suggestions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>💡 Gợi ý hôm nay</Text>
            <Card>
              {weather.suggestions.map((s, i) => (
                <Text key={i} style={styles.suggestionItem}>• {s}</Text>
              ))}
            </Card>
          </>
        )}

        <View style={{ height: 32 }} />
      </Animated.ScrollView>
    );
  };

  /* ─── Render: Forecast Tab ─── */
  const renderForecast = () => {
    if (!weather) return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Chưa có dữ liệu</Text>
      </View>
    );
    return (
      <ScrollView contentContainerStyle={styles.forecastContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.forecastTitle}>📅 Dự báo 14 ngày</Text>
        {weather.daily.map((d, i) => (
          <Card key={i} style={styles.forecastCard}>
            <View style={styles.forecastRow}>
              <View style={styles.forecastLeft}>
                <Text style={styles.forecastDay}>{i === 0 ? 'Hôm nay' : fmtDay(d.date)}</Text>
                <Text style={styles.forecastDesc}>{weatherEmoji(d.text)} {d.text}</Text>
              </View>
              <View style={styles.forecastRight}>
                <Text style={styles.forecastHigh}>{d.max}°</Text>
                <Text style={styles.forecastLow}>{d.min}°</Text>
              </View>
            </View>
            <View style={styles.forecastStats}>
              {d.rain > 0 && <Text style={styles.forecastStat}>💧 {d.rain}mm</Text>}
              <Text style={styles.forecastStat}>💨 {d.wind}km/h</Text>
              {d.uv != null && <Text style={styles.forecastStat}>🌞 UV {d.uv}</Text>}
            </View>
          </Card>
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
    );
  };

  /* ─── Render: Search Tab ─── */
  const renderSearch = () => (
    <View style={styles.searchContainer}>
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm thành phố..."
          placeholderTextColor={C.textMuted}
          value={searchText}
          onChangeText={setSearchText}
          autoFocus
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchText(''); setSuggestions([]); }}>
            <Text style={{ color: C.textMuted, fontSize: 18, marginLeft: 8 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      {searching && <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />}
      {suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(_, i) => String(i)}
          style={styles.suggestionList}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.suggestionRow} onPress={() => selectLocation(item)}>
              <Text style={styles.suggestionText}>📍 {item.name}</Text>
            </TouchableOpacity>
          )}
        />
      )}
      <Text style={styles.quickTitle}>📌 Địa điểm nhanh</Text>
      <FlatList
        data={QUICK_LOCATIONS}
        keyExtractor={(_, i) => String(i)}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.quickBtn, location?.name === item.name && styles.quickBtnActive]}
            onPress={() => selectLocation(item)}
          >
            <Text style={styles.quickBtnText}>{item.name}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );

  /* ─── Tab Bar ─── */
  const tabs = [
    { id: 'home', icon: '🏠', label: 'Trang chủ' },
    { id: 'forecast', icon: '📅', label: 'Dự báo' },
    { id: 'search', icon: '🔍', label: 'Tìm kiếm' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {renderHeader()}
      <View style={styles.content}>
        {activeTab === 'home' && renderHome()}
        {activeTab === 'forecast' && renderForecast()}
        {activeTab === 'search' && renderSearch()}
      </View>
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={styles.tabItem}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {activeTab === tab.id && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 44 : 54, paddingBottom: 12,
    backgroundColor: C.gradTop, borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  headerCity: { color: C.text, fontSize: 17, fontWeight: '700' },
  headerUpdated: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  gpsBtn: { backgroundColor: C.card, borderRadius: 20, padding: 10, borderWidth: 1, borderColor: C.cardBorder },
  gpsBtnText: { fontSize: 20 },
  content: { flex: 1 },

  /* Loading / Error */
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { color: C.textMuted, fontSize: 15 },
  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  errorEmoji: { fontSize: 48 },
  errorText: { color: C.danger, fontSize: 14, textAlign: 'center' },
  retryBtn: { backgroundColor: C.accent, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  /* Card */
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.cardBorder,
  },

  /* Home content */
  homeContent: { padding: 16, paddingBottom: 0 },

  /* Alerts */
  alertsWrap: { marginBottom: 12, gap: 8 },
  alertRow: {
    backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 10, padding: 12,
    borderLeftWidth: 4,
  },
  alertTitle: { color: C.text, fontWeight: '700', fontSize: 13 },
  alertMsg: { color: C.textMuted, fontSize: 12, marginTop: 4 },

  /* Main card */
  mainCard: {
    alignItems: 'center', paddingVertical: 28,
    backgroundColor: 'rgba(56,189,248,0.08)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)', marginBottom: 12,
  },
  mainEmoji: { fontSize: 72, marginBottom: 8 },
  mainTemp: { color: C.text, fontSize: 72, fontWeight: '300', letterSpacing: -2 },
  mainDesc: { color: C.accent, fontSize: 18, marginTop: 4, fontWeight: '600', textTransform: 'capitalize' },
  mainFeels: { color: C.textMuted, fontSize: 14, marginTop: 6 },
  sunRow: { flexDirection: 'row', gap: 24, marginTop: 16 },
  sunText: { color: C.textMuted, fontSize: 13 },

  /* Stats */
  statsCard: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  statItem: { width: '33.33%', alignItems: 'center', paddingVertical: 12 },
  statIcon: { fontSize: 22, marginBottom: 4 },
  statLabel: { color: C.textMuted, fontSize: 11 },
  statValue: { color: C.text, fontSize: 13, fontWeight: '600', marginTop: 2 },

  /* Hourly */
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  hourlyScroll: { marginBottom: 12 },
  hourlyItem: {
    alignItems: 'center', backgroundColor: C.card, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginRight: 10,
    borderWidth: 1, borderColor: C.cardBorder,
  },
  hourlyTime: { color: C.textMuted, fontSize: 11, marginBottom: 6 },
  hourlyEmoji: { fontSize: 24, marginBottom: 4 },
  hourlyTemp: { color: C.text, fontSize: 16, fontWeight: '700' },
  hourlyPop: { color: '#93c5fd', fontSize: 11, marginTop: 4 },

  /* Daily */
  dailyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  dailyRowBorder: { borderTopWidth: 1, borderTopColor: C.cardBorder },
  dailyDay: { color: C.text, fontSize: 14, flex: 1 },
  dailyEmoji: { fontSize: 22, marginHorizontal: 12 },
  dailyRight: { flexDirection: 'row', alignItems: 'center' },
  dailyHigh: { color: C.text, fontWeight: '700', fontSize: 14 },
  dailyLow: { color: C.textMuted, fontSize: 14 },
  dailyRain: { color: '#93c5fd', fontSize: 12 },

  /* UV / AQI */
  uvRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 10 },
  uvValue: { color: C.text, fontSize: 32, fontWeight: '700' },
  uvLevel: { fontSize: 14, fontWeight: '600' },
  progressBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  aqiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  aqiItem: { color: C.textMuted, fontSize: 12, width: '48%' },

  /* Suggestions */
  suggestionItem: { color: C.text, fontSize: 14, lineHeight: 22 },

  /* Forecast */
  forecastContent: { padding: 16 },
  forecastTitle: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  forecastCard: { marginBottom: 10 },
  forecastRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  forecastLeft: { flex: 1 },
  forecastDay: { color: C.text, fontWeight: '700', fontSize: 15 },
  forecastDesc: { color: C.textMuted, fontSize: 13, marginTop: 4 },
  forecastRight: { alignItems: 'flex-end' },
  forecastHigh: { color: C.text, fontWeight: '700', fontSize: 18 },
  forecastLow: { color: C.textMuted, fontSize: 14 },
  forecastStats: { flexDirection: 'row', gap: 12, marginTop: 10 },
  forecastStat: { color: C.textMuted, fontSize: 12 },

  /* Search */
  searchContainer: { flex: 1, padding: 16 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: C.cardBorder, marginBottom: 12,
  },
  searchIcon: { fontSize: 18, marginRight: 10 },
  searchInput: { flex: 1, color: C.text, fontSize: 15 },
  suggestionList: { backgroundColor: C.card, borderRadius: 12, marginBottom: 16, maxHeight: 200 },
  suggestionRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  suggestionText: { color: C.text, fontSize: 14 },
  quickTitle: { color: C.text, fontWeight: '700', fontSize: 15, marginBottom: 12 },
  quickBtn: {
    flex: 1, backgroundColor: C.card, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: C.cardBorder,
  },
  quickBtnActive: { borderColor: C.accent, backgroundColor: 'rgba(56,189,248,0.15)' },
  quickBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },

  /* Tab bar */
  tabBar: {
    flexDirection: 'row', backgroundColor: C.gradTop,
    borderTopWidth: 1, borderTopColor: C.cardBorder,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8, paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', position: 'relative' },
  tabIcon: { fontSize: 22 },
  tabLabel: { color: C.textMuted, fontSize: 11, marginTop: 3 },
  tabLabelActive: { color: C.accent },
  tabIndicator: {
    position: 'absolute', bottom: -8, width: 24, height: 3,
    backgroundColor: C.accent, borderRadius: 2,
  },
});
