import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function Laboratorios({ onLaboratorioChange, esAdmin }) {
  const [laboratorios, setLaboratorios] = useState([]);
  const [equiposPorLaboratorio, setEquiposPorLaboratorio] = useState([]);
  const [laboratorioSeleccionado, setLaboratorioSeleccionado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [form, setForm] = useState({ id: null, nombre: '', edificio: '' });
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const cargarLaboratorios = async () => {
    try {
      setCargando(true);
      const { data, error } = await supabase
        .from('laboratorios')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setLaboratorios(data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const cargarEquiposPorLaboratorio = async (labId) => {
    try {
      setCargando(true);
      const { data, error } = await supabase
        .from('computadoras')
        .select('*')
        .eq('laboratorio_id', labId)
        .order('codigo_inventario', { ascending: true });

      if (error) throw error;
      setEquiposPorLaboratorio(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarLaboratorios();
  }, []);

  const refrescarApp = () => {
    if (onLaboratorioChange) {
      onLaboratorioChange();
    }
  };

  const abrirNuevo = () => {
    setModoEdicion(false);
    setForm({ id: null, nombre: '', edificio: '' });
    setMensaje({ tipo: '', texto: '' });
    setMostrarModal(true);
  };

  const abrirEditar = (lab) => {
    setModoEdicion(true);
    setForm({ id: lab.id, nombre: lab.nombre, edificio: lab.edificio });
    setMensaje({ tipo: '', texto: '' });
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setForm({ id: null, nombre: '', edificio: '' });
    setMensaje({ tipo: '', texto: '' });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  // ==================== VALIDACIÓN DEL FORMULARIO ====================
  const validarLaboratorio = () => {
    const faltantes = [];
    if (!form.nombre.trim()) faltantes.push('NOMBRE');
    if (!form.edificio.trim()) faltantes.push('EDIFICIO');
    return faltantes;
  };

  const guardarLaboratorio = async (e) => {
    e.preventDefault();

    const camposFaltantes = validarLaboratorio();
    if (camposFaltantes.length > 0) {
      alert(
        '⚠️ Faltan campos por completar:\n\n' +
        camposFaltantes.map(c => `• ${c}`).join('\n') +
        '\n\nPor favor llena todos los campos antes de guardar el laboratorio.'
      );
      return;
    }

    setEnviando(true);
    try {
      if (modoEdicion) {
        const { error } = await supabase
          .from('laboratorios')
          .update({ nombre: form.nombre.trim(), edificio: form.edificio.trim() })
          .eq('id', form.id);
        if (error) throw error;
        setMensaje({ tipo: 'success', texto: 'Laboratorio actualizado correctamente.' });
      } else {
        const { error } = await supabase
          .from('laboratorios')
          .insert([{ nombre: form.nombre.trim(), edificio: form.edificio.trim() }]);
        if (error) throw error;
        setMensaje({ tipo: 'success', texto: 'Laboratorio creado correctamente.' });
      }

      await cargarLaboratorios();
      refrescarApp();

      setTimeout(() => {
        cerrarModal();
        setEnviando(false);
      }, 1500);

    } catch (err) {
      alert('Error al guardar: ' + err.message);
      setEnviando(false);
    }
  };

  // SOLO EL ADMINISTRADOR puede eliminar laboratorios.
  const eliminarLaboratorio = async (id) => {
    if (!esAdmin) {
      alert('⛔ Solo un administrador puede eliminar laboratorios.');
      return;
    }
    if (!window.confirm('¿Estás seguro de eliminar este laboratorio? Se desasignarán los equipos.')) return;

    try {
      const { error } = await supabase
        .from('laboratorios')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await cargarLaboratorios();
      refrescarApp();
      alert('Laboratorio eliminado correctamente.');
      if (laboratorioSeleccionado === id) {
        setLaboratorioSeleccionado(null);
        setEquiposPorLaboratorio([]);
      }
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  const handleSeleccionarLaboratorio = (lab) => {
    if (laboratorioSeleccionado === lab.id) {
      setLaboratorioSeleccionado(null);
      setEquiposPorLaboratorio([]);
    } else {
      setLaboratorioSeleccionado(lab.id);
      cargarEquiposPorLaboratorio(lab.id);
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
        Error al cargar laboratorios: {error}
      </div>
    );
  }

  return (
    <div>
      {/* Panel de Laboratorios */}
      <div className="card border-0 rounded-4 bg-white p-4 shadow-sm mb-4">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
          <div>
            <h5 className="fw-bold text-dark m-0">
              <i className="bi bi-building text-success me-2"></i>
              Laboratorios
            </h5>
            <p className="text-muted small m-0">Total: {laboratorios.length} laboratorios registrados</p>
          </div>
          <button
            onClick={abrirNuevo}
            className="btn btn-success px-4 py-2 fw-semibold"
            title="Registrar un nuevo laboratorio en el sistema"
          >
            <i className="bi bi-plus-lg me-2"></i>Nuevo Laboratorio
          </button>
        </div>

        {laboratorios.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="bi bi-building fs-1 d-block mb-2 opacity-25"></i>
            No hay laboratorios registrados. ¡Crea el primero!
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr className="text-muted small fw-semibold" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                  <th className="border-0">Nombre</th>
                  <th className="border-0">Edificio</th>
                  <th className="border-0">Creado</th>
                  <th className="border-0 text-center">Equipos</th>
                  <th className="border-0 text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {laboratorios.map(lab => {
                  const isSelected = laboratorioSeleccionado === lab.id;
                  return (
                    <tr key={lab.id} className="table-row-soft">
                      <td className="fw-bold text-dark" onClick={() => handleSeleccionarLaboratorio(lab)} style={{ cursor: 'pointer' }}>{lab.nombre}</td>
                      <td onClick={() => handleSeleccionarLaboratorio(lab)} style={{ cursor: 'pointer' }}>{lab.edificio}</td>
                      <td className="text-muted small" onClick={() => handleSeleccionarLaboratorio(lab)} style={{ cursor: 'pointer' }}>
                        {new Date(lab.creado_en).toLocaleDateString('es-HN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => handleSeleccionarLaboratorio(lab)}
                          className="btn btn-sm btn-info text-white rounded-pill px-3"
                          style={{ fontSize: '12px' }}
                          title={isSelected ? 'Ocultar los equipos de este laboratorio' : 'Ver los equipos asignados a este laboratorio'}
                        >
                          {isSelected ? '👀 Ver' : '📋 Ver'}
                        </button>
                      </td>
                      <td className="text-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); abrirEditar(lab); }}
                          className="btn btn-sm btn-link text-warning p-1 me-2"
                          title="Editar este laboratorio"
                        >
                          <i className="bi bi-pencil fs-5"></i>
                        </button>
                        {esAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); eliminarLaboratorio(lab.id); }}
                            className="btn btn-sm btn-link text-danger p-1"
                            title="Eliminar este laboratorio (solo administrador)"
                          >
                            <i className="bi bi-trash3 fs-5"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Equipos del laboratorio seleccionado */}
      {laboratorioSeleccionado && (
        <div className="card border-0 rounded-4 bg-white p-4 shadow-sm">
          <h5 className="fw-bold text-dark mb-3">
            <i className="bi bi-pc-display text-success me-2"></i>
            Equipos asignados a <span className="text-success">{laboratorios.find(l => l.id === laboratorioSeleccionado)?.nombre}</span>
          </h5>
          {equiposPorLaboratorio.length === 0 ? (
            <p className="text-muted text-center py-3">No hay equipos asignados a este laboratorio.</p>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle table-sm">
                <thead>
                  <tr className="text-muted small fw-semibold" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                    <th>Código</th>
                    <th>Tipo</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {equiposPorLaboratorio.map(equipo => (
                    <tr key={equipo.id} className="table-row-soft">
                      <td className="fw-bold text-primary small">{equipo.codigo_inventario}</td>
                      <td>{equipo.tipo || '—'}</td>
                      <td>{equipo.marca || '—'}</td>
                      <td>{equipo.modelo || '—'}</td>
                      <td>
                        <span className={`badge ${equipo.estado === 'Operativo' ? 'bg-success' : equipo.estado === 'Mantenimiento' ? 'bg-warning text-dark' : 'bg-danger'} px-2 py-1`}>
                          {equipo.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal igual que antes */}
      {mostrarModal && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-custom">
              <h6 className="fw-bold m-0">
                <i className="bi bi-building text-success me-2"></i>
                {modoEdicion ? 'Editar Laboratorio' : 'Nuevo Laboratorio'}
              </h6>
              <button
                type="button"
                className="btn-close shadow-none"
                onClick={cerrarModal}
                title="Cerrar sin guardar"
              ></button>
            </div>

            <form onSubmit={guardarLaboratorio} className="p-4">
              {mensaje.texto && (
                <div className={`alert alert-${mensaje.tipo} py-2 small`}>
                  <i className={`bi bi-${mensaje.tipo === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2`}></i>
                  {mensaje.texto}
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Nombre del Laboratorio</label>
                <input
                  type="text"
                  name="nombre"
                  className="form-control custom-input"
                  placeholder="Ej: Laboratorio de Sistemas 1"
                  value={form.nombre}
                  onChange={handleChange}
                  required
                  disabled={enviando}
                />
              </div>

              <div className="mb-4">
                <label className="form-label fw-semibold text-secondary small">Edificio</label>
                <input
                  type="text"
                  name="edificio"
                  className="form-control custom-input"
                  placeholder="Ej: Edificio J1"
                  value={form.edificio}
                  onChange={handleChange}
                  required
                  disabled={enviando}
                />
              </div>

              <button
                type="submit"
                className="btn btn-success w-100 py-2 fw-semibold"
                disabled={enviando}
                style={{ backgroundColor: '#28a745', border: 'none' }}
                title="Guardar los datos de este laboratorio"
              >
                {enviando ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    Guardando...
                  </>
                ) : (
                  <>{modoEdicion ? 'Actualizar' : 'Crear'} Laboratorio</>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

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

export default Laboratorios;
