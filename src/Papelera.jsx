import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

/**
 * Papelera / Historial de Bajas.
 *
 * Muestra los equipos marcados como "eliminado = true" (soft delete).
 * Nunca se pierden datos: desde aquí se pueden restaurar, o -solo
 * administradores- eliminarlos de forma permanente e irreversible.
 *
 * Props:
 *  - usuario: objeto de sesión actual ({ nombre, rol, ... })
 *  - onCambio: callback para refrescar el inventario activo en App.js
 *              cuando se restaura un equipo (así vuelve a aparecer ahí)
 */
function Papelera({ usuario, onCambio }) {
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [procesandoId, setProcesandoId] = useState(null);

  const cargarEliminados = useCallback(async () => {
    try {
      setCargando(true);
      const { data, error } = await supabase
        .from('computadoras')
        .select(`
          *,
          laboratorios ( id, nombre, edificio )
        `)
        .eq('eliminado', true)
        .order('fecha_eliminacion', { ascending: false });

      if (error) throw error;
      setEquipos(data || []);
      setError(null);
    } catch (err) {
      console.error('Error cargando historial de bajas:', err);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarEliminados();
  }, [cargarEliminados]);

  const restaurarEquipo = async (id) => {
    if (!window.confirm('¿Restaurar este equipo? Volverá a aparecer en el inventario activo.')) return;
    setProcesandoId(id);
    try {
      const { error } = await supabase
        .from('computadoras')
        .update({ eliminado: false, fecha_eliminacion: null, eliminado_por: null })
        .eq('id', id);

      if (error) throw error;

      await cargarEliminados();
      if (onCambio) await onCambio(); // refresca el inventario activo en App.js
    } catch (err) {
      alert('Error al restaurar: ' + err.message);
    } finally {
      setProcesandoId(null);
    }
  };

  const eliminarPermanente = async (id) => {
    if (usuario?.rol !== 'admin') {
      alert('Solo un administrador puede eliminar un equipo de forma permanente.');
      return;
    }
    if (!window.confirm('⚠️ ATENCIÓN: esto borrará el equipo PARA SIEMPRE, incluyendo toda su bitácora.\n\nEsta acción NO se puede deshacer. ¿Deseas continuar?')) return;

    setProcesandoId(id);
    try {
      // Borra primero la bitácora asociada para no dejar registros huérfanos
      await supabase.from('historial_mantenimiento').delete().eq('computadora_id', id);

      const { error } = await supabase.from('computadoras').delete().eq('id', id);
      if (error) throw error;

      await cargarEliminados();
    } catch (err) {
      alert('Error al eliminar de forma permanente: ' + err.message);
    } finally {
      setProcesandoId(null);
    }
  };

  const equiposFiltrados = equipos.filter(comp => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return true;
    return (
      (comp.codigo_inventario || '').toLowerCase().includes(q) ||
      (comp.tipo || '').toLowerCase().includes(q) ||
      (comp.marca || '').toLowerCase().includes(q) ||
      (comp.modelo || '').toLowerCase().includes(q) ||
      (comp.eliminado_por || '').toLowerCase().includes(q) ||
      (comp.motivo_eliminacion || '').toLowerCase().includes(q)
    );
  });

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
        Error al cargar el historial de bajas: {error}
        <div className="small mt-2">
          Si el error menciona columnas como "eliminado" o "fecha_eliminacion", necesitas correr
          primero el script SQL que agrega esas columnas a la tabla "computadoras" en Supabase.
        </div>
      </div>
    );
  }

  return (
    <div className="card border-0 rounded-4 bg-white p-3 p-md-4 shadow-sm">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 mb-md-4 gap-2 gap-md-3">
        <div>
          <h5 className="fw-bold text-dark mb-0 fs-6 fs-md-5">
            <i className="bi bi-clock-history text-secondary me-2"></i>Historial de Bajas
          </h5>
          <p className="text-muted small mb-0">
            {equipos.length} equipo{equipos.length !== 1 ? 's' : ''} en la papelera. Nada se pierde: puedes restaurarlos cuando quieras.
          </p>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <div className="input-group rounded-3 overflow-hidden search-box-papelera" style={{ maxWidth: '220px', height: '38px' }}>
            <span className="input-group-text bg-white border-0"><i className="bi bi-search text-muted"></i></span>
            <input
              type="text"
              className="form-control border-0 ps-0 small"
              placeholder="Buscar..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ fontSize: '13px' }}
            />
          </div>
          <button onClick={cargarEliminados} className="btn btn-sm btn-outline-secondary rounded-3" title="Actualizar lista">
            <i className="bi bi-arrow-clockwise me-1"></i>Actualizar
          </button>
        </div>
      </div>

      {equiposFiltrados.length === 0 ? (
        <div className="text-center py-5 text-muted">
          <i className="bi bi-folder-x fs-1 d-block mb-2 opacity-25"></i>
          {equipos.length === 0 ? 'No hay equipos en el historial de bajas.' : 'No hay resultados para esa búsqueda.'}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle" style={{ borderCollapse: 'separate', borderSpacing: '0 6px' }}>
            <thead>
              <tr className="text-muted small fw-semibold" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                <th className="border-0 ps-2 ps-md-3">Código</th>
                <th className="border-0">Tipo</th>
                <th className="border-0">Marca / Modelo</th>
                <th className="border-0 d-none d-md-table-cell">Serie</th>
                <th className="border-0 d-none d-lg-table-cell">Laboratorio</th>
                <th className="border-0">Motivo</th>
                <th className="border-0">Eliminado</th>
                <th className="border-0 text-end pe-2 pe-md-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {equiposFiltrados.map(comp => (
                <tr key={comp.id} className="table-row-soft rounded-4 shadow-none">
                  <td className="fw-bold ps-2 ps-md-3 rounded-start-3 border-0 align-middle" style={{ fontSize: '12px' }}>
                    {comp.codigo_inventario}
                  </td>
                  <td className="border-0"><span className="fw-semibold">{comp.tipo || '—'}</span></td>
                  <td className="border-0">{comp.marca || '—'} {comp.modelo ? `/ ${comp.modelo}` : ''}</td>
                  <td className="border-0 d-none d-md-table-cell" style={{ fontSize: '11px' }}>{comp.numero_serie || '—'}</td>
                  <td className="border-0 d-none d-lg-table-cell" style={{ fontSize: '11px' }}>
                    <i className="bi bi-building me-1 text-muted"></i>{comp.laboratorios?.nombre || 'SIN ASIGNAR'}
                  </td>
                  <td className="border-0" style={{ fontSize: '11px', maxWidth: '220px' }}>
                    {comp.motivo_eliminacion ? (
                      <span title={comp.motivo_eliminacion}>{comp.motivo_eliminacion}</span>
                    ) : (
                      <span className="text-muted fst-italic">Sin motivo registrado</span>
                    )}
                  </td>
                  <td className="border-0" style={{ fontSize: '11px' }}>
                    <span className="badge bg-secondary-subtle text-secondary border border-secondary px-2 py-1 rounded-3 fw-semibold" style={{ fontSize: '9px' }}>
                      {comp.fecha_eliminacion
                        ? new Date(comp.fecha_eliminacion).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : '—'}
                    </span>
                    <div className="text-muted mt-1" style={{ fontSize: '10px' }}>
                      <i className="bi bi-person me-1"></i>{comp.eliminado_por || 'Desconocido'}
                    </div>
                  </td>
                  <td className="border-0 text-end pe-2 pe-md-3 rounded-end-3">
                    <button
                      onClick={() => restaurarEquipo(comp.id)}
                      className="btn btn-sm btn-link text-success p-1 rounded-3 me-1"
                      title="Restaurar equipo al inventario activo"
                      disabled={procesandoId === comp.id}
                    >
                      <i className="bi bi-arrow-counterclockwise fs-6"></i>
                    </button>
                    {usuario?.rol === 'admin' && (
                      <button
                        onClick={() => eliminarPermanente(comp.id)}
                        className="btn btn-sm btn-link text-danger p-1 rounded-3"
                        title="Eliminar definitivamente (irreversible)"
                        disabled={procesandoId === comp.id}
                      >
                        <i className="bi bi-trash3-fill fs-6"></i>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .table-row-soft { background-color: #f9fbfa; transition: background-color 0.2s; }
        .table-row-soft:hover { background-color: #eefaf3 !important; }
        .search-box-papelera { border: 1.5px solid #e2ede7; }
      `}</style>
    </div>
  );
}

export default Papelera;