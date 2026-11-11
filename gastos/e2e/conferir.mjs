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
const corpoServidor = await (await respostaLista).json()
const qtdServidor = corpoServidor.total
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

// ---------- F-002: medidas de estilo no navegador ----------
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
// padrão SVG do fundo do body (data URI): cor da tinta e opacidade do <g> que agrupa toda a tinta
const padraoDoFundo = (pg) =>
  pg.evaluate(() => {
    const img = getComputedStyle(document.body).backgroundImage
    const svg = img.startsWith('url("data:image/svg+xml,') ? decodeURIComponent(img.slice(5, -2).replace(/^data:image\/svg\+xml,/, '')) : ''
    const tinta = svg.match(/stroke='(#[0-9a-fA-F]{6})'/)?.[1] ?? null
    const opacidades = [...svg.matchAll(/<g[^>]*\sopacity='([\d.]+)'/g)].map((m) => Number(m[1]))
    return { svg, tinta, opacidade: opacidades.length === 1 ? opacidades[0] : null, grupos: opacidades.length, anexo: getComputedStyle(document.body).backgroundAttachment }
  })
// contraste WCAG entre a cor do texto do elemento e o primeiro fundo opaco atrás dele.
// Se esse fundo é o do body, o texto está sobre o padrão: mede também contra o pior pixel do padrão
// (a tinta na opacidade do grupo sobre a cor do fundo) e fica com o menor dos dois.
const contrastes = (pg, seletores) =>
  pg.evaluate((sels) => {
    const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number)
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const razao = (x, y) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05)
    const img = getComputedStyle(document.body).backgroundImage
    const svg = img.startsWith('url("data:image/svg+xml,') ? decodeURIComponent(img.slice(5, -2).replace(/^data:image\/svg\+xml,/, '')) : ''
    const tinta = svg.match(/stroke='#([0-9a-fA-F]{6})'/)?.[1]
    const alfa = Number(svg.match(/<g[^>]*\sopacity='([\d.]+)'/)?.[1] ?? (svg ? 1 : 0))
    const fundo = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = rgb(getComputedStyle(e).backgroundColor)
        if (c.length === 3 || c[3] === 1) return { cor: c.slice(0, 3), sobrePadrao: e === document.body }
      }
      return { cor: rgb(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3), sobrePadrao: false }
    }
    return sels.flatMap((sel) =>
      [...document.querySelectorAll(sel)].slice(0, 3).map((el) => {
        const texto = rgb(getComputedStyle(el).color).slice(0, 3)
        const { cor, sobrePadrao } = fundo(el)
        let r = razao(texto, cor)
        if (sobrePadrao && svg) {
          const t = tinta ? [0, 2, 4].map((i) => parseInt(tinta.slice(i, i + 2), 16)) : [0, 0, 0]
          r = Math.min(r, razao(texto, t.map((v, i) => Math.round(v * alfa + cor[i] * (1 - alfa)))))
        }
        return { sel, razao: r, sobrePadrao }
      }),
    )
  }, seletores)
const SELETORES_TEXTO = ['h1', '.marca', '.topo-mes', '.resumo-item dt', '.resumo-item dd', '.cartao-loja', '.cartao-info', '.cartao-total', '.selo-alto', '.proporcao-texto', '.campo label', '.linhas li span', '.botao', '#titulo-pedidos', 'label[for="ordem"]']
const SELETORES_DETALHE = ['h1', '.detalhe-cabecalho .cartao-info', '.voltar', '.item-titulo', '.item-conta', '.item-conta strong', '.botao-perigo', '.total-pedido']
const exigirContraste = async (pg, rotulo, seletores = SELETORES_TEXTO) => {
  const medidos = await contrastes(pg, seletores)
  exigir(new Set(medidos.map((m) => m.sel)).size === seletores.length, `${rotulo}: seletor sem elemento medido`)
  const ruins = medidos.filter((m) => m.razao < 4.5)
  exigir(ruins.length === 0, `${rotulo}: ${ruins.map((m) => `${m.sel} ${m.razao.toFixed(2)}`).join(', ')}`)
  return medidos
}
// borda direita do valor rente à borda direita do conteúdo do contêiner (sem padding nem borda), tolerância de 2 px
const foraDaDireita = (pg, pares) =>
  pg.evaluate((lista) =>
    lista.flatMap(([valor, conteiner]) => {
      const els = [...document.querySelectorAll(valor)]
      if (els.length === 0) return [`${valor}: nenhum elemento`]
      return els.flatMap((el) => {
        const c = el.closest(conteiner)
        if (!c) return [`${valor}: sem ${conteiner}`]
        const cs = getComputedStyle(c)
        const limite = c.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
        // a borda do texto, não a da caixa: um bloco de largura total com o texto à esquerda não passa
        const faixa = document.createRange()
        faixa.selectNodeContents(el)
        const direita = faixa.getBoundingClientRect().right
        return Math.abs(limite - direita) <= 2 ? [] : [`${valor} "${el.textContent.trim()}" termina em ${direita.toFixed(1)}, contêiner em ${limite.toFixed(1)}`]
      })
    }),
  pares)
