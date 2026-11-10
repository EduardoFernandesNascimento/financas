import { Link, Route, Routes } from 'react-router-dom'
import Painel from './pages/Painel'
import Pedido from './pages/Pedido'

function NaoEncontrada() {
  return (
    <main className="pagina">
      <h1>Página não encontrada</h1>
      <Link to="/" className="voltar">
        Voltar
      </Link>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Painel />} />
      <Route path="/pedido/:id" element={<Pedido />} />
      <Route path="*" element={<NaoEncontrada />} />
    </Routes>
  )
}
