export const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// '2026-11-02' -> '02/11/2026' sem passar por Date (evita o fuso trocar o dia)
export const dataBR = (data: string) => data.split('-').reverse().join('/')
