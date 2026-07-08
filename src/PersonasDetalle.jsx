// PersonaDetalle.js
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';

function PersonaDetalle({ personaId, onVolver, esAdmin, personas, personasOcupadas, onPersonaChange }) {
  const [equiposPorPersona, setEquiposPorPersona] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [pestanaActiva, setPestanaActiva] = useState('activo'); // 'activo' o 'historial'

  // ===== DESASIGNAR equipo activo (solo admin) =====
  const [equipoActivoADesasignarId, setEquipoActivoADesasignarId] = useState(null);
  const [motivoDesasignacionLocal, setMotivoDesasignacionLocal] = useState('');
  const [enviandoDesasignacionLocal, setEnviandoDesasignacionLocal] = useState(false);

  // ===== REASIGNAR equipo activo a otra persona (solo admin) =====
  const [equipoAReasignarId, setEquipoAReasignarId] = useState(null);
  const [nuevaPersonaId, setNuevaPersonaId] = useState('');
  const [motivoReasignacion, setMotivoReasignacion] = useState('');
  const [enviandoReasignacion, setEnviandoReasignacion] = useState(false);

  const personaActual = personas.find(p => p.id === personaId) || { nombre: 'Persona desconocida' };

  // Cargar historial de asignaciones de la persona seleccionada
  const cargarHistorial = async () => {
    try {
      setCargando(true);
      const { data, error } = await supabase
        .from('historial_asignaciones')
        .select(`
          id,
          fecha_asignacion,
          fecha_fin,
          estado_en_asignacion,
          computadoras ( id, codigo_inventario, tipo, marca, modelo, estado )
        `)
        .eq('persona_id', personaId)
        .order('fecha_asignacion', { ascending: false });

      if (error) throw error;
      setEquiposPorPersona(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (personaId) {
      cargarHistorial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  // Separar equipo(s) activo(s) (fecha_fin = null) e historial cerrado
  const equipoActivo = useMemo(() => {
    const vistos = new Set();
    const activos = [];
    equiposPorPersona.forEach(registro => {
      const compId = registro.computadoras?.id;
      if (!registro.fecha_fin && compId && !vistos.has(compId)) {
        vistos.add(compId);
        activos.push(registro);
      }
    });
    return activos;
  }, [equiposPorPersona]);

  const historialCerrado = useMemo(
    () => equiposPorPersona.filter(registro => registro.fecha_fin),
    [equiposPorPersona]
  );

  // Calcular duración para el historial
  const calcularDuracion = (fechaInicio, fechaFin) => {
    const inicio = new Date(fechaInicio);
    const fin = fechaFin ? new Date(fechaFin) : new Date();
    const dias = Math.max(0, Math.floor((fin - inicio) / (1000 * 60 * 60 * 24)));

    if (dias < 1) return 'Menos de 1 día';
    if (dias < 60) return `${dias} día${dias === 1 ? '' : 's'}`;
    const meses = Math.floor(dias / 30);
    return `${meses} mes${meses === 1 ? '' : 'es'} aprox.`;
  };

  // ==================== DESASIGNAR EQUIPO ACTIVO ====================
  const abrirDesasignarActivo = (computadoraId) => {
    if (!esAdmin) {
      alert('⛔ Solo un administrador puede desasignar equipos.');
      return;
    }
    setEquipoActivoADesasignarId(computadoraId);
    setMotivoDesasignacionLocal('');
  };

  const cancelarDesasignarActivo = () => {
    if (enviandoDesasignacionLocal) return;
    setEquipoActivoADesasignarId(null);
    setMotivoDesasignacionLocal('');
  };

  const confirmarDesasignarActivo = async () => {
    if (!esAdmin) return;
    if (!motivoDesasignacionLocal.trim()) {
      alert('⚠️ Debes indicar el motivo de la desasignación.');
      return;
    }
    if (enviandoDesasignacionLocal) return;
    setEnviandoDesasignacionLocal(true);

    const compId = equipoActivoADesasignarId;
    const motivo = motivoDesasignacionLocal.trim();

    try {
      // Registrar en bitácora
      const { error: histError } = await supabase
        .from('historial_mantenimiento')
        .insert([{
          computadora_id: compId,
          descripcion_problema: `Equipo desasignado de ${personaActual.nombre} desde PersonaDetalle.\nMotivo: ${motivo}`,
          costo: 0,
        }]);
      if (histError) console.warn('Error en bitácora:', histError);

      // Liberar equipo
      const { error } = await supabase
        .from('computadoras')
        .update({ persona_id: null, fecha_asignacion: null })
        .eq('id', compId);
      if (error) throw error;

      setEquipoActivoADesasignarId(null);
      setMotivoDesasignacionLocal('');
      await cargarHistorial();
      if (onPersonaChange) onPersonaChange();
      alert('✅ Equipo desasignado correctamente.');
    } catch (err) {
      alert('Error al desasignar: ' + err.message);
    } finally {
      setEnviandoDesasignacionLocal(false);
    }
  };

  // ==================== REASIGNAR EQUIPO ACTIVO ====================
  const abrirReasignar = (computadoraId) => {
    if (!esAdmin) {
      alert('⛔ Solo un administrador puede reasignar equipos.');
      return;
    }
    setEquipoAReasignarId(computadoraId);
    setNuevaPersonaId('');
    setMotivoReasignacion('');
  };

  const cancelarReasignar = () => {
    if (enviandoReasignacion) return;
    setEquipoAReasignarId(null);
    setNuevaPersonaId('');
    setMotivoReasignacion('');
  };

  const confirmarReasignar = async () => {
    if (!esAdmin) return;
    if (!nuevaPersonaId) {
      alert('⚠️ Selecciona la persona a la que se reasignará el equipo.');
      return;
    }
    if (!motivoReasignacion.trim()) {
      alert('⚠️ Debes indicar el motivo de la reasignación.');
      return;
    }
    if (enviandoReasignacion) return;
    setEnviandoReasignacion(true);

    try {
      // Verificar que la persona destino no tenga ya un equipo activo
      const { data: ocupado } = await supabase
        .from('computadoras')
        .select('id, codigo_inventario')
        .eq('persona_id', parseInt(nuevaPersonaId))
        .eq('eliminado', false)
        .limit(1);

      if (ocupado && ocupado.length > 0) {
        alert(`⚠️ Esa persona ya tiene un equipo activo asignado (${ocupado[0].codigo_inventario}).`);
        setEnviandoReasignacion(false);
        return;
      }

      const personaAnteriorNombre = personaActual.nombre;
      const personaNuevaNombre = personas.find(p => p.id === parseInt(nuevaPersonaId))?.nombre || 'la nueva persona';
      const motivo = motivoReasignacion.trim();

      // Registrar en bitácora
      const { error: histError } = await supabase
        .from('historial_mantenimiento')
        .insert([{
          computadora_id: equipoAReasignarId,
          descripcion_problema: `Equipo reasignado de ${personaAnteriorNombre} a ${personaNuevaNombre}.\nMotivo: ${motivo}`,
          costo: 0,
        }]);
      if (histError) console.warn('Error en bitácora:', histError);

      // Actualizar asignación
      const { error } = await supabase
        .from('computadoras')
        .update({
          persona_id: parseInt(nuevaPersonaId),
          fecha_asignacion: new Date().toISOString(),
        })
        .eq('id', equipoAReasignarId);

      if (error) throw error;

      setEquipoAReasignarId(null);
      setNuevaPersonaId('');
      setMotivoReasignacion('');
      await cargarHistorial();
      if (onPersonaChange) onPersonaChange();
      alert(`✅ Equipo reasignado correctamente a ${personaNuevaNombre}.`);
    } catch (err) {
      alert('Error al reasignar: ' + err.message);
    } finally {
      setEnviandoReasignacion(false);
    }
  };

  if (cargando) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        <i className="bi bi-exclamation-triangle-fill me-2"></i>
        Error al cargar historial: {error}
      </div>
    );
  }

  return (
    <div>
      {/* Cabecera con nombre y botón Volver */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold text-dark mb-0">
            <i className="bi bi-person-badge text-success me-2"></i>
            {personaActual.nombre}
          </h4>
          <small className="text-muted">{personaActual.cargo || 'Sin cargo'}</small>
        </div>
        <button className="btn btn-outline-secondary rounded-3 px-4 py-2 fw-semibold" onClick={onVolver}>
          <i className="bi bi-arrow-left me-2"></i>Volver
        </button>
      </div>

      {/* Pestañas */}
      <ul className="nav nav-pills mb-4 gap-2">
        <li className="nav-item">
          <button
            className={`nav-link px-4 py-2 fw-semibold rounded-3 ${pestanaActiva === 'activo' ? 'active bg-success text-white' : 'text-dark'}`}
            onClick={() => setPestanaActiva('activo')}
          >
            <i className="bi bi-pc-display me-2"></i>Equipo Activo ({equipoActivo.length})
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link px-4 py-2 fw-semibold rounded-3 ${pestanaActiva === 'historial' ? 'active bg-success text-white' : 'text-dark'}`}
            onClick={() => setPestanaActiva('historial')}
          >
            <i className="bi bi-clock-history me-2"></i>Historial ({historialCerrado.length})
          </button>
        </li>
      </ul>

      {/* Contenido de la pestaña activa */}
      {pestanaActiva === 'activo' && (
        <div className="card border-0 rounded-4 bg-white p-4 shadow-sm" style={{ borderLeft: '5px solid #10b981' }}>
          <h5 className="fw-bold text-dark mb-3">
            <i className="bi bi-pc-display text-success me-2"></i>
            Equipo(s) Activo(s)
          </h5>
          {equipoActivo.length === 0 ? (
            <p className="text-muted text-center py-3 mb-0">No tiene equipos asignados actualmente.</p>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle table-sm mb-0">
                <thead>
                  <tr className="text-muted small fw-semibold" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                    <th>Código</th>
                    <th>Tipo</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Estado</th>
                    <th>Desde</th>
                    {esAdmin && <th className="text-end">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {equipoActivo.map(registro => (
                    <tr key={registro.id} className="table-row-soft">
                      <td className="fw-bold text-primary small">{registro.computadoras?.codigo_inventario || '—'}</td>
                      <td>{registro.computadoras?.tipo || '—'}</td>
                      <td>{registro.computadoras?.marca || '—'}</td>
                      <td>{registro.computadoras?.modelo || '—'}</td>
                      <td>
                        <span className={`badge ${registro.computadoras?.estado === 'Operativo' ? 'bg-success' : registro.computadoras?.estado === 'Mantenimiento' ? 'bg-warning text-dark' : 'bg-danger'} px-2 py-1`}>
                          {registro.computadoras?.estado || '—'}
                        </span>
                      </td>
                      <td className="small">{new Date(registro.fecha_asignacion).toLocaleDateString('es-HN')}</td>
                      {esAdmin && (
                        <td className="text-end">
                          <button
                            onClick={() => abrirReasignar(registro.computadoras.id)}
                            className="btn btn-sm btn-link text-primary p-1 me-1"
                            title="Reasignar a otra persona"
                          >
                            <i className="bi bi-arrow-left-right fs-6"></i>
                          </button>
                          <button
                            onClick={() => abrirDesasignarActivo(registro.computadoras.id)}
                            className="btn btn-sm btn-link text-secondary p-1"
                            title="Desasignar (liberar equipo)"
                          >
                            <i className="bi bi-person-dash fs-6"></i>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!esAdmin && equipoActivo.length > 0 && (
            <small className="text-muted d-block mt-2">
              <i className="bi bi-info-circle me-1"></i>
              Solo un administrador puede reasignar o desasignar equipos.
            </small>
          )}
        </div>
      )}

      {pestanaActiva === 'historial' && (
        <div className="card border-0 rounded-4 bg-white p-4 shadow-sm">
          <h5 className="fw-bold text-dark mb-3">
            <i className="bi bi-clock-history text-success me-2"></i>
            Historial de equipos anteriores
          </h5>
          {historialCerrado.length === 0 ? (
            <p className="text-muted text-center py-3">No hay equipos anteriores en el historial.</p>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle table-sm">
                <thead>
                  <tr className="text-muted small fw-semibold" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                    <th>Código</th>
                    <th>Tipo</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Estado al asignar</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th>Duración</th>
                  </tr>
                </thead>
                <tbody>
                  {historialCerrado.map(registro => (
                    <tr key={registro.id} className="table-row-soft">
                      <td className="fw-bold text-primary small">{registro.computadoras?.codigo_inventario || '—'}</td>
                      <td>{registro.computadoras?.tipo || '—'}</td>
                      <td>{registro.computadoras?.marca || '—'}</td>
                      <td>{registro.computadoras?.modelo || '—'}</td>
                      <td>
                        <span className={`badge ${registro.estado_en_asignacion === 'Operativo' ? 'bg-success' : registro.estado_en_asignacion === 'Mantenimiento' ? 'bg-warning text-dark' : 'bg-danger'} px-2 py-1`}>
                          {registro.estado_en_asignacion || '—'}
                        </span>
                      </td>
                      <td className="small">{new Date(registro.fecha_asignacion).toLocaleDateString('es-HN')}</td>
                      <td className="small">{new Date(registro.fecha_fin).toLocaleDateString('es-HN')}</td>
                      <td className="small fw-semibold">{calcularDuracion(registro.fecha_asignacion, registro.fecha_fin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Desasignar equipo activo (solo admin) */}
      {equipoActivoADesasignarId && esAdmin && (
        <div className="modal-overlay" onClick={cancelarDesasignarActivo}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-custom modal-header-desasignar">
              <h6 className="fw-bold m-0 text-secondary">
                <i className="bi bi-person-dash-fill me-2"></i>
                Desasignar equipo
              </h6>
              <button type="button" className="btn-close shadow-none" onClick={cancelarDesasignarActivo} disabled={enviandoDesasignacionLocal}></button>
            </div>
            <div className="p-4">
              <p className="text-secondary small mb-3">
                El equipo se liberará de <strong>{personaActual.nombre}</strong>. El equipo <strong>no se elimina</strong>: queda disponible para asignarse a alguien más, y esta acción quedará registrada en el Historial.
              </p>
              <label className="form-label fw-semibold text-secondary small">
                Motivo de la desasignación <span className="text-danger">*</span>
              </label>
              <textarea
                className="form-control custom-input"
                rows="3"
                placeholder="Ej: Cambio de puesto, fin de contrato..."
                value={motivoDesasignacionLocal}
                onChange={(e) => setMotivoDesasignacionLocal(e.target.value)}
                maxLength={200}
                autoFocus
                disabled={enviandoDesasignacionLocal}
              />
              <small className="text-muted d-block mt-1">{motivoDesasignacionLocal.length}/200</small>
              <div className="d-flex gap-2 mt-4">
                <button
                  type="button"
                  className="btn btn-light border w-100 py-2 text-secondary fw-semibold"
                  onClick={cancelarDesasignarActivo}
                  disabled={enviandoDesasignacionLocal}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-secondary w-100 py-2 fw-semibold"
                  onClick={confirmarDesasignarActivo}
                  disabled={enviandoDesasignacionLocal || !motivoDesasignacionLocal.trim()}
                >
                  {enviandoDesasignacionLocal ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Desasignando...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-person-dash me-2"></i>Confirmar Desasignación
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reasignar equipo activo a otra persona (solo admin) */}
      {equipoAReasignarId && esAdmin && (
        <div className="modal-overlay" onClick={cancelarReasignar}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-custom">
              <h6 className="fw-bold m-0 text-primary">
                <i className="bi bi-arrow-left-right me-2"></i>
                Reasignar equipo
              </h6>
              <button type="button" className="btn-close shadow-none" onClick={cancelarReasignar} disabled={enviandoReasignacion}></button>
            </div>
            <div className="p-4">
              <p className="text-secondary small mb-3">
                Este equipo se quitará de <strong>{personaActual.nombre}</strong> y pasará de inmediato a la persona que elijas abajo. Quedará registrado en el Historial.
              </p>
              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Nueva persona *</label>
                <select
                  className="form-select custom-input"
                  value={nuevaPersonaId}
                  onChange={(e) => setNuevaPersonaId(e.target.value)}
                  disabled={enviandoReasignacion}
                >
                  <option value="">Seleccionar...</option>
                  {personas
                    .filter(p => p.id !== personaId && !personasOcupadas.has(p.id))
                    .map(p => (
                      <option key={p.id} value={p.id}>👤 {p.nombre}</option>
                    ))}
                </select>
                <small className="text-muted d-block mt-1">Solo se muestran personas sin equipo activo asignado.</small>
              </div>
              <label className="form-label fw-semibold text-secondary small">
                Motivo de la reasignación <span className="text-danger">*</span>
              </label>
              <textarea
                className="form-control custom-input"
                rows="3"
                placeholder="Ej: Cambio de puesto, reorganización de área..."
                value={motivoReasignacion}
                onChange={(e) => setMotivoReasignacion(e.target.value)}
                maxLength={200}
                disabled={enviandoReasignacion}
              />
              <small className="text-muted d-block mt-1">{motivoReasignacion.length}/200</small>
              <div className="d-flex gap-2 mt-4">
                <button
                  type="button"
                  className="btn btn-light border w-100 py-2 text-secondary fw-semibold"
                  onClick={cancelarReasignar}
                  disabled={enviandoReasignacion}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary w-100 py-2 fw-semibold"
                  onClick={confirmarReasignar}
                  disabled={enviandoReasignacion || !nuevaPersonaId || !motivoReasignacion.trim()}
                >
                  {enviandoReasignacion ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Reasignando...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-arrow-left-right me-2"></i>Confirmar Reasignación
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Estilos locales (conserva coherencia con el resto de la app) */}
      <style>{`
        .table-row-soft {
          background-color: #f9fbfa;
          transition: background-color 0.2s;
        }
        .table-row-soft:hover {
          background-color: #eefaf3 !important;
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1050;
          padding: 20px;
        }
        .modal-card {
          background: #ffffff;
          border-radius: 16px;
          max-width: 480px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          overflow: hidden;
          animation: slideIn 0.25s ease;
        }
        @keyframes slideIn {
          from { transform: translateY(-30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .modal-header-custom {
          padding: 18px 24px;
          border-bottom: 1px solid #eef2f4;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8fafc;
        }
        .modal-header-desasignar {
          background: #f1f5f9;
        }
        .custom-input {
          background-color: #f6faf8 !important;
          border: 1.5px solid #e2ede7 !important;
          border-radius: 10px !important;
          padding: 11px 15px;
          font-size: 0.9rem;
          transition: all 0.2s ease;
          box-shadow: none !important;
        }
        .custom-input:focus {
          background-color: #ffffff !important;
          border-color: #28a745 !important;
          box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.15) !important;
        }
      `}</style>
    </div>
  );
}

export default PersonaDetalle;