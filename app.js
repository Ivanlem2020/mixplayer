// ==========================================
// REGISTRO DO SERVICE WORKER E CONTROLE DE MODAL
// ==========================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
            // Se já houver uma atualização esperando na fila, chama o modal
            if (reg.waiting) {
                verificarExibicaoModal();
            }

            // Escuta se uma nova atualização terminar de baixar
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        verificarExibicaoModal();
                    }
                });
            });
        }).catch(err => console.log("Erro ao registrar SW:", err));

    // REMOVIDO: Tiramos o recarregamento automático automático daqui para não fechar o modal sozinho!
}

// Função que checa se já se passaram 24 horas desde a última vez que o usuário adiou
function verificarExibicaoModal() {
    const ultimaExibicao = localStorage.getItem('mixplayer_ultimo_aviso_update');
    const agora = Date.now();
    const umDiaEmMilissegundos = 24 * 60 * 60 * 1000;

    // Se nunca foi adiado OU se já passou mais de 1 dia (24h), mostra o modal
    if (!ultimaExibicao || (agora - ultimaExibicao > umDiaEmMilissegundos)) {
        exibirModalAtualizacao();
    }
}

function exibirModalAtualizacao() {
    const modal = document.getElementById('modal-atualizacao');
    const btnAtualizar = document.getElementById('btn-atualizar-app');
    const btnDepois = document.getElementById('btn-atualizar-depois');
    
    if (modal && btnAtualizar && btnDepois) {
        modal.style.display = 'flex'; // Fixa o modal na tela
        
        // Se clicar em Atualizar: Recarrega a página aplicando tudo novo
        btnAtualizar.onclick = function() {
            localStorage.removeItem('mixplayer_ultimo_aviso_update'); // Limpa o timer
            window.location.reload();
        };

        // Se clicar em Depois: Esconde o modal e guarda a data de hoje para só incomodar amanhã
        btnDepois.onclick = function() {
            modal.style.display = 'none';
            localStorage.setItem('mixplayer_ultimo_aviso_update', Date.now());
        };
    }
}
// ==========================================


function fecharCacheERefrescar() {
    // Pega o modal que criamos no HTML
    const modal = document.getElementById('modal-atualizacao');
    const btnAtualizar = document.getElementById('btn-atualizar-app');
    
    if (modal && btnAtualizar) {
        // Mostra o modal bonito na tela
        modal.style.display = 'flex';
        
        // Quando clicar no botão "Atualizar Agora", a página recarrega com o código novo
        btnAtualizar.onclick = function() {
            window.location.reload();
        };
    } else {
        // Caso o HTML não tenha carregado a tempo, recarrega direto
        window.location.reload();
    }
}

// ==========================================



