import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * BotonVoz
 * --------
 * Botón de micrófono que usa la Web Speech API nativa del navegador
 * (SpeechRecognition) para convertir voz a texto en español, sin
 * necesidad de ningún servicio externo ni backend.
 *
 * Uso:
 *   <BotonVoz onResultado={(texto) => setBusqueda(texto)} title="Buscar por voz" />
 *
 * Props:
 *   onResultado (func, requerido): recibe el texto transcrito final.
 *   onInterim   (func, opcional): recibe texto parcial mientras el usuario habla
 *                                 (útil si quieres mostrar el resultado en vivo).
 *   title       (string, opcional): tooltip del botón.
 *   lang        (string, opcional): idioma de reconocimiento. Default 'es-ES'.
 */

// Diccionario simple para normalizar números dictados dentro de códigos,
// ej: "inv cero cero cero siete" -> "INV-0007"
const PALABRAS_A_DIGITOS = {
  cero: '0', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4',
  cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9',
};

function normalizarTexto(texto) {
  if (!texto) return texto;

  let resultado = texto.trim();

  // Detecta patrones tipo "inv <numeros o palabras>" y los convierte a "INV-0007"
  const matchInv = resultado.match(/\b(inv|codigo|código)\b[\s:.-]*([a-z0-9\s]+)/i);
  if (matchInv) {
    const cola = matchInv[2]
      .trim()
      .split(/\s+/)
      .map(palabra => PALABRAS_A_DIGITOS[palabra.toLowerCase()] ?? palabra)
      .join('');
    const digitos = cola.replace(/\D/g, '');
    if (digitos) {
      const codigo = `INV-${digitos.padStart(4, '0')}`;
      resultado = resultado.replace(matchInv[0], codigo);
    }
  }

  return resultado.trim();
}

export default function BotonVoz({ onResultado, onInterim, title = 'Buscar por voz', lang = 'es-ES' }) {
  const [escuchando, setEscuchando] = useState(false);
  const [soportado, setSoportado] = useState(true);
  const [error, setError] = useState(null);
  const reconocimientoRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSoportado(false);
      return;
    }

    const reconocimiento = new SpeechRecognition();
    reconocimiento.lang = lang;
    reconocimiento.continuous = false;
    reconocimiento.interimResults = true;
    reconocimiento.maxAlternatives = 1;

    reconocimiento.onresult = (evento) => {
      let textoFinal = '';
      let textoParcial = '';

      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const transcripcion = evento.results[i][0].transcript;
        if (evento.results[i].isFinal) {
          textoFinal += transcripcion;
        } else {
          textoParcial += transcripcion;
        }
      }

      if (textoParcial && onInterim) {
        onInterim(textoParcial);
      }

      if (textoFinal) {
        onResultado(normalizarTexto(textoFinal));
      }
    };

    reconocimiento.onerror = (evento) => {
      setEscuchando(false);
      switch (evento.error) {
        case 'not-allowed':
        case 'permission-denied':
          setError('Permiso de micrófono denegado.');
          break;
        case 'no-speech':
          setError('No se detectó voz. Intenta de nuevo.');
          break;
        case 'network':
          setError('Error de red durante el reconocimiento.');
          break;
        default:
          setError('No se pudo completar el reconocimiento.');
      }
      // El aviso desaparece solo después de unos segundos
      setTimeout(() => setError(null), 4000);
    };

    reconocimiento.onend = () => {
      setEscuchando(false);
    };

    reconocimientoRef.current = reconocimiento;

    return () => {
      reconocimiento.onresult = null;
      reconocimiento.onerror = null;
      reconocimiento.onend = null;
      try { reconocimiento.abort(); } catch (e) { /* no-op */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const alternarEscucha = useCallback(() => {
    if (!reconocimientoRef.current) return;

    if (escuchando) {
      reconocimientoRef.current.stop();
      setEscuchando(false);
      return;
    }

    setError(null);
    try {
      reconocimientoRef.current.start();
      setEscuchando(true);
    } catch (e) {
      // start() lanza error si ya está corriendo una instancia; lo ignoramos
      setEscuchando(false);
    }
  }, [escuchando]);

  if (!soportado) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-link text-muted p-1"
        disabled
        title="Búsqueda por voz disponible solo en Chrome o Edge"
      >
        <i className="bi bi-mic-mute fs-6"></i>
      </button>
    );
  }

  return (
    <div className="d-inline-flex align-items-center position-relative">
      <button
        type="button"
        onClick={alternarEscucha}
        className={`btn btn-sm btn-link p-1 rounded-3 ${escuchando ? 'text-danger' : 'text-secondary'}`}
        title={escuchando ? 'Detener' : title}
        style={escuchando ? { animation: 'pulso-mic 1.2s ease-in-out infinite' } : undefined}
      >
        <i className={`bi ${escuchando ? 'bi-mic-fill' : 'bi-mic'} fs-6`}></i>
      </button>

      {error && (
        <span
          className="position-absolute text-danger small bg-white border rounded-3 px-2 py-1 shadow-sm"
          style={{ top: '110%', right: 0, whiteSpace: 'nowrap', fontSize: '11px', zIndex: 20 }}
        >
          {error}
        </span>
      )}

      <style>{`
        @keyframes pulso-mic {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}