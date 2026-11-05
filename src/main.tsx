import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Fontes embutidas no app (sem chamar o Google Fonts: nada de IP do usuário enviado a terceiros).
// O subconjunto "latin" cobre todos os acentos do português.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './styles/index.css';

try {
  const t = JSON.parse(localStorage.getItem('ccc:v1:settings') ?? '[]')[0]?.theme;
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
} catch { document.documentElement.dataset.theme = 'dark'; }

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
