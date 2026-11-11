import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePedidos } from '../contexts/PedidosContext'
import { buscarPedido, mensagemDeErro } from '../services/pedidos'
import { dataBR, dinheiro } from '../utils/dinheiro'
import { subtotal, totalPedido } from '../utils/total'

type Conferencia = {
  id: string | undefined
  resultado: 'nao-encontrado' | 'recarregado' | 'erro'
  mensagem?: string
}

export default function Pedido() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { pedidos, carregando, erro, recarregar, removerItem } = usePedidos()
  const [removendo, setRemovendo] = useState<number | null>(null)
  const [erroRemover, setErroRemover] = useState<string | null>(null)
  // resultado da conferência no servidor quando o id não está na lista (guardado junto com o id)
  const [conferencia, setConferencia] = useState<Conferencia | null>(null)

  // useParams devolve texto; o id do pedido é número.
  const pedido = pedidos.find((p) => p.id === Number(id))
  const conferido = conferencia?.id === id ? conferencia : null

  // O detalhe lê do Context (Etapa 5). Só quando a lista carregou sem erro e não tem esse id,
  // pergunta ao servidor (GET /pedidos/:id): 404 = pedido não existe; 200 = a lista estava
  // desatualizada, então o Context busca de novo. Não busca em toda abertura.
  // Durante uma remoção não confere: ao remover o último item o pedido some da lista e a tela volta ao painel.
  useEffect(() => {
    if (carregando || erro || pedido || conferido || removendo !== null) return
    let ativo = true
    async function conferirNoServidor() {
      try {
        await buscarPedido(Number(id))
        if (!ativo) return
        setConferencia({ id, resultado: 'recarregado' })
        recarregar()
      } catch (e) {
        if (!ativo) return
        const mensagem = mensagemDeErro(e)
        setConferencia(
          mensagem === 'Pedido não encontrado'
            ? { id, resultado: 'nao-encontrado' }
            : { id, resultado: 'erro', mensagem },
        )
      }
    }
    conferirNoServidor()
    return () => {
      ativo = false
    }
  }, [carregando, erro, pedido, conferido, removendo, id, recarregar])

  async function remover(itemId: number) {
    if (!pedido) return
    const ultimo = pedido.itens.length === 1
    setRemovendo(itemId)
    setErroRemover(null)
    let saindo = false
    try {
      await removerItem(pedido.id, itemId)
      // o pedido sem itens deixa de existir: volta ao painel. O "removendo" fica ligado até a
      // tela sair, para o detalhe não ir conferir no servidor um pedido que acabou de sumir.
      if (ultimo) {
        saindo = true
        navigate('/')
      }
    } catch (e) {
      setErroRemover(mensagemDeErro(e))
    } finally {
      if (!saindo) setRemovendo(null)
    }
  }

  const voltar = (
    <Link to="/" className="voltar">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path d="M10 3L5 8l5 5" />
      </svg>
      Voltar
    </Link>
  )

  if (carregando) {
    return (
      <main className="pagina">
        {voltar}
        <p className="aviso aviso-carregando" role="status">Carregando…</p>
      </main>
    )
  }

  if (erro) {
    return (
      <main className="pagina">
        {voltar}
        <div className="aviso aviso-erro" role="alert">
          <p>{erro}</p>
          <button type="button" className="botao" onClick={recarregar}>
            Tentar de novo
          </button>
        </div>
      </main>
    )
  }

  if (!pedido && !conferido) {
    return (
      <main className="pagina">
        {voltar}
        <p className="aviso aviso-carregando" role="status">Carregando…</p>
      </main>
    )
  }

  if (!pedido && conferido?.resultado === 'erro') {
    return (
      <main className="pagina">
        {voltar}
        <div className="aviso aviso-erro" role="alert">
          <p>{conferido.mensagem}</p>
          <button type="button" className="botao" onClick={() => setConferencia(null)}>
            Tentar de novo
          </button>
        </div>
      </main>
    )
  }

  if (!pedido) {
    return (
      <main className="pagina">
        <div className="aviso aviso-vazio">
          <h1>Pedido não encontrado</h1>
          {voltar}
        </div>
      </main>
    )
  }

  return (
    <main className="pagina">
      {voltar}
      <div className="detalhe-cabecalho">
        <h1>{pedido.loja}</h1>
        <p className="cartao-info">
          <time dateTime={pedido.data}>{dataBR(pedido.data)}</time>
        </p>
      </div>

      {erroRemover && (
        <p className="aviso aviso-erro" role="alert">
          {erroRemover}
        </p>
      )}

      <ul className="itens">
        {pedido.itens.map((item) => (
          <li key={item.id} className="item">
            <div className="item-texto">
              <h2 className="item-titulo">{item.titulo}</h2>
              <p className="item-conta">
                {dinheiro(item.preco)} × {item.quantidade} ={' '}
                <strong className="valor">{dinheiro(subtotal(item))}</strong>
              </p>
            </div>
            <button
              type="button"
              className="botao botao-perigo"
              onClick={() => remover(item.id)}
              disabled={removendo !== null}
              aria-label={`Remover ${item.titulo}`}
            >
              {removendo === item.id ? 'Removendo…' : 'Remover'}
            </button>
          </li>
        ))}
      </ul>

      <p className="total-pedido">
        <span>Total do pedido:</span> <strong className="valor">{dinheiro(totalPedido(pedido))}</strong>
      </p>
    </main>
  )
}
