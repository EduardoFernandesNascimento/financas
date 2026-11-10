// Conferência das telas no navegador (Playwright), com o app e o servidor-gastos ligados.
// Uso: node e2e/conferir.mjs [url do app] [--remover]
//   url padrão: http://localhost:5173
//   --remover   também remove um item de verdade no servidor (depois: parar o servidor e npm run reset)
// Erros de rede, 500, lista vazia e recusa do DELETE são simulados interceptando a requisição: não mexem nos dados.
// Saída: uma linha "ok" ou "FALHA" por verificação, com o [REQ-NNN], e um resumo "N ok, M falhas".
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const BASE = (args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173').replace(/\/$/, '')
const REMOVER = args.includes('--remover')

let ok = 0
let falhas = 0
async function conferir(nome, fn) {
  try {
    await fn()
    ok++
    console.log(`ok     ${nome}`)
  } catch (e) {
    falhas++
    console.log(`FALHA  ${nome}: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
  }
}
function exigir(cond, msg) {
  if (!cond) throw new Error(msg)
}
const normal = (s) => s.replace(/\s+/g, ' ').trim()
const reais = (s) => Number(normal(s).replace('R$', '').replace(/\./g, '').replace(',', '.').trim())

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const avisos = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') avisos.push(`${m.type()}: ${m.text()} @ ${m.location().url}`)
})
page.on('response', (r) => { if (r.status() >= 400) avisos.push(`http ${r.status()}: ${r.url()}`) })
const requisicoes = []
page.on('request', (r) => requisicoes.push(`${r.method()} ${r.url()}`))
page.on('pageerror', (e) => avisos.push(`pageerror: ${e.message}`))

const totaisDosCartoes = async () =>
  (await page.locator('.cartao-total').allTextContents()).map(reais)
const lojasDosCartoes = async () => page.locator('.cartao-loja').allTextContents()
const cartoes = async () =>
  page.locator('.cartao').evaluateAll((els) =>
    els.map((e) => ({
      loja: e.querySelector('.cartao-loja').textContent,
      data: e.querySelector('time').getAttribute('datetime'),
      total: e.querySelector('.cartao-total').textContent,
    })),
  )
const centavos = (v) => Math.round(v * 100)

const respostaLista = page.waitForResponse((r) => r.url().endsWith('/pedidos') && r.request().method() === 'GET')
await page.goto(`${BASE}/`)
const qtdServidor = (await (await respostaLista).json()).total
await page.locator('.cartao').first().waitFor()

await conferir('[REQ-019] cartão do pedido 1 (Mercado Central) mostra R$ 54,40', async () => {
  const cartao = page.locator('.cartao', { hasText: 'Mercado Central' })
  exigir(normal(await cartao.locator('.cartao-total').innerText()) === 'R$ 54,40', 'total diferente de R$ 54,40')
})

await conferir('[REQ-016] cartão mostra loja, data, número de itens e total', async () => {
  const texto = normal(await page.locator('.cartao', { hasText: 'Mercado Central' }).innerText())
  exigir(/Mercado Central/.test(texto) && /02\/11\/2026/.test(texto) && /2 itens/.test(texto), texto)
})

await conferir('[REQ-022] resumo do topo coerente com a lista (total, quantidade, maior)', async () => {
  const totais = await totaisDosCartoes()
  const dd = (await page.locator('.resumo dd').allTextContents()).map(normal)
  const soma = Math.round(totais.reduce((s, v) => s + v, 0) * 100) / 100
  exigir(reais(dd[0]) === soma, `total ${dd[0]} != soma ${soma}`)
  exigir(Number(dd[1]) === totais.length, `quantidade ${dd[1]} != ${totais.length}`)
  exigir(reais(dd[2]) === Math.max(...totais), `maior ${dd[2]}`)
})

const qtdTodos = (await totaisDosCartoes()).length
await conferir('[REQ-031] campos vazios mostram todos os pedidos do servidor', async () => {
  if (qtdServidor !== null) exigir(qtdTodos === qtdServidor, `${qtdTodos} cartões, servidor tem ${qtdServidor}`)
  exigir(qtdTodos > 0, 'nenhum cartão')
})

await conferir('[REQ-028] mínimo 100 mostra só pedidos >= R$ 100', async () => {
  await page.getByLabel('Mínimo (R$)').fill('100')
  const t = await totaisDosCartoes()
  exigir(t.length > 0 && t.every((v) => v >= 100), JSON.stringify(t))
})

await conferir('[REQ-032] resumo muda junto com o filtro (total, quantidade e maior dos filtrados)', async () => {
  const t = await totaisDosCartoes()
  exigir(t.length < qtdTodos, 'o filtro não reduziu a lista: o teste não diferencia')
  const dd = (await page.locator('.resumo dd').allTextContents()).map(normal)
  exigir(centavos(reais(dd[0])) === centavos(t.reduce((s, v) => s + v, 0)), `total ${dd[0]} != soma dos filtrados`)
  exigir(Number(dd[1]) === t.length, `quantidade ${dd[1]} != ${t.length}`)
  exigir(reais(dd[2]) === Math.max(...t), `maior ${dd[2]} != ${Math.max(...t)}`)
})

await conferir('[REQ-026][REQ-029] mínimo vazio e máximo 50 aplicam só o máximo', async () => {
  await page.getByLabel('Mínimo (R$)').fill('')
  await page.getByLabel('Máximo (R$)').fill('50')
  const t = await totaisDosCartoes()
  exigir(t.length > 0 && t.every((v) => v <= 50), JSON.stringify(t))
})

await conferir('[REQ-030] mínimo e máximo juntos', async () => {
  await page.getByLabel('Mínimo (R$)').fill('50')
  await page.getByLabel('Máximo (R$)').fill('300')
  const t = await totaisDosCartoes()
  exigir(t.every((v) => v >= 50 && v <= 300), JSON.stringify(t))
})

await conferir('[REQ-027][REQ-053] faixa sem resultado mostra a mensagem e Limpar volta tudo', async () => {
  await page.getByLabel('Mínimo (R$)').fill('100')
  await page.getByLabel('Máximo (R$)').fill('50')
  await page.getByText('Nenhum pedido nessa faixa').waitFor()
  await page.getByRole('button', { name: 'Limpar' }).click()
  exigir((await page.getByLabel('Mínimo (R$)').inputValue()) === '', 'mínimo não limpou')
  exigir((await totaisDosCartoes()).length === qtdTodos, 'lista não voltou inteira')
})

await conferir('[REQ-065] ordenar por valor (maior e menor primeiro) e voltar à ordem original', async () => {
  const antes = await lojasDosCartoes()
  await page.getByLabel('Ordenar por valor').selectOption('maior')
  const d = await totaisDosCartoes()
  exigir(d.every((v, i) => i === 0 || d[i - 1] >= v), `não decrescente ${d}`)
  await page.getByLabel('Ordenar por valor').selectOption('menor')
  const c = await totaisDosCartoes()
  exigir(c.every((v, i) => i === 0 || c[i - 1] <= v), `não crescente ${c}`)
  await page.getByLabel('Ordenar por valor').selectOption('nenhuma')
  const depois = await lojasDosCartoes()
  exigir(JSON.stringify(depois) === JSON.stringify(antes), 'a ordem original não voltou: o sort mutou o estado')
})

await conferir('[REQ-066][REQ-067] total por loja e gasto por data agrupam os cartões', async () => {
  const lista = await cartoes()
  const agrupar = (chave) =>
    lista.reduce((acc, c) => ({ ...acc, [c[chave]]: (acc[c[chave]] ?? 0) + centavos(reais(c.total)) }), {})
  const esperado = { loja: agrupar('loja'), data: agrupar('data') }
  exigir(Object.keys(esperado.loja).length < lista.length, 'nenhuma loja repetida: o agrupamento não é exercitado')
  const linhas = async (titulo, chave) =>
    page
      .locator('section', { has: page.getByRole('heading', { name: titulo }) })
      .locator('.linhas li')
      .evaluateAll(
        (els, k) =>
          els.map((li) => [
            k === 'data' ? li.querySelector('time').getAttribute('datetime') : li.querySelector('span').textContent,
            li.querySelector('.valor').textContent,
          ]),
        chave,
      )
  for (const [titulo, chave] of [['Total por loja', 'loja'], ['Gasto por data', 'data']]) {
    const obtido = await linhas(titulo, chave)
    const nomes = Object.keys(esperado[chave])
    exigir(obtido.length === nomes.length, `${titulo}: ${obtido.length} linhas, esperado ${nomes.length}`)
    for (const [nome, valor] of obtido) {
      exigir(esperado[chave][nome] === centavos(reais(valor)), `${titulo}: ${nome} = ${normal(valor)}, esperado ${esperado[chave][nome] / 100}`)
    }
  }
})

await conferir('[REQ-034][REQ-038] clicar no cartão abre /pedido/1 sem recarregar', async () => {
  await page.evaluate(() => (window.__semRecarregar = true))
  await page.locator('.cartao', { hasText: 'Mercado Central' }).getByRole('link').click()
  await page.waitForURL('**/pedido/1')
  exigir(await page.evaluate(() => window.__semRecarregar === true), 'a página recarregou')
})

await conferir('[REQ-043] detalhe de pedido que está na lista lê do Context, sem GET /pedidos/1', async () => {
  await page.locator('.item').first().waitFor()
  exigir(!requisicoes.some((r) => /\/pedidos\/1$/.test(r)), 'o detalhe buscou o pedido sozinho')
})

await conferir('[REQ-036] detalhe mostra itens com subtotal e total R$ 54,40', async () => {
  await page.locator('.item').nth(1).waitFor()
  const contas = (await page.locator('.item-conta').allTextContents()).map(normal)
  exigir(contas.length === 2, `${contas.length} itens`)
  exigir(contas.some((c) => c.endsWith('R$ 25,50')), `subtotal do feijão: ${contas}`)
  exigir(/R\$ 54,40/.test(normal(await page.locator('.total-pedido').innerText())), 'total do pedido')
  exigir((await page.getByRole('button', { name: /Remover/ }).count()) === 2, '[REQ-044] botão Remover por item')
})

await conferir('[REQ-039] F5 no detalhe continua mostrando o pedido', async () => {
  await page.reload()
  await page.getByRole('heading', { name: 'Mercado Central' }).waitFor()
})

await conferir('[REQ-037][REQ-040] Voltar leva a /', async () => {
  await page.getByRole('link', { name: 'Voltar' }).click()
  await page.waitForURL(`${BASE}/`)
})

await conferir('[REQ-041] /pedido/999 faz GET /pedidos/999 com 404 e mostra "Pedido não encontrado" com link de volta', async () => {
  const resposta = page.waitForResponse((r) => r.url().endsWith('/pedidos/999') && r.request().method() === 'GET')
  await page.goto(`${BASE}/pedido/999`)
  exigir((await resposta).status() === 404, 'o servidor não respondeu 404')
  await page.getByText('Pedido não encontrado').waitFor()
  exigir((await page.getByRole('link', { name: 'Voltar' }).getAttribute('href')) === '/', 'link de volta')
  // este 404 é o esperado (aba Network): sai da conta do [REQ-064]
  for (let i = avisos.length - 1; i >= 0; i--) if (avisos[i].includes('/pedidos/999')) avisos.splice(i, 1)
})

await conferir('[REQ-042] /xyz mostra "Página não encontrada"', async () => {
  await page.goto(`${BASE}/xyz`)
  await page.getByText('Página não encontrada').waitFor()
})

// daqui em diante os erros são simulados: as linhas de erro no console são de propósito
const desligarAvisos = avisos.length
await conferir('[REQ-045][REQ-052] servidor recusando o DELETE: mensagem na tela e item continua', async () => {
  await page.route('**/pedidos/*/itens/*', (r) =>
    r.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Item não encontrado"}' }),
  )
  await page.goto(`${BASE}/pedido/1`)
  await page.getByRole('button', { name: 'Remover Arroz 5 kg' }).click()
  await page.getByRole('alert').getByText('Erro 404 ao remover o item').waitFor()
  exigir((await page.locator('.item').count()) === 2, 'item sumiu da tela')
  await page.unroute('**/pedidos/*/itens/*')
})

await conferir('[REQ-054] rede lenta mostra "Carregando…" e depois a lista', async () => {
  await page.route('**/pedidos', async (r) => {
    await new Promise((ok) => setTimeout(ok, 1500))
    await r.continue()
  })
  await page.goto(`${BASE}/`)
  await page.getByText('Carregando…').waitFor({ timeout: 1000 })
  await page.locator('.cartao').first().waitFor()
  await page.unroute('**/pedidos')
})

await conferir('[REQ-055][REQ-057] servidor fora: mensagem de erro e Tentar de novo traz a lista', async () => {
  await page.route('**/pedidos', (r) => r.abort('connectionrefused'))
  await page.goto(`${BASE}/`)
  await page.getByRole('alert').getByText('Não foi possível falar com o servidor', { exact: false }).waitFor()
  await page.unroute('**/pedidos')
  await page.getByRole('button', { name: 'Tentar de novo' }).click()
  await page.locator('.cartao').first().waitFor()
})

await conferir('[REQ-056] 404 e 500 do servidor: a mensagem cita o status', async () => {
  for (const status of [404, 500]) {
    await page.route('**/pedidos', (r) =>
      r.fulfill({ status, contentType: 'application/json', body: '{"message":"Falha"}' }),
    )
    await page.goto(`${BASE}/`)
    await page.getByRole('alert').getByText(`Erro ${status} ao carregar os pedidos`).waitFor()
    await page.unroute('**/pedidos')
  }
})

await conferir('[REQ-059] lista vazia mostra "Nenhum pedido neste mês"', async () => {
  await page.route('**/pedidos', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"pedidos":[],"total":0}' }),
  )
  await page.goto(`${BASE}/`)
  await page.getByText('Nenhum pedido neste mês').waitFor()
  await page.unroute('**/pedidos')
})
await conferir('[REQ-029] filtro compara em centavos: 1,10 × 3 aparece com máximo 3,30', async () => {
  const lista = [
    { id: 1, loja: 'Teste centavos', data: '2026-11-05', itens: [{ id: 1, titulo: 'Bala', preco: 1.1, quantidade: 3 }] },
    { id: 2, loja: 'Teste acima', data: '2026-11-06', itens: [{ id: 1, titulo: 'Chiclete', preco: 3.31, quantidade: 1 }] },
  ]
  await page.route('**/pedidos', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pedidos: lista, total: 2 }) }),
  )
  await page.goto(`${BASE}/`)
  await page.locator('.cartao').first().waitFor()
  await page.getByLabel('Máximo (R$)').fill('3.30')
  const comMaximo = await lojasDosCartoes()
  exigir(JSON.stringify(comMaximo) === '["Teste centavos"]', `com máximo 3,30: ${comMaximo}`)
  await page.getByLabel('Máximo (R$)').fill('')
  await page.getByLabel('Mínimo (R$)').fill('3.30')
  exigir((await lojasDosCartoes()).length === 2, 'com mínimo 3,30 o pedido de R$ 3,30 sumiu')
  await page.unroute('**/pedidos')
})
// os erros simulados acima geram linhas de erro de rede no console de propósito
avisos.splice(desligarAvisos)

// ---------- celular: 375 px ----------
await page.setViewportSize({ width: 375, height: 800 })
const semRolagem = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

await conferir('[REQ-060][REQ-061][REQ-062] 375 px: sem rolagem lateral, cartões e filtro empilhados', async () => {
  await page.goto(`${BASE}/`)
  await page.locator('.cartao').first().waitFor()
  exigir(await semRolagem(), 'rolagem lateral no painel')
  const xs = await page.locator('.cartao').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
  exigir(new Set(xs).size === 1, `cartões em mais de uma coluna: ${xs}`)
  const a = await page.getByLabel('Mínimo (R$)').boundingBox()
  const b = await page.getByLabel('Máximo (R$)').boundingBox()
  exigir(b.y >= a.y + a.height, 'campos do filtro lado a lado')
  await page.getByLabel('Máximo (R$)').fill('80')
  exigir((await page.getByLabel('Máximo (R$)').inputValue()) === '80', 'não aceita digitação')
})

await conferir('[REQ-060][REQ-063] 375 px no detalhe: sem rolagem e Remover com 44 px ou mais', async () => {
  await page.goto(`${BASE}/pedido/1`)
  await page.locator('.item').first().waitFor()
  exigir(await semRolagem(), 'rolagem lateral no detalhe')
  const caixa = await page.getByRole('button', { name: /Remover/ }).first().boundingBox()
  exigir(caixa.height >= 44 && caixa.width >= 44, `Remover ${caixa.width}x${caixa.height}`)
})

if (REMOVER) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await conferir('[REQ-048][REQ-049][REQ-050] remover item atualiza totais, persiste no F5 e pedido vazio some', async () => {
    await page.goto(`${BASE}/pedido/1`)
    await page.locator('.item').first().waitFor()
    await page.getByRole('button', { name: 'Remover Feijão 1 kg' }).click()
    await page.locator('.item').nth(1).waitFor({ state: 'detached' })
    exigir(/R\$ 28,90/.test(normal(await page.locator('.total-pedido').innerText())), 'total do detalhe não recalculou')
    await page.reload()
    await page.locator('.item').first().waitFor()
    exigir((await page.locator('.item').count()) === 1, 'item voltou depois do F5')
    await page.getByRole('link', { name: 'Voltar' }).click()
    const cartao = page.locator('.cartao', { hasText: 'Mercado Central' })
    exigir(normal(await cartao.locator('.cartao-total').innerText()) === 'R$ 28,90', 'painel não recalculou')
    await cartao.getByRole('link').click()
    await page.getByRole('button', { name: 'Remover Arroz 5 kg' }).click()
    await page.waitForURL(`${BASE}/`)
    await page.locator('.cartao').first().waitFor()
    exigir((await page.locator('.cartao', { hasText: 'Mercado Central' }).count()) === 0, 'pedido vazio continua na lista')
  })
}

await conferir('[REQ-064] console sem erro nem aviso de key', async () => {
  exigir(avisos.length === 0, avisos.join(' | '))
})

await browser.close()
console.log(`${ok} ok, ${falhas} falhas`)
process.exit(falhas ? 1 : 0)
