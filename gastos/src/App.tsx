import { Link, Route, Routes } from 'react-router-dom'
import Cabecalho from './components/Cabecalho'
import Painel from './pages/Painel'
import Pedido from './pages/Pedido'

function NaoEncontrada() {
  return (
    <main className="pagina">
      <div className="aviso aviso-vazio">
        <h1>Página não encontrada</h1>
        <Link to="/" className="voltar">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M10 3L5 8l5 5" />
          </svg>
          Voltar
        </Link>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <>
      <Cabecalho />
      <Routes>
        <Route path="/" element={<Painel />} />
        <Route path="/pedido/:id" element={<Pedido />} />
        <Route path="*" element={<NaoEncontrada />} />
      </Routes>
    </>
  )
}
