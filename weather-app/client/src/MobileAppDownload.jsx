import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

export const EXPO_BUILD_URL = 'https://expo.dev/accounts/longbao/projects/thoi-tiet-vn/builds/5a9bc843-82fd-4c5b-800d-8f1e4c926811';
export const DIRECT_APK_FILENAME = 'weather-app.apk';

/* Component vẽ QR Code tự động trên Canvas */
function QrCodeCanvas({ url, size = 180 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    }).catch((err) => {
      console.error('Error generating QR code:', err);
    });
  }, [url, size]);

  return (
    <div className="app-qr-canvas-wrapper">
      <canvas ref={canvasRef} style={{ width: size, height: size, display: 'block' }} />
    </div>
  );
}

/* Phần Showcase Tải App trên Trang Chủ */
export function MobileAppSection({ onOpenModal, showToast }) {
  const [qrTarget, setQrTarget] = useState('expo'); // 'expo' | 'direct'
  const [showSteps, setShowSteps] = useState(false);

  const directApkUrl = typeof window !== 'undefined' ? `${window.location.origin}/${DIRECT_APK_FILENAME}` : `/${DIRECT_APK_FILENAME}`;
  const currentQrUrl = qrTarget === 'expo' ? EXPO_BUILD_URL : directApkUrl;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentQrUrl).then(() => {
      if (showToast) showToast('📋 Đã sao chép liên kết tải ứng dụng!');
    });
  };

  return (
    <section className="card mobile-app-section" id="download-app">
      <div className="mobile-app-grid">
        {/* Cột trái: Thông tin đồ án & Tính năng App */}
        <div className="mobile-app-info">
          <div className="mobile-app-badges">
            <span className="app-pill-badge primary">📱 ĐỒ ÁN REACT NATIVE</span>
            <span className="app-pill-badge green">✓ SẴN SÀNG CÀI ĐẶT (APK)</span>
            <span className="app-pill-badge blue">v1.0.0</span>
          </div>

          <h2 className="mobile-app-heading">
            Cài Đặt Ứng Dụng Thời Tiết VN Cho Android
          </h2>

          <p className="mobile-app-desc">
            Trải nghiệm phiên bản ứng dụng di động độc lập được thiết kế tối ưu cho điện thoại Android. 
            Cập nhật thời tiết theo thời gian thực, tự động lấy vị trí GPS và tra cứu radar thời tiết vệ tinh mọi lúc mọi nơi.
          </p>

          <div className="app-features-grid">
            <div className="app-feature-card">
              <span className="app-feature-icon">⚡</span>
              <div>
                <strong>Tốc độ tức thì</strong>
                <p>Khởi động nhanh, đồng bộ dữ liệu đa nguồn độc lập</p>
              </div>
            </div>
            <div className="app-feature-card">
              <span className="app-feature-icon">📍</span>
              <div>
                <strong>GPS thông minh</strong>
                <p>Tự động nhận diện phường/xã và tỉnh thành theo tọa độ</p>
              </div>
            </div>
            <div className="app-feature-card">
              <span className="app-feature-icon">🛰️</span>
              <div>
                <strong>Radar vệ tinh</strong>
                <p>Xem mây mưa và giông sét trực quan trên màn hình cảm ứng</p>
              </div>
            </div>
            <div className="app-feature-card">
              <span className="app-feature-icon">🔔</span>
              <div>
                <strong>Cảnh báo thời tiết</strong>
                <p>Cảnh báo mức độ UV cực đoan và chỉ số ô nhiễm AQI</p>
              </div>
            </div>
          </div>

          {/* Hàng nút bấm tải */}
          <div className="app-action-buttons">
            <a
              href={directApkUrl}
              download="thoi-tiet-vn.apk"
              className="app-btn-main primary"
              title="Tải trực tiếp file APK về máy"
            >
              <span className="btn-icon">📥</span>
              <div className="btn-text-wrap">
                <span className="btn-title">Tải File APK Trực Tiếp</span>
                <span className="btn-sub">Bản Android độc lập (~48 MB)</span>
              </div>
            </a>

            <a
              href={EXPO_BUILD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="app-btn-main secondary"
              title="Xem trang cài đặt trên Expo Cloud"
            >
              <span className="btn-icon">🚀</span>
              <div className="btn-text-wrap">
                <span className="btn-title">Cài Đặt Qua Expo EAS</span>
                <span className="btn-sub">Mở trang build chính thức</span>
              </div>
            </a>

            <button
              type="button"
              className="app-btn-main outline"
              onClick={handleCopyLink}
              title="Sao chép liên kết tải"
            >
              <span className="btn-icon">📋</span>
              <span className="btn-title">Sao Chép Link</span>
            </button>
          </div>

          {/* Nút bật/tắt hướng dẫn cài đặt */}
          <div className="guide-accordion-box">
            <button
              type="button"
              className="guide-toggle-btn"
              onClick={() => setShowSteps(!showSteps)}
            >
              <span>{showSteps ? '▼' : '▶'} <strong>Hướng dẫn 3 bước cài đặt file APK trên Android</strong></span>
              <span className="guide-pill">{showSteps ? 'Thu gọn' : 'Xem chi tiết'}</span>
            </button>

            {showSteps && (
              <div className="guide-steps-list">
                <div className="guide-step-item">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <strong>Tải file APK về máy:</strong> Bấm nút <em>"Tải File APK Trực Tiếp"</em> ở trên hoặc dùng Camera điện thoại quét mã QR bên cạnh.
                  </div>
                </div>
                <div className="guide-step-item">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <strong>Xác nhận bảo mật Android:</strong> Mở tệp vừa tải. Nếu Android cảnh báo <em>"Tệp có thể gây hại"</em> hoặc <em>"Ứng dụng từ nguồn không xác định"</em> (do cài trực tiếp ngoài Play Store), chọn <strong>"Vẫn tải xuống"</strong> và bật <strong>"Cho phép từ nguồn này"</strong>.
                  </div>
                </div>
                <div className="guide-step-item">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <strong>Cài đặt & Thưởng thức:</strong> Nhấn nút <strong>"Cài đặt"</strong> (Install). Sau vài giây ứng dụng sẽ xuất hiện trên màn hình chính!
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cột phải: Khung điện thoại & QR Code scan bằng Camera */}
        <div className="mobile-app-preview-col">
          <div className="phone-mockup-wrapper">
            <div className="phone-card-header">
              <span className="phone-lens-dot"></span>
              <span className="phone-speaker-bar"></span>
            </div>

            <div className="phone-card-body">
              <div className="qr-scan-badge">📷 Quét Bằng Camera Điện Thoại</div>
              
              <div className="qr-toggle-pills">
                <button
                  type="button"
                  className={`qr-pill ${qrTarget === 'expo' ? 'active' : ''}`}
                  onClick={() => setQrTarget('expo')}
                >
                  🚀 Link Expo Cloud
                </button>
                <button
                  type="button"
                  className={`qr-pill ${qrTarget === 'direct' ? 'active' : ''}`}
                  onClick={() => setQrTarget('direct')}
                >
                  📦 Link Trực Tiếp Web
                </button>
              </div>

              <div className="qr-canvas-box">
                <QrCodeCanvas url={currentQrUrl} size={190} />
              </div>

              <div className="qr-instruction">
                Mở ứng dụng <strong>Camera</strong> trên điện thoại và hướng vào mã QR trên để tải app ngay lập tức.
              </div>

              <div className="phone-meta-tags">
                <span>🤖 Android 8.0+</span>
                <span>📦 ~48 MB</span>
                <span>🔒 Miễn phí 100%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Modal Popup Khi Click Nút "Tải App" ở Header */
export function MobileAppModal({ isOpen, onClose, showToast }) {
  const [qrTarget, setQrTarget] = useState('expo');
  const directApkUrl = typeof window !== 'undefined' ? `${window.location.origin}/${DIRECT_APK_FILENAME}` : `/${DIRECT_APK_FILENAME}`;
  const currentQrUrl = qrTarget === 'expo' ? EXPO_BUILD_URL : directApkUrl;

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentQrUrl).then(() => {
      if (showToast) showToast('📋 Đã sao chép liên kết tải ứng dụng!');
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window app-download-modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📱</span> Tải Ứng Dụng Thời Tiết VN (Android APK)
            </h3>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-sub)', marginTop: 4 }}>
              Đồ án Chuyên ngành CNTT · Đại học Thái Bình Dương
            </div>
          </div>
          <button className="modal-close-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-app-modal-body">
          <div className="modal-qr-side">
            <div className="qr-toggle-pills" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={`qr-pill ${qrTarget === 'expo' ? 'active' : ''}`}
                onClick={() => setQrTarget('expo')}
              >
                🚀 Expo Cloud
              </button>
              <button
                type="button"
                className={`qr-pill ${qrTarget === 'direct' ? 'active' : ''}`}
                onClick={() => setQrTarget('direct')}
              >
                📦 Tải Trực Tiếp Web
              </button>
            </div>

            <div className="qr-canvas-box" style={{ background: '#fff', padding: 12, borderRadius: 16, display: 'inline-block' }}>
              <QrCodeCanvas url={currentQrUrl} size={180} />
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)', marginTop: 8, textAlign: 'center' }}>
              Quét bằng Camera điện thoại để tải
            </div>
          </div>

          <div className="modal-info-side">
            <div className="modal-app-specs">
              <div className="spec-badge">🤖 HĐH: <strong>Android 8.0+</strong></div>
              <div className="spec-badge">📦 Dung lượng: <strong>~48 MB</strong></div>
              <div className="spec-badge">🏷️ Phiên bản: <strong>1.0.0 (Preview)</strong></div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              <a
                href={directApkUrl}
                download="thoi-tiet-vn.apk"
                className="app-btn-main primary"
                style={{ justifyContent: 'center' }}
              >
                <span className="btn-icon">📥</span>
                <span className="btn-title">Tải File APK Về Máy</span>
              </a>

              <a
                href={EXPO_BUILD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="app-btn-main secondary"
                style={{ justifyContent: 'center' }}
              >
                <span className="btn-icon">🚀</span>
                <span className="btn-title">Mở Trang Expo EAS Build</span>
              </a>

              <button
                type="button"
                className="app-btn-main outline"
                onClick={handleCopyLink}
                style={{ justifyContent: 'center' }}
              >
                <span className="btn-icon">📋</span>
                <span className="btn-title">Sao Chép Link Tải</span>
              </button>
            </div>

            <div className="modal-guide-card">
              <strong>💡 Lưu ý cài đặt trên Android:</strong>
              <ol style={{ paddingLeft: 18, marginTop: 6, fontSize: '0.82rem', lineHeight: 1.5 }}>
                <li>Tải file APK về máy bằng nút ở trên.</li>
                <li>Khi mở file, nếu Android hiện cảnh báo, chọn <strong>"Vẫn tải xuống"</strong> hoặc <strong>"Cho phép nguồn không xác định"</strong>.</li>
                <li>Nhấn <strong>"Cài đặt"</strong> là hoàn tất!</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
