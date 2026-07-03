// Estado Global da Aplicação
let audioCtx = null;
let audioHtml = null; 
let sourceNode = null; 

// Nós de Efeito do Mixer (Equalizador 3 Bandas)
let gainNode = null;
let bassFilter = null;
let trebleFilter = null; 
let volumeInicial = 1;
let bassInicial = 0;
let trebleInicial = 0; 

// Variáveis do Visualizador de Áudio
let analyserNode = null;
const canvas = document.getElementById('audio-visualizer');
let canvasCtx = null;
if (canvas) canvasCtx = canvas.getContext('2d');
let animationFrameId = null;

// Banco de Dados em Memória
let biblioteca = { "Todas as Músicas": [] };
let pastaAtual = "Todas as Músicas";
let indiceMusicaAtual = -1;
let urlMusicaAtual = null; 
let musicaSelecionadaParaPlaylist = null;

// Elementos do DOM - Player
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

// Elementos do DOM - Navegação
const pagePlayer = document.getElementById('page-player');
const pageMixer = document.getElementById('page-mixer');
const toggleMixerBtn = document.getElementById('toggle-mixer-btn');
const backToPlayerBtn = document.getElementById('back-to-player-btn');
const addPlaylistBtn = document.getElementById('add-playlist-btn');
const syncFolderBtn = document.getElementById('sync-folder-btn');

// Modais Customizados
const playlistModal = document.getElementById('playlist-modal');
const modalTrackName = document.getElementById('modal-track-name');
const modalPlaylistsOptions = document.getElementById('modal-playlists-options');
const closeModalBtn = document.getElementById('close-modal-btn');
const newPlaylistModal = document.getElementById('new-playlist-modal');
const newPlaylistInput = document.getElementById('new-playlist-input');
const cancelNewPlaylistBtn = document.getElementById('cancel-new-playlist-btn');
const saveNewPlaylistBtn = document.getElementById('save-new-playlist-btn');

function alternarTela(irParaMixer) {
    if (irParaMixer) {
        pagePlayer.classList.remove('active');
        pageMixer.classList.add('active');
        toggleMixerBtn.classList.add('active-tab');
    } else {
        pageMixer.classList.remove('active');
        pagePlayer.classList.add('active');
        toggleMixerBtn.classList.remove('active-tab');
        if (audioCtx) ajustarTamanhoCanvas();
    }
}
if (toggleMixerBtn) toggleMixerBtn.addEventListener('click', () => alternarTela(!pageMixer.classList.contains('active')));
if (backToPlayerBtn) backToPlayerBtn.addEventListener('click', () => alternarTela(false));

// Inicializa o motor de áudio
function inicializarAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioHtml = new Audio();
            
            // CRÍTICO PARA SEGUNDO PLANO NO MOBILE
            audioHtml.preload = 'auto';
            audioHtml.controls = false;
            
            audioHtml.addEventListener('timeupdate', () => {
                if (!userChangingProgress) atualizarProgresso();
                // Atualiza a posição da barra nativa do sistema em segundo plano
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

            audioHtml.onended = () => pularMusica(1);

            ajustarTamanhoCanvas();
            desenharVisualizer();
        } catch (e) { console.error("Erro no motor de áudio: ", e); }
    }
}

// CONFIGURAÇÃO DA MEDIA SESSION (Controle em Segundo Plano e Tela de Bloqueio)
function configurarMediaSession() {
    if ('mediaSession' in navigator && audioHtml) {
        const musicas = biblioteca[pastaAtual];
        if (!musicas || indiceMusicaAtual === -1) return;
        const musica = musicas[indiceMusicaAtual];

        // Injeta os dados da música no player do Android/iOS
        navigator.mediaSession.metadata = new MediaMetadata({
            title: musica.name.replace('.mp3', ''),
            artist: 'MixPlayer App',
            album: pastaAtual,
            artwork: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        // Vincula os botões físicos e da tela de bloqueio do celular ao app
        navigator.mediaSession.setActionHandler('play', () => play());
        navigator.mediaSession.setActionHandler('pause', () => pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => pularMusica(-1));
        navigator.mediaSession.setActionHandler('nexttrack', () => pularMusica(1));
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.fastSeek && 'fastSeek' in audioHtml) {
                audioHtml.fastSeek(details.seekTime);
                return;
            }
            audioHtml.currentTime = details.seekTime;
        });
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
        } catch (e) { /* Evita falhas caso os valores flutuem rapidamente */ }
    }
}