const fundoDoBody = (pg) => pg.evaluate(() => getComputedStyle(document.body).backgroundColor)

// texto esperado do período: um mês só ("novembro de 2026") ou o intervalo ("outubro – novembro de 2026")
const periodoEsperado = (pedidos) => {
  const datas = pedidos.map((p) => p.data).sort()
  const [anoA, mesA] = datas[0].split('-')
  const [anoB, mesB] = datas.at(-1).split('-')
  const fim = `${MESES[Number(mesB) - 1]} de ${anoB}`
  if (anoA === anoB && mesA === mesB) return { texto: fim, datetimes: [`${anoB}-${mesB}`] }
  const inicio = anoA === anoB ? MESES[Number(mesA) - 1] : `${MESES[Number(mesA) - 1]} de ${anoA}`
  return { texto: `${inicio} – ${fim}`, datetimes: [`${anoA}-${mesA}`, `${anoB}-${mesB}`] }
}
const conferirPeriodo = async (pedidos) => {
  const esperado = periodoEsperado(pedidos)
  const topo = normal(await page.locator('header').innerText())
  exigir(topo.includes('Finanças'), `cabeçalho sem "Finanças": ${topo}`)
  exigir(topo.includes(esperado.texto), `cabeçalho sem "${esperado.texto}": ${topo}`)
  const datetimes = await page.locator('header time').evaluateAll((els) => els.map((e) => e.getAttribute('datetime')))
  exigir(JSON.stringify(datetimes) === JSON.stringify(esperado.datetimes), `time ${datetimes}, esperado ${esperado.datetimes}`)
}
await conferir('[REQ-068] cabeçalho "Finanças" com o mês dos pedidos do servidor e título da aba', async () => {
  exigir((await page.title()) === 'Finanças · Painel de gastos', `título: ${await page.title()}`)
  await conferirPeriodo(corpoServidor.pedidos)
})

await conferir('[REQ-069] tokens de cor em :root e texto com contraste >= 4.5:1 no tema claro', async () => {
  const tokens = await page.evaluate(() =>
    ['--primaria', '--alerta', '--perigo', '--fundo', '--texto'].map((t) => getComputedStyle(document.documentElement).getPropertyValue(t).trim()),
  )
  exigir(tokens.every(Boolean), `tokens ausentes: ${tokens}`)
  exigir(!/rgba\(0, 0, 0, 0\)|transparent/.test(await fundoDoBody(page)), 'body sem fundo explícito')
  await exigirContraste(page, 'claro')
})

await conferir('[REQ-071] valores com tabular-nums e alinhados à direita (cartões, resumo, tabelas)', async () => {
  const estilos = await page.evaluate(() =>
    ['.cartao-total', '.resumo-item dd', '.linhas .valor'].map((sel) => {
      const cs = getComputedStyle(document.querySelector(sel))
      return { sel, num: cs.fontVariantNumeric, alin: cs.textAlign }
    }),
  )
  for (const e of estilos) exigir(e.num.includes('tabular-nums'), `${e.sel}: ${e.num}`)
  const fora = await foraDaDireita(page, [['.cartao-total', '.cartao-link'], ['.resumo-item dd', '.resumo-item'], ['.linhas .valor', 'li']])
  exigir(fora.length === 0, fora.slice(0, 3).join(' | '))
})

