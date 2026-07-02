import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import logo from './logo.png'; // <--- Importa el logo desde src/

// Asignar el logo como favicon
const favicon = document.querySelector("link[rel*='icon']") || document.createElement('link');
favicon.type = 'image/png';
favicon.rel = 'shortcut icon';
favicon.href = logo;
document.head.appendChild(favicon);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
