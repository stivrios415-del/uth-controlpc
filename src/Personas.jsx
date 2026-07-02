import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function Personas({ onPersonaChange }) {
  const [personas, setPersonas] = useState([]);
  const [equiposPorPersona, setEquiposPorPersona] = useState([]);
  const [personaSeleccionada, setPersonaSeleccionada] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [form, setForm] = useState({ id: null, nombre: '', email: '', telefono: '', cargo: '' });
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const cargarPersonas = async () => {
    try {
      setCargando(true);
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setPersonas(data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const cargarEquiposPorPersona = async (personaId) => {
    try {
      setCargando(true);
      const { data, error } = await supabase
        .from('computadoras')
        .select('*')
        .eq('persona_id', personaId)
        .order('codigo_inventario', { ascending: true });

      if (error) throw error;
      setEquiposPorPersona(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarPersonas();
  }, []);

  const refrescarApp = () => {
    if (onPersonaChange) {
      onPersonaChange();
    }
  };

  const abrirNuevo = () => {
    setModoEdicion(false);
    setForm({ id: null, nombre: '', email: '', telefono: '', cargo: '' });
    setMensaje({ tipo: '', texto: '' });
    setMostrarModal(true);
  };

  const abrirEditar = (persona) => {
    setModoEdicion(true);
    setForm({ id: persona.id, nombre: persona.nombre, email: persona.email || '', telefono: persona.telefono || '', cargo: persona.cargo || '' });
    setMensaje({ tipo: '', texto: '' });
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setForm({ id: null, nombre: '', email: '', telefono: '', cargo: '' });
    setMensaje({ tipo: '', texto: '' });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const guardarPersona = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setMensaje({ tipo: 'danger', texto: 'El nombre es obligatorio.' });
      return;
    }

    setEnviando(true);
    try {
      if (modoEdicion) {
        const { error } = await supabase
          .from('personas')
          .update({ 
            nombre: form.nombre.trim(), 
            email: form.email.trim() || null, 
            telefono: form.telefono.trim() || null, 
            cargo: form.cargo.trim() || null 
          })
          .eq('id', form.id);
        if (error) throw error;
        setMensaje({ tipo: 'success', texto: 'Persona actualizada correctamente.' });
      } else {
        const { error } = await supabase
          .from('personas')
          .insert([{ 
            nombre: form.nombre.trim(), 
            email: form.email.trim() || null, 
            telefono: form.telefono.trim() || null, 
            cargo: form.cargo.trim() || null 
          }]);
        if (error) throw error;
        setMensaje({ tipo: 'success', texto: 'Persona creada correctamente.' });
      }

      await cargarPersonas();
      refrescarApp();

      setTimeout(() => {
        cerrarModal();
        setEnviando(false);
      }, 1500);

    } catch (err) {
      setMensaje({ tipo: 'danger', texto: 'Error al guardar: ' + err.message });
      setEnviando(false);
    }
  };

  const eliminarPersona = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar esta persona? Se desasignarán los equipos.')) return;

    try {
      const { error } = await supabase
        .from('personas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await cargarPersonas();
      refrescarApp();
      alert('Persona eliminada correctamente.');
      if (personaSeleccionada === id) {
        setPersonaSeleccionada(null);
        setEquiposPorPersona([]);
      }
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  const handleSeleccionarPersona = (persona) => {
    if (personaSeleccionada === persona.id) {
      setPersonaSeleccionada(null);
      setEquiposPorPersona([]);
    } else {
      setPersonaSeleccionada(persona.id);
      cargarEquiposPorPersona(persona.id);
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
        Error al cargar personas: {error}
      </div>
    );
  }

  return (
    <div>
      <div className="card border-0 rounded-4 bg-white p-4 shadow-sm mb-4">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
          <div>
            <h5 className="fw-bold text-dark m-0">
              <i className="bi bi-people text-success me-2"></i>
              Personas
            </h5>
            <p className="text-muted small m-0">Total: {personas.length} personas registradas</p>
          </div>
          <button onClick={abrirNuevo} className="btn btn-success px-4 py-2 fw-semibold">
            <i className="bi bi-plus-lg me-2"></i>Nueva Persona
          </button>
        </div>

        {personas.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="bi bi-people fs-1 d-block mb-2 opacity-25"></i>
            No hay personas registradas. ¡Crea la primera!
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr className="text-muted small fw-semibold" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                  <th className="border-0">Nombre</th>
                  <th className="border-0">Email</th>
                  <th className="border-0">Teléfono</th>
                  <th className="border-0">Cargo</th>
                  <th className="border-0 text-center">Equipos</th>
                  <th className="border-0 text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {personas.map(persona => {
                  const isSelected = personaSeleccionada === persona.id;
                  return (
                    <tr key={persona.id} className="table-row-soft" style={{ cursor: 'pointer' }} onClick={() => handleSeleccionarPersona(persona)}>
                      <td className="fw-bold text-dark">{persona.nombre}</td>
                      <td>{persona.email || '—'}</td>
                      <td>{persona.telefono || '—'}</td>
                      <td>{persona.cargo || '—'}</td>
                      <td className="text-center">
                        <span className="badge bg-info text-white">
                          {isSelected ? '👀' : '📋'}
                        </span>
                      </td>
                      <td className="text-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); abrirEditar(persona); }}
                          className="btn btn-sm btn-link text-warning p-1 me-2"
                          title="Editar"
                        >
                          <i className="bi bi-pencil fs-5"></i>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); eliminarPersona(persona.id); }}
                          className="btn btn-sm btn-link text-danger p-1"
                          title="Eliminar"
                        >
                          <i className="bi bi-trash3 fs-5"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {personaSeleccionada && (
        <div className="card border-0 rounded-4 bg-white p-4 shadow-sm">
          <h5 className="fw-bold text-dark mb-3">
            <i className="bi bi-pc-display text-success me-2"></i>
            Equipos asignados a <span className="text-success">{personas.find(p => p.id === personaSeleccionada)?.nombre}</span>
          </h5>
          {equiposPorPersona.length === 0 ? (
            <p className="text-muted text-center py-3">No hay equipos asignados a esta persona.</p>
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
                    <th>Fecha Asignación</th>
                  </tr>
                </thead>
                <tbody>
                  {equiposPorPersona.map(equipo => (
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
                      <td>{equipo.fecha_asignacion ? new Date(equipo.fecha_asignacion).toLocaleDateString('es-HN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mostrarModal && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-custom">
              <h6 className="fw-bold m-0">
                <i className="bi bi-people text-success me-2"></i>
                {modoEdicion ? 'Editar Persona' : 'Nueva Persona'}
              </h6>
              <button type="button" className="btn-close shadow-none" onClick={cerrarModal}></button>
            </div>

            <form onSubmit={guardarPersona} className="p-4">
              {mensaje.texto && (
                <div className={`alert alert-${mensaje.tipo} py-2 small`}>
                  <i className={`bi bi-${mensaje.tipo === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2`}></i>
                  {mensaje.texto}
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Nombre *</label>
                <input
                  type="text"
                  name="nombre"
                  className="form-control custom-input"
                  placeholder="Nombre completo"
                  value={form.nombre}
                  onChange={handleChange}
                  required
                  disabled={enviando}
                />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Email</label>
                <input
                  type="email"
                  name="email"
                  className="form-control custom-input"
                  placeholder="correo@ejemplo.com"
                  value={form.email}
                  onChange={handleChange}
                  disabled={enviando}
                />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Teléfono</label>
                <input
                  type="text"
                  name="telefono"
                  className="form-control custom-input"
                  placeholder="1234-5678"
                  value={form.telefono}
                  onChange={handleChange}
                  disabled={enviando}
                />
              </div>

              <div className="mb-4">
                <label className="form-label fw-semibold text-secondary small">Cargo</label>
                <input
                  type="text"
                  name="cargo"
                  className="form-control custom-input"
                  placeholder="Técnico, Docente, etc."
                  value={form.cargo}
                  onChange={handleChange}
                  disabled={enviando}
                />
              </div>

              <button
                type="submit"
                className="btn btn-success w-100 py-2 fw-semibold"
                disabled={enviando}
                style={{ backgroundColor: '#28a745', border: 'none' }}
              >
                {enviando ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    Guardando...
                  </>
                ) : (
                  <>{modoEdicion ? 'Actualizar' : 'Crear'} Persona</>
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

export default Personas;