await conferir('[REQ-072][REQ-076] 1280 px: resumo em linha com o total em destaque, cartões em 2+ colunas, filtro em linha', async () => {
  const caixas = await page.locator('.resumo-item').evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect()
    return { top: Math.round(r.top), fonte: parseFloat(getComputedStyle(e.querySelector('dd')).fontSize) }
  }))
  exigir(caixas.length === 3 && new Set(caixas.map((c) => c.top)).size === 1, `resumo não está em linha: ${JSON.stringify(caixas)}`)
  exigir(caixas[0].fonte > caixas[1].fonte, 'total do mês sem destaque')
  const xs = await page.locator('.cartao').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
  exigir(new Set(xs).size >= 2, `cartões em uma coluna só: ${xs}`)
  const a = await page.getByLabel('Mínimo (R$)').boundingBox()
  const b = await page.getByLabel('Máximo (R$)').boundingBox()
  exigir(Math.round(a.y) === Math.round(b.y), 'filtro empilhado em tela larga')
})

await conferir('[REQ-073] pedido acima de R$ 300 tem a marca "alto"; os demais não', async () => {
  const lista = await page.locator('.cartao').evaluateAll((els) =>
    els.map((e) => ({ total: e.querySelector('.cartao-total').textContent, selo: e.querySelector('.selo-alto')?.textContent.trim() ?? null })),
  )
  const altos = lista.filter((c) => reais(c.total) > 300)
  exigir(altos.length > 0 && altos.length < lista.length, 'os dados não têm pedidos dos dois lados de R$ 300')
  for (const c of lista) {
    const esperado = reais(c.total) > 300 ? 'alto' : null
    exigir(c.selo === esperado, `${normal(c.total)}: selo ${c.selo}`)
  }
})

await conferir('[REQ-074] barra de proporção com texto "N% do total exibido" coerente com o total', async () => {
  const lista = await page.locator('.cartao').evaluateAll((els) =>
    els.map((e) => {
      const barra = e.querySelector('.proporcao-barra')
      return {
        total: e.querySelector('.cartao-total').textContent,
        texto: e.querySelector('.proporcao-texto')?.textContent ?? '',
        largura: barra ? barra.firstElementChild.getBoundingClientRect().width / barra.getBoundingClientRect().width : -1,
      }
    }),
  )
  const soma = lista.reduce((s, c) => s + reais(c.total), 0)
  for (const c of lista) {
    const m = normal(c.texto).match(/^(\d+)% do total exibido$/)
    exigir(m, `texto da proporção: "${c.texto}"`)
    const esperado = (reais(c.total) / soma) * 100
    exigir(Math.abs(Number(m[1]) - esperado) <= 1, `${normal(c.total)}: ${m[1]}% != ${esperado.toFixed(1)}%`)
    exigir(Math.abs(c.largura * 100 - esperado) <= 2, `barra ${(c.largura * 100).toFixed(1)}% != ${esperado.toFixed(1)}%`)
  }
})

await conferir('[REQ-078] filtro sem resultado tem visual próprio de vazio e mantém o texto', async () => {
  await page.getByLabel('Mínimo (R$)').fill('100000')
  const aviso = page.locator('.aviso-vazio', { hasText: 'Nenhum pedido nessa faixa' })
  await aviso.waitFor()
  exigir(normal(await aviso.innerText()) === 'Nenhum pedido nessa faixa', 'texto mudou')
  await page.getByRole('button', { name: 'Limpar' }).click()
  await page.locator('.cartao').first().waitFor()
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
await conferir('[REQ-078] carregando, erro e lista vazia com visual próprio e os textos da F-001', async () => {
  // o finally desfaz a interceptação e o viewport mesmo se algo falhar no meio: os testes seguintes não herdam o erro simulado
  try {
    await page.route('**/pedidos', async (r) => {
      await new Promise((ok) => setTimeout(ok, 1500))
      await r.fulfill({ status: 200, contentType: 'application/json', body: '{"pedidos":[],"total":0}' })
    })
    await page.goto(`${BASE}/`)
    const carregando = page.locator('.aviso-carregando')
    await carregando.waitFor({ timeout: 1000 })
    exigir(normal(await carregando.innerText()) === 'Carregando…', 'texto do carregando')
    const vazio = page.locator('.aviso-vazio', { hasText: 'Nenhum pedido neste mês' })
    await vazio.waitFor()
    exigir(normal(await vazio.innerText()) === 'Nenhum pedido neste mês', 'texto do vazio')
    await page.unroute('**/pedidos')
    await page.route('**/pedidos', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Falha"}' }))
    await page.goto(`${BASE}/`)
    const erro = page.locator('.aviso-erro[role="alert"]')
    await erro.getByText('Erro 500 ao carregar os pedidos').waitFor()
    const cores = await erro.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(document.body).backgroundColor])
    exigir(cores[0] !== cores[1], 'erro sem fundo próprio')
    await page.setViewportSize({ width: 375, height: 800 })
    const caixa = await page.getByRole('button', { name: 'Tentar de novo' }).boundingBox()
    exigir(caixa.width >= 44 && caixa.height >= 44, `[REQ-077] Tentar de novo ${caixa.width}x${caixa.height}`)
  } finally {
    await page.unroute('**/pedidos')
    await page.setViewportSize({ width: 1280, height: 900 })
  }
})
await conferir('[REQ-068] pedidos de meses diferentes: o cabeçalho mostra o intervalo "outubro – novembro de 2026"', async () => {
  const lista = [
    { id: 1, loja: 'Teste outubro', data: '2026-10-30', itens: [{ id: 1, titulo: 'A', preco: 10, quantidade: 1 }] },
    { id: 2, loja: 'Teste novembro', data: '2026-11-02', itens: [{ id: 1, titulo: 'B', preco: 20, quantidade: 1 }] },
  ]
  await page.route('**/pedidos', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pedidos: lista, total: 2 }) }),
  )
  try {
    await page.goto(`${BASE}/`)
    await page.locator('.cartao').first().waitFor()
    exigir(periodoEsperado(lista).texto === 'outubro – novembro de 2026', 'texto esperado do teste')
    await conferirPeriodo(lista)
    exigir(!normal(await page.locator('header').innerText()).includes('Mês de referência'), 'intervalo rotulado como mês único')
  } finally {
    await page.unroute('**/pedidos')
  }
})

