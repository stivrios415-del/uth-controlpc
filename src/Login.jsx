import React, { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { supabase } from './supabaseClient';
import { Mail, Lock, User, Eye, EyeOff, ShieldCheck, UserPlus, ArrowRight } from 'lucide-react';
import logoUth from './logo.png';
import fondoImg from './fondo.jpg';

const ADMIN_PIN = '1234';

export default function Login({ onLoginSuccess }) {
  // Estados para el Login
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);

  // Estados para el Modal de Registro
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [pinAdmin, setPinAdmin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [regNombre, setRegNombre] = useState('');
  const [regCorreo, setRegCorreo] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoadingLogin(true);
    setAlertMessage({ type: '', text: '' });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: correo,
        password: password,
      });

      if (error) {
        showAlert('danger', error.message || 'Credenciales incorrectas.');
        setLoadingLogin(false);
        return;
      }

      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('nombre, rol')
        .eq('id', data.user.id)
        .maybeSingle();

      if (perfilError) {
        console.error('Error al obtener perfil:', perfilError);
        showAlert('danger', 'Error al obtener el perfil del usuario.');
        setLoadingLogin(false);
        return;
      }

      if (!perfil) {
        console.log('Perfil no encontrado, creando uno automáticamente...');
        const nombre = data.user.user_metadata?.nombre || 'Usuario';
        
        const { error: insertError } = await supabase
          .from('perfiles')
          .insert([{ id: data.user.id, nombre: nombre, rol: 'usuario' }]);

        if (insertError) {
          console.error('Error al crear perfil:', insertError);
          showAlert('danger', 'No se pudo crear el perfil del usuario.');
          setLoadingLogin(false);
          return;
        }

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

  const handleRegistro = async (e) => {
    e.preventDefault();
    setLoadingReg(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: regCorreo,
        password: regPassword,
        options: { data: { nombre: regNombre } },
      });

      if (error) {
        showAlert('danger', error.message || 'Error al registrar el usuario.');
        setLoadingReg(false);
        return;
      }

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
        <div className="login-header text-center">
          <div className="logo-badge">
            <img
              src={logoUth}
              alt="Logo Institucional"
              className="login-logo"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <h2>BIENVENIDO</h2>
          <p className="header-subtitle">SISTEMA DE GESTIÓN DE ACTIVOS</p>
        </div>

        {/* CUERPO DEL LOGIN */}
        <div className="login-body">
          {alertMessage.text && (
            <div className={alertMessage.type === 'success' ? 'success-alert animate-fade-in' : 'error-alert animate-fade-in'}>
              {alertMessage.text}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="form-label">Correo Electrónico</label>
              <div className="input-group-custom">
                <span className="input-icon"><Mail size={18} /></span>
                <input
                  type="email"
                  className="form-control custom-input"
                  placeholder="nombre@uth.hn"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label">Contraseña</label>
              <div className="input-group-custom">
                <span className="input-icon"><Lock size={18} /></span>
                <input
                  type={showPassword ? "text" : "password"}
                  className="form-control custom-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-login" disabled={loadingLogin}>
              {loadingLogin ? (
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              ) : null}
              {loadingLogin ? 'Validando...' : 'Acceder al Sistema'}
            </button>
          </form>

          <div className="text-center mt-4">
            <button
              type="button"
              className="btn btn-link link-minimal text-decoration-none fw-medium p-0 d-inline-flex align-items-center gap-1"
              onClick={handleOpenModal}
            >
              <UserPlus size={16} /> Registrar nuevo usuario (Admin)
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
            <div className="animate-fade-in">
              <div className="modal-header border-0 pt-4 pb-0 px-4 d-flex justify-content-between align-items-center">
                <h6 className="modal-title fw-bold m-0 modal-title-green d-flex align-items-center gap-2">
                  <ShieldCheck size={20} /> Acceso Restringido
                </h6>
                <button
                  type="button"
                  className="btn-close small shadow-none"
                  onClick={handleCloseModal}
                  aria-label="Close"
                ></button>
              </div>
              <div className="p-4">
                <p className="text-muted small mb-3">Introduce el PIN de Administrador para desbloquear la creación de cuentas.</p>
                <form onSubmit={handleVerifyPin}>
                  <div className="mb-3 position-relative">
                    <input
                      type={showPin ? "text" : "password"}
                      className="form-control custom-input text-center fs-4 fw-bold letter-spacing-lg"
                      placeholder="••••"
                      maxLength="4"
                      value={pinAdmin}
                      onChange={(e) => setPinAdmin(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle-btn me-2"
                      onClick={() => setShowPin(!showPin)}
                    >
                      {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <button type="submit" className="btn-login w-100 py-2 d-flex align-items-center justify-content-center gap-2">
                    Verificar <ArrowRight size={16} />
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in">
              <div className="modal-header border-0 pt-4 pb-0 px-4 d-flex justify-content-between align-items-center">
                <h6 className="modal-title fw-bold m-0 modal-title-green d-flex align-items-center gap-2">
                  <UserPlus size={20} /> Registrar Colaborador
                </h6>
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
                  <div className="input-group-custom">
                    <span className="input-icon"><User size={18} /></span>
                    <input
                      type="text"
                      className="form-control custom-input"
                      placeholder="Ej: Juan Pérez"
                      value={regNombre}
                      onChange={(e) => setRegNombre(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Correo Electrónico</label>
                  <div className="input-group-custom">
                    <span className="input-icon"><Mail size={18} /></span>
                    <input
                      type="email"
                      className="form-control custom-input"
                      placeholder="ejemplo@uth.hn"
                      value={regCorreo}
                      onChange={(e) => setRegCorreo(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Contraseña Temporal</label>
                  <div className="input-group-custom">
                    <span className="input-icon"><Lock size={18} /></span>
                    <input
                      type={showRegPassword ? "text" : "password"}
                      className="form-control custom-input"
                      placeholder="••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                    >
                      {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
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
                  className="btn-login w-100 py-2 d-flex align-items-center justify-content-center"
                  disabled={loadingReg}
                >
                  {loadingReg ? (
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  ) : null}
                  {loadingReg ? 'Registrando...' : 'Dar de Alta'}
                </button>
              </form>
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* ESTILOS CSS REFINADOS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .login-page {
          position: relative;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          font-family: 'Inter', system-ui, sans-serif;
          overflow-y: auto;
          padding: 20px;
        }
        .login-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(4, 47, 46, 0.85) 0%, rgba(6, 95, 70, 0.75) 50%, rgba(16, 185, 129, 0.4) 100%);
          z-index: 0;
        }
        .login-card {
          position: relative;
          z-index: 1;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 24px;
          box-shadow: 0 25px 60px -15px rgba(4, 47, 46, 0.5);
          width: 100%;
          max-width: 420px;
          overflow: hidden;
          transition: transform 0.3s ease;
        }
        .login-header {
          padding: 40px 30px 30px;
          background: linear-gradient(135deg, #042f2e 0%, #065f46 100%);
          position: relative;
        }
        .logo-badge {
          width: 84px;
          height: 84px;
          margin: 0 auto 18px;
          background: #ffffff;
          border-radius: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          transform: rotate(-5deg);
          transition: transform 0.3s ease;
        }
        .login-card:hover .logo-badge {
          transform: rotate(0deg) scale(1.05);
        }
        .login-logo {
          max-height: 52px;
          max-width: 64px;
          width: auto;
          object-fit: contain;
        }
        .login-header h2 {
          color: #ffffff;
          font-weight: 800;
          margin: 0;
          font-size: 1.5rem;
          letter-spacing: 1px;
        }
        .header-subtitle {
          color: #10b981;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 1.5px;
          margin: 6px 0 0;
        }
        .login-body {
          padding: 35px 40px;
        }
        .form-label {
          font-weight: 600;
          font-size: 0.75rem;
          color: #065f46;
          text-transform: uppercase;
          margin-bottom: 8px;
          letter-spacing: 0.5px;
        }
        .input-group-custom {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }
        .input-icon {
          position: absolute;
          left: 14px;
          color: #9ca3af;
          display: flex;
          align-items: center;
          pointer-events: none;
          z-index: 4;
        }
        .custom-input {
          background-color: #f9fafb !important;
          border: 1.5px solid #e5e7eb !important;
          color: #111827 !important;
          border-radius: 12px !important;
          padding: 12px 16px 12px 42px !important;
          font-size: 0.95rem;
          transition: all 0.25s ease-in-out;
          box-shadow: none !important;
          width: 100%;
        }
        .custom-input:focus {
          background-color: #ffffff !important;
          border-color: #10b981 !important;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15) !important;
        }
        .letter-spacing-lg {
          letter-spacing: 0.5rem;
        }
        .password-toggle-btn {
          position: absolute;
          right: 14px;
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0;
          z-index: 4;
          transition: color 0.2s;
        }
        .password-toggle-btn:hover {
          color: #10b981;
        }
        .btn-login {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
          border: none !important;
          color: #ffffff !important;
          font-weight: 700;
          padding: 14px;
          border-radius: 12px !important;
          width: 100%;
          margin-top: 10px;
          transition: all 0.3s ease;
          text-transform: uppercase;
          font-size: 0.85rem;
          letter-spacing: 0.8px;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }
        .btn-login:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);
        }
        .btn-login:active:not(:disabled) {
          transform: translateY(1px);
        }
        .btn-login:disabled {
          background: #d1d5db !important;
          color: #9ca3af !important;
          cursor: not-allowed;
          box-shadow: none;
        }
        .error-alert, .success-alert {
          padding: 12px 16px;
          border-radius: 12px;
          margin-bottom: 24px;
          font-size: 0.85rem;
          text-align: left;
          font-weight: 500;
        }
        .error-alert {
          background-color: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fee2e2;
        }
        .success-alert {
          background-color: #ecfdf5;
          color: #047857;
          border: 1px solid #d1fae5;
        }
        .link-minimal {
          color: #4b5563 !important;
          font-size: 0.85rem;
          transition: all 0.2s ease;
        }
        .link-minimal:hover {
          color: #10b981 !important;
        }
        .footer-text {
          text-align: center;
          margin-top: 35px;
          font-size: 0.7rem;
          color: #9ca3af;
          font-weight: 600;
          letter-spacing: 0.8px;
        }
        .custom-modal {
          border-radius: 24px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
        .modal-title-green {
          color: #042f2e;
        }
        .modal-content {
          background: transparent;
          border: none;
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-in-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
