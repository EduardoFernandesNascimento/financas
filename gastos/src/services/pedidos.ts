import type { Pedido } from '../types'

// A URL vem do .env (VITE_API_URL); nunca fica escrita no código.
const API = import.meta.env.VITE_API_URL

// O fetch só lança erro quando a rede cai: 404 e 500 passam batido, por isso o res.ok.
export async function buscarPedidos(): Promise<Pedido[]> {
  const res = await fetch(`${API}/pedidos`)
  if (!res.ok) throw new Error(`Erro ${res.status} ao carregar os pedidos`)
  const dados: { pedidos: Pedido[]; total: number } = await res.json()
  return dados.pedidos
}

// GET /pedidos/:id (Etapa 4). Desde a Etapa 5 o detalhe lê do PedidosContext.
export async function buscarPedido(id: number): Promise<Pedido> {
  const res = await fetch(`${API}/pedidos/${id}`)
  if (res.status === 404) throw new Error('Pedido não encontrado')
  if (!res.ok) throw new Error(`Erro ${res.status} ao carregar o pedido`)
  return res.json()
}

// Se o servidor recusar (por exemplo 404), o erro sobe e a tela não muda.
export async function excluirItem(pedidoId: number, itemId: number): Promise<void> {
  const res = await fetch(`${API}/pedidos/${pedidoId}/itens/${itemId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Erro ${res.status} ao remover o item`)
}

// Sem servidor não existe status HTTP: o fetch lança TypeError ("Failed to fetch").
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof TypeError) return 'Não foi possível falar com o servidor. Confira se ele está ligado.'
  if (erro instanceof Error) return erro.message
  return 'Erro inesperado'
}
