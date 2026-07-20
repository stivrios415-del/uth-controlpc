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
import BotonVoz from './BotonVoz';
import HistorialPC from './historial';
import EditarEquipo from './EditarEquipo';
import { supabase } from './supabaseClient';
import PersonaDetalle from './PersonasDetalle';
import logo from './logo.png';
import RegistroPorVoz from './RegistroporVoz';
import { startRegistration } from '@simplewebauthn/browser';

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

// Helper para saber si un tipo cuenta como "Monitor" en la categoría de ocupación
const esCategoriaMonitor = (tipo) => {
  const t = (tipo || '').toLowerCase();
  return t.includes('monitor');
};

function App() {
  // ==================== ESTADOS ====================
  const [usuario, setUsuario] = useState(null);
  const [vistaActual, setVistaActual] = useState('equipos');
  const [computadoras, setComputadoras] = useState([]);
  const [personaGestionId, setPersonaGestionId] = useState(null);
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
  const [equipoADesasignarId, setEquipoADesasignarId] = useState(null);
  const [motivoDesasignacion, setMotivoDesasignacion] = useState('');
  const [enviandoDesasignacion, setEnviandoDesasignacion] = useState(false);
  const [qrEquipoCodigo, setQrEquipoCodigo] = useState(null);
  const [filtroReporte, setFiltroReporte] = useState('todos');
  const [filtroTablaUbicacion, setFiltroTablaUbicacion] = useState('todos');
  const [filtroTablaEstado, setFiltroTablaEstado] = useState('todos');
  const [navbarOpen, setNavbarOpen] = useState(false);
  const [laboratorioSeleccionado, setLaboratorioSeleccionado] = useState(null);
  const [areaSeleccionada, setAreaSeleccionada] = useState(null);
  const [personaSeleccionada, setPersonaSeleccionada] = useState(null);

  // ===== NUEVO ESTADO PARA REGISTRO DE PASSKEY =====
  const [registrandoPasskey, setRegistrandoPasskey] = useState(false);

  // ===== CATÁLOGOS =====
  const [catalogos, setCatalogos] = useState({
    tipos: [],
    marcas: [],
    modelos: [],
    procesadores: [],
    ram_opciones: [],
    discos: [],
  });

  const esSinEspecificaciones = form.tipo.toLowerCase().includes('monitor') || form.tipo.toLowerCase().includes('n/a');
  const esAdmin = usuario?.rol === 'admin';

  // ==================== NAVEGACIÓN ====================
  const irA = (vista) => {
    setVistaActual(vista);
    setPcSeleccionadaId(null);
    setEquipoEditandoId(null);
    setNavbarOpen(false);
    setLaboratorioSeleccionado(null);
    setAreaSeleccionada(null);
    setPersonaSeleccionada(null);
  };

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
    }
  }, []);

  const cargarInventario = useCallback(async () => {
    if (!usuario) {
      setCargando(false);
      return;
    }

    setCargando(true);
    setErrorConexion(false);

    try {
      const { data: comps, error: compError } = await supabase
        .from('computadoras')
        .select(`
          *,
          laboratorios ( id, nombre, edificio )
        `)
        .eq('eliminado', false)
        .order('id', { ascending: true });

      if (compError) throw compError;

      const compsFormateadas = comps.map(c => ({
        ...c,
        nombre_laboratorio: c.laboratorios?.nombre || 'SIN ASIGNAR',
        edificio_laboratorio: c.laboratorios?.edificio || '',
      }));
      setComputadoras(compsFormateadas);

      let labs = [];
      try {
        const { data, error } = await supabase.from('laboratorios').select('*').order('nombre');
        if (!error) labs = data || [];
      } catch (e) {
        console.warn('Error cargando laboratorios:', e);
      }

      let areas = [];
      try {
        const { data, error } = await supabase.from('areas').select('*').order('nombre');
        if (!error) areas = data || [];
      } catch (e) {
        console.warn('Error cargando áreas:', e);
      }

      let personas = [];
      try {
        const { data, error } = await supabase.from('personas').select('*').order('nombre');
        if (!error) personas = data || [];
      } catch (e) {
        console.warn('Error cargando personas:', e);
      }

      const total = comps.length;
      const operativos = comps.filter(c => c.estado === 'Operativo').length;
      const mantenimiento = comps.filter(c => c.estado === 'Mantenimiento').length;
      const danados = comps.filter(c => c.estado === 'Dañado').length;

      setDashboardData({
        codigo_automatico: 'Se generará automáticamente',
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
  }, [usuario]);

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    if (!esAdmin && (vistaActual === 'papelera' || vistaActual === 'personas' || vistaActual === 'catalogos')) {
      setVistaActual('equipos');
    }
  }, [esAdmin, vistaActual]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'ubicacion' && !value.startsWith('area-')) {
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

    if (!esSinEspecificaciones) {
      if (!form.procesador) faltantes.push('PROCESADOR');
      if (!form.ram_gb) faltantes.push('RAM (GB)');
      if (!form.disco) faltantes.push('DISCO');
      if (!form.ano) faltantes.push('AÑO');
    }

    if (!form.estado) faltantes.push('ESTADO');
    if (!form.ubicacion) faltantes.push('UBICACIÓN');

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

    let laboratorioId = null;
    let areaId = null;
    if (form.ubicacion.startsWith('lab-')) {
      laboratorioId = parseInt(form.ubicacion.replace('lab-', ''));
    } else if (form.ubicacion.startsWith('area-')) {
      areaId = parseInt(form.ubicacion.replace('area-', ''));
    }

    if (areaId && form.persona_id) {
      const { data: equiposExistentes } = await supabase
        .from('computadoras')
        .select('id, codigo_inventario, tipo')
        .eq('persona_id', parseInt(form.persona_id))
        .eq('eliminado', false);

      const conflicto = (equiposExistentes || []).find(
        eq => esCategoriaMonitor(eq.tipo) === formEsCategoriaMonitor
      );

      if (conflicto) {
        alert(
          `⚠️ Esta persona ya tiene un ${formEsCategoriaMonitor ? 'MONITOR' : 'CPU/Laptop'} activo asignado (${conflicto.codigo_inventario}).\n\n` +
          'No se puede asignar otro equipo del mismo tipo hasta liberar el actual.'
        );
        setSubmitting(false);
        return;
      }
    }

    const payload = {
      tipo: form.tipo || null,
      marca: form.marca || null,
      modelo: form.modelo || null,
      numero_serie: form.numero_serie || null,
      procesador: esSinEspecificaciones ? null : (form.procesador || null),
      ram_gb: esSinEspecificaciones ? null : ramValue,
      disco: esSinEspecificaciones ? null : (form.disco || null),
      ano: esSinEspecificaciones ? null : (form.ano ? parseInt(form.ano) : null),
      estado: form.estado,
      laboratorio_id: laboratorioId,
      area_id: areaId,
      persona_id: (areaId && form.persona_id) ? parseInt(form.persona_id) : null,
      fecha_asignacion: (areaId && form.persona_id) ? new Date().toISOString() : null,
      notas: form.notas || null,
      eliminado: false,
    };

    const { data: nuevoEquipo, error } = await supabase
      .from('computadoras')
      .insert([payload])
      .select()
      .single();

    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      alert(`✅ Equipo registrado correctamente con el código ${nuevoEquipo.codigo_inventario}`);
      setForm(INITIAL_FORM_STATE);
      await cargarInventario();
    }
    setSubmitting(false);
  };

  // ==================== ELIMINACIÓN (SOFT DELETE) ====================
  const abrirConfirmarEliminar = (id) => {
    if (!esAdmin) {
      alert('⛔ Solo un administrador puede dar de baja equipos.');
      return;
    }
    setEquipoAEliminarId(id);
    setMotivoBaja('');
  };

  const cancelarEliminar = () => {
    if (enviandoBaja) return;
    setEquipoAEliminarId(null);
    setMotivoBaja('');
  };

  const confirmarEliminarEquipo = async () => {
    if (!esAdmin) {
      alert('⛔ Solo un administrador puede dar de baja equipos.');
      setEquipoAEliminarId(null);
      return;
    }
    if (!motivoBaja.trim()) {
      alert('⚠️ Debes indicar el motivo por el que se elimina este equipo.');
      return;
    }
    if (enviandoBaja) return;
    setEnviandoBaja(true);

    const id = equipoAEliminarId;
    const motivo = motivoBaja.trim();

    try {
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

  // ==================== DESASIGNAR EQUIPO ====================
  const abrirConfirmarDesasignar = (id) => {
    if (!esAdmin) {
      alert('⛔ Solo un administrador puede desasignar equipos de una persona.');
      return;
    }
    setEquipoADesasignarId(id);
    setMotivoDesasignacion('');
  };

  const cancelarDesasignar = () => {
    if (enviandoDesasignacion) return;
    setEquipoADesasignarId(null);
    setMotivoDesasignacion('');
  };

  const confirmarDesasignarEquipo = async () => {
    if (!esAdmin) {
      alert('⛔ Solo un administrador puede desasignar equipos de una persona.');
      setEquipoADesasignarId(null);
      return;
    }
    if (!motivoDesasignacion.trim()) {
      alert('⚠️ Debes indicar el motivo de la desasignación.');
      return;
    }
    if (enviandoDesasignacion) return;
    setEnviandoDesasignacion(true);

    const id = equipoADesasignarId;
    const motivo = motivoDesasignacion.trim();
    const equipo = computadoras.find(c => c.id === id);
    const personaAnterior = dashboardData.personas.find(p => p.id === equipo?.persona_id)?.nombre || 'persona desconocida';

    try {
      const { error: histError } = await supabase
        .from('historial_mantenimiento')
        .insert([{
          computadora_id: id,
          descripcion_problema: `Equipo desasignado de ${personaAnterior} por ${usuario?.nombre || 'usuario desconocido'}.\nMotivo: ${motivo}`,
          costo: 0,
        }]);
      if (histError) {
        console.warn('No se pudo registrar la desasignación en la bitácora:', histError);
      }

      const { error } = await supabase
        .from('computadoras')
        .update({
          persona_id: null,
          fecha_asignacion: null,
        })
        .eq('id', id);

      if (error) throw error;

      setEquipoADesasignarId(null);
      setMotivoDesasignacion('');
      await cargarInventario();
      alert('✅ Equipo desasignado correctamente. Queda disponible para asignar de nuevo.');
    } catch (error) {
      alert('Error al desasignar: ' + error.message);
    } finally {
      setEnviandoDesasignacion(false);
    }
  };
  
  const registrarPasskey = async () => {
  if (registrandoPasskey) return;
  if (!usuario) {
    alert('⚠️ Debes iniciar sesión con correo y contraseña antes de registrar un acceso biométrico.');
    return;
  }

  if (!window.PublicKeyCredential) {
    alert('❌ Tu navegador no soporta autenticación biométrica. Usa Chrome, Edge o Safari actualizado.');
    return;
  }

  setRegistrandoPasskey(true);

  try {
    // 1️⃣ Llamada directa a Supabase sin modificar opciones manualmente
    //    Dejamos que Supabase construya las opciones por defecto.
    const { data, error } = await supabase.auth.registerPasskey({
      email: usuario.email,
      // Si quieres añadir un nombre amigable para el dispositivo:
      // name: `Dispositivo de ${usuario.nombre}`,
    });

    if (error) {
      console.error('Error al registrar passkey:', error);

      // Manejo específico de errores de WebAuthn
      if (error.message?.includes('NotAllowedError')) {
        alert('❌ Cancelaste el proceso o tu dispositivo no tiene un autenticador biométrico configurado.\n\n' +
              '✅ Asegúrate de tener Windows Hello (PIN + huella) o Touch ID / Face ID activado.\n' +
              '✅ Si usas Windows, ve a Configuración > Cuentas > Opciones de inicio de sesión y configura un PIN.');
      } else if (error.message?.includes('AbortError')) {
        alert('⏱️ La operación tardó demasiado. Vuelve a intentarlo y no cambies de pestaña.');
      } else {
        alert(`❌ Error: ${error.message || 'Intenta de nuevo más tarde.'}`);
      }
      return;
    }

    // 2️⃣ Éxito
    alert('✅ ¡Acceso biométrico activado! Ya puedes iniciar sesión con tu huella, Face ID o PIN.');

  } catch (err) {
    console.error('Error inesperado:', err);
    alert(`❌ Ocurrió un error inesperado: ${err.message || 'Intenta de nuevo.'}`);
  } finally {
    setRegistrandoPasskey(false);
  }
};
  // ==================== LOGOUT ====================
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

  // ==================== MEMOS ====================
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

  const personasConMonitor = useMemo(() => {
    const ids = new Set();
    computadoras.forEach(c => {
      if (c.persona_id && esCategoriaMonitor(c.tipo)) ids.add(c.persona_id);
    });
    return ids;
  }, [computadoras]);

  const personasConCPU = useMemo(() => {
    const ids = new Set();
    computadoras.forEach(c => {
      if (c.persona_id && !esCategoriaMonitor(c.tipo)) ids.add(c.persona_id);
    });
    return ids;
  }, [computadoras]);

  const personasCompletas = useMemo(() => {
    const ids = new Set();
    dashboardData.personas.forEach(p => {
      if (personasConMonitor.has(p.id) && personasConCPU.has(p.id)) ids.add(p.id);
    });
    return ids;
  }, [dashboardData.personas, personasConMonitor, personasConCPU]);

  const formEsCategoriaMonitor = esCategoriaMonitor(form.tipo);
  const personasOcupadas = formEsCategoriaMonitor ? personasConMonitor : personasConCPU;

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

    const equipos = filtroReporte !== 'todos'
      ? computadorasFiltradas.filter(c => c.laboratorio_id === parseInt(filtroReporte))
      : computadorasFiltradas;

    if (equipos.length === 0) {
      alert('No hay equipos para ese laboratorio.');
      return;
    }

    const ubicacionNombre = filtroReporte !== 'todos'
      ? (dashboardData.laboratorios.find(l => l.id === parseInt(filtroReporte))?.nombre || '')
      : 'EN GENERAL';

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

    sheet.mergeCells('A1:I1');
    const tituloCell = sheet.getCell('A1');
    tituloCell.value = 'CONTROL DE INVENTARIO COMPUTADORAS';
    tituloCell.font = { bold: true, size: 14 };
    tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 26;

    sheet.mergeCells('A2:I2');
    const ubicacionCell = sheet.getCell('A2');
    ubicacionCell.value = `UBICACIÓN: ${ubicacionNombre}`;
    ubicacionCell.font = { bold: true, size: 11 };
    ubicacionCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    sheet.mergeCells('A3:A4');
    sheet.mergeCells('B3:E3');
    sheet.mergeCells('F3:H3');
    sheet.mergeCells('I3:I4');

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

      if (filaFin > filaInicio) {
        sheet.mergeCells(`A${filaInicio}:A${filaFin}`);
      }
      const celdaNum = sheet.getCell(`A${filaInicio}`);
      celdaNum.value = idx + 1;
      celdaNum.font = { bold: true, size: 10 };
      celdaNum.alignment = { horizontal: 'center', vertical: 'middle' };

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

    const equiposPdf = filtroReporte !== 'todos'
      ? computadorasFiltradas.filter(c => c.laboratorio_id === parseInt(filtroReporte))
      : computadorasFiltradas;

    if (equiposPdf.length === 0) {
      alert('No hay equipos para ese laboratorio.');
      return;
    }

    const ubicacionNombrePdf = filtroReporte !== 'todos'
      ? (dashboardData.laboratorios.find(l => l.id === parseInt(filtroReporte))?.nombre || '')
      : 'EN GENERAL';

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text('INVENTARIO DE EQUIPOS - UTH CONTROL-PC', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`Ubicación: ${ubicacionNombrePdf}`, pageWidth / 2, 22, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}   |   Total de equipos: ${equiposPdf.length}`, pageWidth / 2, 28, { align: 'center' });

    const headers = [[
      'Nº', 'Código', 'Tipo', 'Marca', 'Modelo', 'Serie',
      'Procesador', 'RAM', 'Disco', 'Año', 'Estado', 'Laboratorio',
      'Área', 'Asignado a', 'Fecha Asig.'
    ]];

    const rows = equiposPdf.map((comp, idx) => {
      const areaNombre = dashboardData.areas?.find(a => a.id === comp.area_id)?.nombre || '';
      const personaNombre = dashboardData.personas?.find(p => p.id === comp.persona_id)?.nombre || '';
      const fechaAsig = comp.fecha_asignacion
        ? new Date(comp.fecha_asignacion).toLocaleDateString('es-HN')
        : '';
      return [
        idx + 1,
        comp.codigo_inventario,
        comp.tipo || '',
        comp.marca || '',
        comp.modelo || '',
        comp.numero_serie || '',
        comp.procesador || '',
        comp.ram_gb ? `${comp.ram_gb}GB` : '',
        comp.disco || '',
        comp.ano || '',
        comp.estado,
        comp.nombre_laboratorio || 'SIN ASIGNAR',
        areaNombre || '—',
        personaNombre || '—',
        fechaAsig || '—'
      ];
    });

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 34,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        valign: 'middle',
        overflow: 'linebreak',
        lineColor: [220, 226, 231],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [6, 95, 70],
        textColor: [255, 255, 255],
        fontSize: 9,
        halign: 'center',
        cellPadding: 3,
      },
      bodyStyles: {
        minCellHeight: 8,
      },
      alternateRowStyles: {
        fillColor: [246, 250, 248],
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 18 },
        2: { cellWidth: 14 },
        3: { cellWidth: 16 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 28 },
        7: { cellWidth: 16 },
        8: { cellWidth: 16 },
        9: { cellWidth: 12 },
        10: { cellWidth: 20 },
        11: { cellWidth: 24 },
        12: { cellWidth: 18 },
        13: { cellWidth: 24 },
        14: { cellWidth: 20 },
      },
      margin: { left: 8, right: 8, bottom: 16 },
      didDrawPage: function () {
        doc.setFontSize(8);
        doc.text('Generado por UTH CONTROL-PC', pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
      }
    });

    doc.save(`Inventario_UTH_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ============================================================
  // TABLA DE EQUIPOS
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

    const esVistaPrincipal = !filtroLabId && !filtroAreaId && !filtroPersonaId;
    if (esVistaPrincipal) {
      if (filtroTablaUbicacion !== 'todos') {
        if (filtroTablaUbicacion.startsWith('lab-')) {
          const labId = parseInt(filtroTablaUbicacion.replace('lab-', ''));
          equiposMostrar = equiposMostrar.filter(c => c.laboratorio_id === labId);
        } else if (filtroTablaUbicacion.startsWith('area-')) {
          const arId = parseInt(filtroTablaUbicacion.replace('area-', ''));
          equiposMostrar = equiposMostrar.filter(c => c.area_id === arId);
        }
      }
      if (filtroTablaEstado !== 'todos') {
        equiposMostrar = equiposMostrar.filter(c => c.estado === filtroTablaEstado);
      }
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
            {esVistaPrincipal && (
              <>
                <select
                  className="form-select form-select-sm rounded-3 border"
                  style={{ maxWidth: '190px', fontSize: '12px' }}
                  value={filtroTablaUbicacion}
                  onChange={(e) => setFiltroTablaUbicacion(e.target.value)}
                  title="Filtrar por ubicación"
                >
                  <option value="todos">📍 Todas las ubicaciones</option>
                  <optgroup label="Laboratorios">
                    {dashboardData.laboratorios.map(lab => (
                      <option key={`lab-${lab.id}`} value={`lab-${lab.id}`}>{lab.nombre}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Áreas Administrativas">
                    {dashboardData.areas.map(area => (
                      <option key={`area-${area.id}`} value={`area-${area.id}`}>{area.nombre}</option>
                    ))}
                  </optgroup>
                </select>
                <select
                  className="form-select form-select-sm rounded-3 border"
                  style={{ maxWidth: '150px', fontSize: '12px' }}
                  value={filtroTablaEstado}
                  onChange={(e) => setFiltroTablaEstado(e.target.value)}
                  title="Filtrar por estado"
                >
                  <option value="todos">Todos los estados</option>
                  <option value="Operativo">🟢 Operativo</option>
                  <option value="Mantenimiento">🟡 Mantenimiento</option>
                  <option value="Dañado">🔴 Dañado</option>
                </select>
                {(filtroTablaUbicacion !== 'todos' || filtroTablaEstado !== 'todos') && (
                  <button
                    type="button"
                    className="btn btn-sm btn-light border rounded-3"
                    style={{ fontSize: '12px' }}
                    onClick={() => { setFiltroTablaUbicacion('todos'); setFiltroTablaEstado('todos'); }}
                    title="Limpiar filtros"
                  >
                    <i className="bi bi-x-circle me-1"></i>Limpiar
                  </button>
                )}
              </>
            )}
            <div className="input-group rounded-3 overflow-hidden search-box" style={{ maxWidth: '280px', height: '38px' }}>
              <span className="input-group-text bg-white border-0"><i className="bi bi-search text-muted"></i></span>
              <input type="text" className="form-control border-0 ps-0 text-dark small" placeholder="Buscar o habla..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ fontSize: '13px' }} />
              <span className="bg-white border-0 d-flex align-items-center pe-2">
                <BotonVoz onResultado={(texto) => setBusqueda(texto)} title="Buscar equipos por voz" />
              </span>
            </div>
          </div>
        </div>

        <div className="table-responsive" style={{ maxHeight: '450px', overflowY: 'auto' }}>
          <table className="table align-middle" style={{ borderCollapse: 'separate', borderSpacing: '0 6px' }}>
            <thead>
              <tr className="text-muted small tracking-wider" style={{ fontSize: '10px', borderBottom: '1px solid #f1f5f9' }}>
                <th className="pb-2 border-0 ps-2 ps-md-3" style={{ width: '40px' }}>Nº</th>
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
                equiposMostrar.map((comp, index) => {
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
                      <td className="ps-2 ps-md-3 rounded-start-3 border-0 align-middle text-center fw-bold" style={{ fontSize: '12px', color: '#6b7280' }}>
                        {index + 1}
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
                        {comp.persona_id && esAdmin && (
                          <button onClick={() => abrirConfirmarDesasignar(comp.id)} className="btn btn-sm btn-link text-secondary p-1 rounded-3 me-1" title="Desasignar de esta persona (solo administrador)">
                            <i className="bi bi-person-dash fs-6"></i>
                          </button>
                        )}
                        {esAdmin && (
                          <button onClick={() => abrirConfirmarEliminar(comp.id)} className="btn btn-sm btn-link text-danger p-1 hover-bg-danger rounded-3" title="Eliminar (solo administrador)">
                            <i className="bi bi-trash3 fs-6"></i>
                          </button>
                        )}
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
  // DASHBOARD COMPLETO (EQUIPOS)
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
            <div className="d-flex align-items-center justify-content-between mb-3 mb-md-4 flex-wrap gap-2">
              <div className="d-flex align-items-center gap-2">
                <div className="p-2 rounded-3 d-inline-flex" style={{ background: '#e9f9f1', color: '#059669' }}><i className="bi bi-plus-circle"></i></div>
                <h5 className="fw-bold m-0 text-dark fs-6 fs-md-5">Registrar Nuevo Activo</h5>
              </div>
              <RegistroPorVoz
                catalogos={catalogos}
                dashboardData={dashboardData}
                onDatosConfirmados={(datosForm) => setForm(prev => ({ ...prev, ...datosForm }))}
              />
            </div>

            <form onSubmit={guardarEquipo}>
              <div className="row g-2 g-md-3">
                <div className="col-12 col-md-4">
                  <label className="form-label text-secondary small fw-semibold">CÓDIGO</label>
                  <input
                    type="text"
                    className="form-control app-input readonly-input fw-bold rounded-3 py-2"
                    value={dashboardData.codigo_automatico}
                    readOnly
                    title="El código definitivo se asigna al guardar, para evitar duplicados si varias personas registran equipos al mismo tiempo"
                  />
                  <small className="text-muted d-block mt-1">Verás el código real en el mensaje de confirmación</small>
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
                <div className={esSinEspecificaciones ? 'col-12' : 'col-12 col-md-4'}>
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
                {!esSinEspecificaciones && (
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
                          const valor = e.target.value;
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
                      {dashboardData.personas
                        .filter(persona => !personasOcupadas.has(persona.id))
                        .map(persona => {
                          const tieneOtroTipo = formEsCategoriaMonitor
                            ? personasConCPU.has(persona.id)
                            : personasConMonitor.has(persona.id);
                          return (
                            <option key={persona.id} value={persona.id}>
                              👤 {persona.nombre}{tieneOtroTipo ? '' : (formEsCategoriaMonitor ? ' (sin CPU aún)' : ' (sin monitor aún)')}
                            </option>
                          );
                        })}
                    </select>
                    <small className="text-muted d-block mt-1">
                      Al seleccionar, se registrará la fecha actual. Solo se muestran personas sin{' '}
                      {formEsCategoriaMonitor ? 'monitor' : 'CPU/Laptop'} activo asignado.
                    </small>
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
                  <option value="todos">-- Todos (en general) --</option>
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
  // CONTENIDO SEGÚN VISTA
  // ============================================================
  const renderContenido = () => {
    switch (vistaActual) {
      case 'laboratorios':
        return (
          <>
            <Laboratorios onLaboratorioChange={cargarInventario} esAdmin={esAdmin} />
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
            <Areas onAreaChange={cargarInventario} esAdmin={esAdmin} />
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
        if (!esAdmin) return renderEquipos();

        if (personaGestionId) {
          return (
            <PersonaDetalle
              personaId={personaGestionId}
              onVolver={() => setPersonaGestionId(null)}
              esAdmin={esAdmin}
              personas={dashboardData.personas}
              personasOcupadas={personasCompletas}
              onPersonaChange={cargarInventario}
            />
          );
        }

        return (
          <Personas
            onPersonaChange={cargarInventario}
            esAdmin={esAdmin}
            onGestionar={setPersonaGestionId}
          />
        );

      case 'extras':
        return <Extras esAdmin={esAdmin} />;

      case 'catalogos':
        if (!esAdmin) return renderEquipos();
        return <Catalogos onCatalogoChange={cargarCatalogos} />;

      case 'papelera':
        if (!esAdmin) return renderEquipos();
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
        <h6 className="fw-bold text-dark mb-1">UTH-TIC</h6>
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
            onClick={() => irA('equipos')}
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
                onClick={() => irA('equipos')}
              >
                <i className="bi bi-pc-display me-2"></i>Equipos
              </button>
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'laboratorios' ? 'nav-pill-active' : ''}`}
                onClick={() => irA('laboratorios')}
              >
                <i className="bi bi-building me-2"></i>Laboratorios
              </button>
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'admin' ? 'nav-pill-active' : ''}`}
                onClick={() => irA('admin')}
              >
                <i className="bi bi-shield-lock me-2"></i>Administrativo
              </button>
              {esAdmin && (
                <button
                  className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'personas' ? 'nav-pill-active' : ''}`}
                  onClick={() => irA('personas')}
                >
                  <i className="bi bi-people me-2"></i>Personal de trabajo
                </button>
              )}
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'extras' ? 'nav-pill-active' : ''}`}
                onClick={() => irA('extras')}
              >
                <i className="bi bi-box-seam me-2"></i>Extras
              </button>
              {esAdmin && (
                <button
                  className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'papelera' ? 'nav-pill-active' : ''}`}
                  onClick={() => irA('papelera')}
                >
                  <i className="bi bi-clock-history me-2"></i>Historial
                </button>
              )}
              <button
                className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'escaner' ? 'nav-pill-active' : ''}`}
                onClick={() => irA('escaner')}
              >
                <i className="bi bi-qr-code-scan me-2"></i>Escanear QR
              </button>
              {esAdmin && (
                <button
                  className={`btn btn-sm px-3 rounded-3 fw-semibold nav-pill ${vistaActual === 'catalogos' ? 'nav-pill-active' : ''}`}
                  onClick={() => irA('catalogos')}
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

             {esAdmin && (
  <button
    onClick={registrarPasskey}
    disabled={registrandoPasskey}
    className="btn btn-sm btn-outline-light rounded-3 px-3 py-1.5 d-flex align-items-center gap-2 fw-semibold"
    style={{ borderColor: 'rgba(255,255,255,0.4)' }}
  >
    <i className="bi bi-fingerprint me-1"></i>
    {registrandoPasskey ? 'Registrando...' : 'Activar biométrico'}
  </button>
)}

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

      {/* MODALES (eliminación, desasignación, QR) - sin cambios */}
      {equipoAEliminarId && esAdmin && (
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
                <button type="button" className="btn btn-light border w-100 py-2 text-secondary fw-semibold" onClick={cancelarEliminar} disabled={enviandoBaja}>Cancelar</button>
                <button type="button" className="btn btn-danger w-100 py-2 fw-semibold" onClick={confirmarEliminarEquipo} disabled={enviandoBaja || !motivoBaja.trim()}>
                  {enviandoBaja ? <><span className="spinner-border spinner-border-sm me-2" role="status"></span>Eliminando...</> : <><i className="bi bi-trash3 me-2"></i>Confirmar Baja</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {equipoADesasignarId && esAdmin && (
        <div className="modal-overlay" onClick={cancelarDesasignar}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-custom modal-header-desasignar">
              <h6 className="fw-bold m-0 text-secondary">
                <i className="bi bi-person-dash-fill me-2"></i>
                Desasignar equipo
              </h6>
              <button type="button" className="btn-close shadow-none" onClick={cancelarDesasignar} disabled={enviandoDesasignacion}></button>
            </div>
            <div className="p-4">
              <p className="text-secondary small mb-3">
                El equipo <strong>{computadoras.find(c => c.id === equipoADesasignarId)?.codigo_inventario}</strong> se
                liberará de{' '}
                <strong>
                  {dashboardData.personas.find(p => p.id === computadoras.find(c => c.id === equipoADesasignarId)?.persona_id)?.nombre || 'la persona asignada'}
                </strong>. El equipo <strong>no se elimina</strong>: solo queda disponible para asignarse a alguien más,
                y esta acción quedará registrada en su Historial.
              </p>
              <label className="form-label fw-semibold text-secondary small">
                Motivo de la desasignación <span className="text-danger">*</span>
              </label>
              <textarea
                className="form-control custom-input"
                rows="3"
                placeholder="Ej: Cambio de puesto, fin de contrato, el equipo pasa a otra persona, se traslada de área..."
                value={motivoDesasignacion}
                onChange={(e) => setMotivoDesasignacion(e.target.value)}
                maxLength={200}
                autoFocus
                disabled={enviandoDesasignacion}
              />
              <small className="text-muted d-block mt-1">{motivoDesasignacion.length}/200</small>
              <div className="d-flex gap-2 mt-4">
                <button type="button" className="btn btn-light border w-100 py-2 text-secondary fw-semibold" onClick={cancelarDesasignar} disabled={enviandoDesasignacion}>Cancelar</button>
                <button type="button" className="btn btn-secondary w-100 py-2 fw-semibold" onClick={confirmarDesasignarEquipo} disabled={enviandoDesasignacion || !motivoDesasignacion.trim()}>
                  {enviandoDesasignacion ? <><span className="spinner-border spinner-border-sm me-2" role="status"></span>Desasignando...</> : <><i className="bi bi-person-dash me-2"></i>Confirmar Desasignación</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {qrEquipoCodigo && (
        <CodigoQR codigo={qrEquipoCodigo} onClose={() => setQrEquipoCodigo(null)} />
      )}

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
