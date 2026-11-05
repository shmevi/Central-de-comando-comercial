import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/app/auth';
import { ScopeProvider } from '@/app/scope';
import { ToastProvider } from '@/components/ui/toast';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorState, Loading } from '@/components/ui/misc';
import Hoje from '@/pages/Hoje';
import Login from '@/pages/Login';

const Rotina = lazy(() => import('@/pages/Rotina'));
const Agenda = lazy(() => import('@/pages/Agenda'));
const Tarefas = lazy(() => import('@/pages/Tarefas'));
const Recrutamento = lazy(() => import('@/pages/Recrutamento'));
const Equipes = lazy(() => import('@/pages/Equipes'));
const Treinamentos = lazy(() => import('@/pages/Treinamentos'));
const Reunioes = lazy(() => import('@/pages/Reunioes'));
const Sistemas = lazy(() => import('@/pages/Sistemas'));
const Okrs = lazy(() => import('@/pages/Okrs'));
const Projetos = lazy(() => import('@/pages/Projetos'));
const Relatorios = lazy(() => import('@/pages/Relatorios'));
const Integracoes = lazy(() => import('@/pages/Integracoes'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));

function NotFound() { return <ErrorState message="Página não encontrada." />; }

function Gate() {
  const { status, error } = useAuth();
  if (status === 'loading') return <Loading label="Preparando a central…" />;
  if (status === 'error') return <div className="p-4"><ErrorState message={`Não foi possível iniciar: ${error}`} onRetry={() => location.reload()} /></div>;
  if (status === 'signed_out') return <Login />;
  return (
    <ScopeProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Hoje />} />
            <Route path="rotina" element={<Rotina />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="tarefas" element={<Tarefas />} />
            <Route path="recrutamento" element={<Recrutamento />} />
            <Route path="equipes" element={<Equipes />} />
            <Route path="treinamentos" element={<Treinamentos />} />
            <Route path="reunioes" element={<Reunioes />} />
            <Route path="sistemas" element={<Sistemas />} />
            <Route path="okrs" element={<Okrs />} />
            <Route path="projetos" element={<Projetos />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="integracoes" element={<Integracoes />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </ScopeProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider><Gate /></AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
