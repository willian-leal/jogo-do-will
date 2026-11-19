# Jogo do Will

Jogo de cartas online para navegador (nada para baixar). Multiplayer em salas por código/link, com bots.
Servidor autoritativo em Node.js + WebSocket; cliente em HTML/CSS/JS puro.

## Rodar localmente
```bash
npm install
npm start          # http://localhost:3000
npm test           # regras, 120 partidas simuladas com bots e teste de integração via WebSocket
```
Abra em duas abas (ou dois dispositivos na mesma rede) para testar o multiplayer.

## Publicar (para jogar de qualquer lugar)
Qualquer hospedagem Node com suporte a WebSocket serve (Render, Railway, Fly.io, um VPS):
- Build: `npm install`  ·  Start: `npm start`  ·  Porta: lida de `PORT`.
- Em Render/Railway: crie um *Web Service* apontando para este repositório; o link público já funciona em HTTPS/WSS.
- Healthcheck: `/healthz`.
Observação: as salas ficam em memória; reiniciar o servidor encerra as partidas em andamento.

## Novidades da versão 2
- **Bots com 3 níveis** (Fácil, Médio, Difícil): mudam memória, esquecimento, tempo de reação no corte e vontade de encerrar. Escolha o nível ao adicionar o bot no lobby. Os bots agora só encerram a partida quando têm boa certeza da própria mão (partidas ~32 turnos no total, em média).
- **Corte por toque:** com o corte aberto, basta tocar na carta da sua mão (o botão CORTAR / tecla C continua existindo). A pilha de descarte mostra "corte aberto · valor X" e uma barra com o tempo mínimo da janela.
- **Animações e avisos:** cartas voando (compra, descarte, corte), troca destacada, aviso de quem usou 10/Dama/Valete e em quem (sem revelar valores), tremida no corte errado.

## Novidades da versão 3
- **Relógio por turno (opcional):** o anfitrião escolhe Sem limite / 30 / 60 / 90 s no lobby ou na tela de resultado. Quando o tempo acaba, o piloto automático joga aquela vez (nunca encerra a partida por você). Contagem regressiva visível, com tique nos últimos 5 s.
- **Sons e vibração:** efeitos sintetizados no navegador (compra, descarte, corte certo/errado, poderes, sua vez, fim de partida) e vibração no celular. Botão 🔊/🔇 no topo.
- **Reações rápidas:** 8 emojis que flutuam sobre o jogador (botão 😀).
- **Vitórias da sala:** o 🏆 acumula entre partidas da mesma sala (empates não contam).

## Novidades da versão 4
- **Novo visual** (a direção de design: feltro, marfim, ouro e carmim; Bricolage Grotesque + Inter): cartas com naipes em SVG, verso com o W, marca em leque, ícones no lugar de emojis na interface, menu no topo e telas ajustadas para celular e desktop.
- **App instalável:** no iPhone, abra o link no Safari › Compartilhar › Adicionar à Tela de Início; no Android, "Instalar app". Abre em tela cheia, com ícone próprio.
- **Compra durante a janela de corte:** se você tocar em comprar antes da hora, o jogo compra assim que liberar, sem erro.
- **Deploy pronto:** `Dockerfile` e `render.yaml` (Render: New › Blueprint, apontando para o repositório).

## Novidades da versão 5
- **Modo campeonato (opcional):** o anfitrião escolhe "Partida única", "3 rodadas" ou "5 rodadas" no lobby ou na tela de resultado. Os pontos acumulam entre as rodadas, aparece a classificação e o campeão leva o 🏆 da sala só no fim. A configuração fica travada enquanto um campeonato está em andamento.
- **Espectadores:** quem entra com o código durante uma partida assiste (vê o placar e as ações) e passa a jogar no próximo campeonato/partida.

## Estrutura
- `game.js` — motor das regras (turnos, cortes, poderes, pontuação, desempate), uma `Room` por sala.
- `bot.js` — bots (memória imperfeita: às vezes esquecem ou lembram errado e erram o corte).
- `server.js` — HTTP estático + WebSocket, reconexão por token (guardado no navegador).
- `public/` — interface.
- `test/` — `rules.js`, `sim.js`, `ws.js`.