await conferir('[REQ-073] marca "alto" em centavos: R$ 300,00 (300,004) sem marca, R$ 300,01 com marca', async () => {
  const lista = [
    { id: 1, loja: 'No limite', data: '2026-11-05', itens: [{ id: 1, titulo: 'A', preco: 300.004, quantidade: 1 }] },
    { id: 2, loja: 'Acima', data: '2026-11-06', itens: [{ id: 1, titulo: 'B', preco: 300.01, quantidade: 1 }] },
  ]
  await page.route('**/pedidos', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pedidos: lista, total: 2 }) }),
  )
  try {
    await page.goto(`${BASE}/`)
    await page.locator('.cartao').first().waitFor()
    const limite = page.locator('.cartao', { hasText: 'No limite' })
    exigir(normal(await limite.locator('.cartao-total').innerText()) === 'R$ 300,00', 'total do limite')
    exigir((await limite.locator('.selo-alto').count()) === 0, 'R$ 300,00 com a marca "alto"')
    exigir((await page.locator('.cartao', { hasText: 'Acima' }).locator('.selo-alto').count()) === 1, 'R$ 300,01 sem a marca')
  } finally {
    await page.unroute('**/pedidos')
  }
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

await conferir('[REQ-072] 375 px: cartões do resumo empilhados', async () => {
  await page.goto(`${BASE}/`)
  await page.locator('.cartao').first().waitFor()
  const tops = await page.locator('.resumo-item').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  exigir(tops.length === 3 && tops[0] < tops[1] && tops[1] < tops[2], `resumo não empilhado: ${tops}`)
})

const alvosPequenos = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('a, button, input, select')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ nome: e.textContent.trim() || e.id || e.tagName, r: e.getBoundingClientRect() }))
      .filter((a) => a.r.width < 24 || a.r.height < 24)
      .map((a) => `${a.nome} ${Math.round(a.r.width)}x${Math.round(a.r.height)}`),
  )
await conferir('[REQ-077] 375 px: Limpar, cartões, Voltar e Remover com 44 px ou mais; nenhum alvo < 24 px', async () => {
  const grande = (c, nome) => exigir(c && c.width >= 44 && c.height >= 44, `${nome} ${c?.width}x${c?.height}`)
  grande(await page.getByRole('button', { name: 'Limpar' }).boundingBox(), 'Limpar')
  const links = await page.locator('.cartao-link').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
  exigir(links.length > 0, 'nenhum cartão')
  for (const c of links) grande(c, 'cartão')
  const pequenosPainel = await alvosPequenos()
  exigir(pequenosPainel.length === 0, `painel: ${pequenosPainel}`)
  await page.goto(`${BASE}/pedido/1`)
  await page.locator('.item').first().waitFor()
  grande(await page.getByRole('link', { name: 'Voltar' }).boundingBox(), 'Voltar')
  const botoes = await page.getByRole('button', { name: /Remover/ }).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
  exigir(botoes.length > 0, 'nenhum Remover')
  for (const c of botoes) grande(c, 'Remover')
  const pequenosDetalhe = await alvosPequenos()
  exigir(pequenosDetalhe.length === 0, `detalhe: ${pequenosDetalhe}`)
})

