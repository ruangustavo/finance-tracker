# CONTEXT — Glossário do domínio

> Linguagem ubíqua do sistema de controle financeiro pessoal.
> Só termos de domínio. Sem detalhes de implementação.
> **As definições ficam em português (idioma do domínio); o código usa os nomes em inglês
> da tabela abaixo.** Este arquivo é a ponte entre os dois.

_Última atualização: 2026-06-06_

---

## Mapa PT ⇄ código (EN)

| PT (domínio) | Código (EN) |
|---|---|
| Lançamento | `Entry` |
| Entrada · Saída · Transferência | `Income` · `Expense` · `Transfer` |
| Tipo de Movimento | `EntryType` = `income \| expense \| transfer` |
| Natureza | `Nature` = `recurring \| variable` |
| Recorrente contínua · parcelada | `recurring` + `openEnded` · `installment` |
| Compra Parcelada | `InstallmentPurchase` (gera `Installment`) |
| Meio de Pagamento | `PaymentMethod` = `account \| creditCard` |
| Conta Corrente · Cartão de Crédito | `CheckingAccount` · `CreditCard` (`closingDay`/`dueDay`) |
| Fatura | `Statement` |
| Categoria | `Category` |
| Saldo · Âncora | `Balance` · `BalanceAnchor` |
| Ciclo de Pagamento | `PayCycle` (`anchorDay`) |
| Verba Diária | `DailyBudget` |
| Ritmo de Gastos | `SpendingPace` |
| Cores / Status | `BalanceStatus` = `healthy \| comfortable \| tight \| negative \| critical` |
| Fechamento do Ciclo · Projeção Rolante | `CycleClose` · `RollingProjection` |
| Simulação de Compra | `AffordabilityCheck` |

---

## Lançamento

A entidade central. Um evento ou compromisso financeiro registrado no sistema.
Todo lançamento tem uma **Direção** e uma **Natureza** — esses dois eixos, e não os
"baldes" da planilha antiga, são o que define o comportamento na projeção.

## Tipo de Movimento

O que o lançamento faz com o dinheiro. Três valores:

- **Entrada** — dinheiro entra na vida financeira (+).
- **Saída** — dinheiro sai pra fora (−). É **gasto**.
- **Transferência** — dinheiro se move **entre contas do próprio usuário** (ex.: investir
  no dia 5). Reduz o Saldo gastável da origem, mas **não é gasto nem receita** — nunca
  aparece em "pra onde vai meu dinheiro".

## Natureza

A previsibilidade do lançamento. É o eixo que a projeção usa:

- **Recorrente** — repete por uma regra, com valor e data conhecidos. No futuro é
  **determinístico**: o sistema sabe que vai acontecer. Pode ser:
  - **Contínua** — sem fim previsto (salário, aluguel). Repete até ser cancelada.
  - **Parcelada** — número fixo de ocorrências (compra em 12x). Tem começo e fim.
- **Variável** — evento pontual, com data e categoria próprias (mercado, corte de cabelo,
  freelance). No futuro é **projetado** (ver Verba Diária / Ritmo de Gastos).

> Os dois eixos são ortogonais. Ex.: salário = Entrada+Recorrente; aluguel =
> Saída+Recorrente; mercado = Saída+Variável; freelance = Entrada+Variável.

## Entrada

Lançamento de direção +. Pode ser Recorrente (salário) ou Variável (freelance, venda).

## Saída

Lançamento de direção −. Pode ser Recorrente (aluguel, parcela) ou Variável
(mercado, lazer, cuidados pessoais).

## Transferência

Movimento de dinheiro entre contas do próprio usuário — não é gasto nem receita. Reduz o
Saldo da conta de origem. Caso principal: o **investimento** feito no recebimento (todo dia
5, uma Transferência Recorrente Contínua). No v1 o destino é **não-rastreado**: o sistema
sabe que saiu pra investir, mas não acompanha saldo investido nem rendimento.

## Meio de Pagamento

*Como* uma Saída foi paga — define **quando** ela bate no Saldo:

- **Conta** (débito/PIX) — bate no Saldo na própria data do lançamento.
- **Cartão de Crédito** — não bate na hora; entra numa Fatura e só bate no Saldo no
  vencimento dela.

## Cartão de Crédito

Um Meio de Pagamento que funciona como **sub-livro**: as compras nele não saem do Saldo
na hora — acumulam numa Fatura. Cada cartão tem um dia de **fechamento** e um de
**vencimento**. **Não é uma Saída** (a planilha antiga o tratava como saída fixa — era
um equívoco).

## Fatura

A **soma** das compras de um cartão num ciclo de fechamento. É *ela* que vira uma Saída
no Saldo, no dia do vencimento (regime de caixa). O valor é **derivado** das compras —
nunca digitado à mão. As compras individuais continuam visíveis por categoria.

## Categoria

