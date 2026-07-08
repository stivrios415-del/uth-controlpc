import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from './supabaseClient';

function EscanerQR({ onVerHistorial }) {
  const scannerRef = useRef(null);
  const [resultado, setResultado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const [escaneando, setEscaneando] = useState(true);
  const [modoManual, setModoManual] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');

  const buscarEquipo = useCallback(async (codigoCrudo) => {
    setBuscando(true);
    setError(null);
    setResultado(null);
    const codigo = codigoCrudo.trim();

    try {
      // 1. Busca en computadoras
      const { data: comp, error: compError } = await supabase
        .from('computadoras')
        .select('*')
        .eq('codigo_inventario', codigo)
        .eq('eliminado', false)
        .maybeSingle();

      if (compError) throw compError;

      if (comp) {
        let ubicacionNombre = 'Sin asignar';
        if (comp.laboratorio_id) {
          const { data: lab } = await supabase
            .from('laboratorios')
            .select('nombre, edificio')
            .eq('id', comp.laboratorio_id)
            .maybeSingle();
          if (lab) ubicacionNombre = `${lab.nombre} (Edif. ${lab.edificio})`;
        } else if (comp.area_id) {
          const { data: area } = await supabase
            .from('areas')
            .select('nombre')
            .eq('id', comp.area_id)
            .maybeSingle();
          if (area) ubicacionNombre = area.nombre;
        }

        let personaNombre = null;
        if (comp.persona_id) {
          const { data: persona } = await supabase
            .from('personas')
            .select('nombre')
            .eq('id', comp.persona_id)
            .maybeSingle();
          if (persona) personaNombre = persona.nombre;
        }

        setResultado({
          tipo: 'computadora',
          ubicacionEsLab: !!comp.laboratorio_id,
          datos: { ...comp, ubicacionNombre, personaNombre }
        });
        return;
      }

      // 2. Si no está en computadoras, busca en extras
      const { data: extra, error: extraError } = await supabase
        .from('extras')
        .select('*')
        .eq('codigo_inventario', codigo)
        .maybeSingle();

      if (extraError) throw extraError;

      if (extra) {
        setResultado({ tipo: 'extra', datos: extra });
        return;
      }

      setError(`No se encontró ningún equipo con el código "${codigo}".`);
    } catch (err) {
      setError('Error al buscar: ' + err.message);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    if (!escaneando || modoManual) return undefined;

    const scanner = new Html5QrcodeScanner(
      'lector-qr',
      { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
      false
    );

    const onScanSuccess = (decodedText) => {
      setEscaneando(false);
      buscarEquipo(decodedText);
    };

    scanner.render(onScanSuccess, () => {});
    scannerRef.current = scanner;

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [escaneando, modoManual, buscarEquipo]);

  const reiniciarEscaneo = () => {
    setResultado(null);
    setError(null);
    setCodigoManual('');
    setEscaneando(true);
  };

  const buscarManual = (e) => {
    e.preventDefault();
    if (!codigoManual.trim()) return;
    setEscaneando(false);
    buscarEquipo(codigoManual);
  };

  const colorEstado = (estado) => {
    if (estado === 'Operativo') return { badge: 'bg-success', borde: '#10b981', icono: 'bi-check-circle-fill' };
    if (estado === 'Mantenimiento') return { badge: 'bg-warning text-dark', borde: '#f59e0b', icono: 'bi-tools' };
    return { badge: 'bg-danger', borde: '#ef4444', icono: 'bi-x-circle-fill' };
  };

  return (
    <div className="card border-0 rounded-4 bg-white p-4 shadow-sm escaner-qr-panel">
      <div className="d-flex align-items-center gap-2 mb-1">
        <div className="p-2 rounded-3 d-inline-flex" style={{ background: '#e9f9f1', color: '#059669' }}>
          <i className="bi bi-qr-code-scan fs-5"></i>
        </div>
        <div>
          <h5 className="fw-bold text-dark m-0">Escanear Código QR</h5>
          <p className="text-muted small m-0">Apunta la cámara a la etiqueta pegada en el equipo.</p>
        </div>
      </div>

      {/* ---------- ESTADO: ESCANEANDO ---------- */}
      {escaneando && !modoManual && (
        <div className="mt-4">
          <div className="scanner-frame mx-auto">
            <div id="lector-qr"></div>
          </div>
          <div className="text-center mt-3">
            <button
              type="button"
              className="btn btn-link btn-sm text-secondary text-decoration-none fw-semibold"
              onClick={() => setModoManual(true)}
            >
              <i className="bi bi-keyboard me-1"></i>
              ¿No tienes cámara? Escribe el código manualmente
            </button>
          </div>
        </div>
      )}

      {/* ---------- ESTADO: ENTRADA MANUAL ---------- */}
      {escaneando && modoManual && (
        <div className="mt-4">
          <div className="p-4 rounded-4 text-center" style={{ background: '#f6faf8', border: '1.5px dashed #bfe3d2' }}>
            <i className="bi bi-keyboard fs-1 text-success opacity-50 d-block mb-3"></i>
            <form onSubmit={buscarManual} className="mx-auto" style={{ maxWidth: '320px' }}>
              <label className="form-label fw-semibold text-secondary small">Código de inventario</label>
              <input
                type="text"
                className="form-control custom-input-qr text-center fw-bold"
                placeholder="Ej: INV-0007"
                value={codigoManual}
                onChange={(e) => setCodigoManual(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-success w-100 mt-3 fw-semibold" disabled={!codigoManual.trim()}>
                <i className="bi bi-search me-2"></i>Buscar equipo
              </button>
            </form>
          </div>
          <div className="text-center mt-3">
            <button
              type="button"
              className="btn btn-link btn-sm text-secondary text-decoration-none fw-semibold"
              onClick={() => { setModoManual(false); setCodigoManual(''); }}
            >
              <i className="bi bi-camera me-1"></i>
              Usar la cámara en su lugar
            </button>
          </div>
        </div>
      )}

      {/* ---------- ESTADO: BUSCANDO ---------- */}
      {!escaneando && buscando && (
        <div className="d-flex flex-column align-items-center py-5">
          <div className="spinner-border text-success mb-3" role="status">
            <span className="visually-hidden">Buscando...</span>
          </div>
          <p className="text-muted small m-0">Buscando equipo en el inventario...</p>
        </div>
      )}

      {/* ---------- ESTADO: ERROR ---------- */}
      {!escaneando && !buscando && error && (
        <div className="mt-4 text-center p-4 rounded-4" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <i className="bi bi-search fs-1 text-danger opacity-50 d-block mb-2"></i>
          <p className="text-danger fw-semibold mb-1">Equipo no encontrado</p>
          <p className="text-muted small mb-3">{error}</p>
          <button className="btn btn-outline-success fw-semibold px-4" onClick={reiniciarEscaneo}>
            <i className="bi bi-arrow-repeat me-2"></i>Intentar de nuevo
          </button>
        </div>
      )}

      {/* ---------- ESTADO: RESULTADO ENCONTRADO ---------- */}
      {!escaneando && !buscando && resultado && (
        <div className="mt-4 resultado-qr-anim">
          <div
            className="rounded-4 overflow-hidden shadow-sm"
            style={{ border: `1.5px solid ${colorEstado(resultado.datos.estado).borde}30` }}
          >
            {/* Encabezado con código y estado */}
            <div
              className="d-flex justify-content-between align-items-center px-4 py-3"
              style={{ background: `${colorEstado(resultado.datos.estado).borde}12`, borderBottom: `1px solid ${colorEstado(resultado.datos.estado).borde}30` }}
            >
              <div className="d-flex align-items-center gap-2">
                <i className={`bi ${resultado.tipo === 'computadora' ? 'bi-pc-display' : 'bi-box-seam'} fs-4`} style={{ color: colorEstado(resultado.datos.estado).borde }}></i>
                <div>
                  <div className="fw-bold text-dark" style={{ fontSize: '1.05rem' }}>{resultado.datos.codigo_inventario}</div>
                  <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {resultado.tipo === 'computadora' ? 'Equipo de cómputo' : 'Equipo extra'}
                  </div>
                </div>
              </div>
              <span className={`badge ${colorEstado(resultado.datos.estado).badge} px-3 py-2 rounded-pill d-flex align-items-center gap-1`}>
                <i className={`bi ${colorEstado(resultado.datos.estado).icono}`}></i>
                {resultado.datos.estado}
              </span>
            </div>

            {/* Cuerpo con los datos */}
            <div className="p-4 bg-white">
              <div className="row g-3">
                <div className="col-6">
                  <div className="dato-qr-label"><i className="bi bi-tag me-1"></i>Tipo</div>
                  <div className="dato-qr-valor">{resultado.datos.tipo}</div>
                </div>
                <div className="col-6">
                  <div className="dato-qr-label"><i className="bi bi-award me-1"></i>Marca / Modelo</div>
                  <div className="dato-qr-valor">{resultado.datos.marca} {resultado.datos.modelo}</div>
                </div>
                {resultado.datos.numero_serie && (
                  <div className="col-6">
                    <div className="dato-qr-label"><i className="bi bi-hash me-1"></i>Serie</div>
                    <div className="dato-qr-valor">{resultado.datos.numero_serie}</div>
                  </div>
                )}
                {resultado.tipo === 'computadora' && (
                  <div className="col-6">
                    <div className="dato-qr-label">
                      <i className={`bi ${resultado.ubicacionEsLab ? 'bi-building' : 'bi-bank'} me-1`}></i>
                      Ubicación
                    </div>
                    <div className="dato-qr-valor">{resultado.datos.ubicacionNombre}</div>
                  </div>
                )}
                {resultado.tipo === 'computadora' && resultado.datos.personaNombre && (
                  <div className="col-12">
                    <div className="dato-qr-label"><i className="bi bi-person me-1"></i>Asignado a</div>
                    <div className="dato-qr-valor fw-semibold text-success">{resultado.datos.personaNombre}</div>
                  </div>
                )}
              </div>

              <div className="d-flex gap-2 mt-4">
                <button className="btn btn-outline-secondary w-100 fw-semibold" onClick={reiniciarEscaneo}>
                  <i className="bi bi-qr-code-scan me-2"></i>Escanear otro
                </button>
                {resultado.tipo === 'computadora' && onVerHistorial && (
                  <button
                    className="btn btn-success w-100 fw-semibold"
                    onClick={() => onVerHistorial(resultado.datos.id)}
                  >
                    <i className="bi bi-journal-text me-2"></i>Ver historial
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .escaner-qr-panel { max-width: 560px; margin: 0 auto; }

        .scanner-frame {
          max-width: 380px;
          border-radius: 20px;
          padding: 14px;
          background: linear-gradient(135deg, #065f46 0%, #10b981 100%);
        }
        .scanner-frame #lector-qr {
          border-radius: 14px;
          overflow: hidden;
          background: #ffffff;
        }

        /* Reestiliza los botones/controles que genera la librería html5-qrcode
           para que combinen con el resto de la app */
        #lector-qr button {
          background-color: #10b981 !important;
          color: #ffffff !important;
          border: none !important;
          border-radius: 10px !important;
          padding: 10px 18px !important;
          font-weight: 600 !important;
          font-size: 0.85rem !important;
          margin: 8px 0 !important;
          transition: background-color 0.2s ease;
        }
        #lector-qr button:hover {
          background-color: #059669 !important;
        }
        #lector-qr select {
          border-radius: 10px !important;
          border: 1.5px solid #e2ede7 !important;
          padding: 8px 12px !important;
          font-size: 0.85rem !important;
        }
        #lector-qr img[alt="Info icon"] { display: none; }
        #lector-qr__dashboard_section_csr { padding: 12px !important; }
        #lector-qr__scan_region img { display: none; }

        .custom-input-qr {
          background-color: #ffffff !important;
          border: 1.5px solid #bfe3d2 !important;
          border-radius: 12px !important;
          padding: 12px 16px;
          font-size: 1.1rem;
          letter-spacing: 1px;
        }
        .custom-input-qr:focus {
          border-color: #10b981 !important;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
        }

        .dato-qr-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #9ca3af;
          font-weight: 700;
          margin-bottom: 2px;
        }
        .dato-qr-valor {
          font-size: 0.95rem;
          color: #1f2937;
          font-weight: 500;
        }

        .resultado-qr-anim {
          animation: apareceQR 0.3s ease;
        }
        @keyframes apareceQR {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default EscanerQR;
