export type OrderStatus = 'open' | 'late' | 'closed' | 'cancelled'
export type Order = { id: string; customer: string; total: number; status: OrderStatus }

export const ORDERS: Order[] = [
  { id: '1040', customer: 'Ana Souza', total: 320.5, status: 'closed' },
  { id: '1041', customer: 'Bruno Lima', total: 89.9, status: 'late' },
  { id: '1042', customer: 'Carla Dias', total: 1250, status: 'open' },
  { id: '1043', customer: 'Diego Reis', total: 42, status: 'late' },
  { id: '1044', customer: 'Elisa Prado', total: 610.3, status: 'open' },
  { id: '1045', customer: 'Fábio Nunes', total: 75, status: 'closed' },
  { id: '1046', customer: 'Gabi Torres', total: 199.99, status: 'late' },
]

export const STATUS_LABEL: Record<OrderStatus | 'all', string> = {
  all: 'Todos',
  open: 'Em aberto',
  late: 'Atrasados',
  closed: 'Fechados',
  cancelled: 'Cancelados',
}
