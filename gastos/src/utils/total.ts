import type { Item, Pedido } from '../types'

// O total não vem do servidor: soma de preco × quantidade, com valor inicial 0.
export const totalPedido = (pedido: Pedido) =>
  pedido.itens.reduce((soma, item) => soma + subtotal(item), 0)

export const subtotal = (item: Item) => item.preco * item.quantidade

export const totalMes = (pedidos: Pedido[]) =>
  pedidos.reduce((soma, pedido) => soma + totalPedido(pedido), 0)

// Centavos inteiros: 1.1 × 3 dá 3.3000000000000003 em ponto flutuante, mas na tela é R$ 3,30.
const centavos = (valor: number) => Math.round(valor * 100)

// Faixa de valor: texto vazio é "sem limite". A comparação é em centavos, o mesmo valor que a tela mostra.
export function dentroDaFaixa(pedido: Pedido, minimo: string, maximo: string) {
  const total = centavos(totalPedido(pedido))
  if (minimo !== '' && total < centavos(Number(minimo))) return false
  if (maximo !== '' && total > centavos(Number(maximo))) return false
  return true
}

// Extra: quanto foi gasto em cada loja (reduce montando um objeto).
export const totalPorLoja = (pedidos: Pedido[]) =>
  pedidos.reduce<Record<string, number>>(
    (acc, pedido) => ({ ...acc, [pedido.loja]: (acc[pedido.loja] ?? 0) + totalPedido(pedido) }),
    {},
  )

// Extra: gasto agrupado por dia.
export const gastoPorData = (pedidos: Pedido[]) =>
  pedidos.reduce<Record<string, number>>(
    (acc, pedido) => ({ ...acc, [pedido.data]: (acc[pedido.data] ?? 0) + totalPedido(pedido) }),
    {},
  )