window.addEventListener('DOMContentLoaded', () => {

    // CONEXÃO COM O BANCO DE DADOS (INDEXEDDB)
    let db = null;
    const requestDB = indexedDB.open('MixPlayerDB', 1);

    requestDB.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('musicas')) {
            database.createObjectStore('musicas', { keyPath: 'id', autoIncrement: true });
        }
    };

    requestDB.onsuccess = (e) => {
        db = e.target.result;
        // Só carrega a biblioteca depois que o banco estiver aberto com sucesso
        carregarBibliotecaDoBanco();
    };

    requestDB.onerror = (e) => {
        console.error('Erro ao abrir o banco de dados:', e.target.error);
    };

    // ==========================================
    // VARIÁVEIS DO MOTOR DE ÁUDIO (NÓS PRINCIPAIS)
    // ==========================================
    let audioCtx = null;   // O "cérebro" do áudio, gerencia todo o sistema de som
    let audioHtml = null;  // O elemento de áudio do HTML que toca o arquivo MP3
    let sourceNode = null; // A fonte de som que interliga o arquivo MP3 ao sistema
    let gainNode = null;   // O nó de ganho que controla o volume geral do app
    let volumeInicial = 1; // Guarda o estado atual do volume base do player

    // ==========================================
    // VARIÁVEIS DOS NOVOS EFEITOS (MESA DE MIXAGEM)
    // ==========================================
    let eqFilter = null;   // Filtro central que muda o som (Pancadão, Voz, Balada)
    let delayNode = null;  // Cria o atraso no som para fazer o efeito de Eco/Show
    let delayGain = null;  // Controla o volume do Eco (se está alto, baixo ou desligado)
    let turboAtivo = false;// Guarda se o botão do ganho Turbo está ligado ou desligado
    let ecoAtivo = false;  // Guarda se o botão do efeito Eco está ligado ou desligado
 
    // ==========================================
    // VARIÁVEIS DO VISUALIZADOR (ANIMAÇÃO CANVAS)
    // ==========================================
    let analyserNode = null; // Analisa as frequências do som em tempo real para o gráfico
    const canvas = document.getElementById('audio-visualizer'); // O painel onde o gráfico é desenhado
    let canvasCtx = canvas ? canvas.getContext('2d') : null;    // O "pincel" usado para desenhar no painel
    let animationFrameId = null; // Guarda a animação do gráfico para poder pausar/rodar


    // CONTROLE DA BIBLIOTECA
    let biblioteca = {};
    let pastaAtual = "";
    let indiceMusicaAtual = -1;
    let urlMusicaAtual = null; 
    let musicaSelecionadaParaPlaylist = null;
    let modoAleatorio = false; 

    // ELEMENTOS DA INTERFACE
    const playlistContainer = document.getElementById('playlist');
    const folderContainer = document.getElementById('folder-list');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const fileInput = document.getElementById('file-input');
    const trackTitleUi = document.getElementById('current-track-title');
    const folderTitleUi = document.getElementById('current-folder-title');
    const progressSlider = document.getElementById('progress-slider');
    const currentTimeUi = document.getElementById('current-time');
    const totalDurationUi = document.getElementById('total-duration');
    let userChangingProgress = false; 

    const pagePlayer = document.getElementById('page-player');
    const pageMixer = document.getElementById('page-mixer');
    const toggleMixerBtn = document.getElementById('toggle-mixer-btn');
    const backToPlayerBtn = document.getElementById('back-to-player-btn');
    const addPlaylistBtn = document.getElementById('add-playlist-btn');

    const playlistModal = document.getElementById('playlist-modal');
    const modalTrackName = document.getElementById('modal-track-name');
    const modalPlaylistsOptions = document.getElementById('modal-playlists-options');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const newPlaylistModal = document.getElementById('new-playlist-modal');
    const newPlaylistInput = document.getElementById('new-playlist-input');
    const cancelNewPlaylistBtn = document.getElementById('cancel-new-playlist-btn');
    const saveNewPlaylistBtn = document.getElementById('save-new-playlist-btn');

    const tabShowFolders = document.getElementById('tab-show-folders');
    const tabShowSongs = document.getElementById('tab-show-songs');

    // Lógica para alternar abas no celular
    if(tabShowFolders && tabShowSongs && folderContainer && playlistContainer) {
        tabShowFolders.addEventListener('click', () => {
            tabShowFolders.classList.add('active-tab');
            tabShowSongs.classList.remove('active-tab');
            folderContainer.style.display = 'block';
            playlistContainer.style.display = 'none';
        });

        tabShowSongs.addEventListener('click', () => {
            tabShowSongs.classList.add('active-tab');
            tabShowFolders.classList.remove('active-tab');
            folderContainer.style.display = 'none';
            playlistContainer.style.display = 'block';
        });
    }

    function carregarBibliotecaDoBanco() {
        if (!db) return;
        const transaction = db.transaction(['musicas'], 'readonly');
        const store = transaction.objectStore('musicas');
        const request = store.openCursor();

        biblioteca = {}; 

        request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const musica = cursor.value;
                const nomePasta = musica.pasta;

                if (!biblioteca[nomePasta]) {
                    biblioteca[nomePasta] = [];
                }
                biblioteca[nomePasta].push(musica);

                cursor.continue();
            } else {
                const nomesPastas = Object.keys(biblioteca);
                if (nomesPastas.length > 0) {
                    if (!pastaAtual || !biblioteca[pastaAtual]) {
                        pastaAtual = nomesPastas[0];
                    }
                    if (folderTitleUi) folderTitleUi.textContent = pastaAtual.toUpperCase();
                }
                renderizarPastas();
                renderizarPlaylist();
            }
        };
    }

    async function salvarBibliotecaNoBanco() {
        try {
            if (typeof localforage !== 'undefined') {
                await localforage.setItem('mixplayer_biblioteca', biblioteca);
            }
        } catch (err) {
            console.error(err);
        }
    }

    function alternarTela(irParaMixer) {
        if (irParaMixer) {
            if (pagePlayer) pagePlayer.classList.remove('active');
            if (pageMixer) pageMixer.classList.add('active');
            if (toggleMixerBtn) toggleMixerBtn.classList.add('active-tab');
        } else {
            if (pageMixer) pageMixer.classList.remove('active');
            if (pagePlayer) pagePlayer.classList.add('active');
            if (toggleMixerBtn) toggleMixerBtn.classList.remove('active-tab');
            ajustarTamanhoCanvas();
        }
    }

    if (toggleMixerBtn) {
        toggleMixerBtn.addEventListener('click', () => {
            if (pageMixer) alternarTela(!pageMixer.classList.contains('active'));
        });
    }
    if (backToPlayerBtn) backToPlayerBtn.addEventListener('click', () => alternarTela(false));

    function inicializarAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                audioHtml = new Audio();
                audioHtml.preload = 'auto';
                audioHtml.textTrackKindUserPreference = 'subtitles'; 

                audioHtml.addEventListener('timeupdate', () => {
                    if (!userChangingProgress) atualizarProgresso();
                    atualizarMediaSessionPosition();
                });

                audioHtml.addEventListener('loadedmetadata', () => {
                    if (totalDurationUi) totalDurationUi.textContent = formatarTempo(audioHtml.duration);
                    if (progressSlider) progressSlider.max = Math.floor(audioHtml.duration);
                    configurarMediaSession();
                });

                sourceNode = audioCtx.createMediaElementSource(audioHtml);
                gainNode = audioCtx.createGain();
                gainNode.gain.setValueAtTime(volumeInicial, audioCtx.currentTime);

                // NOVO: Filtro para os Modos de Som (Inicia no Pancadão)
                eqFilter = audioCtx.createBiquadFilter();
                eqFilter.type = 'lowshelf';
                eqFilter.frequency.setValueAtTime(100, audioCtx.currentTime);
                eqFilter.gain.setValueAtTime(10, audioCtx.currentTime);

                // NOVO: Nós de áudio para o Efeito Eco (Delay)
                delayNode = audioCtx.createDelay();
                delayNode.delayTime.setValueAtTime(0.3, audioCtx.currentTime);
                delayGain = audioCtx.createGain();
                delayGain.gain.setValueAtTime(ecoAtivo ? 0.4 : 0.0, audioCtx.currentTime);

                analyserNode = audioCtx.createAnalyser();
                analyserNode.fftSize = 64; 

                // NOVA CONEXÃO: Som passa pelo filtro principal e vai pro analisador (canvas)
                sourceNode.connect(eqFilter);
                eqFilter.connect(analyserNode);
                
                // Conecta o Eco em paralelo para dar efeito de show
                eqFilter.connect(delayNode);
                delayNode.connect(delayGain);
                delayGain.connect(analyserNode);

                analyserNode.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                audioHtml.onended = () => {
                    pularMusica(1);
                };

                ajustarTamanhoCanvas();
                desenharVisualizer();
            } catch (e) { console.error(e); }
        } else {
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }
    }


    function configurarMediaSession() {
        if ('mediaSession' in navigator && audioHtml) {
            const musicas = biblioteca[pastaAtual];
            if (!musicas || indiceMusicaAtual === -1) return;
            const musica = musicas[indiceMusicaAtual];
            navigator.mediaSession.metadata = new MediaMetadata({
                title: musica.name.replace('.mp3', ''),
                artist: 'MixPlayer App',
                album: pastaAtual
            });
            navigator.mediaSession.setActionHandler('play', () => play());
            navigator.mediaSession.setActionHandler('pause', () => pause());
            navigator.mediaSession.setActionHandler('previoustrack', () => pularMusica(-1));
            navigator.mediaSession.setActionHandler('nexttrack', () => pularMusica(1));
        }
    }

    function atualizarMediaSessionPosition() {
        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && audioHtml && !isNaN(audioHtml.duration)) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: audioHtml.duration,
                    playbackRate: audioHtml.playbackRate,
                    position: audioHtml.currentTime
                });
            } catch (e) { }
        }
    }

    const gainSlider = document.getElementById('gain-slider');
    if (gainSlider) {
        gainSlider.addEventListener('input', (e) => {
            volumeInicial = parseFloat(e.target.value);
            const volLbl = document.getElementById('vol-lbl');
            if (volLbl) volLbl.textContent = `${Math.round(volumeInicial * 100)}%`;
            if (gainNode && audioCtx) gainNode.gain.setValueAtTime(volumeInicial, audioCtx.currentTime);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files.length) return;
            
            if (trackTitleUi) trackTitleUi.textContent = "Carregando pasta...";
            
            // OBRIGATÓRIO: Substitua o bloco do 'for' dentro do fileInput.addEventListener
            for (let file of files) {
                if (file.name.toLowerCase().endsWith('.mp3')) {
                    // Pega o caminho completo (ex: Music/Rio Negro/musica.mp3)
                    const pathParts = file.webkitRelativePath.split('/');
                    
                    let nomePasta = "Pasta Raiz";
                    
                    // Se houver mais de uma pasta (ex: Music/Rio Negro)
                    if (pathParts.length > 1) {
                        // Se a primeira pasta for "Music" ou "Musica", usamos a próxima
                        const primeiraPasta = pathParts[0].toLowerCase();
                        if (primeiraPasta === "music" || primeiraPasta === "musica") {
                            // Se tiver mais de uma, pega o nome do artista (ex: Rio Negro)
                            nomePasta = pathParts.length > 2 ? pathParts[1] : pathParts[0];
                        } else {
                            // Caso contrário, usa a primeira mesmo
                            nomePasta = pathParts[0];
                        }
                    }
                    
                    adicionarAoBanco(nomePasta, file.name, file);
                } 
                else if (file.name.toLowerCase().endsWith('.zip')) {
                    await carregarZip(file);
                }
            }

            
            if (trackTitleUi) trackTitleUi.textContent = "Pasta importada!";
            renderizarPastas();
            renderizarPlaylist();
        });
    }

    async function carregarZip(file) {
        const nomePastaZip = file.name.replace(/\.[^/.]+$/, "");
        try {
            const zip = await JSZip.loadAsync(file);
            const promessas = [];
            zip.forEach((relativePath, zipEntry) => {
                if (zipEntry.name.toLowerCase().endsWith('.mp3') && !zipEntry.dir) {
                    const nomeMusica = zipEntry.name.split('/').pop();
                    const p = zipEntry.async('blob').then((blob) => adicionarAoBanco(nomePastaZip, nomeMusica, blob));
                    promessas.push(p);
                }
            });
            await Promise.all(promessas);
        } catch (f) { console.error(f); }
    }

    function adicionarAoBanco(nomePasta, nomeMusica, arquivoData) {
        if (!db) return;
        const transaction = db.transaction(['musicas'], 'readwrite');
        const store = transaction.objectStore('musicas');

        const novaMusica = {
            pasta: nomePasta,
            name: nomeMusica,
            data: arquivoData
        };

        store.add(novaMusica);

        if (!biblioteca[nomePasta]) {
            biblioteca[nomePasta] = [];
        }
        biblioteca[nomePasta].push(novaMusica);
    }
    
    function renderizarPastas() {
        if (!folderContainer) return;
        folderContainer.innerHTML = '';
        Object.keys(biblioteca).forEach(nomePasta => {
            if (biblioteca[nomePasta].length === 0) return;
            
            const div = document.createElement('div');
            div.className = `list-row ${pastaAtual === nomePasta ? 'active' : ''}`;
            
            const clickArea = document.createElement('div');
            clickArea.className = 'row-clickable-area';
            clickArea.style.display = 'flex';
            clickArea.style.alignItems = 'center';
            clickArea.style.flex = '1';
            clickArea.style.overflow = 'hidden';
            
            if (pastaAtual === nomePasta) {
                clickArea.style.color = '#2ed573'; 
                clickArea.style.fontWeight = 'bold';
                
                // CORREÇÃO: Texto duplicado para o efeito de repetição infinita sem espaço em branco
                const textoExibicao = `${nomePasta} (${biblioteca[nomePasta].length})`;
                clickArea.innerHTML = `
                    <i class="fa-solid fa-folder-open" style="margin-right:8px; color: #2ed573; z-index: 2; background: inherit; padding-right: 4px;"></i> 
                    <div class="marquee-container">
                        <span class="marquee-text">${textoExibicao}</span>
                        <span class="marquee-text">${textoExibicao}</span>
                    </div>
                `;
                
                setTimeout(() => {
                    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
            } else {
                clickArea.innerHTML = `<i class="fa-solid fa-list-ul" style="margin-right:8px;"></i> <span>${nomePasta} (${biblioteca[nomePasta].length})</span>`;
            }
            
            clickArea.onclick = () => {
                pastaAtual = nomePasta;
                indiceMusicaAtual = -1;
                if (folderTitleUi) folderTitleUi.textContent = pastaAtual;
                renderizarPastas(); 
                renderizarPlaylist();
                if (tabShowSongs) tabShowSongs.click();
            };
            div.appendChild(clickArea);

            const deletePlaylistBtn = document.createElement('button');
            deletePlaylistBtn.className = 'mini-action-btn';
            deletePlaylistBtn.innerHTML = `<i class="fa-solid fa-trash" style="color: #ff5e62;"></i>`;
            deletePlaylistBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Excluir a playlist "${nomePasta}"?`)) {
                    delete biblioteca[nomePasta];
                    const restantes = Object.keys(biblioteca);
                    pastaAtual = restantes.length > 0 ? restantes[0] : "";
                    if (folderTitleUi) folderTitleUi.textContent = pastaAtual;
                    renderizarPastas();
                    renderizarPlaylist();
                    salvarBibliotecaNoBanco();
                }
            };
            div.appendChild(deletePlaylistBtn);

            folderContainer.appendChild(div);
        });
    }


    function renderizarPlaylist() {
        if (!playlistContainer) return;
        playlistContainer.innerHTML = '';
        const musicas = biblioteca[pastaAtual];
        if (!musicas || musicas.length === 0) {
            playlistContainer.innerHTML = '<div style="padding:12px; color:#555;">Nenhum som aqui</div>';
            return;
        }
        musicas.forEach((musica, index) => {
            const div = document.createElement('div');
            div.className = `list-row ${indiceMusicaAtual === index ? 'active' : ''}`;
            
            const clickArea = document.createElement('div');
            clickArea.className = 'row-clickable-area';
            clickArea.innerHTML = `<i class="fa-solid fa-music"></i> <span>${musica.name}</span>`;
            clickArea.onclick = () => prepararEMandarPlay(index);
            div.appendChild(clickArea);

            // ADICIONADO: Se for a música tocando agora, rola a lista até ela
            if (indiceMusicaAtual === index) {
                setTimeout(() => {
                    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'mini-action-btn';
            deleteBtn.innerHTML = `<i class="fa-solid fa-xmark" style="color: #747d8c;"></i>`;
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                removerMusicaDaPlaylist(pastaAtual, index);
            };
            div.appendChild(deleteBtn);

            playlistContainer.appendChild(div);
        });
    }


    function removerMusicaDaPlaylist(nomePlaylist, indexMusica) {
        biblioteca[nomePlaylist].splice(indexMusica, 1);
        renderizarPlaylist();
        renderizarPastas();
        salvarBibliotecaNoBanco();
    }

    function prepararEMandarPlay(index) {
        inicializarAudio();
        
        const musicas = biblioteca[pastaAtual];
        if (!musicas || index < 0 || index >= musicas.length) return;
        
        if (urlMusicaAtual) URL.revokeObjectURL(urlMusicaAtual);
        indiceMusicaAtual = index;
        const musica = musicas[indiceMusicaAtual];
        
        if (trackTitleUi) trackTitleUi.textContent = musica.name;
        
        if (musica.data) {
            urlMusicaAtual = URL.createObjectURL(musica.data);
            if (audioHtml) {
                audioHtml.src = urlMusicaAtual;
                audioHtml.load(); 
            }
        }
        
        if (progressSlider) progressSlider.value = 0;
        renderizarPlaylist();
        play();
    }
    
    function play() {
        // CORREÇÃO: Garante que os filtros e o contexto de áudio sejam criados ANTES de puxar a música
        inicializarAudio();

        // Lógica de play automático que já tínhamos feito
        if (!pastaAtual || pastaAtual === "") {
            const pastas = Object.keys(biblioteca);
            if (pastas.length > 0) {
                pastaAtual = pastas[0];
                indiceMusicaAtual = 0;
                if (folderTitleUi) folderTitleUi.textContent = pastaAtual.toUpperCase();
                renderizarPastas();
                renderizarPlaylist();
                prepararEMandarPlay(0);
                return;
            }
        } else if (indiceMusicaAtual === -1) {
            const musicas = biblioteca[pastaAtual];
            if (musicas && musicas.length > 0) {
                prepararEMandarPlay(0);
                return;
            }
        }

        // Se já passou pelas verificações acima, continua o play normal
        if (!audioHtml) return;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        
        audioHtml.play().then(() => {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        }).catch(() => {});
        
        if (playPauseBtn) playPauseBtn.innerHTML = `<i class="fa-solid fa-pause"></i>`;
        
        const marquees = document.querySelectorAll('.marquee-text');
        marquees.forEach(marquee => {
            marquee.style.animationPlayState = 'running';
        });
    }


    function pause() {
        if (!audioHtml) return;
        audioHtml.pause();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
        if (playPauseBtn) playPauseBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
        
        // CORREÇÃO: Pega TODAS as cópias do texto e congela juntas
        const marquees = document.querySelectorAll('.marquee-text');
        marquees.forEach(marquee => {
            marquee.style.animationPlayState = 'paused';
        });
    }

    
    function pularMusica(direcao) {
        const musicas = biblioteca[pastaAtual];
        if (!musicas || musicas.length === 0) return;

        if (modoAleatorio && direcao === 1) {
            const novoIndice = Math.floor(Math.random() * musicas.length);
            prepararEMandarPlay(novoIndice);
            return;
        }

        let novoIndice = indiceMusicaAtual + direcao;

        if (novoIndice >= musicas.length) {
            pularParaProximaPasta(); 
            return;
        } 
        else if (novoIndice < 0) {
            novoIndice = musicas.length - 1; 
        }

        prepararEMandarPlay(novoIndice);
    }

    function pularParaProximaPasta() {
        const nomesPastas = Object.keys(biblioteca);
        if (nomesPastas.length <= 1) {
            prepararEMandarPlay(0);
            return;
        }

        let indicePastaAtual = nomesPastas.indexOf(pastaAtual);
        let proximoIndicePasta = indicePastaAtual + 1;

        if (proximoIndicePasta >= nomesPastas.length) {
            proximoIndicePasta = 0;
        }

        pastaAtual = nomesPastas[proximoIndicePasta];
        if (folderTitleUi) folderTitleUi.textContent = pastaAtual.toUpperCase();
        // ADICIONADO: Atualiza a lista visual para pintar a nova pasta de verde
        renderizarPastas();
        prepararEMandarPlay(0);
    }

    function voltarParaPastaAnterior() {
        const nomesPastas = Object.keys(biblioteca);
        if (nomesPastas.length <= 1) {
            prepararEMandarPlay(0);
            return;
        }

        let indicePastaAtual = nomesPastas.indexOf(pastaAtual);
        let proximoIndicePasta = indicePastaAtual - 1;

        if (proximoIndicePasta < 0) {
            proximoIndicePasta = nomesPastas.length - 1;
        }

        pastaAtual = nomesPastas[proximoIndicePasta];
        if (folderTitleUi) folderTitleUi.textContent = pastaAtual.toUpperCase();
        // ADICIONADO: Atualiza a lista visual para pintar a nova pasta de verde
        renderizarPastas();
        prepararEMandarPlay(0);
    }

    const shuffleBtn = document.getElementById('shuffle-btn');
    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
            modoAleatorio = !modoAleatorio;
            if (modoAleatorio) {
                shuffleBtn.style.color = '#00f2fe'; 
            } else {
                shuffleBtn.style.color = '#fff'; 
            }
        });
    }

    const nextFolderBtn = document.getElementById('next-folder-btn');
    if (nextFolderBtn) {
        nextFolderBtn.addEventListener('click', () => {
            pularParaProximaPasta();
            const corOriginal = nextFolderBtn.style.color;
            nextFolderBtn.style.color = '#00f2fe';
            setTimeout(() => { nextFolderBtn.style.color = corOriginal; }, 200);
        });
    }
    
    const prevFolderBtn = document.getElementById('prev-folder-btn');
    if (prevFolderBtn) {
        prevFolderBtn.addEventListener('click', () => {
            voltarParaPastaAnterior();
            const corOriginal = prevFolderBtn.style.color;
            prevFolderBtn.style.color = '#00f2fe';
            setTimeout(() => { prevFolderBtn.style.color = corOriginal; }, 200);
        });
    }

    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            if (indiceMusicaAtual === -1 && biblioteca[pastaAtual] && biblioteca[pastaAtual].length > 0) { prepararEMandarPlay(0); } 
            else if (audioHtml && !audioHtml.paused) { pause(); } 
            else { play(); }
        });
    }
    if (prevBtn) prevBtn.addEventListener('click', () => pularMusica(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => pularMusica(1));

    function formatarTempo(segundos) {
        if (isNaN(segundos)) return "0:00";
        const mins = Math.floor(segundos / 60);
        const secs = Math.floor(segundos % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function atualizarProgresso() {
        if (!audioHtml || !progressSlider || !currentTimeUi) return;
        progressSlider.value = Math.floor(audioHtml.currentTime);
        currentTimeUi.textContent = formatarTempo(audioHtml.currentTime);
    }

    if (progressSlider) {
        progressSlider.addEventListener('input', () => {
            userChangingProgress = true;
            if (currentTimeUi) currentTimeUi.textContent = formatarTempo(progressSlider.value);
        });
        progressSlider.addEventListener('change', () => {
            if (audioHtml) audioHtml.currentTime = progressSlider.value;
            userChangingProgress = false;
        });
    }

    function ajustarTamanhoCanvas() {
        if (!canvas || !canvas.parentElement) return;
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    }

    // ==========================================
    // PROGRAMAÇÃO DOS NOVOS EFEITOS DO MIXER
    // ==========================================
    const btnPancadao = document.getElementById('btn-preset-pancadao');
    const btnVoz = document.getElementById('btn-preset-voz');
    const btnBalada = document.getElementById('btn-preset-balada');
    const btnOriginal = document.getElementById('btn-preset-original');
    const btnTurbo = document.getElementById('btn-turbo');
    const btnEco = document.getElementById('btn-eco');

    function resetarBotoesPreset() {
        [btnPancadao, btnVoz, btnBalada, btnOriginal].forEach(btn => {
            if (btn) {
                btn.classList.remove('active-preset');
                btn.style.border = '2px solid #2d2d35';
                btn.style.color = '#fff';
            }
        });
    }

    function aplicarPresetEstilo(botao, freq, tipo, ganho) {
        resetarBotoesPreset();
        if (botao) {
            botao.classList.add('active-preset');
            botao.style.border = '2px solid #2ed573';
            botao.style.color = '#2ed573';
        }
        if (eqFilter && audioCtx) {
            eqFilter.type = tipo;
            eqFilter.frequency.setValueAtTime(freq, audioCtx.currentTime);
            eqFilter.gain.setValueAtTime(ganho, audioCtx.currentTime);
        }
    }

    if (btnPancadao) btnPancadao.onclick = () => aplicarPresetEstilo(btnPancadao, 100, 'lowshelf', 10);
    if (btnVoz) btnVoz.onclick = () => aplicarPresetEstilo(btnVoz, 2500, 'peaking', 8);
    if (btnBalada) btnBalada.onclick = () => aplicarPresetEstilo(btnBalada, 1000, 'notch', -6);
    if (btnOriginal) btnOriginal.onclick = () => aplicarPresetEstilo(btnOriginal, 1000, 'peaking', 0);

    if (btnTurbo) {
        btnTurbo.onclick = () => {
            turboAtivo = !turboAtivo;
            const bolinha = btnTurbo.querySelector('div');
            if (turboAtivo) {
                btnTurbo.style.background = '#2ed573';
                if (bolinha) bolinha.style.transform = 'translateX(24px)';
                if (gainNode && audioCtx) gainNode.gain.setValueAtTime(volumeInicial * 1.6, audioCtx.currentTime);
            } else {
                btnTurbo.style.background = '#2d2d35';
                if (bolinha) bolinha.style.transform = 'translateX(0)';
                if (gainNode && audioCtx) gainNode.gain.setValueAtTime(volumeInicial, audioCtx.currentTime);
            }
        };
    }

    if (btnEco) {
        btnEco.onclick = () => {
            ecoAtivo = !ecoAtivo;
            const bolinha = btnEco.querySelector('div');
            if (ecoAtivo) {
                btnEco.style.background = '#00d2d3';
                if (bolinha) bolinha.style.transform = 'translateX(24px)';
                if (delayGain && audioCtx) delayGain.gain.setValueAtTime(0.4, audioCtx.currentTime);
            } else {
                btnEco.style.background = '#2d2d35';
                if (bolinha) bolinha.style.transform = 'translateX(0)';
                if (delayGain && audioCtx) delayGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
            }
        };
    }

    function desenharVisualizer() {
        animationFrameId = requestAnimationFrame(desenharVisualizer);
        if (!analyserNode || !canvasCtx || !canvas) return;

        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserNode.getByteFrequencyData(dataArray);

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

        const quantidadeBarras = 34; 
        const espacamentoBarras = 1.5; 
        const larguraBarra = (canvas.width - (espacamentoBarras * (quantidadeBarras - 1))) / quantidadeBarras;
        const yBaseReto = canvas.height; 

        for (let i = 0; i < quantidadeBarras; i++) {
            const metade = (quantidadeBarras - 1) / 2;
            const distanciaDoCentro = Math.abs(i - metade) / metade; 

            const indiceMapeado = Math.floor((1 - distanciaDoCentro) * 15);
            const valorFrequencia = dataArray[Math.max(0, Math.min(indiceMapeado, bufferLength - 1))];
            
            const fatorCurvaTopo = 0.25 + (Math.pow(distanciaDoCentro, 2) * 0.75); 
            const alturaMaximaBarra = canvas.height * fatorCurvaTopo;
            const alturaAtual = 8 + (valorFrequencia / 255) * alturaMaximaBarra;

            const xBarra = i * (larguraBarra + espacamentoBarras);
            const tamanhoSegmento = 3; 
            const espacamentoVertical = 1.5; 
            const totalSegmentos = Math.floor(alturaAtual / (tamanhoSegmento + espacamentoVertical));

            for (let j = 0; j < totalSegmentos; j++) {
                const alturaDoBlocoAtual = j * (tamanhoSegmento + espacamentoVertical);
                if (alturaDoBlocoAtual > alturaMaximaBarra) break;

                const porcentagemAltura = alturaDoBlocoAtual / alturaMaximaBarra;

                if (porcentagemAltura < 0.60) {
                    canvasCtx.fillStyle = '#00f2fe'; 
                } else if (porcentagemAltura >= 0.60 && porcentagemAltura < 0.90) {
                    canvasCtx.fillStyle = '#f1c40f'; 
                } else {
                    canvasCtx.fillStyle = '#ff3838'; 
                }

                const yBloco = yBaseReto - alturaDoBlocoAtual;
                canvasCtx.fillRect(xBarra, yBloco - tamanhoSegmento, larguraBarra, tamanhoSegmento);
            }
        }
    }
});

// ==========================================
// CAPTURA E EXIBIÇÃO DO POPUP DE INSTALAÇÃO
// ==========================================
let eventoInstalacao = null;

window.addEventListener('beforeinstallprompt', (e) => {
    // Impede que o navegador mostre aquela barra padrão feia lá embaixo
    e.preventDefault();
    // Salva o evento para usarmos quando o usuário clicar no botão
    eventoInstalacao = e;

    // Checa se o usuário já recusou a instalação nas últimas 24 horas
    const ultimaRecusa = localStorage.getItem('mixplayer_recusa_instalacao');
    const agora = Date.now();
    const umDiaEmMilissegundos = 24 * 60 * 60 * 1000;

    if (!ultimaRecusa || (agora - ultimaRecusa > umDiaEmMilissegundos)) {
        exibirModalInstalacao();
    }
});

function exibirModalInstalacao() {
    const modalInstalar = document.getElementById('modal-instalacao');
    const btnInstalar = document.getElementById('btn-instalar-app');
    const btnDepoisInstalar = document.getElementById('btn-instalar-depois');

    if (modalInstalar && btnInstalar && btnDepoisInstalar) {
        modalInstalar.style.display = 'flex';

        // Clique no botão "Instalar Agora"
        btnInstalar.onclick = () => {
            modalInstalar.style.display = 'none';
            if (eventoInstalacao) {
                // Dispara o prompt oficial do sistema (Android/Chrome)
                eventoInstalacao.prompt();
                eventoInstalacao.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('Usuário aceitou instalar o MixPlayer!');
                    }
                    eventoInstalacao = null;
                });
            }
        };

        // Clique no botão "Agora não"
        btnDepoisInstalar.onclick = () => {
            modalInstalar.style.display = 'none';
            // Salva o momento para ocultar por 24 horas
            localStorage.setItem('mixplayer_recusa_instalacao', Date.now());
        };
    }
}
