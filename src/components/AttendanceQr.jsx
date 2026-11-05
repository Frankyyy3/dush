import { useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export const AttendanceSessionQr = ({ token, label }) => (
  <QRCodeSVG
    value={JSON.stringify({ purpose: 'attendance', token })}
    size={180}
    level="M"
    includeMargin
    role="img"
    aria-label={label}
    className="rounded-lg"
  />
);

export const AttendanceQrScanner = ({ active, onScan, onError, cameraLabel }) => {
  const scannerRef = useRef(null);
  const callbacksRef = useRef({ onScan, onError });

  useEffect(() => {
    callbacksRef.current = { onScan, onError };
  }, [onScan, onError]);

  useEffect(() => {
    if (!active) return undefined;

    let disposed = false;
    let hasScanned = false;
    let scanner = null;

    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (disposed) return;
        scanner = new Html5Qrcode('attendance-qr-reader', {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
          decodedText => {
            if (hasScanned || disposed) return;
            hasScanned = true;
            const decoded = decodedText.trim();
            let credential;
            try {
              credential = JSON.parse(decoded);
            } catch {
              callbacksRef.current.onError('invalid_qr');
              return;
            }
            if (
              typeof credential !== 'object'
              || credential === null
              || credential.purpose !== 'attendance'
              || typeof credential.token !== 'string'
              || credential.token.length === 0
            ) {
              callbacksRef.current.onError('invalid_qr');
              return;
            }
            callbacksRef.current.onScan({ token: credential.token });
          },
          () => {},
        );
      } catch (error) {
        if (disposed) return;
        console.error('Unable to start QR scanner:', error);
        callbacksRef.current.onError('camera_unavailable');
      }
    };

    startScanner();

    return () => {
      disposed = true;
      const currentScanner = scanner;
      if (scannerRef.current === currentScanner) scannerRef.current = null;
      if (!currentScanner) return;
      const cleanup = currentScanner.isScanning
        ? currentScanner.stop().then(() => currentScanner.clear())
        : Promise.resolve().then(() => currentScanner.clear());
      cleanup.catch(error => {
        console.error('Unable to stop QR scanner cleanly:', error);
      });
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="mt-4 rounded-2xl bg-white p-3 text-slate-900">
      <p className="mb-2 text-xs font-bold">{cameraLabel}</p>
      <div id="attendance-qr-reader" className="overflow-hidden rounded-xl" />
    </div>
  );
};
