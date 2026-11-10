import { Link } from 'react-router-dom'
import type { Pedido } from '../types'
import { dataBR, dinheiro } from '../utils/dinheiro'
import { totalPedido } from '../utils/total'

type PedidoCardProps = {
  pedido: Pedido
}

export default function PedidoCard({ pedido }: PedidoCardProps) {
  const qtd = pedido.itens.length
  return (
    <article className="cartao">
      <Link to={`/pedido/${pedido.id}`} className="cartao-link">
        <h3 className="cartao-loja">{pedido.loja}</h3>
        <p className="cartao-info">
          <time dateTime={pedido.data}>{dataBR(pedido.data)}</time>
          <span aria-hidden="true"> · </span>
          <span>{qtd} {qtd === 1 ? 'item' : 'itens'}</span>
        </p>
        <p className="cartao-total">{dinheiro(totalPedido(pedido))}</p>
      </Link>
    </article>
  )
}
