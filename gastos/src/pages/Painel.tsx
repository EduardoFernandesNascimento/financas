import { useState } from 'react'
import Filtro from '../components/Filtro'
import PedidoCard from '../components/PedidoCard'
import { usePedidos } from '../contexts/PedidosContext'
import { dataBR, dinheiro } from '../utils/dinheiro'
import { dentroDaFaixa, gastoPorData, totalMes, totalPedido, totalPorLoja } from '../utils/total'

type Ordem = 'nenhuma' | 'maior' | 'menor'

export default function Painel() {
  const { pedidos, carregando, erro, recarregar } = usePedidos()
  const [minimo, setMinimo] = useState('')
  const [maximo, setMaximo] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('nenhuma')

  function limpar() {
    setMinimo('')
    setMaximo('')
  }

  if (carregando) {
    return (
      <main className="pagina">
        <h1>Painel de gastos do mês</h1>
        <p className="aviso aviso-carregando" role="status">Carregando…</p>
      </main>
    )
  }

  if (erro) {
    return (
      <main className="pagina">
        <h1>Painel de gastos do mês</h1>
        <div className="aviso aviso-erro" role="alert">
          <p>{erro}</p>
          <button type="button" className="botao" onClick={recarregar}>
            Tentar de novo
          </button>
        </div>
      </main>
    )
  }

  if (pedidos.length === 0) {
    return (
      <main className="pagina">
        <h1>Painel de gastos do mês</h1>
        <p className="aviso aviso-vazio">Nenhum pedido neste mês</p>
      </main>
    )
  }

  const filtrados = pedidos.filter((pedido) => dentroDaFaixa(pedido, minimo, maximo))
  // Ordenar numa cópia: sort muta o array, e o estado não pode ser mutado.
  const lista =
    ordem === 'nenhuma'
      ? filtrados
      : [...filtrados].sort((a, b) =>
          ordem === 'maior' ? totalPedido(b) - totalPedido(a) : totalPedido(a) - totalPedido(b),
        )
  const totalExibido = totalMes(filtrados)
  const maior = filtrados.reduce((m, pedido) => Math.max(m, totalPedido(pedido)), 0)
  const porLoja = Object.entries(totalPorLoja(filtrados)).sort((a, b) => b[1] - a[1])
  const porData = Object.entries(gastoPorData(filtrados)).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <main className="pagina">
      <h1>Painel de gastos do mês</h1>

      <section aria-label="Resumo do mês">
        <dl className="resumo">
          <div className="resumo-item resumo-destaque">
            <dt>Total do mês</dt>
            <dd>{dinheiro(totalExibido)}</dd>
          </div>
          <div className="resumo-item">
            <dt>Pedidos</dt>
            <dd>{filtrados.length}</dd>
          </div>
          <div className="resumo-item">
            <dt>Maior pedido</dt>
            <dd>{dinheiro(maior)}</dd>
          </div>
        </dl>
      </section>

      <Filtro minimo={minimo} maximo={maximo} setMinimo={setMinimo} setMaximo={setMaximo} onLimpar={limpar} />

      <section aria-labelledby="titulo-pedidos">
        <div className="lista-cabecalho">
          <h2 id="titulo-pedidos">Pedidos</h2>
          <div className="campo campo-linha">
            <label htmlFor="ordem">Ordenar por valor</label>
            <select id="ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
              <option value="nenhuma">Sem ordem</option>
              <option value="maior">Maior primeiro</option>
              <option value="menor">Menor primeiro</option>
            </select>
          </div>
        </div>

        {lista.length === 0 ? (
          <p className="aviso aviso-vazio">Nenhum pedido nessa faixa</p>
        ) : (
          <ul className="cartoes">
            {lista.map((pedido) => (
              <li key={pedido.id}>
                <PedidoCard pedido={pedido} proporcao={totalExibido > 0 ? totalPedido(pedido) / totalExibido : 0} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {filtrados.length > 0 && (
        <div className="extras">
          <section aria-labelledby="titulo-lojas" className="tabela-bloco">
            <h2 id="titulo-lojas">Total por loja</h2>
            <ul className="linhas">
              {porLoja.map(([loja, valor]) => (
                <li key={loja}>
                  <span>{loja}</span>
                  <span className="valor">{dinheiro(valor)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="titulo-datas" className="tabela-bloco">
            <h2 id="titulo-datas">Gasto por data</h2>
            <ul className="linhas">
              {porData.map(([data, valor]) => (
                <li key={data}>
                  <time dateTime={data}>{dataBR(data)}</time>
                  <span className="valor">{dinheiro(valor)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  )
}
