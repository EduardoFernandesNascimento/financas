import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { buscarPedidos, excluirItem, mensagemDeErro } from '../services/pedidos'
import type { Pedido } from '../types'

type PedidosCtx = {
  pedidos: Pedido[]
  carregando: boolean
  erro: string | null
  recarregar: () => void
  removerItem: (pedidoId: number, itemId: number) => Promise<void>
}

const Ctx = createContext<PedidosCtx | undefined>(undefined)

export function PedidosProvider({ children }: { children: ReactNode }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  // cada "Tentar de novo" soma 1 e o useEffect busca outra vez
  const [tentativa, setTentativa] = useState(0)

  // A busca mora aqui: acontece num lugar só e todo mundo lê o mesmo resultado.
  // async/await com try/catch/finally: o carregando termina no finally, dê certo ou errado.
  useEffect(() => {
    async function carregar() {
      try {
        const lista = await buscarPedidos()
        setPedidos(lista)
      } catch (e) {
        setErro(mensagemDeErro(e))
      } finally {
        setCarregando(false)
      }
    }
    carregar()
  }, [tentativa])

  // Botão "Tentar de novo": volta ao carregando e dispara a busca outra vez.
  // useCallback: a função é a mesma entre renderizações (o detalhe a usa num useEffect).
  const recarregar = useCallback(() => {
    setCarregando(true)
    setErro(null)
    setTentativa((t) => t + 1)
  }, [])

  // Primeiro o servidor, depois a tela. Se o servidor recusar, o erro sobe e o estado não muda.
  async function removerItem(pedidoId: number, itemId: number) {
    await excluirItem(pedidoId, itemId)
    setPedidos((atuais) =>
      atuais
        .map((pedido) =>
          pedido.id === pedidoId
            ? { ...pedido, itens: pedido.itens.filter((item) => item.id !== itemId) }
            : pedido,
        )
        .filter((pedido) => pedido.itens.length > 0),
    )
  }

  return (
    <Ctx.Provider value={{ pedidos, carregando, erro, recarregar, removerItem }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function usePedidos() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePedidos precisa estar dentro do PedidosProvider')
  return ctx
}
