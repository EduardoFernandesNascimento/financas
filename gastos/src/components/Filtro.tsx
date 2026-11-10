type FiltroProps = {
  minimo: string
  maximo: string
  setMinimo: (valor: string) => void
  setMaximo: (valor: string) => void
  onLimpar: () => void
}

// Inputs controlados: o estado mora no Painel e chega por props.
export default function Filtro({ minimo, maximo, setMinimo, setMaximo, onLimpar }: FiltroProps) {
  return (
    <form className="filtro" role="search" aria-label="Filtrar por faixa de valor" onSubmit={(e) => e.preventDefault()}>
      <div className="campo">
        <label htmlFor="filtro-minimo">Mínimo (R$)</label>
        <input
          id="filtro-minimo"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="sem limite"
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
        />
      </div>
      <div className="campo">
        <label htmlFor="filtro-maximo">Máximo (R$)</label>
        <input
          id="filtro-maximo"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="sem limite"
          value={maximo}
          onChange={(e) => setMaximo(e.target.value)}
        />
      </div>
      <button type="button" className="botao botao-secundario" onClick={onLimpar}>
        Limpar
      </button>
    </form>
  )
}
