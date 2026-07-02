import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

function HistorialPC({ computadoraId, onVolver }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    descripcion: '',
    costo: '',
    nuevo_estado: 'Operativo'
  });

  const cargarHistorial = useCallback(async () => {
    try {
      setCargando(true);
      setErrorMsg(null);

      const { data: pc, error: pcError } = await supabase
        .from('computadoras')
        .select(`
          *,
          laboratorios ( nombre )
        `)
        .eq('id', computadoraId)
        .single();

      if (pcError) throw pcError;

      const { data: historial, error: histError } = await supabase
        .from('historial_mantenimiento')
        .select('*')
        .eq('computadora_id', computadoraId)
        .order('fecha_registro', { ascending: false });

      if (histError) throw histError;

      const historialFormateado = historial.map(h => ({
        id: h.id,
        fecha: h.fecha_registro,
        tipo_evento: h.costo > 0 ? 'Correctivo / Repuesto' : 'Mantenimiento',
        descripcion: h.descripcion_problema,
        estado_nuevo: pc.estado,
        tecnico_nombre: 'Soporte Técnico UTH'
      }));

      const pcConLab = {
        ...pc,
        lab_nombre: pc.laboratorios?.nombre || 'Sin Asignar'
      };

      setDatos({ computadora: pcConLab, historial: historialFormateado });
      setForm(prev => ({ ...prev, nuevo_estado: pc.estado || 'Operativo' }));

    } catch (err) {
      console.error('Error cargando historial:', err);
      setErrorMsg(err.message || 'Error al cargar el historial.');
    } finally {
      setCargando(false);
    }
  }, [computadoraId]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (!form.descripcion.trim()) {
      alert('La descripción es obligatoria.');
      return;
    }

    setEnviando(true);
    try {
      const { error: insertError } = await supabase
        .from('historial_mantenimiento')
        .insert([{
          computadora_id: computadoraId,
          descripcion_problema: form.descripcion.trim(),
          costo: parseFloat(form.costo) || 0,
        }]);

      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('computadoras')
        .update({ estado: form.nuevo_estado })
        .eq('id', computadoraId);

      if (updateError) throw updateError;

      setForm(prev => ({ ...prev, descripcion: '', costo: '' }));
      await cargarHistorial();

    } catch (err) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <div className="card border-0 rounded-4 bg-white p-5 text-center shadow-sm">
        <div className="spinner-border text-success mb-3" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
        <p className="text-muted small">Consultando hoja de vida y registros del activo...</p>
      </div>
    );
  }

  if (errorMsg || !datos || !datos.computadora) {
    return (
      <div className="card border-0 rounded-4 bg-white p-5 text-center shadow-sm" style={{ maxWidth: '500px', margin: '0 auto' }}>
        <div className="bg-danger-subtle text-danger rounded-circle d-inline-flex p-3 mb-3 mx-auto">
          <i className="bi bi-exclamation-octagon fs-3"></i>
        </div>
        <h5 className="fw-bold text-dark mb-2">Error</h5>
        <p className="text-secondary small mb-4">{errorMsg || "El equipo no existe."}</p>
        <button className="btn btn-dark w-100 py-2 rounded-3 fw-semibold" onClick={onVolver}>
          <i className="bi bi-arrow-left me-2"></i>Regresar
        </button>
      </div>
    );
  }

  const { computadora, historial } = datos;

  const getEstadoBadge = (estado) => {
    switch (estado) {
      case 'Operativo': return 'bg-success';
      case 'Mantenimiento': return 'bg-warning text-dark';
      case 'Dañado': return 'bg-danger';
      default: return 'bg-secondary';
    }
  };

  return (
    <div className="animate__animated animate__fadeIn">
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-4">
        <div>
          <button className="btn btn-link link-secondary p-0 text-decoration-none fw-semibold small mb-1" onClick={onVolver}>
            <i className="bi bi-arrow-left me-1"></i> Volver a Equipos
          </button>
          <h4 className="fw-bold text-dark m-0 d-flex align-items-center gap-2">
            <i className="bi bi-journal-text text-success"></i>
            Hoja de Vida: <span className="text-success">{computadora.codigo_inventario}</span>
          </h4>
        </div>
        {/* Botones de Excel y PDF ELIMINADOS */}
      </div>

      <div className="card border-0 rounded-4 mb-4 p-4 text-white" style={{ background: '#1a1a1a', borderLeft: '5px solid #28a745' }}>
        <div className="row align-items-center">
          <div className="col-12 col-md-8">
            <span className="badge bg-light text-dark mb-2 fw-bold px-3 py-2 fs-6 shadow-sm">
              {computadora.codigo_inventario}
            </span>
            <h2 className="fw-bold m-0 text-white">
              {computadora.marca} {computadora.modelo || ''}
            </h2>
            <p className="text-white-50 m-0 mt-2">
              <i className="bi bi-cpu me-1"></i> Procesador: {computadora.procesador || 'S/P'} |
              <i className="bi bi-hdd-stack me-1"></i> RAM: {computadora.ram_gb || '?'} GB |
              <i className="bi bi-building me-1"></i> Ubicación: {computadora.lab_nombre || 'Sin Asignar'}
            </p>
          </div>
          <div className="col-12 col-md-4 text-md-end mt-3 mt-md-0">
            <span className="fs-6 fw-bold px-4 py-2 rounded-pill bg-light text-dark shadow-sm d-inline-block">
              Estado Actual:
              <span className={`fw-extrabold ${getEstadoBadge(computadora.estado)} px-2 py-1 rounded-pill text-white ms-1`}>
                {computadora.estado}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12 col-lg-4">
          <div className="card border-0 rounded-4 bg-white p-4 shadow-sm">
            <h5 className="fw-bold text-dark mb-4">
              <i className="bi bi-journal-plus text-success me-2"></i>Registrar Evento / Falla
            </h5>
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Descripción</label>
                <textarea
                  name="descripcion"
                  className="form-control"
                  rows="4"
                  placeholder="Describa el problema o mantenimiento realizado..."
                  value={form.descripcion}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Costo (opcional)</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    step="0.01"
                    name="costo"
                    className="form-control"
                    placeholder="0.00"
                    value={form.costo}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="form-label fw-semibold text-secondary small">Actualizar Estado</label>
                <select
                  name="nuevo_estado"
                  className="form-select"
                  value={form.nuevo_estado}
                  onChange={handleInputChange}
                >
                  <option value="Operativo">Operativo</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Dañado">Dañado</option>
                </select>
                <small className="text-muted d-block mt-1">El estado del inventario cambiará automáticamente.</small>
              </div>
              <button
                type="submit"
                className="btn btn-success w-100 py-2 fw-semibold"
                disabled={enviando}
                style={{ backgroundColor: '#28a745', border: 'none' }}
              >
                {enviando ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Guardando...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check-circle-fill me-1"></i> Guardar en Bitácora
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="col-12 col-lg-8">
          <div className="card border-0 rounded-4 bg-white p-4 shadow-sm">
            <h5 className="fw-bold text-dark mb-4">
              <i className="bi bi-journal-text text-success me-2"></i>Línea de Tiempo
            </h5>
            <div className="pe-2" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {historial && historial.length > 0 ? (
                historial.map((ev) => (
                  <div key={ev.id} className="timeline-item">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="text-muted small fw-bold">
                        <i className="bi bi-calendar3 text-success me-1"></i>
                        {new Date(ev.fecha).toLocaleString('es-HN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {ev.costo > 0 && (
                        <span className="badge bg-danger-subtle text-danger fw-bold">
                          Gasto: ${Number(ev.costo).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <p className="text-dark m-0 bg-light p-3 rounded-3" style={{ fontSize: '14px', whiteSpace: 'pre-line', borderLeft: '3px solid #dee2e6' }}>
                      {ev.descripcion}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-5 text-muted">
                  <i className="bi bi-folder-x fs-1 d-block mb-2 text-secondary"></i>
                  Este equipo no tiene registros previos.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .timeline-item {
          border-left: 3px solid #28a745;
          padding-left: 20px;
          position: relative;
          margin-bottom: 25px;
        }
        .timeline-item::before {
          content: '';
          position: absolute;
          width: 12px;
          height: 12px;
          background: #28a745;
          border-radius: 50%;
          left: -8px;
          top: 5px;
        }
        .btn-success {
          background-color: #28a745 !important;
          border-color: #28a745 !important;
        }
        .btn-success:hover {
          background-color: #218838 !important;
          border-color: #1e7e34 !important;
        }
      `}</style>
    </div>
  );
}

export default HistorialPC;