import React, { useState } from 'react';
import { Copy, Check, Download, Sparkles, Camera } from 'lucide-react';

interface ModernMockupQrProps {
  token: string;
  title?: string;
  subtitle?: string;
  jsonPayload?: string;
  onCopy?: () => void;
}

export const ModernMockupQr: React.FC<ModernMockupQrProps> = ({
  token,
  title,
  subtitle,
  jsonPayload,
  onCopy
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'modern' | 'camera'>('modern');

  const payload = jsonPayload || JSON.stringify({
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME': 'app.apexmsp.dpc',
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': 'https://api.apexmsp.app/api/v1/apexmdm/dpc/latest.apk',
    'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
      serverUrl: 'https://api.apexmsp.app',
      enrollmentToken: token
    }
  }, null, 2);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(payload)}&size=360x360&margin=4`;

  const handleCopy = () => {
    navigator.clipboard.writeText(payload);
    setCopied(true);
    if (onCopy) onCopy();
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `apex-enrollment-${token}.png`;
    a.target = '_blank';
    a.click();
  };

  return (
    <div className="flex flex-col items-center text-center select-none">
      {/* Elevated White Card - Exact Mockup Style */}
      <div className="p-4 bg-white rounded-2xl shadow-xl border border-slate-700/60 relative group transition-all duration-200">
        {viewMode === 'modern' ? (
          /* Exact Modern Vector SVG from Mockup */
          <div className="w-48 h-48 flex items-center justify-center">
            <svg className="w-44 h-44" viewBox="0 0 100 100" fill="none">
              {/* Top-Left Finder Eye */}
              <rect x="5" y="5" width="30" height="30" rx="4" fill="#0f172a" />
              <rect x="10" y="10" width="20" height="20" rx="2" fill="white" />
              <rect x="15" y="15" width="10" height="10" rx="2" fill="#0f172a" />

              {/* Top-Right Finder Eye */}
              <rect x="65" y="5" width="30" height="30" rx="4" fill="#0f172a" />
              <rect x="70" y="10" width="20" height="20" rx="2" fill="white" />
              <rect x="75" y="15" width="10" height="10" rx="2" fill="#0f172a" />

              {/* Bottom-Left Finder Eye */}
              <rect x="5" y="65" width="30" height="30" rx="4" fill="#0f172a" />
              <rect x="10" y="70" width="20" height="20" rx="2" fill="white" />
              <rect x="15" y="75" width="10" height="10" rx="2" fill="#0f172a" />

              {/* Modern Stylized Geometry Dots */}
              <rect x="42" y="8" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="52" y="8" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="42" y="20" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="52" y="26" width="6" height="6" rx="1.5" fill="#0f172a" />

              <rect x="8" y="42" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="20" y="42" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="26" y="52" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="8" y="52" width="6" height="6" rx="1.5" fill="#0f172a" />

              <rect x="68" y="42" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="80" y="42" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="74" y="52" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="86" y="52" width="6" height="6" rx="1.5" fill="#0f172a" />

              <rect x="42" y="68" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="52" y="74" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="68" y="68" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="80" y="80" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="68" y="86" width="6" height="6" rx="1.5" fill="#0f172a" />
              <rect x="42" y="86" width="6" height="6" rx="1.5" fill="#0f172a" />

              {/* Exact Modern Fuchsia Center Brand Square from Mockup */}
              <rect x="40" y="40" width="20" height="20" rx="4" fill="#d946ef" />
              <rect x="45" y="45" width="10" height="10" rx="2" fill="white" />
            </svg>
          </div>
        ) : (
          /* Optical Camera Scan Mode */
          <div className="w-48 h-48 flex items-center justify-center p-1">
            <img
              src={qrUrl}
              alt="Optical Enrollment QR"
              className="w-full h-full object-contain"
              loading="eager"
            />
          </div>
        )}
      </div>

      {/* Token Label - Exact Mockup Style */}
      <span className="mt-4 font-mono text-xs text-fuchsia-400 font-semibold block">
        Token: {token}
      </span>

      {title && (
        <h3 className="text-sm font-bold text-white mt-1">{title}</h3>
      )}
      {subtitle && (
        <p className="text-xs text-slate-400 max-w-xs mt-0.5 leading-relaxed">{subtitle}</p>
      )}

      {/* Mode Switcher & Quick Actions */}
      <div className="mt-4 flex items-center gap-2">
        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => setViewMode('modern')}
            className={`px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1 font-medium ${
              viewMode === 'modern'
                ? 'bg-fuchsia-600/20 text-fuchsia-300 border border-fuchsia-500/40 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Clean Modern Vector Mockup"
          >
            <Sparkles className="w-3 h-3 text-fuchsia-400" />
            <span>Modern Mockup</span>
          </button>

          <button
            onClick={() => setViewMode('camera')}
            className={`px-2.5 py-1 rounded transition cursor-pointer flex items-center gap-1 font-medium ${
              viewMode === 'camera'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Raw Optical Camera Scan Matrix"
          >
            <Camera className="w-3 h-3" />
            <span>Camera Scan</span>
          </button>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'JSON'}</span>
        </button>

        <button
          onClick={handleDownload}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition cursor-pointer"
          title="Save PNG barcode image"
        >
          <Download className="w-3.5 h-3.5 text-fuchsia-400" />
          <span>PNG</span>
        </button>
      </div>
    </div>
  );
};
