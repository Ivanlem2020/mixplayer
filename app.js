window.addEventListener('DOMContentLoaded', () => {

    let audioCtx = null;
    let audioHtml = null; 
    let sourceNode = null; 
    let gainNode = null;
    let bassFilter = null;
    let trebleFilter = null; 
    let volumeInicial = 1;
    let bassInicial = 0;
    let trebleInicial = 0; 

    let analyserNode = null;
    const canvas = document.getElementById('audio-visualizer');
    let canvasCtx = canvas ? canvas.getContext('2d') : null;
    let animationFrameId = null;

    let biblioteca = { "Todas as Músicas": [] };
    let pastaAtual = "Todas as Músicas";
    let indiceMusicaAtual = -1;
    let urlMusicaAtual = null; 
    let musicaSelecionadaParaPlaylist = null;

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

    // Elementos das novas Abas
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

    async function carregarBibliotecaDoBanco() {
        try {
            if (trackTitleUi) trackTitleUi.textContent = "Carregando biblioteca...";
            if (typeof localforage !== 'undefined') {
                const dadosSalvos = await localforage.getItem('mixplayer_biblioteca');
                if (dadosSalvos) {
                    biblioteca = dadosSalvos;
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            if (trackTitleUi) trackTitleUi.textContent = "Sem arquivos na agulha";
            renderizarPastas();
            renderizarPlaylist();
        }
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

    carregarBibliotecaDoBanco();

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
                
                // CORREÇÃO: Ajuda a manter a prioridade do áudio em segundo plano
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

                bassFilter = audioCtx.createBiquadFilter();
                bassFilter.type = 'lowshelf';
                bassFilter.frequency.setValueAtTime(200, audioCtx.currentTime);
                bassFilter.gain.setValueAtTime(bassInicial, audioCtx.currentTime);

                trebleFilter = audioCtx.createBiquadFilter();
                trebleFilter.type = 'highshelf';
                trebleFilter.frequency.setValueAtTime(4000, audioCtx.currentTime); 
                trebleFilter.gain.setValueAtTime(trebleInicial, audioCtx.currentTime);

                analyserNode = audioCtx.createAnalyser();
                analyserNode.fftSize = 64; 

                sourceNode.connect(bassFilter);
                bassFilter.connect(trebleFilter);
                trebleFilter.connect(analyserNode);
                analyserNode.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                // Quando a música terminar, pula para a próxima imediatamente
                audioHtml.onended = () => {
                    pularMusica(1);
                };

                ajustarTamanhoCanvas();
                desenharVisualizer();
            } catch (e) { console.error(e); }
        } else {
            // CORREÇÃO CRÍTICA: Se o telemóvel suspendeu o áudio com a tela bloqueada, força ele a acordar
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
            if (trackTitleUi) trackTitleUi.textContent = "Carregando faixas...";
            for (let file of files) {
                if (file.name.toLowerCase().endsWith('.zip')) { 
                    await carregarZip(file); 
                } else if (file.name.toLowerCase().endsWith('.mp3')) { 
                    adicionarAoBanco("Pasta Raiz", file.name, file); 
                }
            }
            if (trackTitleUi) trackTitleUi.textContent = "Músicas prontas!";
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

    function adicionarAoBanco(pasta, nomeMusica, fileOrBlob) {
        if (!biblioteca[pasta]) biblioteca[pasta] = [];
        if (!biblioteca[pasta].some(m => m.name === nomeMusica)) biblioteca[pasta].push({ name: nomeMusica, data: fileOrBlob });
        if (!biblioteca["Todas as Músicas"].some(m => m.name === nomeMusica)) biblioteca["Todas as Músicas"].push({ name: nomeMusica, data: fileOrBlob });
        salvarBibliotecaNoBanco(); 
    }

    function renderizarPastas() {
        if (!folderContainer) return;
        folderContainer.innerHTML = '';
        Object.keys(biblioteca).forEach(nomePasta => {
            if (biblioteca[nomePasta].length === 0 && nomePasta !== "Todas as Músicas") return;
            
            const div = document.createElement('div');
            div.className = `list-row ${pastaAtual === nomePasta ? 'active' : ''}`;
            
            const clickArea = document.createElement('div');
            clickArea.className = 'row-clickable-area';
            clickArea.style.display = 'flex';
            clickArea.style.alignItems = 'center';
            clickArea.style.flex = '1';
            clickArea.innerHTML = `<i class="fa-solid ${nomePasta === 'Todas as Músicas' || nomePasta === 'Pasta Raiz' ? 'fa-folder-open' : 'fa-list-ul'}" style="margin-right:8px;"></i> <span>${nomePasta} (${biblioteca[nomePasta].length})</span>`;
            
            clickArea.onclick = () => {
                pastaAtual = nomePasta;
                indiceMusicaAtual = -1;
                if (folderTitleUi) folderTitleUi.textContent = pastaAtual;
                renderizarPastas();
                renderizarPlaylist();
                
                if (tabShowSongs) tabShowSongs.click();
            };
            div.appendChild(clickArea);

            if (nomePasta !== "Todas as Músicas" && nomePasta !== "Pasta Raiz") {
                const deletePlaylistBtn = document.createElement('button');
                deletePlaylistBtn.className = 'mini-action-btn';
                deletePlaylistBtn.innerHTML = `<i class="fa-solid fa-trash" style="color: #ff5e62;"></i>`;
                deletePlaylistBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`Excluir a playlist "${nomePasta}"?`)) {
                        delete biblioteca[nomePasta];
                        pastaAtual = "Todas as Músicas";
                        if (folderTitleUi) folderTitleUi.textContent = pastaAtual;
                        renderizarPastas();
                        renderizarPlaylist();
                        salvarBibliotecaNoBanco();
                    }
                };
                div.appendChild(deletePlaylistBtn);
            }

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

            if (pastaAtual !== "Todas as Músicas" && pastaAtual !== "Pasta Raiz") {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'mini-action-btn';
                deleteBtn.innerHTML = `<i class="fa-solid fa-xmark" style="color: #747d8c;"></i>`;
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    removerMusicaDaPlaylist(pastaAtual, index);
                };
                div.appendChild(deleteBtn);
            } else {
                const addBtn = document.createElement('button');
                addBtn.className = 'mini-action-btn';
                addBtn.innerHTML = `<i class="fa-solid fa-circle-plus"></i>`;
                addBtn.onclick = (e) => {
                    e.stopPropagation();
                    abrirModalPlaylists(musica);
                };
                div.appendChild(addBtn);
            }
            playlistContainer.appendChild(div);
        });
    }

    function abrirModalPlaylists(musica) {
        musicaSelecionadaParaPlaylist = musica;
        if (modalTrackName) modalTrackName.textContent = musica.name;
        if (modalPlaylistsOptions) modalPlaylistsOptions.innerHTML = '';
        const playlistsDisponiveis = Object.keys(biblioteca).filter(p => p !== "Todas as Músicas" && p !== "Pasta Raiz");

        if (playlistsDisponiveis.length === 0) {
            if (modalPlaylistsOptions) modalPlaylistsOptions.innerHTML = '<div style="padding:15px; font-size:0.8rem; color:#747d8c;">Crie uma playlist no botão (+) das abas.</div>';
        } else {
            playlistsDisponiveis.forEach(nomePlaylist => {
                const row = document.createElement('div');
                row.className = 'modal-option-row';
                row.innerHTML = `<i class="fa-solid fa-list-ul" style="color:#ff5e62; margin-right:10px;"></i> ${nomePlaylist}`;
                row.onclick = () => injetarMusicaNaPlaylist(nomePlaylist);
                if (modalPlaylistsOptions) modalPlaylistsOptions.appendChild(row);
            });
        }
        if (playlistModal) playlistModal.classList.add('open');
    }

    function injetarMusicaNaPlaylist(nomePlaylist) {
        if (!musicaSelecionadaParaPlaylist) return;
        if (biblioteca[nomePlaylist].some(m => m.name === musicaSelecionadaParaPlaylist.name)) {
            alert("A música já está nesta playlist!");
        } else {
            biblioteca[nomePlaylist].push(musicaSelecionadaParaPlaylist);
            renderizarPastas();
            salvarBibliotecaNoBanco();
        }
        fecharModalPlaylists();
    }

    function fecharModalPlaylists() {
        if (playlistModal) playlistModal.classList.remove('open');
        musicaSelecionadaParaPlaylist = null;
    }
    if (closeModalBtn) closeModalBtn.addEventListener('click', fecharModalPlaylists);

    if (addPlaylistBtn) {
        addPlaylistBtn.addEventListener('click', () => {
            if (newPlaylistInput) newPlaylistInput.value = '';
            if (newPlaylistModal) newPlaylistModal.classList.add('open');
        });
    }
    if (cancelNewPlaylistBtn) {
        cancelNewPlaylistBtn.addEventListener('click', () => {
            if (newPlaylistModal) newPlaylistModal.classList.remove('open');
        });
    }
    if (saveNewPlaylistBtn) {
        saveNewPlaylistBtn.addEventListener('click', () => {
            if (!newPlaylistInput) return;
            const nomeNovaPlaylist = newPlaylistInput.value.trim();
            if (nomeNovaPlaylist === "") return;
            if (biblioteca[nomeNovaPlaylist]) {
                alert("Essa playlist já existe!");
                return;
            }
            biblioteca[nomeNovaPlaylist] = [];
            renderizarPastas();
            salvarBibliotecaNoBanco();
            if (newPlaylistModal) newPlaylistModal.classList.remove('open');
        });
    }

    function removerMusicaDaPlaylist(nomePlaylist, indexMusica) {
        biblioteca[nomePlaylist].splice(indexMusica, 1);
        renderizarPlaylist();
        renderizarPastas();
        salvarBibliotecaNoBanco();
    }

        function prepararEMandarPlay(index) {
        // Força a ativação ou o despertar do motor de áudio antes de carregar o arquivo
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
                audioHtml.load(); // Força o carregamento imediato do arquivo na memória do sistema
            }
        }
        
        if (progressSlider) progressSlider.value = 0;
        renderizarPlaylist();
        
        // Dá o play com o sistema de áudio reativado
        play();
    }


    function play() {
        inicializarAudio();
        if (!audioHtml) return;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        audioHtml.play().then(() => {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        }).catch(() => {});
        if (playPauseBtn) playPauseBtn.innerHTML = `<i class="fa-solid fa-pause"></i>`;
    }

    function pause() {
        if (!audioHtml) return;
        audioHtml.pause();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
        if (playPauseBtn) playPauseBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
    }

    function pularMusica(direcao) {
        const musicas = biblioteca[pastaAtual];
        if (!musicas || musicas.length === 0) return;
        let novoIndice = indiceMusicaAtual + direcao;
        if (novoIndice >= musicas.length) novoIndice = 0;
        if (novoIndice < 0) novoIndice = musicas.length - 1;
        prepararEMandarPlay(novoIndice);
    }

    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            if (indiceMusicaAtual === -1 && biblioteca[pastaAtual].length > 0) { prepararEMandarPlay(0); } 
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
        // Ajusta o canvas para ocupar toda a área do container do disco
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    }

        function desenharVisualizer() {
        animationFrameId = requestAnimationFrame(desenharVisualizer);
        if (!analyserNode || !canvasCtx || !canvas) return;

        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserNode.getByteFrequencyData(dataArray);

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

        const quantidadeBarras = 34; // Aumentado ligeiramente para fechar bem os cantos
        
        // CORREÇÃO: Calcula a largura exata de cada barra para dividir o espaço total do canvas sem deixar sobras nas pontas
        const espacamentoBarras = 1.5; 
        const larguraBarra = (canvas.width - (espacamentoBarras * (quantidadeBarras - 1))) / quantidadeBarras;

        // CORREÇÃO: O chão agora é 100% o limite inferior do Canvas (colado na borda de baixo)
        const yBaseReto = canvas.height; 

        for (let i = 0; i < quantidadeBarras; i++) {
            // Distância em relação ao centro (0 no meio, 1 nas pontas/laterais)
            const metade = (quantidadeBarras - 1) / 2;
            const distanciaDoCentro = Math.abs(i - metade) / metade; 

            // Mapeamento do som: Graves fortes nas pontas, médios/agudos no centro
            const indiceMapeado = Math.floor((1 - distanciaDoCentro) * 15);
            const valorFrequencia = dataArray[Math.max(0, Math.min(indiceMapeado, bufferLength - 1))];
            
            // CORREÇÃO: As laterais agora ganham teto total (1.0) para irem até o topo exato do canvas
            const fatorCurvaTopo = 0.25 + (Math.pow(distanciaDoCentro, 2) * 0.75); 
            const alturaMaximaBarra = canvas.height * fatorCurvaTopo;
            
            // Altura atual baseada no volume do som (mínimo de 8px para manter os cantos acesos no chão)
            const alturaAtual = 8 + (valorFrequencia / 255) * alturaMaximaBarra;

            // Posição X de cada coluna começando exatamente no pixel 0 da esquerda
            const xBarra = i * (larguraBarra + espacamentoBarras);

            // CONSTANTES DOS BLOQUINHOS (Segmentação)
            const tamanhoSegmento = 3; 
            const espacamentoVertical = 1.5; 
            const totalSegmentos = Math.floor(alturaAtual / (tamanhoSegmento + espacamentoVertical));

            // Desenha a coluna subindo bloco por bloco a partir da base colada embaixo
            for (let j = 0; j < totalSegmentos; j++) {
                const alturaDoBlocoAtual = j * (tamanhoSegmento + espacamentoVertical);
                
                // Evita que os blocos ultrapassem o teto máximo permitido para aquela barra
                if (alturaDoBlocoAtual > alturaMaximaBarra) break;

                const porcentagemAltura = alturaDoBlocoAtual / alturaMaximaBarra;

                // Escala de cores: 60% Azul, 30% Amarelo, 10% Vermelho
                if (porcentagemAltura < 0.60) {
                    canvasCtx.fillStyle = '#00f2fe'; 
                } else if (porcentagemAltura >= 0.60 && porcentagemAltura < 0.90) {
                    canvasCtx.fillStyle = '#f1c40f'; 
                } else {
                    canvasCtx.fillStyle = '#ff3838'; 
                }

                const yBloco = yBaseReto - alturaDoBlocoAtual;

                // Desenha o quadradinho do LED
                canvasCtx.fillRect(xBarra, yBloco - tamanhoSegmento, larguraBarra, tamanhoSegmento);
            }
        }
    }

});