await conferir('[REQ-071] detalhe: subtotais e total com tabular-nums, alinhados à direita', async () => {
  const estilos = await page.evaluate(() =>
    ['.item-conta', '.total-pedido'].map((sel) => {
      const cs = getComputedStyle(document.querySelector(sel))
      return { sel, num: cs.fontVariantNumeric, alin: cs.textAlign }
    }),
  )
  for (const e of estilos) exigir(e.num.includes('tabular-nums'), `${e.sel}: ${e.num}`)
  const fora = await foraDaDireita(page, [['.item-conta strong', '.item-texto'], ['.total-pedido strong', '.total-pedido']])
  exigir(fora.length === 0, fora.slice(0, 3).join(' | '))
})

await conferir('[REQ-075] sem rolagem lateral em 320, 360, 375, 768 e 1280 px (/, /pedido/1, /pedido/999)', async () => {
  const problemas = []
  for (const largura of [320, 360, 375, 768, 1280]) {
    await page.setViewportSize({ width: largura, height: 800 })
    for (const [rota, pronto] of [['/', page.locator('.cartao').first()], ['/pedido/1', page.locator('.item').first()], ['/pedido/999', page.getByText('Pedido não encontrado')]]) {
      await page.goto(`${BASE}${rota}`)
      await pronto.waitFor()
      if (!(await semRolagem())) problemas.push(`${rota} em ${largura}`)
    }
  }
  // o 404 de /pedidos/999 é o esperado (ver [REQ-041])
  for (let i = avisos.length - 1; i >= 0; i--) if (avisos[i].includes('/pedidos/999')) avisos.splice(i, 1)
  exigir(problemas.length === 0, problemas.join(', '))
})

await conferir('[REQ-079] foco visível (contorno) em campos, botões e links navegando com Tab', async () => {
  const ctxTeclado = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const pg = await ctxTeclado.newPage()
  const percorrer = async (vezes) => {
    const vistos = []
    for (let i = 0; i < vezes; i++) {
      await pg.keyboard.press('Tab')
      vistos.push(await pg.evaluate(() => {
        const e = document.activeElement
        const cs = getComputedStyle(e)
        return { tag: e.tagName, contorno: cs.outlineStyle, largura: parseFloat(cs.outlineWidth) }
      }))
    }
    return vistos.filter((v) => v.tag !== 'BODY')
  }
  await pg.goto(`${BASE}/`)
  await pg.locator('.cartao').first().waitFor()
  const painel = await percorrer(6)
  await pg.goto(`${BASE}/pedido/1`)
  await pg.locator('.item').first().waitFor()
  const detalhe = await percorrer(3)
  await ctxTeclado.close()
  const todos = [...painel, ...detalhe]
  for (const tag of ['INPUT', 'BUTTON', 'SELECT', 'A']) exigir(todos.some((v) => v.tag === tag), `Tab não chegou a ${tag}`)
  const sem = todos.filter((v) => v.contorno === 'none' || v.largura < 2)
  exigir(sem.length === 0, `sem contorno: ${JSON.stringify(sem)}`)
})

