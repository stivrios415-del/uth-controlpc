import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const FORM_VACIO = {
  tipo: '',
  marca: '',
  modelo: '',
  numero_serie: '',
  procesador: '',
  ram_gb: '',
  disco: '',
  ano: '',
  estado: 'Operativo',
  ubicacion: '',
  persona_id: '',
  notas: ''
};

function EditarEquipo({ equipoId, onVolver }) {
  const [form, setForm] = useState(FORM_VACIO);
  const [equipoOriginal, setEquipoOriginal] = useState(null);
  const [laboratorios, setLaboratorios] = useState([]);
  const [areas, setAreas] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [catalogos, setCatalogos] = useState({
    tipos: [],
    marcas: [],
    modelos: [],
    procesadores: [],
    ram_opciones: [],
    discos: [],
  });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);

  // Detecta si el tipo actual es Monitor, para ocultar Procesador/RAM/Disco/Año
  const esMonitor = form.tipo.toLowerCase().includes('monitor');

  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);

      const [
        { data: equipo, error: eqError },
        { data: labs, error: labsError },
        { data: areasData, error: areasError },
        { data: personasData, error: personasError },
        { data: tipos, error: tiposError },
        { data: marcas, error: marcasError },
        { data: modelos, error: modelosError },
        { data: procesadores, error: procesadoresError },
        { data: ramOpciones, error: ramError },
        { data: discos, error: discosError },
      ] = await Promise.all([
        supabase.from('computadoras').select('*').eq('id', equipoId).single(),
        supabase.from('laboratorios').select('*').order('nombre'),
        supabase.from('areas').select('*').order('nombre'),
        supabase.from('personas').select('*').order('nombre'),
        supabase.from('tipos').select('*').order('orden'),
        supabase.from('marcas').select('*').order('orden'),
        supabase.from('modelos').select('*').order('orden'),
        supabase.from('procesadores').select('*').order('orden'),
        supabase.from('ram_opciones').select('*').order('orden'),
        supabase.from('discos').select('*').order('orden'),
      ]);

      if (eqError) throw eqError;
      if (labsError) throw labsError;
      if (areasError) throw areasError;

      setLaboratorios(labs || []);
      setAreas(areasData || []);
      setPersonas(personasError ? [] : (personasData || []));
      setCatalogos({
        tipos: tiposError ? [] : (tipos || []),
        marcas: marcasError ? [] : (marcas || []),
        modelos: modelosError ? [] : (modelos || []),
        procesadores: procesadoresError ? [] : (procesadores || []),
        ram_opciones: ramError ? [] : (ramOpciones || []),
        discos: discosError ? [] : (discos || []),
      });

      // Reconstruye el valor combinado de UBICACIÓN a partir de lo que ya tenía el equipo
      let ubicacionActual = '';
      if (equipo.laboratorio_id) {
        ubicacionActual = `lab-${equipo.laboratorio_id}`;
      } else if (equipo.area_id) {
        ubicacionActual = `area-${equipo.area_id}`;
      }

      setEquipoOriginal(equipo);
      setForm({
        tipo: equipo.tipo || '',
        marca: equipo.marca || '',
        modelo: equipo.modelo || '',
        numero_serie: equipo.numero_serie || '',
        procesador: equipo.procesador || '',
        ram_gb: equipo.ram_gb ? String(equipo.ram_gb) : '',
        disco: equipo.disco || '',
        ano: equipo.ano ? String(equipo.ano) : '',
        estado: equipo.estado || 'Operativo',
        ubicacion: ubicacionActual,
        persona_id: equipo.persona_id ? String(equipo.persona_id) : '',
        notas: equipo.notas || ''
      });

    } catch (err) {
      console.error('Error cargando datos:', err);
      setError('No se pudieron cargar los datos del equipo.');
    } finally {
      setCargando(false);
    }
  }, [equipoId]);

  useEffect(() => {
    if (equipoId) {
      cargarDatos();
    }
  }, [equipoId, cargarDatos]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'ubicacion' && !value.startsWith('area-')) {
      // Si la ubicación no es un Área Administrativa, no se puede asignar a ninguna persona
      setForm(prev => ({ ...prev, ubicacion: value, persona_id: '' }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  // ==================== VALIDACIÓN DEL FORMULARIO ====================
  const validarFormulario = () => {
    const faltantes = [];

    if (!form.tipo) faltantes.push('TIPO');
    if (!form.marca.trim()) faltantes.push('MARCA');
    if (!form.modelo.trim()) faltantes.push('MODELO');
    if (!form.numero_serie.trim()) faltantes.push('SERIE');

    if (!esMonitor) {
      if (!form.procesador.trim()) faltantes.push('PROCESADOR');
      if (!form.ram_gb) faltantes.push('RAM (GB)');
      if (!form.disco.trim()) faltantes.push('DISCO');
      if (!form.ano) faltantes.push('AÑO');
    }

    if (!form.estado) faltantes.push('ESTADO');
    if (!form.ubicacion) faltantes.push('UBICACIÓN');

    if (form.ubicacion.startsWith('area-') && !form.persona_id) {
      faltantes.push('ASIGNAR A');
    }

    if (!form.notas.trim()) faltantes.push('NOTAS');

    return faltantes;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (enviando) return;

    const camposFaltantes = validarFormulario();
    if (camposFaltantes.length > 0) {
      alert(
        '⚠️ Faltan campos por completar:\n\n' +
        camposFaltantes.map(c => `• ${c}`).join('\n') +
        '\n\nPor favor llena todos los campos antes de guardar los cambios.'
      );
      return;
    }

    setEnviando(true);
    try {
      // Interpreta la UBICACIÓN unificada ("lab-3" o "area-2") en la columna correcta
      let laboratorioId = null;
      let areaId = null;
      if (form.ubicacion.startsWith('lab-')) {
        laboratorioId = parseInt(form.ubicacion.replace('lab-', ''));
      } else if (form.ubicacion.startsWith('area-')) {
        areaId = parseInt(form.ubicacion.replace('area-', ''));
      }

      const personaIdNueva = (areaId && form.persona_id) ? parseInt(form.persona_id) : null;
      const personaIdOriginal = equipoOriginal?.persona_id || null;

      // Solo actualiza fecha_asignacion si la persona asignada realmente cambió
      let fechaAsignacion = equipoOriginal?.fecha_asignacion || null;
      if (personaIdNueva !== personaIdOriginal) {
        fechaAsignacion = personaIdNueva ? new Date().toISOString() : null;
      }

      const payload = {
        tipo: form.tipo || null,
        marca: form.marca || null,
        modelo: form.modelo || null,
        numero_serie: form.numero_serie || null,
        procesador: esMonitor ? null : (form.procesador || null),
        ram_gb: esMonitor ? null : (form.ram_gb ? parseInt(form.ram_gb) : null),
        disco: esMonitor ? null : (form.disco || null),
        ano: esMonitor ? null : (form.ano ? parseInt(form.ano) : null),
        estado: form.estado,
        laboratorio_id: laboratorioId,
        area_id: areaId,
        persona_id: personaIdNueva,
        fecha_asignacion: fechaAsignacion,
        notas: form.notas || null,
      };

      const { error: updateError } = await supabase
        .from('computadoras')
        .update(payload)
        .eq('id', equipoId);

      if (updateError) throw updateError;

      setExito(true);
      setTimeout(() => {
        onVolver();
      }, 1500);

    } catch (err) {
      alert('Error al actualizar: ' + err.message);
    } finally {
      setEnviando(false);
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
      <div className="card border-0 rounded-4 bg-white p-5 text-center shadow-sm" style={{ maxWidth: '500px', margin: '0 auto' }}>
        <div className="bg-danger-subtle text-danger rounded-circle d-inline-flex p-3 mb-3 mx-auto">
          <i className="bi bi-exclamation-octagon fs-3"></i>
        </div>
        <h5 className="fw-bold text-dark mb-2">Error</h5>
        <p className="text-secondary small mb-4">{error}</p>
        <button className="btn btn-dark w-100 py-2 rounded-3 fw-semibold" onClick={onVolver}>
          <i className="bi bi-arrow-left me-2"></i>Volver
        </button>
      </div>
    );
  }

  return (
    <div className="animate__animated animate__fadeIn">
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-4">
        <div>
          <button className="btn btn-link link-secondary p-0 text-decoration-none fw-semibold small mb-1" onClick={onVolver}>
            <i className="bi bi-arrow-left me-1"></i> Cancelar y Volver
          </button>
          <h4 className="fw-bold text-dark m-0 d-flex align-items-center gap-2">
            <i className="bi bi-pencil-square text-warning"></i>
            Editar Equipo
          </h4>
        </div>
        <span className="badge bg-primary fs-6 px-3 py-2">
          {form.marca || 'Sin marca'} {form.modelo || ''}
        </span>
      </div>

      <div className="card border-0 rounded-4 bg-white p-4 p-sm-5 shadow-sm">
        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            <div className="col-12 col-sm-4">
              <label className="form-label fw-semibold text-secondary small">Tipo</label>
              <select
                name="tipo"
                className="form-select app-input"
                value={form.tipo}
                onChange={handleChange}
              >
                <option value="">Seleccionar...</option>
                {catalogos.tipos.map(item => (
                  <option key={item.id} value={item.nombre}>{item.nombre}</option>
                ))}
              </select>
            </div>
            <div className="col-12 col-sm-4">
              <label className="form-label fw-semibold text-secondary small">Marca</label>
              <select
                name="marca"
                className="form-select app-input"
                value={form.marca}
                onChange={handleChange}
              >
                <option value="">Seleccionar...</option>
                {catalogos.marcas.map(item => (
                  <option key={item.id} value={item.nombre}>{item.nombre}</option>
                ))}
              </select>
            </div>
            <div className="col-12 col-sm-4">
              <label className="form-label fw-semibold text-secondary small">Modelo</label>
              <select
                name="modelo"
                className="form-select app-input"
                value={form.modelo}
                onChange={handleChange}
              >
                <option value="">Seleccionar...</option>
                {catalogos.modelos.map(item => (
                  <option key={item.id} value={item.nombre}>{item.nombre}</option>
                ))}
              </select>
            </div>

            <div className="col-12">
              <label className="form-label fw-semibold text-secondary small">Serie</label>
              <input
                type="text"
                name="numero_serie"
                className="form-control app-input"
                value={form.numero_serie}
                onChange={handleChange}
                placeholder="Número de serie del equipo"
                maxLength={50}
              />
              <small className="text-muted d-block mt-1">{form.numero_serie.length}/50</small>
            </div>

            {!esMonitor && (
              <>
                <div className="col-12">
                  <label className="form-label fw-semibold text-secondary small">Procesador</label>
                  <select
                    name="procesador"
                    className="form-select app-input"
                    value={form.procesador}
                    onChange={handleChange}
                  >
                    <option value="">Seleccionar...</option>
                    {catalogos.procesadores.map(item => (
                      <option key={item.id} value={item.nombre}>{item.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="col-12 col-sm-4">
                  <label className="form-label fw-semibold text-secondary small">RAM (GB)</label>
                  <select
                    name="ram_gb"
                    className="form-select app-input"
                    value={form.ram_gb}
                    onChange={handleChange}
                  >
                    <option value="">Seleccionar...</option>
                    {catalogos.ram_opciones.map(item => (
                      <option key={item.id} value={item.nombre.replace('GB', '')}>{item.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-sm-4">
                  <label className="form-label fw-semibold text-secondary small">Disco</label>
                  <select
                    name="disco"
                    className="form-select app-input"
                    value={form.disco}
                    onChange={handleChange}
                  >
                    <option value="">Seleccionar...</option>
                    {catalogos.discos.map(item => (
                      <option key={item.id} value={item.nombre}>{item.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-sm-4">
                  <label className="form-label fw-semibold text-secondary small">Año</label>
                  <input
                    type="month"
                    name="ano"
                    className="form-control app-input"
                    value={form.ano ? `${form.ano}-01` : ''}
                    onChange={(e) => {
                      const valor = e.target.value; // formato "YYYY-MM"
                      const anioExtraido = valor ? valor.split('-')[0] : '';
                      setForm(prev => ({ ...prev, ano: anioExtraido }));
                    }}
                    min="2000-01"
                    max={`${new Date().getFullYear() + 5}-12`}
                  />
                </div>
              </>
            )}

            <div className="col-12 col-sm-6">
              <label className="form-label fw-semibold text-secondary small">Estado</label>
              <select
                name="estado"
                className="form-select app-input"
                value={form.estado}
                onChange={handleChange}
              >
                <option value="Operativo">🟢 Operativo</option>
                <option value="Mantenimiento">🟡 Mantenimiento</option>
                <option value="Dañado">🔴 Dañado</option>
              </select>
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label fw-semibold text-secondary small">Ubicación</label>
              <select
                name="ubicacion"
                className="form-select app-input"
                value={form.ubicacion}
                onChange={handleChange}
              >
                <option value="">-- Sin Asignar --</option>
                <optgroup label="🏢 Laboratorios">
                  {laboratorios.map(lab => (
                    <option key={`lab-${lab.id}`} value={`lab-${lab.id}`}>
                      {lab.nombre} (Edif. {lab.edificio})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="🏛️ Áreas Administrativas">
                  {areas.map(area => (
                    <option key={`area-${area.id}`} value={`area-${area.id}`}>
                      {area.nombre}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {form.ubicacion.startsWith('area-') && (
              <div className="col-12">
                <label className="form-label fw-semibold text-secondary small">Asignar a</label>
                <select
                  name="persona_id"
                  className="form-select app-input"
                  value={form.persona_id}
                  onChange={handleChange}
                >
                  <option value="">⚠️ -- Sin Asignar --</option>
                  {personas.map(persona => (
                    <option key={persona.id} value={persona.id}>👤 {persona.nombre}</option>
                  ))}
                </select>
                <small className="text-muted d-block mt-1">
                  Si cambias la persona asignada, se registrará la fecha actual.
                </small>
              </div>
            )}
            {form.ubicacion.startsWith('lab-') && (
              <div className="col-12">
                <small className="text-muted">
                  <i className="bi bi-info-circle me-1"></i>
                  Los equipos de laboratorio no se asignan a una persona específica.
                </small>
              </div>
            )}

            <div className="col-12">
              <label className="form-label fw-semibold text-secondary small">Notas</label>
              <textarea
                name="notas"
                className="form-control app-input"
                rows="3"
                value={form.notas}
                onChange={handleChange}
                maxLength={50}
              />
              <small className="text-muted d-block mt-1">{form.notas.length}/50</small>
            </div>
          </div>

          <div className="d-flex flex-column flex-sm-row gap-2 mt-4 pt-2">
            <button
              type="submit"
              className="btn btn-warning px-4 py-2 fw-bold text-dark w-100 w-sm-auto"
              disabled={enviando}
              title="Guarda los cambios realizados en este equipo"
            >
              {enviando ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Guardando...
                </>
              ) : (
                <>
                  <i className="bi bi-check-lg me-1"></i> Guardar Cambios
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-light border px-4 py-2 text-secondary w-100 w-sm-auto"
              onClick={onVolver}
              disabled={enviando}
              title="Descarta los cambios y vuelve a la lista de equipos"
            >
              Cancelar
            </button>
          </div>

          {exito && (
            <div className="alert alert-success mt-3 d-flex align-items-center" role="alert">
              <i className="bi bi-check-circle-fill me-2"></i>
              Equipo actualizado exitosamente. Redirigiendo...
            </div>
          )}
        </form>
      </div>

      <style>{`
        .app-input {
          border: 1.5px solid #e2ede7 !important;
          background-color: #f9fbfa !important;
        }
        .app-input:focus {
          border-color: #10b981 !important;
          box-shadow: 0 0 0 0.2rem rgba(16, 185, 129, 0.15) !important;
        }
        .btn-warning {
          background-color: #f59e0b !important;
          border-color: #f59e0b !important;
        }
        .btn-warning:hover:not(:disabled) {
          background-color: #d97706 !important;
          border-color: #d97706 !important;
        }
      `}</style>
    </div>
  );
}

export default EditarEquipo;
