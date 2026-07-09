import React, { useState, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

/**
 * RegistroPorVoz
 * ---------------
 * Botón + modal para dictar un equipo completo de corrido y que la IA
 * (vía la Edge Function "parse-equipo-voz") lo convierta en los campos
 * del formulario de "Registrar Nuevo Activo".
 *
 * IMPORTANTE: nunca rellena el formulario "a ciegas". Siempre muestra
 * una vista previa de lo que entendió para que el técnico confirme o
 * corrija antes de aplicarlo — así un error de transcripción no termina
 * guardado directo en el inventario.
 *
 * Uso en App.js:
 *   <RegistroPorVoz
 *     catalogos={catalogos}
 *     dashboardData={dashboardData}
 *     onDatosConfirmados={(datosForm) => setForm(prev => ({ ...prev, ...datosForm }))}
 *   />
 */

const ESTADOS_VALIDOS = ['Operativo', 'Mantenimiento', 'Dañado'];

// Convierte lo que devolvió la IA en el shape exacto que espera tu `form` de App.js
function mapearAFormulario(datos, dashboardData) {
  const resultado = {};

  if (datos.tipo) resultado.tipo = datos.tipo;
  if (datos.marca) resultado.marca = datos.marca;
  if (datos.modelo) resultado.modelo = datos.modelo;
  if (datos.numero_serie) resultado.numero_serie = datos.numero_serie;
  if (datos.procesador) resultado.procesador = datos.procesador;
  if (datos.ram_gb != null) resultado.ram_gb = String(datos.ram_gb);
  if (datos.disco) resultado.disco = datos.disco;
  if (datos.ano != null) resultado.ano = String(datos.ano);
  if (datos.estado && ESTADOS_VALIDOS.includes(datos.estado)) resultado.estado = datos.estado;
  if (datos.notas) resultado.notas = datos.notas;

  // Ubicación: el form usa un valor unificado "lab-<id>" o "area-<id>"
  if (datos.ubicacion_tipo === 'laboratorio' && datos.ubicacion_id) {
    resultado.ubicacion = `lab-${datos.ubicacion_id}`;
  } else if (datos.ubicacion_tipo === 'area' && datos.ubicacion_id) {
    resultado.ubicacion = `area-${datos.ubicacion_id}`;
  }

  // Persona: buscamos su id real a partir del nombre que devolvió la IA
  if (datos.persona_nombre && dashboardData?.personas) {
    const persona = dashboardData.personas.find(
      p => p.nombre.toLowerCase() === datos.persona_nombre.toLowerCase()
    );
    if (persona) resultado.persona_id = String(persona.id);
  }

  return resultado;
}

export default function RegistroPorVoz({ catalogos, dashboardData, onDatosConfirmados }) {
  const [abierto, setAbierto] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [transcripcion, setTranscripcion] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);
  const [vistaPrevia, setVistaPrevia] = useState(null); // datos crudos que devolvió la IA
  const reconocimientoRef = useRef(null);
  const soportado = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const iniciarEscucha = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    setError(null);
    setVistaPrevia(null);
    setTranscripcion('');

    const reconocimiento = new SpeechRecognition();
    reconocimiento.lang = 'es-ES';
    reconocimiento.continuous = true;
    reconocimiento.interimResults = true;

    reconocimiento.onresult = (evento) => {
      let textoCompleto = '';
      for (let i = 0; i < evento.results.length; i++) {
        textoCompleto += evento.results[i][0].transcript;
      }
      setTranscripcion(textoCompleto);
    };

    reconocimiento.onerror = (evento) => {
      setEscuchando(false);
      if (evento.error === 'not-allowed' || evento.error === 'permission-denied') {
        setError('Permiso de micrófono denegado.');
      } else if (evento.error !== 'no-speech') {
        setError('Ocurrió un error durante el reconocimiento de voz.');
      }
    };

    reconocimiento.onend = () => setEscuchando(false);

    reconocimientoRef.current = reconocimiento;
    reconocimiento.start();
    setEscuchando(true);
  }, []);

  const detenerEscucha = useCallback(() => {
    reconocimientoRef.current?.stop();
    setEscuchando(false);
  }, []);

  const procesarConIA = useCallback(async () => {
    if (!transcripcion.trim()) {
      setError('No se detectó ningún dictado. Intenta de nuevo.');
      return;
    }
    setProcesando(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('parse-equipo-voz', {
        body: { texto: transcripcion, catalogos },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setVistaPrevia(data.datos);
    } catch (e) {
      console.error('Error procesando dictado:', e);
      setError('No se pudo interpretar el dictado. Intenta de nuevo o llena el formulario manualmente.');
    } finally {
      setProcesando(false);
    }
  }, [transcripcion, catalogos]);

  const confirmarYAplicar = useCallback(() => {
    if (!vistaPrevia) return;
    const datosForm = mapearAFormulario(vistaPrevia, dashboardData);
    onDatosConfirmados(datosForm);
    cerrarModal();
  }, [vistaPrevia, dashboardData, onDatosConfirmados]);

  const cerrarModal = () => {
    reconocimientoRef.current?.stop();
    setAbierto(false);
    setEscuchando(false);
    setTranscripcion('');
    setVistaPrevia(null);
    setError(null);
  };

  // Etiquetas legibles para la vista previa
  const filasVistaPrevia = vistaPrevia ? [
    ['Tipo', vistaPrevia.tipo],
    ['Marca', vistaPrevia.marca],
    ['Modelo', vistaPrevia.modelo],
    ['Serie', vistaPrevia.numero_serie],
    ['Procesador', vistaPrevia.procesador],
    ['RAM', vistaPrevia.ram_gb != null ? `${vistaPrevia.ram_gb} GB` : null],
    ['Disco', vistaPrevia.disco],
    ['Año', vistaPrevia.ano],
    ['Estado', vistaPrevia.estado],
    ['Ubicación', vistaPrevia.ubicacion_tipo && vistaPrevia.ubicacion_id
      ? (vistaPrevia.ubicacion_tipo === 'laboratorio'
          ? dashboardData?.laboratorios?.find(l => l.id === vistaPrevia.ubicacion_id)?.nombre
          : dashboardData?.areas?.find(a => a.id === vistaPrevia.ubicacion_id)?.nombre)
      : null],
    ['Asignado a', vistaPrevia.persona_nombre],
    ['Observaciones', vistaPrevia.notas],
  ].filter(([, valor]) => valor !== null && valor !== undefined && valor !== '') : [];

  if (!soportado) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn-outline-success btn-sm rounded-3 fw-semibold d-flex align-items-center gap-2"
        onClick={() => setAbierto(true)}
        title="Registrar un equipo completo dictándolo de corrido"
      >
        <i className="bi bi-mic-fill"></i> Registrar por voz
      </button>

      {abierto && (
        <div className="modal-overlay-voz" onClick={cerrarModal}>
          <div className="modal-card-voz" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-voz">
              <h6 className="fw-bold m-0 text-success">
                <i className="bi bi-mic-fill me-2"></i>Registrar equipo por voz
              </h6>
              <button type="button" className="btn-close shadow-none" onClick={cerrarModal}></button>
            </div>

            <div className="p-4">
              {!vistaPrevia && (
                <>
                  <p className="text-secondary small mb-3">
                    Presiona el micrófono y describe el equipo de corrido. Por ejemplo:
                    <br />
                    <em>"Laptop Dell Latitude, serie ABC123, procesador i5, 8 gigas de RAM,
                    disco de 256, año 2023, operativo, en el laboratorio de redes"</em>
                  </p>

                  <div className="d-flex justify-content-center mb-3">
                    <button
                      type="button"
                      onClick={escuchando ? detenerEscucha : iniciarEscucha}
                      className={`btn-mic-grande ${escuchando ? 'btn-mic-activo' : ''}`}
                      disabled={procesando}
                    >
                      <i className={`bi ${escuchando ? 'bi-stop-fill' : 'bi-mic-fill'}`}></i>
                    </button>
                  </div>
                  <p className="text-center small text-muted mb-3">
                    {escuchando ? 'Escuchando... presiona para detener' : 'Presiona para empezar a dictar'}
                  </p>

                  {transcripcion && (
                    <div className="p-3 rounded-3 mb-3" style={{ background: '#f6faf8', fontSize: '13px' }}>
                      <span className="text-muted d-block mb-1" style={{ fontSize: '10px' }}>TRANSCRIPCIÓN:</span>
                      {transcripcion}
                    </div>
                  )}

                  {error && <div className="alert alert-danger py-2 small">{error}</div>}

                  <button
                    type="button"
                    className="btn btn-brand w-100 py-2"
                    disabled={!transcripcion.trim() || procesando || escuchando}
                    onClick={procesarConIA}
                  >
                    {procesando ? (
                      <><span className="spinner-border spinner-border-sm me-2" role="status"></span>Interpretando...</>
                    ) : (
                      <><i className="bi bi-stars me-2"></i>Interpretar dictado</>
                    )}
                  </button>
                </>
              )}

              {vistaPrevia && (
                <>
                  <p className="text-secondary small mb-3">
                    Esto es lo que entendí. Revisa antes de aplicarlo — podrás seguir editando
                    cualquier campo en el formulario después.
                  </p>

                  {vistaPrevia.confianza_general === 'baja' && (
                    <div className="alert alert-warning py-2 small mb-3">
                      <i className="bi bi-exclamation-triangle me-1"></i>
                      Confianza baja en algunos datos — revísalos con cuidado.
                    </div>
                  )}

                  <div className="rounded-3 border mb-3 overflow-hidden">
                    {filasVistaPrevia.length === 0 ? (
                      <div className="p-3 text-center text-muted small">No se detectaron datos claros.</div>
                    ) : (
                      filasVistaPrevia.map(([etiqueta, valor], i) => (
                        <div
                          key={etiqueta}
                          className="d-flex justify-content-between px-3 py-2 small"
                          style={{ background: i % 2 === 0 ? '#fff' : '#f9fbfa' }}
                        >
                          <span className="text-muted fw-semibold">{etiqueta}</span>
                          <span className="text-dark">{valor}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-light border w-100 py-2 text-secondary fw-semibold"
                      onClick={() => { setVistaPrevia(null); setTranscripcion(''); }}
                    >
                      <i className="bi bi-arrow-counterclockwise me-1"></i>Intentar de nuevo
                    </button>
                    <button
                      type="button"
                      className="btn btn-brand w-100 py-2"
                      onClick={confirmarYAplicar}
                    >
                      <i className="bi bi-check-lg me-1"></i>Aplicar al formulario
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <style>{`
            .modal-overlay-voz {
              position: fixed; inset: 0; background: rgba(0,0,0,0.5);
              backdrop-filter: blur(4px); display: flex; align-items: center;
              justify-content: center; z-index: 1070; padding: 20px;
            }
            .modal-card-voz {
              background: #fff; border-radius: 16px; max-width: 480px; width: 100%;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;
              max-height: 90vh; overflow-y: auto;
            }
            .modal-header-voz {
              padding: 18px 24px; border-bottom: 1px solid #eef2f4;
              display: flex; justify-content: space-between; align-items: center;
              background: #e9f9f1;
            }
            .btn-mic-grande {
              width: 84px; height: 84px; border-radius: 50%; border: none;
              background: #10b981; color: #fff; font-size: 32px;
              display: flex; align-items: center; justify-content: center;
              box-shadow: 0 6px 18px rgba(16,185,129,0.35); transition: all 0.2s ease;
            }
            .btn-mic-grande:hover { background: #059669; }
            .btn-mic-activo {
              background: #dc3545;
              animation: pulso-grande 1.2s ease-in-out infinite;
            }
            @keyframes pulso-grande {
              0% { box-shadow: 0 0 0 0 rgba(220,53,69,0.5); }
              70% { box-shadow: 0 0 0 16px rgba(220,53,69,0); }
              100% { box-shadow: 0 0 0 0 rgba(220,53,69,0); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}