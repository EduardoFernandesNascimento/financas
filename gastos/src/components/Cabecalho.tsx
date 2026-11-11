import { usePedidos } from '../contexts/PedidosContext'
import { mesBR, mesesBR } from '../utils/dinheiro'

// Identidade do app: nome "Finanças" e o período dos pedidos exibidos.
// Todos do mesmo mês: "novembro de 2026". Meses diferentes: "outubro – novembro de 2026",
// porque o painel soma todos os pedidos da lista, de qualquer mês.
export default function Cabecalho() {
  const { pedidos } = usePedidos()
  const datas = pedidos.map((p) => p.data).sort()
  const inicio = datas[0]?.slice(0, 7)
  const fim = datas.at(-1)?.slice(0, 7)

  return (
    <header className="topo">
      <div className="topo-conteudo">
        <p className="marca">
          <svg className="marca-icone" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
            <rect width="32" height="32" rx="8" />
            <path d="M8 22l6-6 4 4 7-8" />
          </svg>
          <span>Finanças</span>
        </p>
        {inicio && fim && (
          <p className="topo-mes">
            <span className="topo-mes-rotulo">{inicio === fim ? 'Mês de referência' : 'Período'}</span>{' '}
            {inicio === fim ? (
              <time dateTime={fim}>{mesBR(`${fim}-01`)}</time>
            ) : (
              <>
                <time dateTime={inicio}>{mesesBR(`${inicio}-01`, `${fim}-01`)[0]}</time>
                {' – '}
                <time dateTime={fim}>{mesesBR(`${inicio}-01`, `${fim}-01`)[1]}</time>
              </>
            )}
          </p>
        )}
      </div>
    </header>
  )
}
