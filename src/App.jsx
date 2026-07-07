import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import Login from './Login';
import Laboratorios from './Laboratorios';
import Areas from './Areas';
import Personas from './Personas';
import Extras from './Extras';
import Catalogos from './Catalogos';
import Papelera from './Papelera';
import CodigoQR from './CodigoQR';
import EscanerQR from './EscanerQR';
import HistorialPC from './historial';
import EditarEquipo from './EditarEquipo';
import { supabase } from './supabaseClient';
import logo from './logo.png';

ChartJS.register(ArcElement, Tooltip, Legend);

const INITIAL_FORM_STATE = {
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

function App() {
  // ==================== ESTADOS ====================
  const [usuario, setUsuario] = useState(null);
  const [vistaActual, setVistaActual] = useState('equipos');
  const [computadoras, setComputadoras] = useState([]);
  const [dashboardData, setDashboardData] = useState({
    codigo_automatico: 'INV-0001',
    laboratorios: [],
    areas: [],
    personas: [],
    estadisticas: { total: 0, operativos: 0, mantenimiento: 0, danados: 0 }
  });
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [errorConexion, setErrorConexion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [pcSeleccionadaId, setPcSeleccionadaId] = useState(null);
  const [equipoEditandoId, setEquipoEditandoId] = useState(null);
  const [equipoAEliminarId, setEquipoAEliminarId] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [enviandoBaja, setEnviandoBaja] = useState(false);
  const [qrEquipoCodigo, setQrEquipoCodigo] = useState(null);
  const [filtroReporte, setFiltroReporte] = useState('todos');
  const [navbarOpen, setNavbarOpen] = useState(false);
  const [laboratorioSeleccionado, setLaboratorioSeleccionado] = useState(null);
  const [areaSeleccionada, setAreaSeleccionada] = useState(null);
  const [personaSeleccionada, setPersonaSeleccionada] = useState(null);

  // ===== CATÁLOGOS =====
  const [catalogos, setCatalogos] = useState({
    tipos: [],
    marcas: [],
    modelos: [],
    procesadores: [],
    ram_opciones: [],
    discos: [],
  });

  // Detecta si el tipo seleccionado es Monitor, para mostrar solo Marca/Modelo/Serie
  const esMonitor = form.tipo.toLowerCase().includes('monitor');

  // ==================== FUNCIONES ====================
  const cargarCatalogos = useCallback(async () => {
    try {
      const tablas = ['tipos', 'marcas', 'modelos', 'procesadores', 'ram_opciones', 'discos'];
      const resultados = await Promise.all(
        tablas.map(tabla => supabase.from(tabla).select('*').order('orden', { ascending: true }))
      );
      const data = {};
      tablas.forEach((tabla, i) => {
        if (resultados[i].error) {
          console.warn(`Error cargando ${tabla}:`, resultados[i].error);
          data[tabla] = [];
        } else {
          data[tabla] = resultados[i].data || [];
        }
      });
      setCatalogos(data);
    } catch (error) {
      console.error('Error cargando catálogos:', error);
      // No lanzamos error para no romper la UI
    }
  }, []);

  const cargarInventario = useCallback(async () => {
    // Si no hay usuario, no cargamos datos
    if (!usuario) {
      setCargando(false);
      return;
    }

    setCargando(true);
    setErrorConexion(false);

    try {
      // 1. Computadoras con laboratorio (solo activas, no eliminadas)
      const { data: comps, error: compError } = await supabase
        .from('computadoras')
        .select(`
          *,
          laboratorios ( id, nombre, edificio )
        `)
        .eq('eliminado', false)
        .order('id', { ascending: false });

      if (compError) throw compError;

      const compsFormateadas = comps.map(c => ({
        ...c,
        nombre_laboratorio: c.laboratorios?.nombre || 'SIN ASIGNAR',
        edificio_laboratorio: c.laboratorios?.edificio || '',
      }));
      setComputadoras(compsFormateadas);

      // 2. Laboratorios
      let labs = [];
      try {
        const { data, error } = await supabase.from('laboratorios').select('*').order('nombre');
        if (!error) labs = data || [];
      } catch (e) {
        console.warn('Error cargando laboratorios:', e);
      }

      // 3. Áreas
      let areas = [];
      try {
        const { data, error } = await supabase.from('areas').select('*').order('nombre');
        if (!error) areas = data || [];
      } catch (e) {
        console.warn('Error cargando áreas:', e);
      }

      // 4. Personas
      let personas = [];
      try {
        const { data, error } = await supabase.from('personas').select('*').order('nombre');
        if (!error) personas = data || [];
      } catch (e) {
        console.warn('Error cargando personas:', e);
      }

      // 5. Estadísticas (solo sobre equipos activos)
      const total = comps.length;
      const operativos = comps.filter(c => c.estado === 'Operativo').length;
      const mantenimiento = comps.filter(c => c.estado === 'Mantenimiento').length;
      const danados = comps.filter(c => c.estado === 'Dañado').length;

      // 6. Código automático (se calcula sobre TODOS los registros, incluyendo eliminados,
      //    para que nunca se repita un código ya usado)
      let codigoAutomatico = 'INV-0001';
      try {
        const { data: ultimo, error: ultimoError } = await supabase
          .from('computadoras')
          .select('codigo_inventario')
          .order('id', { ascending: false })
          .limit(1);
        if (!ultimoError && ultimo && ultimo.length > 0) {
          const num = parseInt(ultimo[0].codigo_inventario.replace('INV-', ''));
          const nuevoNumero = num + 1;
          codigoAutomatico = `INV-${String(nuevoNumero).padStart(4, '0')}`;
        }
      } catch (e) {
        console.warn('Error calculando código automático:', e);
      }

      setDashboardData({
        codigo_automatico: codigoAutomatico,
        laboratorios: labs,
        areas: areas,
        personas: personas,
        estadisticas: { total, operativos, mantenimiento, danados }
      });

      setErrorConexion(false);

    } catch (error) {
      console.error('Error en cargarInventario:', error);
      setErrorConexion(true);
    } finally {
      setCargando(false);
    }
  }, [usuario]);

  useEffect(() => {
    cargarInventario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  useEffect(() => {
    cargarCatalogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (e) => {
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
    if (!form.marca) faltantes.push('MARCA');
    if (!form.modelo) faltantes.push('MODELO');
    if (!form.numero_serie.trim()) faltantes.push('SERIE');

    // Procesador, RAM, Disco y Año solo aplican para CPU/Laptop, no para Monitor
    if (!esMonitor) {
      if (!form.procesador) faltantes.push('PROCESADOR');
      if (!form.ram_gb) faltantes.push('RAM (GB)');
      if (!form.disco) faltantes.push('DISCO');
      if (!form.ano) faltantes.push('AÑO');
    }

    if (!form.estado) faltantes.push('ESTADO');
    if (!form.ubicacion) faltantes.push('UBICACIÓN');

    // Si la ubicación es un Área Administrativa, también se exige asignar una persona
    if (form.ubicacion.startsWith('area-') && !form.persona_id) {
      faltantes.push('ASIGNAR A');
    }

    if (!form.notas.trim()) faltantes.push('OBSERVACIONES');

    return faltantes;
  };

  const guardarEquipo = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const camposFaltantes = validarFormulario();
    if (camposFaltantes.length > 0) {
      alert(
        '⚠️ Faltan campos por completar:\n\n' +
        camposFaltantes.map(c => `• ${c}`).join('\n') +
        '\n\nPor favor llena todos los campos antes de registrar el equipo.'
      );
      return;
    }

    setSubmitting(true);

    let ramValue = null;
    if (form.ram_gb) {
      const num = parseInt(form.ram_gb);
      if (!isNaN(num)) ramValue = num;
    }

    // Interpreta la UBICACIÓN unificada ("lab-3" o "area-2") en la columna correcta
    let laboratorioId = null;
    let areaId = null;
    if (form.ubicacion.startsWith('lab-')) {
      laboratorioId = parseInt(form.ubicacion.replace('lab-', ''));
    } else if (form.ubicacion.startsWith('area-')) {
      areaId = parseInt(form.ubicacion.replace('area-', ''));
    }

    const payload = {
      codigo_inventario: dashboardData.codigo_automatico,
      tipo: form.tipo || null,
      marca: form.marca || null,
      modelo: form.modelo || null,
      numero_serie: form.numero_serie || null,
      // Los CPU/Laptop llevan procesador, RAM, disco y año.
      // Los Monitores solo llevan marca, modelo y serie.
      procesador: esMonitor ? null : (form.procesador || null),
      ram_gb: esMonitor ? null : ramValue,
      disco: esMonitor ? null : (form.disco || null),
      ano: esMonitor ? null : (form.ano ? parseInt(form.ano) : null),
      estado: form.estado,
      laboratorio_id: laboratorioId,
      area_id: areaId,
      // Solo se puede asignar a una persona si la ubicación es un Área Administrativa
      persona_id: (areaId && form.persona_id) ? parseInt(form.persona_id) : null,
      fecha_asignacion: (areaId && form.persona_id) ? new Date().toISOString() : null,
      notas: form.notas || null,
      eliminado: false,
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

  // ==================== ELIMINACIÓN (SOFT DELETE CON MOTIVO) ====================
  // En vez de borrar el registro para siempre, se marca como eliminado y
  // se guarda cuándo, quién y POR QUÉ lo hizo. El equipo pasa a "Historial".

  // Abre el modal pidiendo el motivo de la baja
  const abrirConfirmarEliminar = (id) => {
    setEquipoAEliminarId(id);
    setMotivoBaja('');
  };

  // Cierra el modal sin hacer nada
  const cancelarEliminar = () => {
    if (enviandoBaja) return;
    setEquipoAEliminarId(null);
    setMotivoBaja('');
  };

  // Confirma la baja: exige un motivo, guarda todo y actualiza la bitácora
  const confirmarEliminarEquipo = async () => {
    if (!motivoBaja.trim()) {
      alert('⚠️ Debes indicar el motivo por el que se elimina este equipo.');
      return;
    }
    if (enviandoBaja) return;
    setEnviandoBaja(true);

    const id = equipoAEliminarId;
    const motivo = motivoBaja.trim();

    try {
      // Deja constancia en la bitácora del equipo (misma tabla que usa HistorialPC)
      const { error: histError } = await supabase
        .from('historial_mantenimiento')
        .insert([{
          computadora_id: id,
          descripcion_problema: `Equipo dado de baja por ${usuario?.nombre || 'usuario desconocido'}.\nMotivo: ${motivo}`,
          costo: 0,
        }]);
      if (histError) {
        console.warn('No se pudo registrar la baja en la bitácora:', histError);
      }

      const { error } = await supabase
        .from('computadoras')
        .update({
          eliminado: true,
          fecha_eliminacion: new Date().toISOString(),
          eliminado_por: usuario?.nombre || null,
          motivo_eliminacion: motivo
        })
        .eq('id', id);

      if (error) throw error;

      setEquipoAEliminarId(null);
      setMotivoBaja('');
      await cargarInventario();
    } catch (error) {
      alert('Error al eliminar: ' + error.message);
    } finally {
      setEnviandoBaja(false);
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
    setLaboratorioSeleccionado(null);
    setAreaSeleccionada(null);
    setPersonaSeleccionada(null);
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
      (comp.codigo_inventario || '').toLowerCase().includes(query) ||
      (comp.tipo || '').toLowerCase().includes(query) ||
      (dashboardData.personas.find(p => p.id === comp.persona_id)?.nombre || '').toLowerCase().includes(query)
    );
  }, [computadoras, busqueda, dashboardData.personas]);

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
  const exportarExcel = async () => {
    if (computadorasFiltradas.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    // Filtra por el laboratorio elegido en "Reportes" (o todos)
    const equipos = filtroReporte !== 'todos'
      ? computadorasFiltradas.filter(c => c.laboratorio_id === parseInt(filtroReporte))
      : computadorasFiltradas;

    if (equipos.length === 0) {
      alert('No hay equipos para ese laboratorio.');
      return;
    }

    const ubicacionNombre = filtroReporte !== 'todos'
      ? (dashboardData.laboratorios.find(l => l.id === parseInt(filtroReporte))?.nombre || '')
      : '';

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventario');

    sheet.columns = [
      { width: 6 },   // A: Nº
      { width: 12 },  // B: Tipo
      { width: 14 },  // C: Marca
      { width: 16 },  // D: Modelo
      { width: 18 },  // E: Serie
      { width: 16 },  // F: Procesador
      { width: 10 },  // G: RAM
      { width: 12 },  // H: DISCO
      { width: 10 },  // I: Año CPU
    ];

    const bordeFino = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };

    // ---- Título ----
    sheet.mergeCells('A1:I1');
    const tituloCell = sheet.getCell('A1');
    tituloCell.value = 'CONTROL DE INVENTARIO COMPUTADORAS';
    tituloCell.font = { bold: true, size: 14 };
    tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 26;

    // ---- Ubicación ----
    sheet.mergeCells('A2:I2');
    const ubicacionCell = sheet.getCell('A2');
    ubicacionCell.value = `UBICACIÓN: ${ubicacionNombre}`;
    ubicacionCell.font = { bold: true, size: 11 };
    ubicacionCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    // ---- Encabezados combinados (filas 3 y 4) ----
    sheet.mergeCells('A3:A4'); // Nº
    sheet.mergeCells('B3:E3'); // Descripción
    sheet.mergeCells('F3:H3'); // Especificaciones CPU
    sheet.mergeCells('I3:I4'); // Año CPU

    sheet.getCell('A3').value = 'Nº';
    sheet.getCell('B3').value = 'Descripción';
    sheet.getCell('F3').value = 'Especificaciones CPU';
    sheet.getCell('I3').value = 'Año CPU';

    sheet.getCell('B4').value = 'Tipo';
    sheet.getCell('C4').value = 'Marca';
    sheet.getCell('D4').value = 'Modelo';
    sheet.getCell('E4').value = 'Serie';
    sheet.getCell('F4').value = 'Procesador';
    sheet.getCell('G4').value = 'RAM';
    sheet.getCell('H4').value = 'DISCO';

    ['A3', 'B3', 'F3', 'I3', 'B4', 'C4', 'D4', 'E4', 'F4', 'G4', 'H4'].forEach(ref => {
      const cell = sheet.getCell(ref);
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F9F1' } };
      cell.border = bordeFino;
    });
    sheet.getRow(3).height = 18;
    sheet.getRow(4).height = 18;

    // ---- Agrupar equipos: cada CPU abre un ítem nuevo, lo que sigue (ej. MONITOR) se agrupa con él ----
    const grupos = [];
    equipos.forEach(equipo => {
      const tipoUpper = (equipo.tipo || '').toUpperCase();
      const esInicioDeGrupo = tipoUpper.includes('CPU') || tipoUpper.includes('LAPTOP') || tipoUpper.includes('DESKTOP') || grupos.length === 0;
      if (esInicioDeGrupo) {
        grupos.push([equipo]);
      } else {
        grupos[grupos.length - 1].push(equipo);
      }
    });

    let filaActual = 5;
    grupos.forEach((grupo, idx) => {
      const filaInicio = filaActual;

      grupo.forEach(equipo => {
        const row = sheet.getRow(filaActual);
        row.getCell(2).value = (equipo.tipo || '').toUpperCase();
        row.getCell(3).value = equipo.marca || '';
        row.getCell(4).value = equipo.modelo || '';
        row.getCell(5).value = equipo.numero_serie || '';
        row.getCell(6).value = equipo.procesador || '';
        row.getCell(7).value = equipo.ram_gb ? `${equipo.ram_gb}GB` : '';
        row.getCell(8).value = equipo.disco || '';
        row.getCell(9).value = equipo.ano || '';

        for (let col = 1; col <= 9; col++) {
          const cell = row.getCell(col);
          cell.border = bordeFino;
          cell.font = { size: 10 };
          cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : 'left' };
        }
        filaActual++;
      });

      const filaFin = filaActual - 1;

      // Combina el número de ítem verticalmente
      if (filaFin > filaInicio) {
        sheet.mergeCells(`A${filaInicio}:A${filaFin}`);
      }
      const celdaNum = sheet.getCell(`A${filaInicio}`);
      celdaNum.value = idx + 1;
      celdaNum.font = { bold: true, size: 10 };
      celdaNum.alignment = { horizontal: 'center', vertical: 'middle' };

      // Combina la marca verticalmente solo si es la misma en todo el grupo
      const marcasUnicas = [...new Set(grupo.map(e => e.marca || ''))];
      if (filaFin > filaInicio && marcasUnicas.length === 1) {
        sheet.mergeCells(`C${filaInicio}:C${filaFin}`);
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Inventario_UTH_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

    const headers = [['Código', 'Tipo', 'Marca', 'Modelo', 'Serie', 'Procesador', 'RAM (GB)', 'Disco', 'Año', 'Estado', 'Laboratorio', 'Área', 'Asignado a', 'Fecha Asignación']];
    const rows = computadorasFiltradas.map(comp => {
      const areaNombre = dashboardData.areas?.find(a => a.id === comp.area_id)?.nombre || '';
      const personaNombre = dashboardData.personas?.find(p => p.id === comp.persona_id)?.nombre || '';
      const fechaAsig = comp.fecha_asignacion ? new Date(comp.fecha_asignacion).toLocaleDateString('es-HN') : '';
      return [
        comp.codigo_inventario,
        comp.tipo || '',
        comp.marca || '',
        comp.modelo || '',
        comp.numero_serie || '',
        comp.procesador || '',
        comp.ram_gb || '',
        comp.disco || '',
        comp.ano || '',
        comp.estado,
        comp.nombre_laboratorio || 'SIN ASIGNAR',
        areaNombre,
        personaNombre,
        fechaAsig
      ];
    });

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [6, 95, 70], textColor: [255, 255, 255], fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 14 },
        2: { cellWidth: 16 },
        3: { cellWidth: 16 },
        4: { cellWidth: 18 },
        5: { cellWidth: 20 },
        6: { cellWidth: 12 },
        7: { cellWidth: 16 },
        8: { cellWidth: 12 },
        9: { cellWidth: 16 },
        10: { cellWidth: 16 },
        11: { cellWidth: 18 },
        12: { cellWidth: 16 },
        13: { cellWidth: 16 },
      },
      margin: { left: 10, right: 10 },
      didDrawPage: function () {
        doc.setFontSize(8);
        doc.text('Generado por UTH CONTROL-PC', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      }
    });

    doc.save(`Inventario_UTH_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // ============================================================
  // FUNCIÓN PARA RENDERIZAR SOLO LA TABLA (con filtros)
  // ============================================================
  const renderTablaEquipos = (filtroLabId = null, filtroAreaId = null, filtroPersonaId = null) => {
    let equiposMostrar = computadorasFiltradas;
    if (filtroLabId) {
      equiposMostrar = equiposMostrar.filter(c => c.laboratorio_id === filtroLabId);
    }
    if (filtroAreaId) {
      equiposMostrar = equiposMostrar.filter(c => c.area_id === filtroAreaId);
    }
    if (filtroPersonaId) {
      equiposMostrar = equiposMostrar.filter(c => c.persona_id === filtroPersonaId);
    }

    return (
      <div className="card border-0 rounded-4 bg-white p-3 p-md-4 shadow-sm">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 mb-md-4 gap-2 gap-md-3">
          <div>
            <h5 className="fw-bold text-dark mb-0 fs-6 fs-md-5">Equipos</h5>
            <p className="text-muted small mb-0">
              {filtroLabId
                ? `Equipos en ${dashboardData.laboratorios.find(l => l.id === filtroLabId)?.nombre || 'laboratorio seleccionado'}`
                : filtroAreaId
                ? `Equipos en ${dashboardData.areas.find(a => a.id === filtroAreaId)?.nombre || 'área seleccionada'}`
                : filtroPersonaId
                ? `Equipos asignados a ${dashboardData.personas.find(p => p.id === filtroPersonaId)?.nombre || 'persona seleccionada'}`
                : `Total filtrado: ${equiposMostrar.length} activos`}
            </p>
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
                <th className="pb-2 border-0">TIPO</th>
                <th className="pb-2 border-0">MARCA</th>
                <th className="pb-2 border-0 d-none d-md-table-cell">MODELO</th>
                <th className="pb-2 border-0 d-none d-md-table-cell">SERIE</th>
                <th className="pb-2 border-0">ESTADO</th>
                <th className="pb-2 border-0 d-none d-lg-table-cell">LABORATORIO</th>
                <th className="pb-2 border-0 d-none d-lg-table-cell">ÁREA</th>
                <th className="pb-2 border-0 d-none d-lg-table-cell">ASIGNADO A</th>
                <th className="pb-2 border-0 text-end pe-2 pe-md-3">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {equiposMostrar.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center py-4 text-muted small bg-light rounded-4">
                    <i className="bi bi-folder-x d-block fs-3 mb-2 text-secondary"></i>
                    No hay equipos que coincidan.
                  </td>
                </tr>
              ) : (
                equiposMostrar.map(comp => {
                  const areaNombre = dashboardData.areas?.find(a => a.id === comp.area_id)?.nombre || '';
                  const personaNombre = dashboardData.personas?.find(p => p.id === comp.persona_id)?.nombre || '';
                  return (
                    <tr key={comp.id} className="table-row-soft rounded-4 shadow-none">
                      <td className="fw-bold ps-2 ps-md-3 rounded-start-3 border-0 align-middle" style={{ fontSize: '12px', cursor: 'pointer', color: '#059669' }}
                        onClick={() => setPcSeleccionadaId(comp.id)} title="Ver Historial">
                        <u>{comp.codigo_inventario}</u>
                      </td>
                      <td className="border-0"><span className="fw-semibold">{comp.tipo || '—'}</span></td>
                      <td className="border-0">{comp.marca || '—'}</td>
                      <td className="border-0 d-none d-md-table-cell">{comp.modelo || '—'}</td>
                      <td className="border-0 d-none d-md-table-cell" style={{ fontSize: '11px' }}>{comp.numero_serie || '—'}</td>
                      <td className="border-0">
                        <span className={`badge ${comp.estado === 'Operativo' ? 'bg-success-subtle text-success border border-success' : comp.estado === 'Mantenimiento' ? 'bg-warning-subtle text-warning-emphasis border border-warning' : 'bg-danger-subtle text-danger border border-danger'} px-2 py-1 rounded-3 fw-semibold`} style={{ fontSize: '9px' }}>
                          {comp.estado === 'Operativo' && '🟢'} {comp.estado === 'Mantenimiento' && '🟡'} {comp.estado === 'Dañado' && '🔴'} {comp.estado}
                        </span>
                      </td>
                      <td className="border-0 text-dark fw-medium d-none d-lg-table-cell" style={{ fontSize: '11px' }}>
                        <i className="bi bi-building me-1 text-muted"></i>{comp.nombre_laboratorio || 'SIN ASIGNAR'}
                      </td>
                      <td className="border-0 text-dark fw-medium d-none d-lg-table-cell" style={{ fontSize: '11px' }}>
                        <i className="bi bi-building me-1 text-muted"></i>{areaNombre || 'SIN ASIGNAR'}
                      </td>
                      <td className="border-0 text-dark fw-medium d-none d-lg-table-cell" style={{ fontSize: '11px' }}>
                        <i className="bi bi-person me-1 text-muted"></i>{personaNombre || 'SIN ASIGNAR'}
                      </td>
                      <td className="border-0 text-end pe-2 pe-md-3 rounded-end-3">
                        <button onClick={() => setQrEquipoCodigo(comp.codigo_inventario)} className="btn btn-sm btn-link text-info p-1 rounded-3 me-1" title="Ver código QR">
                          <i className="bi bi-qr-code fs-6"></i>
                        </button>
                        <button onClick={() => abrirEditor(comp.id)} className="btn btn-sm btn-link text-warning p-1 rounded-3 me-1" title="Editar">
                          <i className="bi bi-pencil fs-6"></i>
                        </button>
                        <button onClick={() => setPcSeleccionadaId(comp.id)} className="btn btn-sm btn-link text-primary p-1 rounded-3 me-1" title="Historial">
                          <i className="bi bi-journal-text fs-6"></i>
                        </button>
                        <button onClick={() => abrirConfirmarEliminar(comp.id)} className="btn btn-sm btn-link text-danger p-1 hover-bg-danger rounded-3" title="Eliminar">
                          <i className="bi bi-trash3 fs-6"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ============================================================
  // RENDER DEL DASHBOARD COMPLETO (EQUIPOS)
  // ============================================================
  const renderEquipos = () => (
    <>
      {/* KPI */}
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

      {/* FORM Y GRÁFICO */}
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
                  <label className="form-label text-secondary small fw-semibold">TIPO</label>
                  <select name="tipo" className="form-select app-input rounded-3 py-2" value={form.tipo} onChange={handleInputChange}>
                    <option value="">Seleccionar...</option>
                    {catalogos.tipos.map(item => (
                      <option key={item.id} value={item.nombre}>{item.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label text-secondary small fw-semibold">MARCA</label>
                  <select name="marca" className="form-select app-input rounded-3 py-2" value={form.marca} onChange={handleInputChange}>
                    <option value="">Seleccionar...</option>
                    {catalogos.marcas.map(item => (
                      <option key={item.id} value={item.nombre}>{item.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label text-secondary small fw-semibold">MODELO</label>
                  <select name="modelo" className="form-select app-input rounded-3 py-2" value={form.modelo} onChange={handleInputChange}>
                    <option value="">Seleccionar...</option>
                    {catalogos.modelos.map(item => (
                      <option key={item.id} value={item.nombre}>{item.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className={esMonitor ? 'col-12' : 'col-12 col-md-4'}>
                  <label className="form-label text-secondary small fw-semibold">SERIE</label>
                  <input
                    type="text"
                    name="numero_serie"
                    className="form-control app-input rounded-3 py-2"
                    value={form.numero_serie}
                    onChange={handleInputChange}
                    placeholder="Número de serie del equipo"
                    maxLength={50}
                  />
                  <small className="text-muted d-block mt-1">{form.numero_serie.length}/50</small>
                </div>
                {!esMonitor && (
                  <>
                    <div className="col-12 col-md-4">
                      <label className="form-label text-secondary small fw-semibold">PROCESADOR</label>
                      <select name="procesador" className="form-select app-input rounded-3 py-2" value={form.procesador} onChange={handleInputChange}>
                        <option value="">Seleccionar...</option>
                        {catalogos.procesadores.map(item => (
                          <option key={item.id} value={item.nombre}>{item.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="form-label text-secondary small fw-semibold">RAM (GB)</label>
                      <select name="ram_gb" className="form-select app-input rounded-3 py-2" value={form.ram_gb} onChange={handleInputChange}>
                        <option value="">Seleccionar...</option>
                        {catalogos.ram_opciones.map(item => (
                          <option key={item.id} value={item.nombre.replace('GB', '')}>{item.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="form-label text-secondary small fw-semibold">DISCO</label>
                      <select name="disco" className="form-select app-input rounded-3 py-2" value={form.disco} onChange={handleInputChange}>
                        <option value="">Seleccionar...</option>
                        {catalogos.discos.map(item => (
                          <option key={item.id} value={item.nombre}>{item.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="form-label text-secondary small fw-semibold">AÑO</label>
                      <input
                        type="month"
                        name="ano"
                        className="form-control app-input rounded-3 py-2"
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

                <div className="col-6 col-md-3">
                  <label className="form-label text-secondary small fw-semibold">ESTADO</label>
                  <select name="estado" className="form-select app-input rounded-3 py-2" value={form.estado} onChange={handleInputChange}>
                    <option value="Operativo">🟢 Operativo</option>
                    <option value="Mantenimiento">🟡 Mantenimiento</option>
                    <option value="Dañado">🔴 Dañado</option>
                  </select>
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label text-secondary small fw-semibold">UBICACIÓN</label>
                  <select name="ubicacion" className="form-select app-input rounded-3 py-2" value={form.ubicacion} onChange={handleInputChange}>
                    <option value="">⚠️ -- Sin Asignar --</option>
                    <optgroup label="🏢 Laboratorios">
                      {dashboardData.laboratorios.map(lab => (
                        <option key={`lab-${lab.id}`} value={`lab-${lab.id}`}>{lab.nombre} — {lab.edificio}</option>
                      ))}
                    </optgroup>
                    <optgroup label="🏛️ Áreas Administrativas">
                      {dashboardData.areas.map(area => (
                        <option key={`area-${area.id}`} value={`area-${area.id}`}>{area.nombre}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {form.ubicacion.startsWith('area-') && (
                  <div className="col-12 col-md-6">
                    <label className="form-label text-secondary small fw-semibold">ASIGNAR A</label>
                    <select name="persona_id" className="form-select app-input rounded-3 py-2" value={form.persona_id} onChange={handleInputChange}>
                      <option value="">⚠️ -- Sin Asignar --</option>
                      {dashboardData.personas.map(persona => (
                        <option key={persona.id} value={persona.id}>👤 {persona.nombre}</option>
                      ))}
                    </select>
                    <small className="text-muted d-block mt-1">Al seleccionar, se registrará la fecha actual.</small>
                  </div>
                )}
                {form.ubicacion.startsWith('lab-') && (
                  <div className="col-12 col-md-6 d-flex align-items-end">
                    <small className="text-muted">
                      <i className="bi bi-info-circle me-1"></i>
                      Los equipos de laboratorio no se asignan a una persona específica.
                    </small>
                  </div>
                )}

                <div className="col-12">
                  <label className="form-label text-secondary small fw-semibold">OBSERVACIONES</label>
                  <textarea name="notas" className="form-control app-input rounded-3" rows="2" value={form.notas} onChange={handleInputChange} placeholder="Detalles adicionales..." maxLength={250}></textarea>
                  <small className="text-muted d-block mt-1">{form.notas.length}/250</small>
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

      {/* REPORTES */}
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
                <button
                  onClick={exportarPDF}
                  className="btn btn-danger w-100 py-2 fw-bold btn-sm"
                  title="Descargar el inventario filtrado en formato PDF"
                >
                  <i className="bi bi-file-earmark-pdf-fill me-1"></i> PDF
                </button>
                <button
                  onClick={exportarExcel}
                  className="btn btn-success w-100 py-2 fw-bold btn-sm"
                  title="Descargar el inventario filtrado en formato Excel (.xlsx)"
                >
                  <i className="bi bi-file-earmark-excel-fill me-1"></i> Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TABLA */}
      {renderTablaEquipos()}
    </>
  );

  // ============================================================
  // RENDER CONTENIDO SEGÚN VISTA
  // ============================================================
  const renderContenido = () => {
    switch (vistaActual) {
      case 'laboratorios':
        return (
          <>
            <Laboratorios onLaboratorioChange={cargarInventario} />
            {laboratorioSeleccionado && (
              <>
                <hr className="my-4" />
                <h5 className="fw-bold text-dark mb-3">
                  Equipos en {dashboardData.laboratorios.find(l => l.id === laboratorioSeleccionado)?.nombre || 'laboratorio seleccionado'}
                </h5>
                {renderTablaEquipos(laboratorioSeleccionado)}
              </>
            )}
          </>
        );

      case 'admin':
        return (
          <>
            <div className="card border-0 rounded-4 bg-white p-4 shadow-sm mb-4">
              <h5 className="fw-bold text-dark">Panel Administrativo</h5>
              <p className="text-muted small">Gestión de áreas administrativas y equipos asociados.</p>
            </div>
            <Areas onAreaChange={cargarInventario} />
            {areaSeleccionada && (
              <>
                <hr className="my-4" />
                <h5 className="fw-bold text-dark mb-3">
                  Equipos en {dashboardData.areas.find(a => a.id === areaSeleccionada)?.nombre || 'área seleccionada'}
                </h5>
                {renderTablaEquipos(null, areaSeleccionada)}
              </>
            )}
          </>
        );

      case 'personas':
        return (
          <>
            <Personas onPersonaChange={cargarInventario} />
            {personaSeleccionada && (
              <>
                <hr className="my-4" />
                <h5 className="fw-bold text-dark mb-3">
                  Equipos asignados a {dashboardData.personas.find(p => p.id === personaSeleccionada)?.nombre || 'persona seleccionada'}
                </h5>
                {renderTablaEquipos(null, null, personaSeleccionada)}
              </>
            )}
          </>
        );

      case 'extras':
        return <Extras />;

      case 'catalogos':
        return <Catalogos onCatalogoChange={cargarCatalogos} />;

      case 'papelera':
        return <Papelera usuario={usuario} onCambio={cargarInventario} />;

      case 'escaner':
        return (
          <EscanerQR
            onVerHistorial={(id) => {
              setPcSeleccionadaId(id);
              setVistaActual('equipos');
            }}
          />
        );

      case 'equipos':
      default:
        return renderEquipos();
    }
  };

  // ==================== RENDER PRINCIPAL ====================
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
      {/* NAVBAR */}
      <nav className="navbar navbar-expand-lg sticky-top px-3 px-md-4 shadow-sm app-navbar">
        <div className="container-fluid">
          <span
            className="navbar-brand fw-extrabold fs-5 tracking-tight d-flex align-items-center gap-2"
            style={{ cursor: 'pointer' }}
            onClick={() => { setVistaActual('equipos'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); setLaboratorioSeleccionado(null); setAreaSeleccionada(null); setPersonaSeleccionada(null); }}
          >
            <img src={logo} alt="Logo UTH" style={{ height: '32px', width: 'auto', borderRadius: '8px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }} />
            <span className="text-white d-none d-sm-inline">UTH <span className="text-white-50 fw-light">|</span> TIC</span>
            <span className="text-white d-inline d-sm-none">UTH-TIC</span>
          </span>

          <button
            className="navbar-toggler border-0"
            type="button"
            onClick={() => setNavbarOpen(!navbarOpen)}
            aria-controls="navbarNav"
            aria-expanded={navbarOpen}
            aria-label="Toggle navigation"
            style={{ color: '#fff', fontSize: '1.5rem', padding: '0.25rem 0.75rem' }}
          >
            <i className={`bi ${navbarOpen ? 'bi-x-lg' : 'bi-list'}`}></i>
          </button>

          {navbarOpen && (
            <div className="mobile-menu-backdrop" onClick={() => setNavbarOpen(false)}></div>
          )}

          <div className={`collapse navbar-collapse ${navbarOpen ? 'show' : ''}`} id="navbarNav">
            <div className="navbar-nav me-auto mb-2 mb-lg-0 d-flex flex-row gap-2 ms-0 ms-lg-4">
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'equipos' && !pcSeleccionadaId && !equipoEditandoId ? 'nav-pill-active' : ''}`}
                onClick={() => { setVistaActual('equipos'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); setLaboratorioSeleccionado(null); setAreaSeleccionada(null); setPersonaSeleccionada(null); }}
              >
                <i className="bi bi-pc-display me-2"></i>Equipos
              </button>
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'laboratorios' ? 'nav-pill-active' : ''}`}
                onClick={() => { setVistaActual('laboratorios'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); setLaboratorioSeleccionado(null); setAreaSeleccionada(null); setPersonaSeleccionada(null); }}
              >
                <i className="bi bi-building me-2"></i>Laboratorios
              </button>
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'admin' ? 'nav-pill-active' : ''}`}
                onClick={() => { setVistaActual('admin'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); setLaboratorioSeleccionado(null); setAreaSeleccionada(null); setPersonaSeleccionada(null); }}
              >
                <i className="bi bi-shield-lock me-2"></i>Administrativo
              </button>
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'personas' ? 'nav-pill-active' : ''}`}
                onClick={() => { setVistaActual('personas'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); setLaboratorioSeleccionado(null); setAreaSeleccionada(null); setPersonaSeleccionada(null); }}
              >
                <i className="bi bi-people me-2"></i>Personal de trabajo 
              </button>
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'extras' ? 'nav-pill-active' : ''}`}
                onClick={() => { setVistaActual('extras'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); setLaboratorioSeleccionado(null); setAreaSeleccionada(null); setPersonaSeleccionada(null); }}
              >
                <i className="bi bi-box-seam me-2"></i>Extras
              </button>
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'papelera' ? 'nav-pill-active' : ''}`}
                onClick={() => { setVistaActual('papelera'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); setLaboratorioSeleccionado(null); setAreaSeleccionada(null); setPersonaSeleccionada(null); }}
              >
                <i className="bi bi-clock-history me-2"></i>Historial
              </button>
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'escaner' ? 'nav-pill-active' : ''}`}
                onClick={() => { setVistaActual('escaner'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); setLaboratorioSeleccionado(null); setAreaSeleccionada(null); setPersonaSeleccionada(null); }}
              >
                <i className="bi bi-qr-code-scan me-2"></i>Escanear QR
              </button>
              {usuario.rol === 'admin' && (
                <button
                  className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'catalogos' ? 'nav-pill-active' : ''}`}
                  onClick={() => { setVistaActual('catalogos'); setPcSeleccionadaId(null); setEquipoEditandoId(null); setNavbarOpen(false); setLaboratorioSeleccionado(null); setAreaSeleccionada(null); setPersonaSeleccionada(null); }}
                >
                  <i className="bi bi-sliders me-2"></i>Catálogos
                </button>
              )}
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
        ) : (
          renderContenido()
        )}
      </div>

      {/* MODAL: Confirmar eliminación con motivo obligatorio */}
      {equipoAEliminarId && (
        <div className="modal-overlay" onClick={cancelarEliminar}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-custom">
              <h6 className="fw-bold m-0 text-danger">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                Dar de baja este equipo
              </h6>
              <button type="button" className="btn-close shadow-none" onClick={cancelarEliminar} disabled={enviandoBaja}></button>
            </div>

            <div className="p-4">
              <p className="text-secondary small mb-3">
                El equipo <strong>{computadoras.find(c => c.id === equipoAEliminarId)?.codigo_inventario}</strong> no se
                borrará: se moverá al <strong>Historial de Bajas</strong> y podrás restaurarlo cuando quieras. Para
                continuar, indica el motivo de la baja.
              </p>

              <label className="form-label fw-semibold text-secondary small">
                Motivo de la eliminación <span className="text-danger">*</span>
              </label>
              <textarea
                className="form-control custom-input"
                rows="3"
                placeholder="Ej: Equipo dañado sin reparación posible, robo, fin de vida útil, reemplazo por equipo nuevo..."
                value={motivoBaja}
                onChange={(e) => setMotivoBaja(e.target.value)}
                maxLength={200}
                autoFocus
                disabled={enviandoBaja}
              />
              <small className="text-muted d-block mt-1">{motivoBaja.length}/200</small>

              <div className="d-flex gap-2 mt-4">
                <button
                  type="button"
                  className="btn btn-light border w-100 py-2 text-secondary fw-semibold"
                  onClick={cancelarEliminar}
                  disabled={enviandoBaja}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-danger w-100 py-2 fw-semibold"
                  onClick={confirmarEliminarEquipo}
                  disabled={enviandoBaja || !motivoBaja.trim()}
                >
                  {enviandoBaja ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-trash3 me-2"></i>Confirmar Baja
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Código QR */}
      {qrEquipoCodigo && (
        <CodigoQR codigo={qrEquipoCodigo} onClose={() => setQrEquipoCodigo(null)} />
      )}

      {/* ESTILOS */}
      <style>{`
        .app-shell { background: linear-gradient(180deg, #f4faf7 0%, #f8fafc 260px, #f8fafc 100%); }
        .app-navbar { background: linear-gradient(120deg, #065f46 0%, #10b981 100%); border-bottom: none; min-height: 60px; }
        .navbar-toggler { border-color: rgba(255,255,255,0.3); }
        .navbar-toggler:focus { box-shadow: none; }

        .mobile-menu-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 1040;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        @media (max-width: 991.98px) {
          .navbar-collapse {
            position: fixed !important;
            top: 0;
            right: 0;
            height: 100vh;
            width: 280px;
            max-width: 80vw;
            background: linear-gradient(180deg, #065f46 0%, #10b981 100%);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            z-index: 1050;
            padding: 5.5rem 1.25rem 1.5rem;
            overflow-y: auto;
            display: flex !important;
            flex-direction: column;
            box-shadow: -8px 0 24px rgba(0,0,0,0.25);
          }
          .navbar-collapse.show {
            transform: translateX(0);
          }
          .navbar-nav {
            flex-direction: column !important;
            width: 100%;
            gap: 6px !important;
          }
          .nav-pill {
            width: 100%;
            text-align: left;
            padding: 0.85rem 1rem !important;
            font-size: 1rem !important;
            border-radius: 10px !important;
          }
        }

        .nav-pill { color: rgba(255,255,255,0.75) !important; background: transparent; border: 1px solid transparent; font-size: 0.85rem; }
        .nav-pill:hover { background: rgba(255,255,255,0.12); color: #ffffff !important; }
        .nav-pill-active { background: #ffffff !important; color: #065f46 !important; }
        .nav-pill-active:hover { background: #ffffff !important; color: #065f46 !important; }
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
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1060;
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
          background: #fdf2f2;
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
          border-color: #ef4444 !important;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important;
        }
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
