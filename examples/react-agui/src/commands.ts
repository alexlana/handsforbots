import type { Command } from '@handsforbots/menu'

const STATUS: Record<string, string> = {
  atrasados: 'late',
  atrasado: 'late',
  abertos: 'open',
  aberto: 'open',
  fechados: 'closed',
  fechado: 'closed',
  todos: 'all',
}

/** Direct commands: run on the device, no LLM round trip, still recorded in history. */
export const commands: Command[] = [
  {
    action: 'filter_orders',
    label: 'Pedidos atrasados',
    slash: 'atrasados',
    phrases: ['pedidos atrasados', 'ver atrasados'],
    args: { status: 'late' },
  },
  {
    action: 'filter_orders',
    label: 'Todos os pedidos',
    slash: 'todos',
    phrases: ['todos os pedidos', 'limpar filtro'],
    args: { status: 'all' },
  },
  {
    action: 'filter_orders',
    label: 'Filtrar pedidos…',
    slash: 'pedidos',
    patterns: ['mostrar pedidos {status}', 'pedidos {status}', 'filtrar {status}'],
    args: ({ status, rest }: Record<string, string>) => ({ status: STATUS[status ?? rest ?? ''] ?? 'all' }),
  },
  {
    action: 'open_order',
    label: 'Abrir pedido…',
    slash: 'abrir',
    patterns: ['abrir pedido {id}', 'abrir {id}'],
    args: ({ id, rest }: Record<string, string>) => ({ id: (id ?? rest ?? '').trim() }),
  },
]
