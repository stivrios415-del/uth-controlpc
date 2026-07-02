import React, { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { supabase } from './supabaseClient';
import logoUth from './logo.png';
import fondoImg from './fondo.jpg';

// PIN fijo para administradores
const ADMIN_PIN = '1234';

export default function Login({ onLoginSuccess }) {
  // Estados para el Login
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);

  // Estados para el Modal de Registro (2 pasos)
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [pinAdmin, setPinAdmin] = useState('');
  const [regNombre, setRegNombre] = useState('');
  const [regCorreo, setRegCorreo] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRol, setRegRol] = useState('usuario');
  const [loadingReg, setLoadingReg] = useState(false);

  // Estados para Alertas
  const [alertMessage, setAlertMessage] = useState({ type: '', text: '' });

  const showAlert = (type, text) => {
    setAlertMessage({ type, text });
    if (type === 'success') {
      setTimeout(() => setAlertMessage({ type: '', text: '' }), 5000);
    }
  };

  // ==================== 1. INICIO DE SESIÓN (MEJORADO) ====================
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoadingLogin(true);
    setAlertMessage({ type: '', text: '' });

    try {
      // 1. Autenticar con Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email: correo,
        password: password,
      });

      if (error) {
        showAlert('danger', error.message || 'Credenciales incorrectas.');
        setLoadingLogin(false);
        return;
      }

      // 2. Obtener el perfil del usuario desde la tabla 'perfiles'
      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('nombre, rol')
        .eq('id', data.user.id)
        .maybeSingle(); // Usamos maybeSingle() en lugar de single() para evitar error si no existe

      if (perfilError) {
        console.error('Error al obtener perfil:', perfilError);
        showAlert('danger', 'Error al obtener el perfil del usuario.');
        setLoadingLogin(false);
        return;
      }

      // 3. Si no existe perfil, intentar crearlo automáticamente
      if (!perfil) {
        console.log('Perfil no encontrado, creando uno automáticamente...');
        
        // Obtener el nombre desde los metadatos del usuario (si existe)
        const nombre = data.user.user_metadata?.nombre || 'Usuario';
        
        // Insertar perfil
        const { error: insertError } = await supabase
          .from('perfiles')
          .insert([{ 
            id: data.user.id, 
            nombre: nombre, 
            rol: 'usuario' 
          }]);

        if (insertError) {
          console.error('Error al crear perfil:', insertError);
          showAlert('danger', 'No se pudo crear el perfil del usuario.');
          setLoadingLogin(false);
          return;
        }

        // Recuperar el perfil recién creado
        const { data: newPerfil, error: newPerfilError } = await supabase
          .from('perfiles')
          .select('nombre, rol')
          .eq('id', data.user.id)
          .single();

        if (newPerfilError) {
          showAlert('danger', 'Perfil creado pero no se pudo obtener.');
          setLoadingLogin(false);
          return;
        }

        // Usar el nuevo perfil
        const userData = {
          id: data.user.id,
          email: data.user.email,
          nombre: newPerfil.nombre,
          rol: newPerfil.rol,
        };

        showAlert('success', `¡Bienvenido, ${userData.nombre}!`);
        if (onLoginSuccess) {
          setTimeout(() => onLoginSuccess(userData), 1000);
        }
        setLoadingLogin(false);
        return;
      }

      // 4. Perfil existe, continuar normalmente
      const userData = {
        id: data.user.id,
        email: data.user.email,
        nombre: perfil.nombre,
        rol: perfil.rol,
      };

      showAlert('success', `¡Bienvenido de nuevo, ${userData.nombre}!`);
      if (onLoginSuccess) {
        setTimeout(() => onLoginSuccess(userData), 1000);
      }
    } catch (error) {
      console.error('Error en login:', error);
      showAlert('danger', 'Error de conexión con el servidor de autenticación.');
    } finally {
      setLoadingLogin(false);
    }
  };

  // ==================== 2. VERIFICACIÓN DEL PIN ====================
  const handleVerifyPin = (e) => {
    e.preventDefault();
    if (pinAdmin.trim() === '') {
      showAlert('danger', 'Por favor ingresa un PIN.');
      return;
    }
    if (pinAdmin !== ADMIN_PIN) {
      showAlert('danger', 'PIN incorrecto.');
      setPinAdmin('');
      return;
    }
    setStep(2);
  };

  // ==================== 3. REGISTRO DE USUARIO ====================
  const handleRegistro = async (e) => {
    e.preventDefault();
    setLoadingReg(true);

    try {
      // 1. Registrar usuario en Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: regCorreo,
        password: regPassword,
        options: {
          data: {
            nombre: regNombre,
          },
        },
      });

      if (error) {
        showAlert('danger', error.message || 'Error al registrar el usuario.');
        setLoadingReg(false);
        return;
      }

      // 2. Si se seleccionó 'admin', actualizar el rol en la tabla perfiles
      if (regRol === 'admin' && data.user) {
        const { error: updateError } = await supabase
          .from('perfiles')
          .update({ rol: 'admin' })
          .eq('id', data.user.id);

        if (updateError) {
          showAlert('danger', 'Usuario creado, pero no se pudo asignar el rol de administrador.');
          setLoadingReg(false);
          return;
        }
      }

      showAlert('success', '¡Usuario registrado exitosamente! Ya puede iniciar sesión.');
      handleCloseModal();

    } catch (error) {
      showAlert('danger', 'No se pudo conectar al servidor de autenticación.');
    } finally {
      setLoadingReg(false);
    }
  };

  const resetModal = () => {
    setStep(1);
    setPinAdmin('');
    setRegNombre('');
    setRegCorreo('');
    setRegPassword('');
    setRegRol('usuario');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetModal();
  };

  const handleOpenModal = () => {
    resetModal();
    setShowModal(true);
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center min-vh-100 login-page"
      style={{ backgroundImage: `url(${fondoImg})` }}
    >
      <div className="login-overlay"></div>

      <div className="login-card">
        {/* CABECERA */}
        <div className="login-header">
          <div className="logo-badge">
            <img
              src={logoUth}
              alt="Logo Institucional"
              className="login-logo"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <h2>CONTROL-PC</h2>
          <p className="header-subtitle">SISTEMA DE GESTIÓN DE ACTIVOS</p>
        </div>

        {/* CUERPO DEL LOGIN */}
        <div className="login-body">
          {alertMessage.text && (
            <div className={alertMessage.type === 'success' ? 'success-alert' : 'error-alert'}>
              {alertMessage.text}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="form-label">Correo Electrónico</label>
              <input
                type="email"
                className="form-control custom-input"
                placeholder="nombre@uth.hn"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                required
              />
            </div>

            <div className="mb-4">
              <label className="form-label">Contraseña</label>
              <input
                type="password"
                className="form-control custom-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-login" disabled={loadingLogin}>
              {loadingLogin ? 'Validando...' : 'Acceder al Sistema'}
            </button>
          </form>

          <div className="text-center mt-4">
            <button
              type="button"
              className="btn btn-link link-minimal text-decoration-none fw-medium p-0"
              onClick={handleOpenModal}
            >
              Registrar nuevo usuario (Admin)
            </button>
          </div>

          <div className="footer-text">
            &copy; {new Date().getFullYear()} UTH &bull; SOPORTE TÉCNICO
          </div>
        </div>
      </div>

      {/* MODAL DE REGISTRO */}
      <Modal show={showModal} onHide={handleCloseModal} centered backdrop="static">
        <Modal.Body className="p-0 custom-modal">
          {step === 1 ? (
            <div>
              <div className="modal-header border-0 pt-4 pb-0 px-4 d-flex justify-content-between align-items-center">
                <h6 className="modal-title fw-bold m-0 modal-title-green">Acceso Restringido</h6>
                <button
                  type="button"
                  className="btn-close small shadow-none"
                  onClick={handleCloseModal}
                  aria-label="Close"
                ></button>
              </div>
              <div className="p-4">
                <p className="text-muted small mb-3">Introduce el PIN de Administrador para desbloquear.</p>
                <form onSubmit={handleVerifyPin}>
                  <div className="mb-3">
                    <input
                      type="password"
                      className="form-control custom-input text-center fs-4 fw-bold"
                      placeholder="••••"
                      maxLength="4"
                      value={pinAdmin}
                      onChange={(e) => setPinAdmin(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-login w-100 py-2">Verificar</button>
                </form>
              </div>
            </div>
          ) : (
            <div>
              <div className="modal-header border-0 pt-4 pb-0 px-4 d-flex justify-content-between align-items-center">
                <h6 className="modal-title fw-bold m-0 modal-title-green">Registrar Colaborador</h6>
                <button
                  type="button"
                  className="btn-close small shadow-none"
                  onClick={handleCloseModal}
                  aria-label="Close"
                ></button>
              </div>
              <form onSubmit={handleRegistro} className="p-4">
                <div className="mb-3">
                  <label className="form-label">Nombre Completo</label>
                  <input
                    type="text"
                    className="form-control custom-input"
                    placeholder="Ej: Juan Pérez"
                    value={regNombre}
                    onChange={(e) => setRegNombre(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Correo Electrónico</label>
                  <input
                    type="email"
                    className="form-control custom-input"
                    placeholder="ejemplo@uth.hn"
                    value={regCorreo}
                    onChange={(e) => setRegCorreo(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Contraseña Temporal</label>
                  <input
                    type="password"
                    className="form-control custom-input"
                    placeholder="••••••••"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-4">
                  <label className="form-label">Rol Asignado</label>
                  <select
                    className="form-select custom-input"
                    value={regRol}
                    onChange={(e) => setRegRol(e.target.value)}
                  >
                    <option value="usuario">Usuario / Técnico</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="btn-login w-100 py-2"
                  disabled={loadingReg}
                >
                  {loadingReg ? 'Registrando...' : 'Dar de Alta'}
                </button>
              </form>
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* ESTILOS */}
      <style>{`
        .login-page {
          position: relative;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          font-family: 'Inter', system-ui, sans-serif;
          overflow: hidden;
        }
        .login-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(160deg, rgba(6, 95, 70, 0.75) 0%, rgba(16, 185, 129, 0.55) 45%, rgba(255, 255, 255, 0.85) 100%);
          z-index: 0;
        }
        .login-card {
          position: relative;
          z-index: 1;
          background: #ffffff;
          border: 1px solid #e6f4ec;
          border-radius: 18px;
          box-shadow: 0 25px 50px -12px rgba(6, 95, 70, 0.35), 0 4px 10px rgba(0,0,0,0.08);
          width: 100%;
          max-width: 400px;
          overflow: hidden;
        }
        .login-header {
          text-align: center;
          padding: 36px 30px 28px;
          background: linear-gradient(135deg, #065f46 0%, #10b981 100%);
          position: relative;
        }
        .logo-badge {
          width: 76px;
          height: 76px;
          margin: 0 auto 16px;
          background: #ffffff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 20px rgba(0,0,0,0.15);
        }
        .login-logo {
          max-height: 46px;
          max-width: 56px;
          width: auto;
          object-fit: contain;
        }
        .login-header h2 {
          color: #ffffff;
          font-weight: 800;
          margin: 0;
          font-size: 1.35rem;
          letter-spacing: 0.6px;
        }
        .header-subtitle {
          color: rgba(255,255,255,0.85);
          font-size: 11px;
          letter-spacing: 1px;
          margin: 6px 0 0;
        }
        .login-body {
          padding: 32px 35px 30px;
        }
        .form-label {
          font-weight: 600;
          font-size: 0.72rem;
          color: #065f46;
          text-transform: uppercase;
          margin-bottom: 6px;
          letter-spacing: 0.5px;
        }
        .custom-input {
          background-color: #f6faf8 !important;
          border: 1.5px solid #e2ede7 !important;
          color: #1f2937 !important;
          border-radius: 10px !important;
          padding: 11px 15px;
          font-size: 0.9rem;
          transition: all 0.2s ease-in-out;
          box-shadow: none !important;
        }
        .custom-input:focus {
          background-color: #ffffff !important;
          border-color: #10b981 !important;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
        }
        .btn-login {
          background-color: #10b981 !important;
          border: 1px solid #10b981 !important;
          color: #ffffff !important;
          font-weight: 700;
          padding: 12px;
          border-radius: 10px !important;
          width: 100%;
          margin-top: 6px;
          transition: all 0.2s ease;
          text-transform: uppercase;
          font-size: 0.82rem;
          letter-spacing: 0.6px;
        }
        .btn-login:hover:not(:disabled) {
          background-color: #059669 !important;
          border-color: #059669 !important;
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
        }
        .btn-login:disabled {
          background-color: #a7d9c7 !important;
          border-color: #a7d9c7 !important;
          cursor: not-allowed;
        }
        .error-alert {
          background-color: #fdf2f2;
          color: #c0392b;
          border-left: 4px solid #e02424;
          padding: 10px 14px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 0.8rem;
          text-align: center;
        }
        .success-alert {
          background-color: #e9f9f1;
          color: #067a4a;
          border-left: 4px solid #10b981;
          padding: 10px 14px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 0.8rem;
          text-align: center;
        }
        .link-minimal {
          color: #6b7280 !important;
          font-size: 0.8rem;
          transition: color 0.2s ease;
        }
        .link-minimal:hover {
          color: #10b981 !important;
        }
        .footer-text {
          text-align: center;
          margin-top: 28px;
          font-size: 0.68rem;
          color: #b6c9c0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .custom-modal {
          border-radius: 16px;
          overflow: hidden;
          background: white;
        }
        .modal-title-green {
          color: #065f46;
        }
        .modal-content {
          background: transparent;
          border: none;
        }
      `}</style>
    </div>
  );
}