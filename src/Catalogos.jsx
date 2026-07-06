import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const CATALOGOS_CONFIG = [
  { key: 'tipos', label: 'Tipos', icon: 'bi-tags' },
  { key: 'marcas', label: 'Marcas', icon: 'bi-award' },
  { key: 'modelos', label: 'Modelos', icon: 'bi-cpu' },
  { key: 'procesadores', label: 'Procesadores', icon: 'bi-cpu-fill' },
  { key: 'ram_opciones', label: 'RAM', icon: 'bi-memory' },
  { key: 'discos', label: 'Discos', icon: 'bi-hdd' },
];

function Catalogos({ onCatalogoChange }) {
  const [activo, setActivo] = useState('tipos');
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editandoNombre, setEditandoNombre] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargarItems = useCallback(async (tabla) => {
    try {
      setCargando(true);
      const { data, error } = await supabase.from(tabla).select('*').order('orden', { ascending: true });
      if (error) throw error;
      setItems(data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarItems(activo);
    setNuevoNombre('');
    setEditandoId(null);
  }, [activo, cargarItems]);

  const refrescarApp = () => {
    if (onCatalogoChange) onCatalogoChange();
  };

  const agregarItem = async (e) => {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;
    setEnviando(true);
    try {
      const maxOrden = items.reduce((max, it) => Math.max(max, it.orden || 0), 0);
      const { error } = await supabase.from(activo).insert([{ nombre: nuevoNombre.trim(), orden: maxOrden + 1 }]);
      if (error) throw error;
      setNuevoNombre('');
      await cargarItems(activo);
      refrescarApp();
    } catch (err) {
      alert('Error al agregar: ' + err.message);
    } finally {
      setEnviando(false);
    }
  };

  const iniciarEdicion = (item) => {
    setEditandoId(item.id);
    setEditandoNombre(item.nombre);
  };

  const guardarEdicion = async (id) => {
    if (!editandoNombre.trim()) return;
    try {
      const { error } = await supabase.from(activo).update({ nombre: editandoNombre.trim() }).eq('id', id);
      if (error) throw error;
      setEditandoId(null);
      await cargarItems(activo);
      refrescarApp();
    } catch (err) {
      alert('Error al actualizar: ' + err.message);
    }
  };

  const eliminarItem = async (id) => {
    if (!window.confirm('¿Eliminar esta opción del catálogo? Los equipos ya registrados con este valor no se modifican.')) return;
    try {
      const { error } = await supabase.from(activo).delete().eq('id', id);
      if (error) throw error;
      await cargarItems(activo);
      refrescarApp();
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  const moverOrden = async (item, direccion) => {
    const idx = items.findIndex(i => i.id === item.id);
    const otroIdx = idx + direccion;
    if (otroIdx < 0 || otroIdx >= items.length) return;
    const otro = items[otroIdx];
    try {
      await Promise.all([
        supabase.from(activo).update({ orden: otro.orden }).eq('id', item.id),
        supabase.from(activo).update({ orden: item.orden }).eq('id', otro.id),
      ]);
      await cargarItems(activo);
      refrescarApp();
    } catch (err) {
      alert('Error al reordenar: ' + err.message);
    }
  };

  const configActivo = CATALOGOS_CONFIG.find(c => c.key === activo);

  return (
    <div>
      <div className="card border-0 rounded-4 bg-white p-4 shadow-sm mb-4">
        <h5 className="fw-bold text-dark mb-1">
          <i className="bi bi-sliders text-success me-2"></i>
          Catálogos del Sistema
        </h5>
        <p className="text-muted small mb-4">
          Agrega, edita, reordena o elimina las opciones que aparecen en los desplegables del formulario de equipos.
        </p>

        <div className="d-flex flex-wrap gap-2 mb-4">
          {CATALOGOS_CONFIG.map(c => (
            <button
              key={c.key}
              onClick={() => setActivo(c.key)}
              className={`btn btn-sm px-3 rounded-3 fw-semibold ${activo === c.key ? 'btn-success' : 'btn-outline-secondary'}`}
            >
              <i className={`bi ${c.icon} me-2`}></i>{c.label}
            </button>
          ))}
        </div>

        <form onSubmit={agregarItem} className="d-flex flex-column flex-sm-row gap-2 mb-2">
          <input
            type="text"
            className="form-control custom-input"
            placeholder={`Nueva opción para ${configActivo?.label}...`}
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            maxLength={50}
            disabled={enviando}
          />
          <button type="submit" className="btn btn-success px-4 fw-semibold" disabled={enviando}>
            <i className="bi bi-plus-lg me-1"></i>Agregar
          </button>
        </form>
        {activo === 'ram_opciones' && (
          <p className="text-muted small mb-3">
            <i className="bi bi-info-circle me-1"></i>
            Escribe el valor incluyendo "GB", por ejemplo: <strong>32GB</strong>
          </p>
        )}

        {cargando ? (
          <div className="d-flex justify-content-center py-4">
            <div className="spinner-border text-success" role="status">
              <span className="visually-hidden">Cargando...</span>
            </div>
          </div>
        ) : error ? (
          <div className="alert alert-danger mt-3">Error: {error}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-4 text-muted">
            <i className="bi bi-inbox fs-2 d-block mb-2 opacity-25"></i>
            No hay opciones registradas en {configActivo?.label}.
          </div>
        ) : (
          <div className="table-responsive mt-3">
            <table className="table align-middle">
              <thead>
                <tr className="text-muted small fw-semibold" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                  <th className="border-0" style={{ width: '90px' }}>Orden</th>
                  <th className="border-0">Nombre</th>
                  <th className="border-0 text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id} className="table-row-soft">
                    <td>
                      <div className="d-flex gap-1">
                        <button className="btn btn-sm btn-light border p-1" onClick={() => moverOrden(item, -1)} disabled={idx === 0} title="Subir">
                          <i className="bi bi-arrow-up"></i>
                        </button>
                        <button className="btn btn-sm btn-light border p-1" onClick={() => moverOrden(item, 1)} disabled={idx === items.length - 1} title="Bajar">
                          <i className="bi bi-arrow-down"></i>
                        </button>
                      </div>
                    </td>
                    <td>
                      {editandoId === item.id ? (
                        <input
                          type="text"
                          className="form-control form-control-sm custom-input"
                          value={editandoNombre}
                          onChange={(e) => setEditandoNombre(e.target.value)}
                          maxLength={50}
                          autoFocus
                        />
                      ) : (
                        <span className="fw-semibold">{item.nombre}</span>
                      )}
                    </td>
                    <td className="text-end">
                      {editandoId === item.id ? (
                        <>
                          <button className="btn btn-sm btn-link text-success p-1 me-1" onClick={() => guardarEdicion(item.id)} title="Guardar">
                            <i className="bi bi-check-lg fs-5"></i>
                          </button>
                          <button className="btn btn-sm btn-link text-secondary p-1" onClick={() => setEditandoId(null)} title="Cancelar">
                            <i className="bi bi-x-lg fs-5"></i>
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-sm btn-link text-warning p-1 me-1" onClick={() => iniciarEdicion(item)} title="Editar">
                            <i className="bi bi-pencil fs-5"></i>
                          </button>
                          <button className="btn btn-sm btn-link text-danger p-1" onClick={() => eliminarItem(item.id)} title="Eliminar">
                            <i className="bi bi-trash3 fs-5"></i>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .table-row-soft { background-color: #f9fbfa; transition: background-color 0.2s; }
        .table-row-soft:hover { background-color: #eefaf3 !important; }
        .custom-input {
          background-color: #f6faf8 !important;
          border: 1.5px solid #e2ede7 !important;
          border-radius: 10px !important;
          padding: 10px 14px;
          font-size: 0.9rem;
          box-shadow: none !important;
        }
        .custom-input:focus {
          background-color: #ffffff !important;
          border-color: #28a745 !important;
          box-shadow: 0 0 0 3px rgba(40,167,69,0.15) !important;
        }
      `}</style>
    </div>
  );
}

export default Catalogos;