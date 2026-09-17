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
    "https://api.apexmsp.app/api/v1/mdm/dpc/latest.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM":
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
    "serverUrl": "https://api.apexmsp.app",
    "enrollmentToken": "tok_apex_logistics_2026",
    "assignedPolicy": "Warehouse Kiosk",
    "wifiSsid": "WH-Mesh-Setup",
    "wifiPassword": "SecretPassword123"
  }
}`;

  const copyJson = () => {
    navigator.clipboard?.writeText(jsonPayload);
    onTriggerToast('Copied Android provisioning JSON to clipboard!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Zero-Touch & Android Enterprise Provisioning</h2>
        <p className="text-xs text-slate-400">
          Provision out-of-the-box tablets by scanning this QR code during the initial 6-tap welcome screen setup.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* QR Code Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center text-center">
          <h3 className="text-sm font-semibold text-white mb-1">Android Enterprise 6-Tap QR Code</h3>
          <p className="text-xs text-slate-400 mb-5 max-w-sm">
            Tap any blank area on the initial Android "Welcome" screen 6 times to open the QR camera scanner.
          </p>

          <div className="p-4 bg-white rounded-2xl shadow-xl border-4 border-fuchsia-500/40">
            <svg className="w-48 h-48" viewBox="0 0 100 100" fill="black">
              <rect x="5" y="5" width="30" height="30" rx="3" fill="#0f172a" />
              <rect x="10" y="10" width="20" height="20" fill="white" />
              <rect x="15" y="15" width="10" height="10" fill="#0f172a" />
              <rect x="65" y="5" width="30" height="30" rx="3" fill="#0f172a" />
              <rect x="70" y="10" width="20" height="20" fill="white" />
              <rect x="75" y="15" width="10" height="10" fill="#0f172a" />
              <rect x="5" y="65" width="30" height="30" rx="3" fill="#0f172a" />
              <rect x="10" y="70" width="20" height="20" fill="white" />
              <rect x="15" y="75" width="10" height="10" fill="#0f172a" />
              <rect x="42" y="10" width="6" height="6" fill="#d946ef" />
              <rect x="50" y="18" width="6" height="6" fill="#0f172a" />
              <rect x="42" y="26" width="6" height="6" fill="#0f172a" />
              <rect x="15" y="45" width="8" height="8" fill="#d946ef" />
              <rect x="28" y="42" width="6" height="6" fill="#0f172a" />
              <rect x="42" y="42" width="16" height="16" fill="#0f172a" />
              <rect x="46" y="46" width="8" height="8" fill="white" />
              <rect x="65" y="42" width="8" height="8" fill="#0f172a" />
              <rect x="78" y="45" width="8" height="8" fill="#d946ef" />
              <rect x="42" y="68" width="6" height="6" fill="#0f172a" />
              <rect x="52" y="75" width="8" height="8" fill="#d946ef" />
              <rect x="68" y="68" width="10" height="10" fill="#0f172a" />
              <rect x="82" y="82" width="6" height="6" fill="#0f172a" />
            </svg>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs">
            <span className="text-slate-400">Enrollment Token:</span>
            <span className="font-mono bg-slate-950 px-2 py-1 rounded text-fuchsia-400 border border-slate-800">
              tok_apex_logistics_2026
            </span>
          </div>
        </div>

        {/* Provisioning JSON Payload */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Android Provisioning Bundle Extra</h3>
            <p className="text-xs text-slate-400 mb-3">
              This JSON bundle instructs the Android OS to silently download the DPC and assign Device Owner.
            </p>
            <pre className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 font-mono text-[11px] text-fuchsia-300/90 overflow-x-auto leading-relaxed">
              {jsonPayload}
            </pre>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Samsung Knox (KME) & Google ZTP Compatible</span>
            <button
              onClick={copyJson}
              className="text-fuchsia-400 hover:text-fuchsia-300 font-medium flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" /> Copy JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
