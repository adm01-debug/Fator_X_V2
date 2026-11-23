# 00 — RESUMO PARA O DONO

**Auditoria de QA do Fator X V2 — 2026-11-23 · código auditado: commit `d912348`**

Escrito sem jargão. Os detalhes técnicos, com a linha de código de cada afirmação, estão nos outros quatro
arquivos desta pasta.

---

## O estado geral, em três parágrafos

**A engenharia deste sistema é boa. A operação dele é que está aberta.** Os 6.226 testes passam, o código
compila sem um único erro de tipo, o lint não acusa nada e o build sai limpo — rodei os quatro nesta sessão.
Não é um sistema malfeito.

**O problema é outro, e é de um tipo específico: em dez lugares diferentes, o sistema tem um controle de
segurança ou de qualidade que está configurado, aparece verde no painel, e não faz efeito nenhum.** Um
cadeado pendurado na porta, sem estar trancado. A análise de segurança de código rodou 830 vezes e joga o
resultado no lixo. O teste que detecta mudança indevida na tela fotografa a tela e compara com a foto que
acabou de tirar. O teste que verifica se um cliente consegue ver os dados de outro cliente está escrito,
passa, e nunca executou nada. O deploy desliga a verificação de login de todas as 89 funções do servidor,
enquanto um arquivo de controle diz que 80 estão protegidas — e o CI confere esse arquivo contra outro
arquivo, nunca contra o deploy de verdade.

**Três coisas precisam de decisão sua hoje, antes de qualquer outra:** uma chave que dá controle total do
banco de dados está publicada na internet (item 1 abaixo); o repositório está público, não privado como a
documentação do projeto afirma; e o site que está no ar não é a versão atual do código — é de antes de
11 de novembro, e não existe nada que publique o site automaticamente.

---

## Os 10 maiores riscos, em ordem

### 1. A chave que controla o banco de dados está acessível para qualquer pessoa na internet

Existe uma função de servidor chamada `migrate-helper`, criada como "temporária" para uma migração e nunca
removida. Ela entrega, para quem pedir, a senha-mestra do banco de dados de produção. A senha de acesso a essa
função está escrita dentro do próprio arquivo — e o repositório está **público** no GitHub. Confirmei pelo log
de publicação que ela está no ar agora.
**O que isso permite:** ler, alterar e apagar todos os dados do sistema, incluindo os cadastros de usuários,
sem senha, sem login e sem deixar registro de quem foi.
**Não explorei isso.** A prova de que está no ar é o log de publicação, não uma chamada ao endereço.
**Ação:** apagar a função do servidor, trocar a senha do banco, e decidir se o repositório fica público.
→ Etapas 001 a 005

### 2. Qualquer pessoa pode disparar as tarefas internas do sistema

O script que publica as funções de servidor desliga a verificação de login de **todas as 89**. E **21 delas** não conferem nada por conta própria. Entre elas: a que executa todas as tarefas agendadas, a que processa a fila
de trabalho, as que enviam mensagem no Slack da empresa.
**O que isso permite:** uma pessoa de fora roda as rotinas internas do sistema quantas vezes quiser.
→ Etapas 006 a 032

### 3. Um cliente consegue gravar dados dentro da conta de outro cliente — e assinar em nome de terceiros

As regras de acesso do banco foram criadas em massa, por um laço que percorreu todas as tabelas de uma vez.
Duas das quatro regras saíram com a condição errada, e o erro foi aplicado a todas as tabelas:

- **Mover registro entre clientes:** a regra de alteração aceita a linha se ela for "do usuário" — e não
  confere o cliente no valor **novo**. Resultado: o usuário altera o próprio registro apontando-o para o
  workspace de outro cliente.
- **Assinar em nome de outro:** a regra de inserção confere só o workspace, nunca de quem é a linha. Um
  membro comum insere registro com o nome de outra pessoa. Em tabelas de log, aprovação e execução, isso é
  **forjar autoria** — a trilha de auditoria pode ser escrita por quem ela deveria auditar.
  **Por que ninguém viu:** o verificador do CI confere se a proteção está **ligada** (e está: 221 de 221
  tabelas) e não lê **o que ela diz**.
  → Etapas de Onda 1

### 4. Um cliente consegue ver — e trocar — as senhas de integração de outro cliente

Esta é uma corrente de quatro elos, e nenhum deles isolado chamaria atenção. O sistema guarda no banco todos
os cabeçalhos das requisições que recebe das integrações, inclusive os que carregam senha. A regra de acesso
dessa tabela diz apenas "basta estar logado", sem separar um cliente do outro. A tela que mostra esses eventos
consulta sem filtrar por cliente. E imprime os cabeçalhos na tela.
**O que isso permite:** um cliente logado abre a tela de eventos e lê as credenciais das integrações de todos
os outros. Com elas, passa a enviar dados em nome deles.
→ Etapas 057 a 062

### 5. O controle de permissões não é operável: ou a pessoa pode tudo, ou não pode nada

