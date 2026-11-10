export type Item = {
  id: number
  titulo: string
  preco: number
  quantidade: number
}

export type Pedido = {
  id: number
  loja: string
  data: string // '2026-11-02'
  itens: Item[]
}
