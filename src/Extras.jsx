import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const TIPOS_EXTRA = ['Micrófono', 'Parlante', 'Impresora', 'Proyector', 'Escáner', 'Router', 'Switch', 'Cámara Web', 'UPS', 'Otro'];

function Extras({ esAdmin }) {
  const [extras, setExtras] = useState([]);
  const [laboratorios, setLaboratorios] = useState([]);
  const [areas, setAreas] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [form, setForm] = useState({
    id: null,
    tipo: '',
    marca: '',
    modelo: '',
    numero_serie: '',
    estado: 'Operativo',
    ubicacion: '',
    persona_id: '',
    notas: ''
  });
  const [codigoAutomatico, setCodigoAutomatico] = useState('EXT-0001');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const cargarTodo = async () => {
    try {
      setCargando(true);

      const [
        { data: extrasData, error: extrasError },
        { data: labsData, error: labsError },
        { data: areasData, error: areasError },
        { data: personasData, error: personasError }
      ] = await Promise.all([
        supabase.from('extras').select('*').order('id', { ascending: false }),
        supabase.from('laboratorios').select('*').order('nombre'),
        supabase.from('areas').select('*').order('nombre'),
        supabase.from('personas').select('*').order('nombre')
      ]);

      if (extrasError) throw extrasError;
      if (labsError) throw labsError;
      if (areasError) throw areasError;
      if (personasError) throw personasError;

      setExtras(extrasData || []);
      setLaboratorios(labsData || []);
      setAreas(areasData || []);
      setPersonas(personasData || []);

      // Calcular próximo código automático (EXT-000X)
      let siguiente = 'EXT-0001';
      if (extrasData && extrasData.length > 0) {
        const ultimo = extrasData.reduce((max, e) => (e.id > max.id ? e : max), extrasData[0]);
        const num = parseInt((ultimo.codigo_inventario || 'EXT-0000').replace('EXT-', ''));
        siguiente = `EXT-${String((isNaN(num) ? 0 : num) + 1).padStart(4, '0')}`;
      }
      setCodigoAutomatico(siguiente);

      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  const nombreUbicacion = (extra) => {
    if (extra.laboratorio_id) {
      const lab = laboratorios.find(l => l.id === extra.laboratorio_id);
      return lab ? `🏢 ${lab.nombre}` : 'Laboratorio';
    }
    if (extra.area_id) {
      const area = areas.find(a => a.id === extra.area_id);
      return area ? `🏛️ ${area.nombre}` : 'Área';
    }
    return 'Sin asignar';
  };

  const nombrePersona = (extra) => {
    if (!extra.persona_id) return '—';
    return personas.find(p => p.id === extra.persona_id)?.nombre || '—';
  };

  const abrirNuevo = () => {
    setModoEdicion(false);
    setForm({
      id: null, tipo: '', marca: '', modelo: '', numero_serie: '',
      estado: 'Operativo', ubicacion: '', persona_id: '', notas: ''
    });
    setMensaje({ tipo: '', texto: '' });
    setMostrarModal(true);
  };

  const abrirEditar = (extra) => {
    setModoEdicion(true);
    let ubicacionActual = '';
    if (extra.laboratorio_id) ubicacionActual = `lab-${extra.laboratorio_id}`;
    else if (extra.area_id) ubicacionActual = `area-${extra.area_id}`;

    setForm({
      id: extra.id,
      tipo: extra.tipo || '',
      marca: extra.marca || '',
      modelo: extra.modelo || '',
      numero_serie: extra.numero_serie || '',
      estado: extra.estado || 'Operativo',
      ubicacion: ubicacionActual,
      persona_id: extra.persona_id || '',
      notas: extra.notas || ''
    });
    setMensaje({ tipo: '', texto: '' });
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setMensaje({ tipo: '', texto: '' });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'ubicacion' && !value.startsWith('area-')) {
      // Solo se asigna a una persona si la ubicación es un Área Administrativa
      setForm(prev => ({ ...prev, ubicacion: value, persona_id: '' }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const guardarExtra = async (e) => {
    e.preventDefault();
    if (!form.tipo.trim() || !form.marca.trim()) {
      setMensaje({ tipo: 'danger', texto: 'Tipo y Marca son obligatorios.' });
      return;
    }

    setEnviando(true);
    try {
      let laboratorioId = null;
      let areaId = null;
      if (form.ubicacion.startsWith('lab-')) {
        laboratorioId = parseInt(form.ubicacion.replace('lab-', ''));
      } else if (form.ubicacion.startsWith('area-')) {
        areaId = parseInt(form.ubicacion.replace('area-', ''));
      }

      const payload = {
        tipo: form.tipo,
        marca: form.marca,
        modelo: form.modelo || null,
        numero_serie: form.numero_serie || null,
        estado: form.estado,
        laboratorio_id: laboratorioId,
        area_id: areaId,
        persona_id: (areaId && form.persona_id) ? parseInt(form.persona_id) : null,
        fecha_asignacion: (areaId && form.persona_id) ? new Date().toISOString() : null,
        notas: form.notas || null,
      };

      if (modoEdicion) {
        const { error } = await supabase.from('extras').update(payload).eq('id', form.id);
        if (error) throw error;
        setMensaje({ tipo: 'success', texto: 'Extra actualizado correctamente.' });
      } else {
        const { error } = await supabase.from('extras').insert([{ ...payload, codigo_inventario: codigoAutomatico }]);
        if (error) throw error;
        setMensaje({ tipo: 'success', texto: 'Extra registrado correctamente.' });
      }

      await cargarTodo();
      setTimeout(() => {
        cerrarModal();
        setEnviando(false);
      }, 1200);

    } catch (err) {
      setMensaje({ tipo: 'danger', texto: 'Error al guardar: ' + err.message });
      setEnviando(false);
    }
  };

  // SOLO EL ADMINISTRADOR puede eliminar equipos extra.
  const eliminarExtra = async (id) => {
    if (!esAdmin) {
      alert('⛔ Solo un administrador puede eliminar equipos extra.');
      return;
    }
    if (!window.confirm('¿Estás seguro de eliminar este equipo extra?')) return;
    try {
      const { error } = await supabase.from('extras').delete().eq('id', id);
      if (error) throw error;
      await cargarTodo();
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  const extrasFiltrados = extras.filter(e => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return true;
    return (e.tipo || '').toLowerCase().includes(q) ||
      (e.marca || '').toLowerCase().includes(q) ||
      (e.modelo || '').toLowerCase().includes(q) ||
      (e.codigo_inventario || '').toLowerCase().includes(q);
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
        Error al cargar extras: {error}
        <div className="small mt-2">
          Si el error menciona que la tabla "extras" no existe, necesitas crearla en Supabase primero.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card border-0 rounded-4 bg-white p-4 shadow-sm mb-4">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
          <div>
            <h5 className="fw-bold text-dark m-0">
              <i className="bi bi-box-seam text-success me-2"></i>
              Extras
            </h5>
            <p className="text-muted small m-0">Micrófonos, parlantes, impresoras y otros equipos. Total: {extras.length}</p>
          </div>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <div className="input-group rounded-3 overflow-hidden search-box-extras" style={{ maxWidth: '220px', height: '38px' }}>
              <span className="input-group-text bg-white border-0"><i className="bi bi-search text-muted"></i></span>
              <input type="text" className="form-control border-0 ps-0 small" placeholder="Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ fontSize: '13px' }} />
            </div>
            <button onClick={abrirNuevo} className="btn btn-success px-4 py-2 fw-semibold">
              <i className="bi bi-plus-lg me-2"></i>Nuevo Extra
            </button>
          </div>
        </div>

        {extrasFiltrados.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="bi bi-box-seam fs-1 d-block mb-2 opacity-25"></i>
            No hay equipos extra registrados. ¡Agrega el primero!
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr className="text-muted small fw-semibold" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                  <th className="border-0">Código</th>
                  <th className="border-0">Tipo</th>
                  <th className="border-0">Marca</th>
                  <th className="border-0">Modelo</th>
                  <th className="border-0">Serie</th>
                  <th className="border-0">Estado</th>
                  <th className="border-0">Ubicación</th>
                  <th className="border-0">Asignado a</th>
                  <th className="border-0 text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {extrasFiltrados.map(extra => (
                  <tr key={extra.id} className="table-row-soft">
                    <td className="fw-bold text-success small">{extra.codigo_inventario}</td>
                    <td className="fw-semibold">{extra.tipo}</td>
                    <td>{extra.marca || '—'}</td>
                    <td>{extra.modelo || '—'}</td>
                    <td className="small">{extra.numero_serie || '—'}</td>
                    <td>
                      <span className={`badge ${extra.estado === 'Operativo' ? 'bg-success' : extra.estado === 'Mantenimiento' ? 'bg-warning text-dark' : 'bg-danger'} px-2 py-1`}>
                        {extra.estado}
                      </span>
                    </td>
                    <td className="small">{nombreUbicacion(extra)}</td>
                    <td className="small">{nombrePersona(extra)}</td>
                    <td className="text-end">
                      <button
                        onClick={() => abrirEditar(extra)}
                        className="btn btn-sm btn-link text-warning p-1 me-2"
                        title="Editar"
                      >
                        <i className="bi bi-pencil fs-5"></i>
                      </button>
                      {esAdmin && (
                        <button
                          onClick={() => eliminarExtra(extra.id)}
                          className="btn btn-sm btn-link text-danger p-1"
                          title="Eliminar (solo administrador)"
                        >
                          <i className="bi bi-trash3 fs-5"></i>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nuevo / Editar Extra */}
      {mostrarModal && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-custom">
              <h6 className="fw-bold m-0">
                <i className="bi bi-box-seam text-success me-2"></i>
                {modoEdicion ? 'Editar Extra' : 'Nuevo Extra'}
              </h6>
              <button type="button" className="btn-close shadow-none" onClick={cerrarModal}></button>
            </div>

            <form onSubmit={guardarExtra} className="p-4">
              {mensaje.texto && (
                <div className={`alert alert-${mensaje.tipo} py-2 small`}>
                  <i className={`bi bi-${mensaje.tipo === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2`}></i>
                  {mensaje.texto}
                </div>
              )}

              {!modoEdicion && (
                <div className="mb-3">
                  <label className="form-label fw-semibold text-secondary small">Código</label>
                  <input type="text" className="form-control custom-input fw-bold text-success" value={codigoAutomatico} readOnly />
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Tipo *</label>
                <select name="tipo" className="form-select custom-input" value={form.tipo} onChange={handleChange} required disabled={enviando}>
                  <option value="">Seleccionar...</option>
                  {TIPOS_EXTRA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Marca *</label>
                <input type="text" name="marca" className="form-control custom-input" placeholder="Ej: Logitech" value={form.marca} onChange={handleChange} required disabled={enviando} />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Modelo</label>
                <input type="text" name="modelo" className="form-control custom-input" value={form.modelo} onChange={handleChange} disabled={enviando} />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Serie</label>
                <input type="text" name="numero_serie" className="form-control custom-input" value={form.numero_serie} onChange={handleChange} disabled={enviando} maxLength={50} />
                <small className="text-muted d-block mt-1">{form.numero_serie.length}/50</small>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Estado</label>
                <select name="estado" className="form-select custom-input" value={form.estado} onChange={handleChange} disabled={enviando}>
                  <option value="Operativo">🟢 Operativo</option>
                  <option value="Mantenimiento">🟡 Mantenimiento</option>
                  <option value="Dañado">🔴 Dañado</option>
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-secondary small">Ubicación</label>
                <select name="ubicacion" className="form-select custom-input" value={form.ubicacion} onChange={handleChange} disabled={enviando}>
                  <option value="">⚠️ -- Sin Asignar --</option>
                  <optgroup label="🏢 Laboratorios">
                    {laboratorios.map(lab => (
                      <option key={`lab-${lab.id}`} value={`lab-${lab.id}`}>{lab.nombre} — {lab.edificio}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🏛️ Áreas Administrativas">
                    {areas.map(area => (
                      <option key={`area-${area.id}`} value={`area-${area.id}`}>{area.nombre}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {form.ubicacion.startsWith('area-') && (
                <div className="mb-3">
                  <label className="form-label fw-semibold text-secondary small">Asignar a</label>
                  <select name="persona_id" className="form-select custom-input" value={form.persona_id} onChange={handleChange} disabled={enviando}>
                    <option value="">⚠️ -- Sin Asignar --</option>
                    {personas.map(p => (
                      <option key={p.id} value={p.id}>👤 {p.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
              {form.ubicacion.startsWith('lab-') && (
                <p className="text-muted small mb-3">
                  <i className="bi bi-info-circle me-1"></i>
                  Los extras de laboratorio no se asignan a una persona específica.
                </p>
              )}

              <div className="mb-4">
                <label className="form-label fw-semibold text-secondary small">Notas</label>
                <textarea name="notas" className="form-control custom-input" rows="2" value={form.notas} onChange={handleChange} disabled={enviando} maxLength={50} />
                <small className="text-muted d-block mt-1">{form.notas.length}/50</small>
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
                  <>{modoEdicion ? 'Actualizar' : 'Registrar'} Extra</>
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
        .search-box-extras {
          border: 1.5px solid #e2ede7;
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
          overflow-y: auto;
        }
        .modal-card {
          background: #ffffff;
          border-radius: 16px;
          max-width: 480px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          overflow: hidden;
          animation: slideIn 0.25s ease;
          max-height: 90vh;
          overflow-y: auto;
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
          position: sticky;
          top: 0;
          z-index: 2;
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

export default Extras;