// Ouvintes dos Sliders do Mixer
if (document.getElementById('gain-slider')) {
    document.getElementById('gain-slider').addEventListener('input', (e) => {
        volumeInicial = parseFloat(e.target.value);
        if (document.getElementById('vol-lbl')) document.getElementById('vol-lbl').textContent = `${Math.round(volumeInicial * 100)}%`;
        if (gainNode && audioCtx) gainNode.gain.setValueAtTime(volumeInicial, audioCtx.currentTime);
    });
}
if (document.getElementById('bass-slider')) {
    document.getElementById('bass-slider').addEventListener('input', (e) => {
        bassInicial = parseFloat(e.target.value);
        if (document.getElementById('bass-lbl')) document.getElementById('bass-lbl').textContent = `${bassInicial} dB`;
        if (bassFilter && audioCtx) bassFilter.gain.setValueAtTime(bassInicial, audioCtx.currentTime);
    });
}
if (document.getElementById('treble-slider')) {
    document.getElementById('treble-slider').addEventListener('input', (e) => {
        trebleInicial = parseFloat(e.target.value);
        if (document.getElementById('treble-lbl')) document.getElementById('treble-lbl').textContent = `${trebleInicial} dB`;
        if (trebleFilter && audioCtx) trebleFilter.gain.setValueAtTime(trebleInicial, audioCtx.currentTime);
    });
}

// Manipulação Manual de Arquivos e ZIPs
if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files.length) return;
        if (trackTitleUi) trackTitleUi.textContent = "Carregando faixas...";
        for (let file of files) {
            if (file.name.toLowerCase().endsWith('.zip')) { await carregarZip(file); } 
            else if (file.name.toLowerCase().endsWith('.mp3')) { adicionarAoBanco("Pasta Raiz", file.name, file); }
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
    } catch (f) { console.error("Erro no ZIP:", f); }
}

if (syncFolderBtn) {
    syncFolderBtn.addEventListener('click', async () => {
        if ('showDirectoryPicker' in window) {
            try {
                if (trackTitleUi) trackTitleUi.textContent = "Aguardando seleção de pasta...";
                const directoryHandle = await window.showDirectoryPicker();
                if (trackTitleUi) trackTitleUi.textContent = "Varrendo músicas...";
                const nomePastaOrigem = directoryHandle.name;
                
                for await (const entry of directoryHandle.values()) {
                    if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.mp3')) {
                        const file = await entry.getFile();
                        adicionarAoBanco(nomePastaOrigem, file.name, file);
                    }
                }
                if (trackTitleUi) trackTitleUi.textContent = "Sincronização concluída!";
                renderizarPastas();
                renderizarPlaylist();
            } catch (err) { if (trackTitleUi) trackTitleUi.textContent = "Sincronização cancelada."; }
        } else { alert("Navegador incompatível com varredura de diretório."); }
    });
}

function adicionarAoBanco(pasta, nomeMusica, fileOrBlob) {
    if (!biblioteca[pasta]) biblioteca[pasta] = [];
    if (!biblioteca[pasta].some(m => m.name === nomeMusica)) biblioteca[pasta].push({ name: nomeMusica, data: fileOrBlob });
    if (!biblioteca["Todas as Músicas"].some(m => m.name === nomeMusica)) biblioteca["Todas as Músicas"].push({ name: nomeMusica, data: fileOrBlob });
}

