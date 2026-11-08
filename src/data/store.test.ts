import { describe, it, expect, vi, beforeEach } from 'vitest';

// Repositório controlável: cada chamada devolve uma promessa que o teste resolve/rejeita quando quiser.
const pending: { kind: string; resolve: (v: any) => void; reject: (e: any) => void }[] = [];
const call = (kind: string) => new Promise((resolve, reject) => pending.push({ kind, resolve, reject }));
vi.mock('./index', () => ({
  repo: () => ({ list: () => call('list'), create: () => call('create'), createMany: () => call('createMany'), update: () => call('update'), remove: () => call('remove') }),
}));
const { load, getItems, actions, resetStore, prefetch } = await import('./store');
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('cache de dados (store)', () => {
  beforeEach(() => { pending.length = 0; resetStore(false); });

  it('leituras simultâneas da mesma coleção viram UMA requisição', async () => {
    void load('tasks'); void load('tasks'); void prefetch(['tasks', 'tasks']);
    expect(pending.filter((p) => p.kind === 'list')).toHaveLength(1);
    pending[0].resolve([{ id: '1' }]); await flush();
    expect(getItems('tasks')).toEqual([{ id: '1' }]);
  });

  it('resposta de leitura antiga (antes de sair/entrar) é descartada', async () => {
    void load('tasks');
    resetStore(false);                  // ex.: saiu da conta
    pending[0].resolve([{ id: 'de-outra-sessao' }]); await flush();
    expect(getItems('tasks')).toEqual([]);
  });

  it('alteração aparece na hora e é confirmada pelo servidor', async () => {
    void load('tasks'); pending.shift()!.resolve([{ id: '1', title: 'A', status: 'a_fazer' }]); await flush();
    const p = actions.update('tasks', '1', { status: 'concluida' } as any);
    expect(getItems('tasks')[0]).toMatchObject({ status: 'concluida' }); // otimista, antes do servidor
    pending.shift()!.resolve({ id: '1', title: 'A', status: 'concluida', updated_at: 'srv' }); await p;
    expect(getItems('tasks')[0]).toMatchObject({ updated_at: 'srv' });
  });

  it('se o servidor recusar a alteração, a tela volta ao que era e o erro chega a quem chamou', async () => {
    void load('tasks'); pending.shift()!.resolve([{ id: '1', status: 'a_fazer' }]); await flush();
    const p = actions.update('tasks', '1', { status: 'concluida' } as any);
    pending.shift()!.reject(new Error('sem permissão'));
    await expect(p).rejects.toThrow('sem permissão');
    expect(getItems('tasks')[0]).toMatchObject({ status: 'a_fazer' });
  });

  it('exclusão some na hora e volta na mesma posição se falhar', async () => {
    void load('tasks'); pending.shift()!.resolve([{ id: '1' }, { id: '2' }, { id: '3' }]); await flush();
    const p = actions.remove('tasks', '2');
    expect(getItems('tasks').map((t) => t.id)).toEqual(['1', '3']);
    pending.shift()!.reject(new Error('offline'));
    await expect(p).rejects.toThrow('offline');
    expect(getItems('tasks').map((t) => t.id)).toEqual(['1', '2', '3']);
  });
});
