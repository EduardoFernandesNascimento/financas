# Painel de gastos do mês

Prática de revisão da P2 (Lab Front, aula 12, 10/11/2026). O app lista os pedidos do mês com o total de cada um (calculado no app: soma de preço × quantidade), mostra o total do mês, a quantidade de pedidos e o maior pedido, filtra por faixa de valor, abre o detalhe de cada pedido e remove itens gravando no servidor.

Também tem os extras: ordenar por valor, total por loja e gasto por data.

## Dupla

- Eduardo Fernandes
- Carlos Wagner

## Tecnologia

React + TypeScript + Vite, react-router-dom, `fetch` para falar com o servidor (sem Axios) e Context para o estado global.

## Como rodar

São dois terminais: um para o servidor, outro para o app.

### 1. Servidor (pasta `servidor-gastos`, ao lado de `gastos`)

```bash
cd servidor-gastos
npm install
npm start          # http://localhost:3334
```

Para voltar os dados ao início: pare o servidor (Ctrl+C) e rode `npm run reset`.

### 2. App

Crie o arquivo `gastos/.env` (ao lado do `package.json`) com esta linha:

```
VITE_API_URL=http://localhost:3334
```

Depois:

```bash
cd gastos
npm install
npm run dev        # http://localhost:5173
```

Reinicie o `npm run dev` sempre que criar ou mudar o `.env`.

### Outros comandos

| Comando | O que faz |
| :--- | :--- |
| `npm run build` | confere os tipos e gera a versão de produção em `dist/` |
| `npm run lint` | lint com oxlint |
| `npm run e2e` | confere as telas no navegador (Playwright), com o app e o servidor ligados; `npm run e2e -- --remover` também remove itens de verdade (depois rode `npm run reset` no servidor) |

## Telas

| Rota | Tela |
| :--- | :--- |
| `/` | Painel: resumo do mês, filtro por faixa, lista de pedidos, total por loja e gasto por data |
| `/pedido/:id` | Detalhe: itens com preço, quantidade e subtotal, total do pedido e botão Remover em cada item |
| qualquer outra | Página não encontrada |

Estados tratados: "Carregando…", erro com a mensagem e o botão "Tentar de novo", "Nenhum pedido neste mês" (lista vazia), "Nenhum pedido nessa faixa" (filtro sem resultado) e "Pedido não encontrado".

## Pastas

```
src/
  types.ts                    Item e Pedido
  services/pedidos.ts         buscarPedidos, buscarPedido, excluirItem (fetch)
  contexts/PedidosContext.tsx PedidosProvider e usePedidos (busca, carregando, erro, removerItem)
  pages/Painel.tsx            painel do mês
  pages/Pedido.tsx            detalhe do pedido
  components/PedidoCard.tsx   cartão de um pedido
  components/Filtro.tsx       campos mínimo e máximo
  utils/dinheiro.ts           formatação em R$ e da data
  utils/total.ts              totais com reduce, filtro por faixa, total por loja e por data
  App.tsx                     rotas
  main.tsx                    BrowserRouter e PedidosProvider
```
