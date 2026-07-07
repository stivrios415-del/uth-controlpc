import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

function CodigoQR({ codigo, onClose }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    setDataUrl(null);
    setError(null);
    QRCode.toDataURL(codigo, { width: 320, margin: 2, color: { dark: '#065f46', light: '#ffffff' } })
      .then(url => { if (activo) setDataUrl(url); })
      .catch(err => { if (activo) setError(err.message); });
    return () => { activo = false; };
  }, [codigo]);

  const descargar = () => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `QR_${codigo}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-overlay-qr" onClick={onClose}>
      <div className="modal-card-qr" onClick={(e) => e.stopPropagation()}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="fw-bold m-0">
            <i className="bi bi-qr-code me-2 text-success"></i>
            Código QR — {codigo}
          </h6>
          <button className="btn-close" onClick={onClose}></button>
        </div>

        <div className="text-center">
          {error ? (
            <div className="alert alert-danger small">{error}</div>
          ) : dataUrl ? (
            <>
              <img
                src={dataUrl}
                alt={`QR ${codigo}`}
                className="img-fluid rounded-3 border p-2 mb-3"
                style={{ maxWidth: '260px' }}
              />
              <button className="btn btn-success w-100 fw-semibold" onClick={descargar}>
                <i className="bi bi-download me-2"></i>Descargar PNG
              </button>
              <p className="text-muted small mt-3 mb-0">
                Imprime esta imagen y pégala en el equipo físico. Al escanearla desde el panel
                "Escanear QR" se mostrará su información al instante.
              </p>
            </>
          ) : (
            <div className="spinner-border text-success" role="status">
              <span className="visually-hidden">Generando...</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .modal-overlay-qr {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1070;
          padding: 20px;
        }
        .modal-card-qr {
          background: #ffffff;
          border-radius: 16px;
          padding: 24px;
          max-width: 360px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
}

export default CodigoQR;