Não existe nenhuma tela ou caminho no produto que atribua um papel a um usuário. As funções que fariam isso
não têm chamador; as três telas de permissões são somente leitura. Na prática, um gatilho do banco dá poder
total ao **primeiro** usuário de cada conta, e todos os seguintes ficam sem papel nenhum — sem acesso às 38
telas que exigem permissão, e sem nenhuma forma de receber acesso.
**O que isso significa no dia a dia:** você não consegue dar acesso parcial a ninguém. E as 26 telas de
segurança e conformidade estão todas sob a mesma permissão, que é a de "gerenciar chaves de API" — quem
cuida de LGPD não entra, e quem mexe em chave de API entra em tudo.
→ Etapas de Onda 1 e 2

### 6. Qualquer pessoa na internet pode gastar seu crédito de inteligência artificial

Sete endereços do sistema chamam a OpenRouter — que você paga por uso — sem exigir login e **sem passar pelo
controle de orçamento**. Há um controle de orçamento bem feito no sistema, mas essas sete funções usam um
atalho que não passa por ele. E o próprio controle tem uma brecha: se o pedido não informar de qual cliente
é, ele libera sem verificar nada.
**O que isso permite:** esvaziar o saldo de IA. Quanto já foi gasto assim eu não consegui medir.
→ Etapas 033, 039 a 045

### 7. O site no ar é de antes de 11 de novembro, e nada publica o site automaticamente

Comparei o que o navegador recebe de `superagent-lab.lovable.app` com o código atual: são versões diferentes,
e a diferença identifica o build como anterior a 11/11. A Vercel, que a documentação do projeto aponta como o
caminho oficial de publicação, **não tem nenhum projeto** nesta conta. O Lovable publica por botão, manualmente.
**O que isso significa:** as correções mergeadas nos últimos 11 dias não chegaram a nenhum usuário. E quem
mergear uma correção de tela e disser "está em produção" vai estar errado. (Funções de servidor, ao contrário,
sobem sozinhas no merge — a diferença não está escrita em lugar nenhum.)
**Efeito colateral:** o monitoramento de erros (Sentry) está bloqueado na versão publicada. Erro de usuário
real hoje não chega a ninguém.
→ Etapas 063 a 068

### 8. Cinco telas do produto estão quebradas em produção por uma variável que ninguém define

O código lê uma variável de ambiente que não existe nem no modelo de configuração do projeto nem na
publicação. O resultado está no arquivo que o navegador baixa: a credencial vai literalmente como
`undefined`. Afeta Interpretador de Código, Computer Use, Agent Builder, Oráculo e o detalhe de Base de
Conhecimento.
**Por que o CI não pega:** variável ausente não quebra o build, e nenhum dos 6.226 testes exercita esses
cinco caminhos de rede.
→ Etapas de Onda 2

### 9. Um botão da interface grava 50 medições falsas no banco — e elas liberam uma decisão real

Na tela de experimentos de prompt existe um botão que gera 50 resultados aleatórios e **grava no banco de
produção**, misturados com as medições reais, sem nenhuma marca de que são inventados. Em seguida, a regra que
decide se uma versão de prompt pode ser promovida exige "pelo menos 50 resultados" — exatamente o que o botão
entrega, e com vantagem embutida para uma das versões.
**O que isso significa:** é possível promover uma versão de prompt para produção com base em números
inventados, e depois não há como separar, na tabela, o que foi medido do que foi simulado.
As próprias regras do projeto já proibiam isso, apontando este mesmo arquivo. O código continua lá.
→ Etapas 105 a 107

### 10. Salvar um workflow pode apagá-lo, com mensagem de sucesso na tela

Ao salvar, o sistema primeiro apaga todas as etapas do workflow e depois grava as novas. Se a segunda parte
falhar — por rede, por permissão, por qualquer motivo — as etapas antigas já foram apagadas, a falha só vai
para o log, e o usuário vê **"Canvas salvo!"**.
**O que isso significa:** perda definitiva do trabalho, sem aviso.
→ Etapas 063 a 065

---

## E mais três que pedem decisão sua, não correção técnica

#### Não existe proteção contra sua tela de login ser embutida em site de terceiro

As proteções de segurança do navegador estão declaradas no lugar errado do arquivo — numa forma que o
navegador ignora. O próprio navegador avisa isso no console, em todas as páginas, em todos os carregamentos.
E há cinco testes automatizados que passam, porque verificam que o texto está escrito no arquivo, nunca que a
proteção está em vigor.
**O que isso permite:** um site qualquer carrega sua tela de login dentro dele e captura senha de quem digitar
(o golpe conhecido como clickjacking).
→ Etapas 047 a 052

#### O sistema promete "SOC 2" na tela de login, e cita um cliente que não existe no repositório

A tela de login exibe, para todo visitante: "Criptografia ponta-a-ponta · SOC 2 · LGPD Compliant", e um
depoimento com nome, cargo e empresa ("Marcos Costa, Head de Operações, TechBR") com uma métrica de 60 %.
Nenhuma dessas afirmações tem fonte no repositório.
**Por que é risco:** afirmar certificação SOC 2 sem auditoria é exposição jurídica, não detalhe de design.
Isso é decisão sua: remover ou comprovar.
→ Etapas 269 a 271

