import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

function EditarEquipo({ equipoId, onVolver }) {
  const [form, setForm] = useState({
    marca: '',
    modelo: '',
    procesador: '',
    ram_gb: '',
    almacenamiento: '',
    estado: 'Operativo',
    ubicacion: '',
    notas: ''
  });
  const [laboratorios, setLaboratorios] = useState([]);
  const [areas, setAreas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);

  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);

      // Obtener equipo
      const { data: equipo, error: eqError } = await supabase
        .from('computadoras')
        .select('*')
        .eq('id', equipoId)
        .single();

      if (eqError) throw eqError;

      // Obtener laboratorios
      const { data: labs, error: labsError } = await supabase
        .from('laboratorios')
        .select('*')
        .order('nombre');

      if (labsError) throw labsError;

      // Obtener áreas administrativas
      const { data: areasData, error: areasError } = await supabase
        .from('areas')
        .select('*')
        .order('nombre');

      if (areasError) throw areasError;

      setLaboratorios(labs || []);
      setAreas(areasData || []);

      // Reconstruye el valor combinado de UBICACIÓN a partir de lo que ya tenía el equipo
      let ubicacionActual = '';
      if (equipo.laboratorio_id) {
        ubicacionActual = `lab-${equipo.laboratorio_id}`;
      } else if (equipo.area_id) {
        ubicacionActual = `area-${equipo.area_id}`;
      }

      setForm({
        marca: equipo.marca || '',
        modelo: equipo.modelo || '',
        procesador: equipo.procesador || '',
        ram_gb: equipo.ram_gb || '',
        almacenamiento: equipo.almacenamiento || '',
        estado: equipo.estado || 'Operativo',
        ubicacion: ubicacionActual,
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
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (!form.marca.trim()) {
      alert('La marca es obligatoria.');
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

      const payload = {
        marca: form.marca,
        modelo: form.modelo || null,
        procesador: form.procesador || null,
        ram_gb: form.ram_gb ? parseInt(form.ram_gb) : null,
        almacenamiento: form.almacenamiento || null,
        estado: form.estado,
        laboratorio_id: laboratorioId,
        area_id: areaId,
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
            <div className="col-12 col-sm-6">
              <label className="form-label fw-semibold text-secondary small">Marca *</label>
              <input
                type="text"
                name="marca"
                className="form-control app-input"
                value={form.marca}
                onChange={handleChange}
                required
              />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label fw-semibold text-secondary small">Modelo</label>
              <input
                type="text"
                name="modelo"
                className="form-control app-input"
                value={form.modelo}
                onChange={handleChange}
              />
            </div>

            <div className="col-12">
              <label className="form-label fw-semibold text-secondary small">Procesador</label>
              <input
                type="text"
                name="procesador"
                className="form-control app-input"
                value={form.procesador}
                onChange={handleChange}
              />
            </div>

            <div className="col-12 col-sm-4">
              <label className="form-label fw-semibold text-secondary small">RAM (GB)</label>
              <input
                type="number"
                name="ram_gb"
                className="form-control app-input"
                value={form.ram_gb}
                onChange={handleChange}
                min="0"
                step="1"
              />
            </div>
            <div className="col-12 col-sm-8">
              <label className="form-label fw-semibold text-secondary small">Almacenamiento</label>
              <input
                type="text"
                name="almacenamiento"
                className="form-control app-input"
                value={form.almacenamiento}
                onChange={handleChange}
              />
            </div>

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