## Decisões de regra (pontos que o manual deixa em aberto)
- **Turno:** comprar da pilha **ou** pegar o topo do descarte. Da pilha: descartar a carta ou trocá-la por uma da mão. Do descarte: é obrigatório trocar por uma da mão (a que sai vai para o descarte, revelada). Pegar do descarte também respeita a janela de corte e a fecha.
- **Janela de corte:** abre a cada descarte e fecha quando alguém corta ou quando o próximo jogador compra. O próximo jogador só pode comprar ~2 s depois do descarte, para dar tempo de reação.
- **"Mesmo valor":** igual em pontos — Rei preto (13) só corta Rei preto; Rei vermelho (0) só corta Rei vermelho.
- **Cortes não ativam poderes** (10, Q, J só valem em descarte de turno). Quem corta pode esvaziar a mão e encerrar a partida.
- **Valete:** as duas cartas trocadas devem ser de jogadores diferentes (pode incluir você).
- **Memória é o jogo:** o cliente nunca mantém as cartas reveladas; elas viram de volta (10/Dama: 4 s; início: ao clicar "Memorizei").
- **Desconexão:** se for sua vez e você estiver offline, um bot joga por você até você voltar.
- Uma partida = uma rodada. Empate total → botão de **rodada extra** só com os empatados.

## Novidades da versão 6

- **Treinar contra bots**: botão na tela inicial cria uma sala com 2 bots e já começa a partida.
- **Dicas de tutorial** na primeira vez de cada fase (memorização, compra, corte, poderes), com "Entendi" e "Rever dicas" no menu.
- **Estatísticas locais** (partidas, vitórias, cortes certos/errados, melhor pontuação), guardadas no navegador.
- **Acessibilidade**: alto contraste, reduzir animações, cartas focáveis por teclado com rótulos (Tab/Enter/Espaço; D compra, C corta, Esc cancela), áreas com aria-live.
- **Mesa rápida**: janela de corte menor e turno de 20 s.
- **Personalidades dos bots**: equilibrado, afobado e cauteloso.
- **Robustez do servidor**: limite de mensagens por conexão e limite de salas (`MAX_ROOMS`, padrão 300).
- **Teste de interface** (`test/ui.js`, usa puppeteer-core e Chrome; é ignorado se não houver Chrome).

## Novidades da versão 7

- **Pegar do descarte:** na sua vez, toque na pilha de descarte (ou no botão "Pegar do descarte") para levar a carta do topo. Você precisa trocá-la por uma das suas. Bots também usam essa opção.

## Novidades da versão 8

- **Frases rápidas** (Boa!, Quase!, Que sorte!, Rápido!, Calma…, Revanche?) junto dos emojis.
- **Pedir revanche:** quem não é anfitrião vê o botão na tela de resultado e o pedido aparece para a mesa.
- **Conexão mais firme:** batimento a cada 20 s (também evita que o serviço gratuito hiberne durante a partida), reconexão com espera crescente e reconexão imediata ao voltar para a aba.
- **Aviso de vez:** se a aba estiver em segundo plano (ex.: você foi ao WhatsApp), o título vira "🔔 Sua vez!" e o celular vibra.

## Novidades da versão 9

- **Arrastar e soltar** (além do toque, que continua funcionando):
  - arraste a pilha de **compras** ou o topo do **descarte** até sua mão para pegar a carta; solte direto **sobre uma carta sua** para já trocar;
  - arraste a **carta comprada** sobre uma carta sua (trocar) ou sobre o descarte (descartar);
  - com o corte aberto, arraste uma carta sua até o descarte para **cortar**.
  Os destinos válidos ficam destacados e, se soltar num lugar inválido, a carta volta.

## Novidades da versão 10

- **Mesa sem botões de ação**: no celular só aparece "Encerrar partida" (e "Não usar o poder", quando é o caso). Tudo é feito nas próprias cartas:
  - toque (ou arraste) a pilha de compras ou o descarte para pegar uma carta;
  - com a carta na mão, **toque numa carta sua para trocar** ou **toque no descarte para descartar**;
  - com o corte aberto, toque numa carta sua do mesmo valor.
