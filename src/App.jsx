import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Login from './Login';
import Laboratorios from './Laboratorios';
import HistorialPC from './historial';
import EditarEquipo from './EditarEquipo';
import { supabase } from './supabaseClient';
import logo from './logo.png';

ChartJS.register(ArcElement, Tooltip, Legend);

const INITIAL_FORM_STATE = {
  marca: '',
  modelo: '',
  procesador: '',
  ram_gb: '',
  almacenamiento: '',
  estado: 'Operativo',
  laboratorio_id: '',
  notas: ''
};

function App() {
  // ==================== ESTADOS ====================
  const [usuario, setUsuario] = useState(null);
  const [vistaActual, setVistaActual] = useState('equipos');
  const [computadoras, setComputadoras] = useState([]);
  const [dashboardData, setDashboardData] = useState({
    codigo_automatico: 'INV-0001',
    laboratorios: [],
    estadisticas: { total: 0, operativos: 0, mantenimiento: 0, danados: 0 }
  });
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [errorConexion, setErrorConexion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [pcSeleccionadaId, setPcSeleccionadaId] = useState(null);
  const [equipoEditandoId, setEquipoEditandoId] = useState(null);
  const [filtroReporte, setFiltroReporte] = useState('todos');
  const [navbarOpen, setNavbarOpen] = useState(false);

  // ==================== FUNCIONES ====================
  const cargarInventario = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setErrorConexion(false);

    try {
      const { data: comps, error: compError } = await supabase
        .from('computadoras')
        .select(`
          *,
          laboratorios ( id, nombre, edificio )
        `)
        .order('id', { ascending: false });

      if (compError) throw compError;

      const compsFormateadas = comps.map(c => ({
        ...c,
        nombre_laboratorio: c.laboratorios?.nombre || 'SIN ASIGNAR',
        edificio_laboratorio: c.laboratorios?.edificio || '',
      }));
      setComputadoras(compsFormateadas);

      const { data: labs, error: labsError } = await supabase
        .from('laboratorios')
        .select('*')
        .order('nombre');

      if (labsError) throw labsError;

      const total = comps.length;
      const operativos = comps.filter(c => c.estado === 'Operativo').length;
      const mantenimiento = comps.filter(c => c.estado === 'Mantenimiento').length;
      const danados = comps.filter(c => c.estado === 'Dañado').length;

      const { data: ultimo, error: ultimoError } = await supabase
        .from('computadoras')
        .select('codigo_inventario')
        .order('id', { ascending: false })
        .limit(1);

      if (ultimoError) throw ultimoError;

      let nuevoNumero = 1;
      if (ultimo && ultimo.length > 0) {
        const num = parseInt(ultimo[0].codigo_inventario.replace('INV-', ''));
        nuevoNumero = num + 1;
      }
      const codigoAutomatico = `INV-${String(nuevoNumero).padStart(4, '0')}`;

      setDashboardData({
        codigo_automatico: codigoAutomatico,
        laboratorios: labs || [],
        estadisticas: { total, operativos, mantenimiento, danados }
      });

    } catch (error) {
      console.error('Error cargando inventario:', error);
      setErrorConexion(true);
    } finally {
      setCargando(false);
    }
  }, [usuario]);

  useEffect(() => {
    cargarInventario();
  }, [cargarInventario]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const guardarEquipo = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const payload = {
      codigo_inventario: dashboardData.codigo_automatico,
      marca: form.marca,
      modelo: form.modelo || null,
      procesador: form.procesador || null,
      ram_gb: form.ram_gb ? parseInt(form.ram_gb) : null,
      almacenamiento: form.almacenamiento || null,
      estado: form.estado,
      laboratorio_id: form.laboratorio_id ? parseInt(form.laboratorio_id) : null,
      notas: form.notas || null,
    };

    const { error } = await supabase
      .from('computadoras')
      .insert([payload]);

    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      setForm(INITIAL_FORM_STATE);
      await cargarInventario();
    }
    setSubmitting(false);
  };

  const eliminarEquipo = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este equipo?')) return;
    const { error } = await supabase
      .from('computadoras')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Error al eliminar: ' + error.message);
    } else {
      await cargarInventario();
    }
  };

  const handleLogout = () => {
    supabase.auth.signOut();
    setUsuario(null);
    setCargando(true);
    setVistaActual('equipos');
    setPcSeleccionadaId(null);
    setEquipoEditandoId(null);
    setNavbarOpen(false);
  };

  const abrirEditor = (id) => {
    setEquipoEditandoId(id);
    setPcSeleccionadaId(null);
    setNavbarOpen(false);
  };

  const computadorasFiltradas = useMemo(() => {
    const query = busqueda.toLowerCase().trim();
    if (!query) return computadoras;
    return computadoras.filter(comp =>
      (comp.nombre_laboratorio || 'SIN ASIGNAR').toLowerCase().includes(query) ||
      (comp.marca || '').toLowerCase().includes(query) ||
      (comp.codigo_inventario || '').toLowerCase().includes(query)
    );
  }, [computadoras, busqueda]);

  const datosGrafico = useMemo(() => ({
    labels: ['Operativos', 'Mantenimiento', 'Dañados'],
    datasets: [{
      data: [
        dashboardData.estadisticas.operativos || 0,
        dashboardData.estadisticas.mantenimiento || 0,
        dashboardData.estadisticas.danados || 0
      ],
      backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
      borderWidth: 4,
      borderColor: '#ffffff',
      hoverOffset: 4
    }]
  }), [dashboardData.estadisticas]);

  // ==================== EXPORTACIONES ====================
  const exportarExcel = () => {
    if (computadorasFiltradas.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    let html = `<html><head><meta charset="UTF-8"></head><body>
      <table border="1" style="border-collapse:collapse; font-family:Arial; font-size:12px;">
        <tr style="background-color:#1a1a1a; color:white; font-weight:bold;">
          <th>CÓDIGO</th><th>MARCA</th><th>MODELO</th><th>PROCESADOR</th>
          <th>RAM (GB)</th><th>ALMACENAMIENTO</th><th>ESTADO</th>
          <th>LABORATORIO</th><th>NOTAS</th>
        </tr>`;

    computadorasFiltradas.forEach(comp => {
      html += `<tr>
        <td>${comp.codigo_inventario}</td>
        <td>${comp.marca}</td>
        <td>${comp.modelo || ''}</td>
        <td>${comp.procesador || ''}</td>
        <td>${comp.ram_gb || ''}</td>
        <td>${comp.almacenamiento || ''}</td>
        <td>${comp.estado}</td>
        <td>${comp.nombre_laboratorio || 'SIN ASIGNAR'}</td>
        <td>${comp.notas || ''}</td>
      </tr>`;
    });

    html += '</table></body></html>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Inventario_UTH_${new Date().toISOString().slice(0,10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportarPDF = () => {
    if (computadorasFiltradas.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text('INVENTARIO DE EQUIPOS - UTH CONTROL-PC', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, pageWidth / 2, 22, { align: 'center' });
    doc.text(`Total de equipos: ${computadorasFiltradas.length}`, pageWidth / 2, 28, { align: 'center' });

    const headers = [['Código', 'Marca', 'Modelo', 'Procesador', 'RAM (GB)', 'Almacenamiento', 'Estado', 'Laboratorio']];
    const rows = computadorasFiltradas.map(comp => [
      comp.codigo_inventario,
      comp.marca,
      comp.modelo || '',
      comp.procesador || '',
      comp.ram_gb || '',
      comp.almacenamiento || '',
      comp.estado,
      comp.nombre_laboratorio || 'SIN ASIGNAR'
    ]);

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [6, 95, 70], textColor: [255, 255, 255], fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 25 },
        2: { cellWidth: 25 },
        3: { cellWidth: 30 },
        4: { cellWidth: 20 },
        5: { cellWidth: 25 },
        6: { cellWidth: 20 },
        7: { cellWidth: 30 },
      },
      margin: { left: 10, right: 10 },
      didDrawPage: function () {
        doc.setFontSize(8);
        doc.text('Generado por UTH CONTROL-PC', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      }
    });

    doc.save(`Inventario_UTH_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // ==================== RENDER ====================
  if (!usuario) {
    return <Login onLoginSuccess={(userObj) => setUsuario(userObj)} />;
  }

  if (errorConexion) {
    return (
      <div className="d-flex align-items-center justify-content-center vh-100 app-shell">
        <div className="card border-0 shadow-lg p-5 text-center rounded-4" style={{ maxWidth: '460px' }}>
          <div className="bg-danger-subtle text-danger rounded-circle d-inline-flex p-3 mb-4 mx-auto">
            <i className="bi bi-exclamation-triangle fs-2"></i>
          </div>
          <h4 className="fw-bold text-dark mb-2">Fallo de Comunicación</h4>
          <p className="text-secondary small mb-4">No se pudo conectar con la base de datos. Verifica tu conexión a Supabase.</p>
          <button className="btn-brand w-100 py-2" onClick={cargarInventario}>
            <i className="bi bi-arrow-clockwise me-2"></i>Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (cargando) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 app-shell">
        <div className="spinner-border mb-3" style={{ width: '3rem', height: '3rem', color: '#10b981' }} role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
        <h6 className="fw-bold text-dark mb-1">UTH CONTROL-PC</h6>
        <p className="text-muted small">Cargando inventario...</p>
      </div>
    );
  }

  return (
    <div className="app-shell min-vh-100" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ==================== NAVBAR MEJORADA ==================== */}
      <nav className="navbar navbar-expand-lg sticky-top px-3 px-md-4 shadow-sm app-navbar">
        <div className="container-fluid">
          <span
            className="navbar-brand fw-extrabold fs-5 tracking-tight d-flex align-items-center gap-2"
            style={{ cursor: 'pointer' }}
            onClick={() => { setVistaActual('equipos'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); }}
          >
            <img src={logo} alt="Logo UTH" style={{ height: '32px', width: 'auto', borderRadius: '8px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }} />
            <span className="text-white d-none d-sm-inline">UTH <span className="text-white-50 fw-light">|</span> CONTROL-PC</span>
            <span className="text-white d-inline d-sm-none">UTH-PC</span>
          </span>

          {/* Botón hamburguesa para móvil */}
          <button
            className="navbar-toggler border-0"
            type="button"
            onClick={() => setNavbarOpen(!navbarOpen)}
            aria-controls="navbarNav"
            aria-expanded={navbarOpen}
            aria-label="Toggle navigation"
            style={{ color: '#fff', fontSize: '1.5rem' }}
          >
            <i className={`bi ${navbarOpen ? 'bi-x-lg' : 'bi-list'}`}></i>
          </button>

          {/* Menú colapsable */}
          <div className={`collapse navbar-collapse ${navbarOpen ? 'show' : ''}`} id="navbarNav">
            <div className="navbar-nav me-auto mb-2 mb-lg-0 d-flex flex-row gap-2 ms-0 ms-lg-4">
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'equipos' && !pcSeleccionadaId && !equipoEditandoId ? 'nav-pill-active' : ''}`}
                onClick={() => { setVistaActual('equipos'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); }}
              >
                <i className="bi bi-pc-display me-2"></i>Equipos
              </button>
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'laboratorios' ? 'nav-pill-active' : ''}`}
                onClick={() => { setVistaActual('laboratorios'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); }}
              >
                <i className="bi bi-building me-2"></i>Laboratorios
              </button>
            </div>

            <div className="d-flex flex-column flex-lg-row align-items-lg-center gap-3 mt-3 mt-lg-0">
              <div className="d-flex flex-column text-end">
                <span className="text-white small fw-bold lh-1">{usuario.nombre}</span>
                <span className="small fw-medium text-uppercase" style={{ fontSize: '10px', letterSpacing: '0.5px', color: '#d1fae5' }}>
                  <i className="bi bi-person-badge me-1"></i> {usuario.rol === 'admin' ? 'Administrador' : 'Técnico'}
                </span>
              </div>
              <button
                onClick={() => { handleLogout(); setNavbarOpen(false); }}
                className="btn btn-sm btn-danger rounded-3 px-3 py-1.5 d-flex align-items-center gap-2 fw-semibold"
                style={{ backgroundColor: '#dc3545', border: 'none' }}
                title="Cerrar Sesión"
              >
                <i className="bi bi-box-arrow-right"></i>
                <span className="d-none d-sm-inline">Cerrar Sesión</span>
                <span className="d-inline d-sm-none">Salir</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="container py-3 py-md-4">
        {equipoEditandoId ? (
          <EditarEquipo equipoId={equipoEditandoId} onVolver={() => { setEquipoEditandoId(null); cargarInventario(); }} />
        ) : pcSeleccionadaId ? (
          <HistorialPC computadoraId={pcSeleccionadaId} onVolver={() => { setPcSeleccionadaId(null); cargarInventario(); }} />
        ) : vistaActual === 'laboratorios' ? (
          // ===== IMPORTANTE: pasamos la prop para notificar cambios =====
          <Laboratorios onLaboratorioChange={cargarInventario} />
        ) : (
          <>
            {/* ===== KPI ===== */}
            <div className="row g-2 g-md-3 mb-4">
              <div className="col-6 col-lg-3">
                <div className="card border-0 shadow-sm p-2 p-md-3 bg-white rounded-4 h-100 transition-all hover-shadow kpi-card">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <p className="text-uppercase text-muted fw-semibold mb-0" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>Total</p>
                      <h3 className="mb-0 fw-bold text-dark fs-4 fs-md-3">{dashboardData.estadisticas.total}</h3>
                    </div>
                    <div className="kpi-icon kpi-icon-neutral"><i className="bi bi-pc-display"></i></div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="card border-0 shadow-sm p-2 p-md-3 bg-white rounded-4 h-100 transition-all hover-shadow kpi-card">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <p className="text-uppercase text-muted fw-semibold mb-0" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>Operativos</p>
                      <h3 className="mb-0 fw-bold fs-4 fs-md-3" style={{ color: '#059669' }}>{dashboardData.estadisticas.operativos}</h3>
                    </div>
                    <div className="kpi-icon kpi-icon-success"><i className="bi bi-check-circle-fill"></i></div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="card border-0 shadow-sm p-2 p-md-3 bg-white rounded-4 h-100 transition-all hover-shadow kpi-card">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <p className="text-uppercase text-muted fw-semibold mb-0" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>Mantenimiento</p>
                      <h3 className="mb-0 fw-bold text-warning fs-4 fs-md-3">{dashboardData.estadisticas.mantenimiento}</h3>
                    </div>
                    <div className="kpi-icon kpi-icon-warning"><i className="bi bi-tools"></i></div>
                  </div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="card border-0 shadow-sm p-2 p-md-3 bg-white rounded-4 h-100 transition-all hover-shadow kpi-card">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <p className="text-uppercase text-muted fw-semibold mb-0" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>Dañados</p>
                      <h3 className="mb-0 fw-bold text-danger fs-4 fs-md-3">{dashboardData.estadisticas.danados}</h3>
                    </div>
                    <div className="kpi-icon kpi-icon-danger"><i className="bi bi-x-circle-fill"></i></div>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== FORM Y GRÁFICO ===== */}
            <div className="row g-3 g-md-4 mb-4">
              <div className="col-12 col-lg-7">
                <div className="card border-0 rounded-4 bg-white p-3 p-md-4 shadow-sm h-100">
                  <div className="d-flex align-items-center gap-2 mb-3 mb-md-4">
                    <div className="p-2 rounded-3 d-inline-flex" style={{ background: '#e9f9f1', color: '#059669' }}><i className="bi bi-plus-circle"></i></div>
                    <h5 className="fw-bold m-0 text-dark fs-6 fs-md-5">Registrar Nuevo Activo</h5>
                  </div>
                  <form onSubmit={guardarEquipo}>
                    <div className="row g-2 g-md-3">
                      <div className="col-12 col-md-4">
                        <label className="form-label text-secondary small fw-semibold">CÓDIGO</label>
                        <input type="text" className="form-control app-input readonly-input fw-bold rounded-3 py-2" value={dashboardData.codigo_automatico} readOnly />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label text-secondary small fw-semibold">MARCA *</label>
                        <input type="text" name="marca" className="form-control app-input rounded-3 py-2" value={form.marca} onChange={handleInputChange} placeholder="Ej: HP" required />
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label text-secondary small fw-semibold">MODELO</label>
                        <input type="text" name="modelo" className="form-control app-input rounded-3 py-2" value={form.modelo} onChange={handleInputChange} placeholder="Ej: ProDesk" />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label text-secondary small fw-semibold">PROCESADOR</label>
                        <input type="text" name="procesador" className="form-control app-input rounded-3 py-2" value={form.procesador} onChange={handleInputChange} placeholder="Ej: AMD Ryzen 5" />
                      </div>
                      <div className="col-6 col-md-3">
                        <label className="form-label text-secondary small fw-semibold">RAM (GB)</label>
                        <input type="number" name="ram_gb" className="form-control app-input rounded-3 py-2" value={form.ram_gb} onChange={handleInputChange} placeholder="8" min="1" />
                      </div>
                      <div className="col-6 col-md-3">
                        <label className="form-label text-secondary small fw-semibold">ALMACENAMIENTO</label>
                        <input type="text" name="almacenamiento" className="form-control app-input rounded-3 py-2" value={form.almacenamiento} onChange={handleInputChange} placeholder="512GB NVMe" />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label text-secondary small fw-semibold">ESTADO</label>
                        <select name="estado" className="form-select app-input rounded-3 py-2" value={form.estado} onChange={handleInputChange}>
                          <option value="Operativo">🟢 Operativo</option>
                          <option value="Mantenimiento">🟡 Mantenimiento</option>
                          <option value="Dañado">🔴 Dañado</option>
                        </select>
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label text-secondary small fw-semibold">LABORATORIO</label>
                        <select name="laboratorio_id" className="form-select app-input rounded-3 py-2" value={form.laboratorio_id} onChange={handleInputChange}>
                          <option value="">⚠️ -- Sin Asignar --</option>
                          {dashboardData.laboratorios.map(lab => (
                            <option key={lab.id} value={lab.id}>🏢 {lab.nombre} — {lab.edificio}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-12">
                        <label className="form-label text-secondary small fw-semibold">OBSERVACIONES</label>
                        <textarea name="notas" className="form-control app-input rounded-3" rows="2" value={form.notas} onChange={handleInputChange} placeholder="Detalles de garantía, periféricos faltantes..."></textarea>
                      </div>
                    </div>
                    <button type="submit" className="btn-brand mt-3 mt-md-4 w-100 py-2" disabled={submitting}>
                      {submitting ? <><span className="spinner-border spinner-border-sm me-2" role="status"></span>Procesando...</> : <><i className="bi bi-plus-lg me-2"></i>Registrar</>}
                    </button>
                  </form>
                </div>
              </div>

              <div className="col-12 col-lg-5">
                <div className="card border-0 rounded-4 bg-white p-3 p-md-4 shadow-sm h-100 d-flex flex-column justify-content-between">
                  <div><h5 className="fw-bold text-dark mb-1 fs-6 fs-md-5">Métricas de Estado</h5><p className="text-muted small">Resumen analítico del inventario.</p></div>
                  <div className="my-auto py-2 py-md-3" style={{ maxHeight: '200px', position: 'relative', width: '100%' }}>
                    {dashboardData.estadisticas.total > 0 ? (
                      <Doughnut data={datosGrafico} options={{ plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, font: { family: 'Inter', size: 10 } } } }, cutout: '76%', responsive: true, maintainAspectRatio: false }} />
                    ) : (
                      <div className="text-center py-4 text-muted small"><i className="bi bi-pie-chart d-block fs-3 mb-2"></i>Esperando registros...</div>
                    )}
                  </div>
                  <div className="p-2 p-md-3 rounded-3 mt-2 text-center" style={{ background: '#f6faf8' }}>
                    <span className="text-secondary small" style={{ fontSize: '10px' }}><i className="bi bi-info-circle me-1"></i>Sincronizado con Supabase.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== REPORTES ===== */}
            <div className="row mb-4">
              <div className="col-12">
                <div className="card border-0 rounded-4 bg-white p-3 p-md-4 shadow-sm" style={{ borderLeft: '5px solid #10b981' }}>
                  <h5 className="fw-bold text-dark mb-2 mb-md-3 fs-6 fs-md-5">
                    <i className="bi bi-file-earmark-bar-graph-fill text-success me-2"></i>
                    Reportes
                  </h5>
                  <p className="text-muted small mb-3">Exporta el inventario actual filtrado.</p>
                  <div className="row g-2 g-md-3 align-items-end">
                    <div className="col-12 col-md-6 col-lg-5">
                      <label className="form-label fw-semibold text-secondary small">Filtrar por laboratorio</label>
                      <select
                        className="form-select border rounded-3 py-2"
                        value={filtroReporte}
                        onChange={(e) => setFiltroReporte(e.target.value)}
                      >
                        <option value="todos">-- Todos --</option>
                        {dashboardData.laboratorios.map(lab => (
                          <option key={lab.id} value={lab.id}>
                            {lab.nombre} ({lab.edificio})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12 col-md-6 col-lg-4 d-flex gap-2">
                      <button onClick={exportarPDF} className="btn btn-danger w-100 py-2 fw-bold btn-sm">
                        <i className="bi bi-file-earmark-pdf-fill me-1"></i> PDF
                      </button>
                      <button onClick={exportarExcel} className="btn btn-success w-100 py-2 fw-bold btn-sm">
                        <i className="bi bi-file-earmark-excel-fill me-1"></i> Excel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== TABLA ===== */}
            <div className="card border-0 rounded-4 bg-white p-3 p-md-4 shadow-sm">
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 mb-md-4 gap-2 gap-md-3">
                <div>
                  <h5 className="fw-bold text-dark mb-0 fs-6 fs-md-5">Inventario</h5>
                  <p className="text-muted small mb-0">Total filtrado: {computadorasFiltradas.length} activos</p>
                </div>
                <div className="d-flex gap-2 align-items-center flex-wrap">
                  <div className="input-group rounded-3 overflow-hidden search-box" style={{ maxWidth: '240px', height: '38px' }}>
                    <span className="input-group-text bg-white border-0"><i className="bi bi-search text-muted"></i></span>
                    <input type="text" className="form-control border-0 ps-0 text-dark small" placeholder="Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ fontSize: '13px' }} />
                  </div>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table align-middle" style={{ borderCollapse: 'separate', borderSpacing: '0 6px' }}>
                  <thead>
                    <tr className="text-muted small tracking-wider" style={{ fontSize: '10px', borderBottom: '1px solid #f1f5f9' }}>
                      <th className="pb-2 border-0 ps-2 ps-md-3">CÓDIGO</th>
                      <th className="pb-2 border-0">ACTIVO</th>
                      <th className="pb-2 border-0 d-none d-md-table-cell">HARDWARE</th>
                      <th className="pb-2 border-0">ESTADO</th>
                      <th className="pb-2 border-0 d-none d-lg-table-cell">UBICACIÓN</th>
                      <th className="pb-2 border-0 text-end pe-2 pe-md-3">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computadorasFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-4 text-muted small bg-light rounded-4">
                          <i className="bi bi-folder-x d-block fs-3 mb-2 text-secondary"></i>
                          No hay registros.
                        </td>
                      </tr>
                    ) : (
                      computadorasFiltradas.map(comp => (
                        <tr key={comp.id} className="table-row-soft rounded-4 shadow-none">
                          <td className="fw-bold ps-2 ps-md-3 rounded-start-3 border-0 align-middle" style={{ fontSize: '12px', cursor: 'pointer', color: '#059669' }}
                            onClick={() => setPcSeleccionadaId(comp.id)} title="Ver Historial">
                            <u>{comp.codigo_inventario}</u>
                          </td>
                          <td className="border-0">
                            <span className="fw-semibold text-dark d-block lh-sm" style={{ fontSize: '13px' }}>{comp.marca}</span>
                            <span className="text-muted" style={{ fontSize: '10px' }}>{comp.modelo || 'Genérico'}</span>
                          </td>
                          <td className="border-0 py-1 d-none d-md-table-cell">
                            <div className="d-flex flex-column gap-0" style={{ fontSize: '11px' }}>
                              <span className="text-dark fw-medium"><i className="bi bi-cpu text-muted me-1"></i>{comp.procesador || 'N/D'}</span>
                              <span className="text-secondary" style={{ fontSize: '10px' }}><i className="bi bi-memory text-muted me-1"></i>{comp.ram_gb ? `${comp.ram_gb} GB` : '—'} / {comp.almacenamiento || '—'}</span>
                            </div>
                          </td>
                          <td className="border-0">
                            <span className={`badge ${comp.estado === 'Operativo' ? 'bg-success-subtle text-success border border-success' : comp.estado === 'Mantenimiento' ? 'bg-warning-subtle text-warning-emphasis border border-warning' : 'bg-danger-subtle text-danger border border-danger'} px-2 py-1 rounded-3 fw-semibold`} style={{ fontSize: '9px' }}>
                              {comp.estado}
                            </span>
                          </td>
                          <td className="border-0 text-dark fw-medium d-none d-lg-table-cell" style={{ fontSize: '11px' }}>
                            <i className="bi bi-building me-1 text-muted"></i>{comp.nombre_laboratorio || 'SIN ASIGNAR'}
                          </td>
                          <td className="border-0 text-end pe-2 pe-md-3 rounded-end-3">
                            <button onClick={() => abrirEditor(comp.id)} className="btn btn-sm btn-link text-warning p-1 rounded-3 me-1" title="Editar">
                              <i className="bi bi-pencil fs-6"></i>
                            </button>
                            <button onClick={() => setPcSeleccionadaId(comp.id)} className="btn btn-sm btn-link text-primary p-1 rounded-3 me-1" title="Historial">
                              <i className="bi bi-journal-text fs-6"></i>
                            </button>
                            <button onClick={() => eliminarEquipo(comp.id)} className="btn btn-sm btn-link text-danger p-1 hover-bg-danger rounded-3" title="Eliminar">
                              <i className="bi bi-trash3 fs-6"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ESTILOS */}
      <style>{`
        .app-shell { background: linear-gradient(180deg, #f4faf7 0%, #f8fafc 260px, #f8fafc 100%); }
        .app-navbar { background: linear-gradient(120deg, #065f46 0%, #10b981 100%); border-bottom: none; min-height: 60px; }
        .navbar-toggler { border-color: rgba(255,255,255,0.3); }
        .navbar-toggler:focus { box-shadow: none; }
        .nav-pill { color: rgba(255,255,255,0.75) !important; background: transparent; border: 1px solid transparent; font-size: 0.85rem; }
        .nav-pill:hover { background: rgba(255,255,255,0.12); color: #ffffff !important; }
        .nav-pill-active { background: #ffffff !important; color: #065f46 !important; }
        .nav-pill-active:hover { background: #ffffff !important; color: #065f46 !important; }
        .logout-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25); color: #ffffff; }
        .logout-btn:hover { background: rgba(255,255,255,0.2); color: #ffffff; }
        .btn-brand { background-color: #10b981; border: 1px solid #10b981; color: #ffffff; font-weight: 600; border-radius: 10px; transition: all 0.2s ease; font-size: 0.9rem; }
        .btn-brand:hover:not(:disabled) { background-color: #059669; border-color: #059669; box-shadow: 0 6px 16px rgba(16, 185, 129, 0.3); color: #ffffff; }
        .btn-brand:disabled { background-color: #a7d9c7; border-color: #a7d9c7; }
        .kpi-card { border: 1px solid #eef2f4; }
        .kpi-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
        .kpi-icon-neutral { background: #eef2f1; color: #374151; }
        .kpi-icon-success { background: #e6f7ee; color: #059669; }
        .kpi-icon-warning { background: #fef3e2; color: #b45309; }
        .kpi-icon-danger { background: #fdeceb; color: #dc2626; }
        .app-input { border: 1.5px solid #e2ede7 !important; background-color: #f9fbfa !important; font-size: 0.9rem; }
        .readonly-input { color: #059669 !important; background-color: #f2faf6 !important; }
        .transition-all { transition: all 0.25s ease; }
        .hover-shadow:hover { transform: translateY(-2px); box-shadow: 0 .5rem 1rem rgba(6, 95, 70, 0.1) !important; }
        .hover-bg-danger:hover { background-color: #fee2e2; }
        .search-box { border: 1.5px solid #e2ede7; }
        .table-row-soft { background-color: #f9fbfa; transition: background-color 0.2s; }
        .table-row-soft:hover { background-color: #eefaf3 !important; }
        input:focus, select:focus, textarea:focus { border-color: #10b981 !important; box-shadow: 0 0 0 0.2rem rgba(16, 185, 129, 0.15) !important; }
        @media (max-width: 576px) {
          .app-navbar { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
          .container { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
          .kpi-card h3 { font-size: 1.25rem !important; }
          .kpi-icon { width: 30px; height: 30px; font-size: 0.8rem; }
        }
      `}</style>
    </div>
  );
}

export default App;