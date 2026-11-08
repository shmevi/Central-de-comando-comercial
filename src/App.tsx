import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/app/auth';
import { ScopeProvider } from '@/app/scope';
import { ToastProvider } from '@/components/ui/toast';
import { AppShell } from '@/components/layout/AppShell';
import { PAGE_LOADERS } from '@/app/routes';
import { ErrorState, Loading } from '@/components/ui/misc';
import Hoje from '@/pages/Hoje';
import Login, { ConfigError, SetPassword } from '@/pages/Login';

const Rotina = lazy(PAGE_LOADERS['/rotina']);
const Agenda = lazy(PAGE_LOADERS['/agenda']);
const Tarefas = lazy(PAGE_LOADERS['/tarefas']);
const Equipes = lazy(PAGE_LOADERS['/equipes']);
const EquipePessoa = lazy(PAGE_LOADERS['/equipes/:personId']);
const Treinamentos = lazy(PAGE_LOADERS['/treinamentos']);
const Reunioes = lazy(PAGE_LOADERS['/reunioes']);
const Okrs = lazy(PAGE_LOADERS['/okrs']);
const Projetos = lazy(PAGE_LOADERS['/projetos']);
const Relatorios = lazy(PAGE_LOADERS['/relatorios']);
const Integracoes = lazy(PAGE_LOADERS['/integracoes']);
const Configuracoes = lazy(PAGE_LOADERS['/configuracoes']);

function NotFound() { return <ErrorState message="Página não encontrada." />; }

function Gate() {
  const { status, error } = useAuth();
  if (status === 'loading') return <Loading label="Preparando a central…" />;
  if (status === 'config_error') return <ConfigError message={error ?? ''} />;
  if (status === 'set_password') return <SetPassword />;
  if (status === 'error') return <div className="p-4"><ErrorState message={`Não foi possível iniciar: ${error}`} onRetry={() => location.reload()} /></div>;
  if (status === 'signed_out') return <Login />;
  return (
    <ScopeProvider>
      <Suspense fallback={<Loading />}>{/* fallback só para o primeiro carregamento; as telas têm Suspense dentro do AppShell */}
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Hoje />} />
            <Route path="rotina" element={<Rotina />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="tarefas" element={<Tarefas />} />
            <Route path="equipes" element={<Equipes />} />
            <Route path="equipes/:personId" element={<EquipePessoa />} />
            <Route path="treinamentos" element={<Treinamentos />} />
            <Route path="reunioes" element={<Reunioes />} />
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