await conferir('[REQ-070] tema escuro (prefers-color-scheme: dark): fundo do body muda e o contraste continua >= 4.5:1', async () => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${BASE}/`)
  await page.locator('.cartao').first().waitFor()
  await page.emulateMedia({ colorScheme: 'light' })
  const claro = await fundoDoBody(page)
  // recarrega já no escuro: medir logo depois da troca pegaria as transições de cor no meio
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await page.locator('.cartao').first().waitFor()
  const escuro = await fundoDoBody(page)
  exigir(escuro !== claro && !/rgba\(0, 0, 0, 0\)/.test(escuro), `fundo claro ${claro}, escuro ${escuro}`)
  await exigirContraste(page, 'escuro')
  await page.emulateMedia({ colorScheme: 'light' })
})

await conferir('[REQ-082] fundo com padrão SVG nos dois temas, superfícies opacas e texto >= 4.5:1 (inclusive sobre o padrão)', async () => {
  const padroes = {}
  for (const tema of ['light', 'dark']) {
    const ctxTema = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: tema, reducedMotion: 'reduce' })
    const pg = await ctxTema.newPage()
    try {
      await pg.goto(`${BASE}/`)
      await pg.locator('.cartao').first().waitFor()
      const p = await padraoDoFundo(pg)
      exigir(p.svg.includes('<svg'), `${tema}: body sem padrão SVG em data URI`)
      exigir(p.tinta && p.grupos === 1 && p.opacidade > 0 && p.opacidade <= 0.15, `${tema}: tinta ${p.tinta}, ${p.grupos} grupo(s) com opacidade ${p.opacidade}`)
      exigir(p.anexo !== 'fixed', `${tema}: background-attachment fixed`)
      padroes[tema] = p.svg
      const transparentes = await pg.evaluate(() =>
        [...document.querySelectorAll('.resumo-item, .filtro, .cartao, .tabela-bloco, header')]
          .filter((e) => {
            const c = (getComputedStyle(e).backgroundColor.match(/[\d.]+/g) || []).map(Number)
            return !(c.length === 3 || c[3] === 1)
          })
          .map((e) => e.className || e.tagName),
      )
      exigir(transparentes.length === 0, `${tema}: superfície sem fundo opaco: ${transparentes}`)
      const medidos = await exigirContraste(pg, `${tema} painel`)
      exigir(medidos.some((m) => m.sobrePadrao), `${tema}: nenhum texto medido sobre o padrão: o teste não diferencia`)
      await pg.getByRole('button', { name: 'Limpar' }).click()
      await pg.getByLabel('Mínimo (R$)').fill('100000')
      await pg.locator('.aviso-vazio').waitFor()
      await exigirContraste(pg, `${tema} vazio`, ['.aviso-vazio'])
      await pg.goto(`${BASE}/pedido/1`)
      await pg.locator('.item').first().waitFor()
      await exigirContraste(pg, `${tema} detalhe`, SELETORES_DETALHE)
      await pg.goto(`${BASE}/xyz`)
      await pg.getByText('Página não encontrada').waitFor()
      await exigirContraste(pg, `${tema} não encontrada`, ['h1', '.voltar'])
    } finally {
      await ctxTema.close()
    }
  }
  exigir(padroes.light !== padroes.dark, 'o padrão do fundo não muda no tema escuro')
})

await conferir('[REQ-080] transições só sem prefers-reduced-motion e :hover só dentro de (hover: hover) and (pointer: fine)', async () => {
  const duracao = () => page.locator('.cartao').first().evaluate((e) => getComputedStyle(e).transitionDuration)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const com = await duracao()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const sem = await duracao()
  await page.emulateMedia({ reducedMotion: null })
  exigir(com.split(',').some((d) => parseFloat(d) > 0), `sem transição nenhuma: ${com}`)
  exigir(sem.split(',').every((d) => parseFloat(d) === 0), `transição com reduce: ${sem}`)
  const regras = await page.evaluate(() => {
    const fora = []
    let total = 0
    const visitar = (lista, dentroHover) => {
      for (const r of lista) {
        if (r instanceof CSSMediaRule) visitar(r.cssRules, dentroHover || (/hover:\s*hover/.test(r.conditionText) && /pointer:\s*fine/.test(r.conditionText)))
        else if (r instanceof CSSStyleRule && r.selectorText.includes(':hover')) {
          total++
          if (!dentroHover) fora.push(r.selectorText)
        }
      }
    }
    for (const folha of document.styleSheets) visitar(folha.cssRules, false)
    return { fora, total }
  })
  exigir(regras.total > 0, 'nenhuma regra :hover encontrada: o teste não diferencia')
  exigir(regras.fora.length === 0, `:hover fora da media query: ${regras.fora}`)
})

await conferir('[REQ-080] 360 px com toque: chega ao detalhe e ao Remover só com toques', async () => {
  const ctxToque = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })
  const pg = await ctxToque.newPage()
  await pg.goto(`${BASE}/`)
  await pg.locator('.cartao', { hasText: 'Mercado Central' }).getByRole('link').tap()
  await pg.waitForURL('**/pedido/1')
  const remover = pg.getByRole('button', { name: /Remover/ }).first()
  await remover.scrollIntoViewIfNeeded()
  exigir(await remover.isVisible(), 'Remover não aparece sem hover')
  await pg.getByRole('link', { name: 'Voltar' }).tap()
  await pg.waitForURL(`${BASE}/`)
  await ctxToque.close()
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
