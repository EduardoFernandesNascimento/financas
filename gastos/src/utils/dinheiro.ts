export const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// '2026-11-02' -> '02/11/2026' sem passar por Date (evita o fuso trocar o dia)
export const dataBR = (data: string) => data.split('-').reverse().join('/')

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

// '2026-11-02' -> 'novembro de 2026' (também sem Date, pelo mesmo motivo)
export function mesBR(data: string) {
  const [ano, mes] = data.split('-')
  return `${MESES[Number(mes) - 1]} de ${ano}`
}

// intervalo de meses, em duas partes para a tela juntar com ' – ':
// ['outubro', 'novembro de 2026']; anos diferentes: ['dezembro de 2025', 'janeiro de 2026']
export function mesesBR(inicio: string, fim: string) {
  const [anoA, mesA] = inicio.split('-')
  const [anoB] = fim.split('-')
  return [anoA === anoB ? MESES[Number(mesA) - 1] : mesBR(inicio), mesBR(fim)] as const
}

// 0.234 -> '23%'
export const porcentagem = (fracao: number) =>
  fracao.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 0 })
