import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ===== CORRECCIÓN: Cargar favicon desde src/ =====
// Usamos import.meta.url para obtener la URL correcta en producción
const logoUrl = new URL('./logo.png', import.meta.url).href;

// Asignar el logo como favicon
const favicon = document.querySelector("link[rel*='icon']") || document.createElement('link');
favicon.type = 'image/png';
favicon.rel = 'shortcut icon';
favicon.href = logoUrl;
document.head.appendChild(favicon);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