function renderizarPastas() {
    if (!folderContainer) return;
    folderContainer.innerHTML = '';
    Object.keys(biblioteca).forEach(nomePasta => {
        if (biblioteca[nomePasta].length === 0 && nomePasta !== "Todas as Músicas") return;
        const div = document.createElement('div');
        div.className = `list-row ${pastaAtual === nomePasta ? 'active' : ''}`;
        div.innerHTML = `<i class="fa-solid fa-folder"></i> <span>${nomePasta} (${biblioteca[nomePasta].length})</span>`;
        div.onclick = () => {
            pastaAtual = nomePasta;
            indiceMusicaAtual = -1;
            renderizarPastas();
            renderizarPlaylist();
        };
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
            deleteBtn.innerHTML = `<i class="fa-solid fa-trash-can" style="color: #747d8c;"></i>`;
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
        modalPlaylistsOptions.innerHTML = '<div style="padding:15px; font-size:0.8rem; color:#747d8c;">Nenhuma playlist criada. Crie uma no botão (+) da tela principal.</div>';
    } else {
        playlistsDisponiveis.forEach(nomePlaylist => {
            const row = document.createElement('div');
            row.className = 'modal-option-row';
            row.innerHTML = `<i class="fa-solid fa-list-ul" style="color:#ff5e62; margin-right:10px;"></i> ${nomePlaylist}`;
            row.onclick = () => {
                injetarMusicaNaPlaylist(nomePlaylist);
            };
            modalPlaylistsOptions.appendChild(row);
        });
    }
    if (playlistModal) playlistModal.classList.add('open');
}

function injetarMusicaNaPlaylist(nomePlaylist) {
    if (!musicaSelecionadaParaPlaylist) return;
    if (biblioteca[nomePlaylist].some(m => m.name === musicaSelecionadaParaPlaylist.name)) {
        alert(`A música já está na playlist "${nomePlaylist}"!`);
    } else {
        biblioteca[nomePlaylist].push(musicaSelecionadaParaPlaylist);
        renderizarPastas();
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
        if (newPlaylistModal) newPlaylistModal.classList.remove('open');
    });
}

function removerMusicaDaPlaylist(nomePlaylist, indexMusica) {
    biblioteca[nomePlaylist].splice(indexMusica, 1);
    renderizarPlaylist();
    renderizarPastas();
}

function prepararEMandarPlay(index) {
    inicializarAudio();
    const musicas = biblioteca[pastaAtual];
    if (!musicas || index < 0 || index >= musicas.length) return;

    if (urlMusicaAtual) URL.revokeObjectURL(urlMusicaAtual);
    indiceMusicaAtual = index;
    const musica = musicas[indiceMusicaAtual];
    if (trackTitleUi) trackTitleUi.textContent = musica.name;
    if (folderTitleUi) folderTitleUi.textContent = `Origem: ${pastaAtual}`;

    if (musica.data) {
        urlMusicaAtual = URL.createObjectURL(musica.data);
        if (audioHtml) audioHtml.src = urlMusicaAtual;
    }
    if (progressSlider) progressSlider.value = 0;
    if (currentTimeUi) currentTimeUi.textContent = "0:00";
    renderizarPlaylist();
    play();
}

function play() {
    if (!audioHtml) return;
    inicializarAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    
    audioHtml.play()
        .then(() => {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        })
        .catch(e => console.log("Aguardando interação do usuário."));
        
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

    const quantidadeBarras = 16; 
    const larguraBarra = canvas.width / quantidadeBarras; 
    const espacamentoColunas = 2; 
    const alturaBlocoLed = 5; 
    const espacamentoBlocoLed = 2; 
    const metade = quantidadeBarras / 2;

    for (let i = 0; i < quantidadeBarras; i++) {
        let indiceData;
        if (i < metade) { indiceData = Math.floor((i / metade) * (bufferLength * 0.6)); } 
        else { let invertido = quantidadeBarras - 1 - i; indiceData = Math.floor((invertido / metade) * (bufferLength * 0.6)); }

        const valorFrequencia = dataArray[indiceData];
        const alturaBarraTotal = (valorFrequencia / 255) * canvas.height;
        const totalBlocos = Math.floor(alturaBarraTotal / (alturaBlocoLed + espacamentoBlocoLed));
        const x = i * larguraBarra;

        for (let j = 0; j < totalBlocos; j++) {
            const y = canvas.height - (j * (alturaBlocoLed + espacamentoBlocoLed));
            const alturaRelativa = j / (canvas.height / (alturaBlocoLed + espacamentoBlocoLed));
            let corLed = '#00d2ff';

            if (alturaRelativa > 0.35 && alturaRelativa <= 0.75) { corLed = '#00f2fe'; } 
            else if (alturaRelativa > 0.75) { corLed = '#ff5e62'; }

            canvasCtx.fillStyle = corLed;
            canvasCtx.fillRect(x + espacamentoColunas, y - alturaBlocoLed, larguraBarra - (espacamentoColunas * 2), alturaBlocoLed);
        }
    }
}

window.addEventListener('resize', () => { if (audioCtx) ajustarTamanhoCanvas(); });
renderizarPastas();
renderizarPlaylist();