- Quem prefere botões (ou usa teclado/leitor de tela) pode ligar **Mostrar botões de ação** em Menu → Acessibilidade.

## Novidades da versão 11

- **Carta na mão de quem joga:** a carta comprada deixa de aparecer no centro. Ela fica ao lado das cartas de quem comprou (no seu espaço tracejado à direita da mão; nos bots, sobreposta à mão deles). Se veio do descarte, todos veem a face; se veio da pilha, só quem comprou vê.
- **Montinho de descarte:** as últimas cartas descartadas ficam empilhadas, levemente desalinhadas, com a última por cima. O centro da mesa fica sempre igual (só as duas pilhas).

## Novidades da versão 12
- **Corte livre:** sem espera de 2 s e sem a etiqueta "corte aberto". Qualquer jogador pode cortar, quando quiser, enquanto nenhuma outra carta for descartada no monte (comprar da pilha não fecha o corte; pegar a carta do topo do descarte fecha). Só o primeiro corte certo vale.
- **Narração opcional:** em Menu → Acessibilidade, "Mostrar narração da jogada no centro da mesa". Padrão: ligada nas 3 primeiras partidas, desligada depois. Com ela desligada ficam só "Sua vez", o aviso dos poderes e os erros.
- **Correção:** um corte que encerra a partida com alguém segurando a carta comprada fazia a carta sumir (a simulação de 120 partidas pegou); agora ela volta ao fundo da pilha.

## Novidades da versão 13
- **Mesa quadrada:** você fica embaixo e os outros jogadores nos outros lados — esquerda, frente e direita —, no sentido da vez a partir de você. 2 jogadores: um de cada lado; 3: esquerda, frente e direita; 4 a 8: distribuídos entre os três lados. As pilhas ficam no centro. Nos lados as cartas ficam giradas, viradas para quem está sentado ali, e enfileiradas em coluna.

## Novidades da versão 14
- **Cortar durante o próprio poder:** ao descartar um 10 ou Valete com outra igual na mão, dá para cortar sem ser obrigado a usar o poder: arraste a carta até o descarte, ou toque em CORTAR (aparece enquanto o poder está pendente). O poder continua opcional.
- **Costas das cartas dos adversários** agora mostram o "W", igual às suas e à pilha.

## Novidades da versão 15
- **Voltar ao início:** no resultado da partida há o botão "Voltar ao início" (e também na mesa depois de fechar o resultado). Sai da sala e volta à tela inicial.

## Novidades da versão 16
- **Voltar ao início sem perder a vaga:** depois da partida (ou no lobby), "Voltar ao início" guarda a sua vaga na sala por 30 minutos. Na home aparece "Voltar à sala XXXX": um toque e você reentra, sem novo convite. "Sair da sala" no menu continua saindo de vez.
- A sala só é apagada depois de 45 minutos sem ninguém conectado. As salas continuam só na memória do servidor: se o Render reiniciar ou hibernar, elas somem.

## Novidades da versão 17
- **Salas abertas:** o anfitrião liga "Sala pública" no lobby (desligada por padrão) e a sala aparece na lista "salas abertas" da tela inicial, com anfitrião, vagas e configurações. Qualquer um entra com um toque, sem código. A lista mostra só salas públicas, no lobby ou entre partidas, com alguém conectado e vaga livre; atualiza sozinha a cada 5 s.

## Novidades da versão 18
- **Quem cortou:** a caixa do jogador acende em verde com "✂ cortou!" no corte certo e em vermelho com "errou!" no errado, além do aviso e do som de antes.
- **Placar do campeonato:** durante um campeonato (3 ou 5 rodadas) aparece uma faixa "Placar" sob o topo, com os pontos acumulados de cada jogador, o líder em dourado.
- **Mesa compacta no celular:** com 5 ou mais adversários as cartas e as pilhas encolhem para a sua mão caber na tela.
- Teste de WebSocket ficou robusto contra uma corrida entre o fim do poder e o envio da jogada.