A lente de "pra onde vai meu dinheiro". **Conjunto fechado** (categoria nova só nasce se o
usuário criar), **plana** (sem hierarquia no v1), **uma por Lançamento**. Ao registrar, a
IA é obrigada a **encaixar** numa categoria existente ou **perguntar** — nunca inventa, pra
não fragmentar o relatório ("mercado" vs "supermercado" vs "compras"). Lista inicial: a
definir pelo usuário (sementes possíveis: mercado, restaurante, transporte, lazer, saúde,
cuidados pessoais, assinaturas, moradia).

## Compra Parcelada

Uma compra registrada **uma única vez** que gera N ocorrências mensais (é uma Saída
Recorrente Parcelada). O usuário informa valor, número de vezes e início; o sistema
**expande** nas parcelas. Editar/cancelar afeta as parcelas **restantes**, não as já pagas.
Tem um Meio de Pagamento: se **Cartão**, cada parcela entra na Fatura; se **Conta**, bate
direto no Saldo na data (ex.: PIX mensal pra um familiar).

## Saldo

Quanto dinheiro o usuário tem disponível em sua **única conta corrente** (no v1 o sistema
enxerga só ela; cartões são sub-livros e investimentos são destino não-rastreado). É
**ancorado na realidade**: o usuário informa
o saldo atual (a **Âncora**), e o saldo futuro é projetado a partir dela. Quando a
realidade descola, o usuário **re-ancora** e o sistema se corrige. Não é um total
calculado cegamente desde um marco zero.

## Âncora (Saldo de Referência)

Um ponto de verdade datado: "no dia X eu tinha R$Y na conta". Toda projeção de saldo
parte da âncora mais recente. Serve pra absorver erro acumulado de lançamentos esquecidos.

## Ciclo (de Pagamento)

A unidade de tempo do sistema. Vai do dia do salário até a véspera do próximo — **não** é
o mês civil. Ancorado num **dia nominal fixo** (dia 5) pra dar estabilidade: mesmo que o
salário real caia dia 4 ou 6, a fronteira do ciclo não se move. É o Ciclo que define
"fechar o mês" e de onde saem as Cores.

## Horizontes

Duas visões distintas sobre a mesma linha do tempo:

- **Fechamento do Ciclo** — como *este* ciclo termina. Origem das Cores.
- **Projeção Rolante** — o Saldo projetado por vários ciclos à frente. É onde se responde
  "consigo comprar X?" como **simulação avulsa** (não uma meta persistida):
  - **à vista** — a primeira data em que o Saldo comporta pagar X sem cair de cor;
  - **parcelado** — se a parcela de X em N× cabe nos próximos ciclos sem entrar no vermelho.

> **Fora do v1:** metas acompanhadas (objetivos de poupança/compra com progresso salvo).
> "Comprar X" é só uma pergunta à projeção, não um objetivo que o sistema guarda e persegue.

## Verba Diária

A **meta** de gasto variável por dia que o usuário **define** (ex.: R$50/dia).
É normativa — serve de referência pra medir aderência. **Não é gasto real.**

> Termo: o usuário às vezes chama isso de "orçamento". O nome canônico é **Verba Diária**.
> A Verba é o **único orçamento** do v1 — tetos por categoria e acompanhamento formal de
> orçamento ficam **fora do v1**.

## Ritmo de Gastos

A **estimativa descritiva** de quanto o usuário está gastando de variável por dia,
**calculada a partir dos lançamentos variáveis reais**. Reflete a realidade, não a meta.
Cálculo **híbrido**: no início do ciclo ancora na média dos **ciclos anteriores** (pra não
oscilar com poucos dados) e migra pro comportamento **real do ciclo** conforme os dias
passam. É o Ritmo que projeta o variável dos dias futuros; os recorrentes futuros entram
determinísticos; a Verba fica como linha de referência.

> Verba e Ritmo respondem perguntas diferentes e coexistem:
> Verba = "estou seguindo meu plano?". Ritmo = "do jeito que vou, fecho o mês como?".

## Cores (Status do Saldo)

Faixas de cor aplicadas ao **Saldo projetado**. Na **curva diária**, cada dia recebe a cor
do seu saldo; o **verdict do ciclo** é a cor do saldo de *fechamento* (o ponto mais baixo,
véspera do próximo salário). Os limiares são **configuráveis** pelo usuário. Valores atuais:

- 🟢 **Folgado** — saldo > R$2.000
- 🟩 **Confortável** — R$1.000 a R$2.000
- 🟡 **Apertado** — R$0 a R$1.000
- 🔴 **No vermelho** — −R$500 a R$0
- 🟥 **Crítico** — ≤ −R$500

> A cor é função só do Saldo. O Ritmo de Gastos não pinta nada diretamente — ele **projeta
> a curva** do saldo futuro, e as faixas pintam essa curva.

---

## Termos da planilha antiga (referência)

- **"Diário"** → hoje é **Saída + Variável** (o gasto real) e a **Verba Diária** (a premissa).
  O termo único foi desmembrado porque misturava realidade e meta.
