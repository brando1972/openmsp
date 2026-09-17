import React from 'react';
import { QrCode, Copy, Check } from 'lucide-react';

interface ZeroTouchTabProps {
  onTriggerToast: (msg: string) => void;
}

export const ZeroTouchTab: React.FC<ZeroTouchTabProps> = ({ onTriggerToast }) => {
  const jsonPayload = `{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME":
    "app.apexmsp.dpc",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION":
    "https://api.apexmsp.app/api/v1/apexmdm/dpc/latest.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM":
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
    "serverUrl": "https://api.apexmsp.app",
    "enrollmentToken": "tok_apex_logistics_2026",
    "assignedPolicy": "Warehouse Kiosk",
    "wifiSsid": "WH-Mesh-5G",
    "wifiPassword": "SecretPassword123"
  }
}`;

  const copyJson = () => {
    navigator.clipboard.writeText(jsonPayload);
    onTriggerToast('Zero-Touch JSON bundle copied to clipboard');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <h2 className="text-sm font-semibold text-white">6-Tap QR & Android Zero-Touch Provisioning</h2>
        <p className="text-xs text-slate-400">
          Provision unboxed or factory-reset tablets directly into Device Owner mode in seconds.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: QR Code Viewer */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-700">
            {/* SVG Representation of 6-tap Enrollment QR */}
            <div className="w-56 h-56 bg-slate-100 rounded-xl flex items-center justify-center border-2 border-slate-300 relative overflow-hidden group">
              <QrCode className="w-44 h-44 text-slate-900" />
              <div className="absolute inset-0 bg-fuchsia-600/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs font-bold text-fuchsia-800 bg-white/90 px-3 py-1.5 rounded-full shadow">
                  Scan to Enroll
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">Warehouse Kiosk Enrollment QR</h3>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Power on factory-fresh tablet &rarr; Tap welcome screen 6 times in empty space &rarr; Camera opens &rarr; Scan QR.
            </p>
          </div>
        </div>

        {/* Right: Provisioning Bundle Payload */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Android Enterprise Provisioning Extras
              </h3>
              <button
                onClick={copyJson}
                className="flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300 font-medium"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy JSON
              </button>
            </div>

            <pre className="mt-3 p-3 rounded-lg bg-black/90 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto leading-relaxed max-h-[300px]">
              {jsonPayload}
            </pre>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300">Zero-Touch Portal Integration:</div>
            <div>
              Compatible with Google Zero-Touch Portal, Samsung Knox Mobile Enrollment (KME), and SOTI.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