#### A documentação do projeto contradiz a realidade nos pontos que mais importam

O arquivo de regras diz que o repositório é privado (é público). O de deploy aponta a Vercel (que não tem
projeto). O de estado diz que três falhas graves de banco estão abertas — e elas foram corrigidas entre
setembro e novembro.
**Por que isso é o risco de maior alcance:** cada agente de IA que trabalha neste repositório começa lendo
esses arquivos. Hoje eles mandam consertar o que já está consertado e não mencionam o que está aberto. Foi o
que esta auditoria quase fez.
→ Etapas 060 a 062, 068
---

## Quanto foi encontrado

| Gravidade   | Quantos | O que significa                                                          |
| ----------- | ------: | ------------------------------------------------------------------------ |
| **Crítica** |  **13** | perda ou vazamento de dado, falha de segurança, fluxo principal quebrado |
| **Alta**    |  **34** | função importante falha ou dá resultado errado                           |
| **Média**   |  **44** | funciona com defeito ou fragilidade                                      |
| **Baixa**   |  **12** | acabamento e higiene                                                     |
| **Total**   | **103** | agrupados pelas 14 causas que os produzem                                |

De 103, **97 estão confirmados** (li o código que roda, ou executei e vi o resultado) e **6 são hipóteses**,
cada uma dizendo o que faltou para confirmar.

Registrei também **15 verificações que deram "sem defeito"** — coisas que pareciam problema e não são — para
que o próximo agente não gaste tempo nelas.

**O plano de correção tem 300 etapas**, em 8 ondas, da mais urgente para a menos. Cada etapa é uma mudança
pequena, verificável sozinha, com o comando exato que prova que funcionou.

---

## O que eu verifiquei de verdade e o que apenas li

Essa distinção é a parte mais importante deste resumo, porque define no que você pode confiar.

- **49 cenários executados**: rodei o comando, a consulta ou a requisição e vi o resultado.
- **46 cenários rastreados**: segui o caminho lendo o código, sem executar.

Nunca escrevi "testado" para algo que apenas li.

---

## O que NÃO foi coberto, e por quê

| O que ficou de fora                                                                                                                             | Por quê                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **O estado real do banco de dados** (o que tem dentro das tabelas, se as regras de acesso estão corretas, quais tarefas agendadas estão ativas) | Nesta sessão não havia conexão com o banco oficial. Os cinco bancos que eu conseguia alcançar são de outros produtos seus. Toda a parte de banco foi auditada lendo os arquivos de migração, não o banco. |
| **Se a função que executa comando livre no banco ainda está aberta**                                                                            | É o item mais importante que ficou de fora. Existe uma correção escrita e aplicada em setembro, mas confirmar exige consultar o banco. **É a primeira coisa que o executor deve fazer** (etapa 053).      |
| **Toda a área logada do sistema** — 143 das 151 telas                                                                                           | Não havia usuário de teste nesta sessão. Só as 8 telas públicas foram abertas de verdade; as outras 143 foram auditadas lendo o código.                                                                   |
| **O histórico antigo do repositório**                                                                                                           | A cópia desta sessão tinha só os últimos 50 commits. Como o repositório é público e a varredura de segredos do GitHub está desligada, essa verificação é necessária e não pôde ser feita (etapa 005).     |
| **Quanto já foi gasto de IA indevidamente**                                                                                                     | Exigiria o painel da OpenRouter.                                                                                                                                                                          |
| **Qual versão exata está publicada no Lovable**                                                                                                 | Provei que é anterior a 11/11, não qual commit.                                                                                                                                                           |
| **Desempenho sob carga real**                                                                                                                   | Os testes de carga e de performance só rodam em pull request e não foram executados nesta sessão.                                                                                                         |

---

## Uma coisa que a auditoria corrigiu no caminho

O arquivo `ESTADO-ATUAL.md`, de agosto, descreve o sistema como "construído e desabitado": 210 de 215 tabelas
vazias, 176 tabelas sem proteção de acesso, e três falhas graves de banco abertas.

**Encontrei prova de que a parte de banco foi consertada.** O log do CI de 21 de novembro mostra o próprio
sistema medindo: as 338 migrações estão aplicadas, **as 221 tabelas têm proteção de acesso ligada**, e não há
permissão de escrita para visitante anônimo.

Isso muda a leitura do sistema: **o risco mudou de lugar**. O banco foi endurecido entre setembro e novembro;
o que ficou para trás é a camada das funções de servidor e a publicação do site. A documentação não acompanhou
— e é por isso que o item 10 da lista acima existe.

Com uma ressalva que o item 3 provou na prática: "proteção de acesso ligada" não é o mesmo que "proteção de
acesso correta". O verificador do CI confere se a proteção está ligada e não lê o que ela diz. Encontrei uma
tabela onde a regra é literalmente "basta estar logado" — e é isso que permite um cliente ver os dados de
outro.
