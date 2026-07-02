import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// ===== AGREGAR FAVICON DESDE src/logo.png =====
import logo from './logo.png';

const favicon = document.querySelector("link[rel*='icon']") || document.createElement('link');
favicon.type = 'image/png';
favicon.rel = 'shortcut icon';
favicon.href = logo;
document.head.appendChild(favicon);
// ===== FIN FAVICON =====

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
