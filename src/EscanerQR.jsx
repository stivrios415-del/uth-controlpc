import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from './supabaseClient';

function EscanerQR({ onVerHistorial }) {
  const scannerRef = useRef(null);
  const [resultado, setResultado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const [escaneando, setEscaneando] = useState(true);

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
          if (lab) ubicacionNombre = `🏢 ${lab.nombre} (${lab.edificio})`;
        } else if (comp.area_id) {
          const { data: area } = await supabase
            .from('areas')
            .select('nombre')
            .eq('id', comp.area_id)
            .maybeSingle();
          if (area) ubicacionNombre = `🏛️ ${area.nombre}`;
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

        setResultado({ tipo: 'computadora', datos: { ...comp, ubicacionNombre, personaNombre } });
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
    if (!escaneando) return undefined;

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
  }, [escaneando, buscarEquipo]);

  const reiniciarEscaneo = () => {
    setResultado(null);
    setError(null);
    setEscaneando(true);
  };

  return (
    <div className="card border-0 rounded-4 bg-white p-4 shadow-sm">
      <h5 className="fw-bold text-dark mb-1">
        <i className="bi bi-qr-code-scan text-success me-2"></i>
        Escanear Código QR
      </h5>
      <p className="text-muted small mb-4">
        Apunta la cámara al código QR pegado en el equipo para ver su información al instante.
      </p>

      {escaneando ? (
        <div id="lector-qr" style={{ maxWidth: '400px', margin: '0 auto' }}></div>
      ) : (
        <div>
          {buscando && (
            <div className="d-flex justify-content-center py-4">
              <div className="spinner-border text-success" role="status">
                <span className="visually-hidden">Buscando...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-warning">
              <i className="bi bi-exclamation-triangle me-2"></i>{error}
            </div>
          )}

          {resultado && (
            <div className="p-3 rounded-4" style={{ background: '#f6faf8', border: '1px solid #d1f0e0' }}>
              <div className="d-flex justify-content-between align-items-start mb-2">
                <h6 className="fw-bold text-success mb-0">{resultado.datos.codigo_inventario}</h6>
                <span className={`badge ${resultado.datos.estado === 'Operativo' ? 'bg-success' : resultado.datos.estado === 'Mantenimiento' ? 'bg-warning text-dark' : 'bg-danger'}`}>
                  {resultado.datos.estado}
                </span>
              </div>
              <p className="mb-1 small"><strong>Tipo:</strong> {resultado.datos.tipo}</p>
              <p className="mb-1 small"><strong>Marca / Modelo:</strong> {resultado.datos.marca} {resultado.datos.modelo}</p>
              {resultado.datos.numero_serie && (
                <p className="mb-1 small"><strong>Serie:</strong> {resultado.datos.numero_serie}</p>
              )}
              {resultado.tipo === 'computadora' && (
                <>
                  <p className="mb-1 small"><strong>Ubicación:</strong> {resultado.datos.ubicacionNombre}</p>
                  {resultado.datos.personaNombre && (
                    <p className="mb-1 small"><strong>Asignado a:</strong> 👤 {resultado.datos.personaNombre}</p>
                  )}
                </>
              )}
              {resultado.tipo === 'computadora' && onVerHistorial && (
                <button
                  className="btn btn-success btn-sm mt-2 w-100 fw-semibold"
                  onClick={() => onVerHistorial(resultado.datos.id)}
                >
                  <i className="bi bi-journal-text me-2"></i>Ver historial completo
                </button>
              )}
            </div>
          )}

          <button className="btn btn-outline-success w-100 mt-3 fw-semibold" onClick={reiniciarEscaneo}>
            <i className="bi bi-qr-code-scan me-2"></i>Escanear otro código
          </button>
        </div>
      )}
    </div>
  );
}

export default EscanerQR;