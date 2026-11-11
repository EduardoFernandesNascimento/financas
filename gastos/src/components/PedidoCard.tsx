import { Link } from 'react-router-dom'
import type { Pedido } from '../types'
import { dataBR, dinheiro, porcentagem } from '../utils/dinheiro'
import { centavos, totalPedido } from '../utils/total'

type PedidoCardProps = {
  pedido: Pedido
  // fração do pedido no total exibido (0 a 1)
  proporcao: number
}

// Acima deste valor o pedido ganha a marca "alto" (âmbar e texto, não só cor).
const LIMITE_ALTO = 300

export default function PedidoCard({ pedido, proporcao }: PedidoCardProps) {
  const qtd = pedido.itens.length
  const total = totalPedido(pedido)
  // em centavos, como o filtro: o que conta é o valor que a tela mostra
  const alto = centavos(total) > LIMITE_ALTO * 100
  return (
    <article className={alto ? 'cartao cartao-alto' : 'cartao'}>
      <Link to={`/pedido/${pedido.id}`} className="cartao-link">
        <h3 className="cartao-loja">{pedido.loja}</h3>
        <p className="cartao-info">
          <time dateTime={pedido.data}>{dataBR(pedido.data)}</time>
          <span aria-hidden="true"> · </span>
          <span>{qtd} {qtd === 1 ? 'item' : 'itens'}</span>
        </p>
        <div className="cartao-valor">
          {alto && (
            <span className="selo-alto">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                <path d="M8 3l6 10H2z" />
              </svg>
              alto
            </span>
          )}
          <p className="cartao-total">{dinheiro(total)}</p>
        </div>
        <div className="proporcao">
          <div className="proporcao-barra" aria-hidden="true">
            <span style={{ inlineSize: `${Math.min(100, Math.max(0, proporcao * 100))}%` }} />
          </div>
          <p className="proporcao-texto">{porcentagem(proporcao)} do total exibido</p>
        </div>
      </Link>
    </article>
  )
}
