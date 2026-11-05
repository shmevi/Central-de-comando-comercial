import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

try {
  const t = JSON.parse(localStorage.getItem('ccc:v1:settings') ?? '[]')[0]?.theme;
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
} catch { document.documentElement.dataset.theme = 'dark'; }

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
