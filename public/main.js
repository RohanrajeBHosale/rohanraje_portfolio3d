document.addEventListener('DOMContentLoaded', () => {
    // --- Global Variables & DOM Elements ---
    let scene, camera, renderer, controls, avatar, skillNodes = {};
    const loader = document.getElementById('loader');
    const chatbotFab = document.getElementById('chatbot-fab');
    const chatWindow = document.getElementById('chat-window');
    const closeBtn = document.getElementById('chat-close-btn');
    const chatInputArea = document.getElementById('chat-input-area');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const micBtn = document.getElementById('mic-btn');
    const stopBtn = document.getElementById('stop-btn');
    const chatMessages = document.getElementById('chat-messages');

    let currentAudio = null;
    let chatHistory = [];
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = SpeechRecognition ? new SpeechRecognition() : null;

    // --- Initialization ---
    function init() {
        init3D();
        initChat();
        window.addEventListener('load', () => {
            loader.classList.add('hidden');
        });
    }

    // --- 3D Scene Logic ---
    function init3D() {
        // Scene & Camera
        scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x0c0c0e, 50, 150);
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 5, 30);

        // Renderer
        renderer = new THREE.WebGLRenderer({
            canvas: document.querySelector('#scene-canvas'),
            antialias: true,
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);

        // Controls
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.minDistance = 10;
        controls.maxDistance = 80;
        controls.target.set(0, 2, 0);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7);
        scene.add(ambientLight, directionalLight);

        // Main Avatar
        const avatarGeometry = new THREE.IcosahedronGeometry(4, 1);
        const avatarMaterial = new THREE.MeshStandardMaterial({
            color: 0x007aff,
            metalness: 0.6,
            roughness: 0.3,
        });
        avatar = new THREE.Mesh(avatarGeometry, avatarMaterial);
        avatar.position.y = 2;
        scene.add(avatar);

        // Create placeholder nodes for skills
        const skills = {
            'Python': { color: 0x306998, position: new THREE.Vector3(-15, 5, -10) },
            'AWS': { color: 0xFF9900, position: new THREE.Vector3(15, 10, -5) },
            'RAG': { color: 0x8A2BE2, position: new THREE.Vector3(10, -5, -15) },
            'ROHbot': { color: 0xde3163, position: new THREE.Vector3(-10, -8, -8) }
        };

        for (const [name, data] of Object.entries(skills)) {
            const nodeGeo = new THREE.SphereGeometry(1.5, 32, 32);
            const nodeMat = new THREE.MeshStandardMaterial({ color: data.color, metalness: 0.5, roughness: 0.5 });
            const node = new THREE.Mesh(nodeGeo, nodeMat);
            node.position.copy(data.position);
            scene.add(node);
            skillNodes[name] = node;
        }

        animate();
    }

    function animate() {
        requestAnimationFrame(animate);
        TWEEN.update();
        controls.update();
        avatar.rotation.y += 0.001;
        renderer.render(scene, camera);
    }

    // --- Chat UI & AI Logic ---
    function initChat() {
        chatbotFab.addEventListener('click', () => { chatWindow.style.display = 'flex'; });
        closeBtn.addEventListener('click', () => { chatWindow.style.display = 'none'; stopBotSpeaking(); });
        sendBtn.addEventListener('click', handleUserInput);
        chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserInput(); });
        chatInput.addEventListener('input', () => { sendBtn.classList.toggle('hidden', chatInput.value.length === 0); });
        stopBtn.addEventListener('click', stopBotSpeaking);

        if (recognition) {
            micBtn.addEventListener('click', toggleMic);
            recognition.onresult = (e) => {
                chatInput.value = e.results[0][0].transcript;
                sendBtn.classList.remove('hidden');
                handleUserInput();
            };
            recognition.onstart = () => micBtn.classList.add('listening');
            recognition.onend = () => micBtn.classList.remove('listening');
        } else {
            micBtn.style.display = 'none';
        }
    }

    function handleUserInput() {
        const userText = chatInput.value.trim();
        if (!userText) return;
        addUserMessage(userText);
        chatInput.value = '';
        sendBtn.classList.add('hidden');
        getBotResponse(userText);
    }

    async function getBotResponse(userText) {
        let fullReply = "";
        let sourcesForAnimation = [];
        const botMsgElement = addBotMessage(""); // Add empty bot message bubble

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userInput: userText, history: chatHistory })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n\n');
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const data = JSON.parse(line.substring(5));
                        if (data.type === 'text_chunk') {
                            fullReply += data.content;
                            botMsgElement.innerHTML = fullReply + '<span class="blinking-cursor">▋</span>';
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        } else if (data.type === 'metadata') {
                            sourcesForAnimation = data.sources;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching bot response:', error);
            fullReply = "Sorry, I'm having trouble connecting to my core systems right now.";
        }

        botMsgElement.innerHTML = fullReply;
        chatHistory.push({ role: 'user', parts: [{ text: userText }] });
        chatHistory.push({ role: 'model', parts: [{ text: fullReply }] });
        speakText(fullReply);
        trigger3DAnimation(sourcesForAnimation);
    }

    function trigger3DAnimation(sources) {
        // Reset all nodes first
        Object.values(skillNodes).forEach(node => {
            new TWEEN.Tween(node.scale).to({ x: 1, y: 1, z: 1 }, 300).start();
        });

        if (!sources || sources.length === 0) return;

        const sourceName = sources[0].source_name; // Animate the first relevant source
        if (skillNodes[sourceName]) {
            const node = skillNodes[sourceName];
            new TWEEN.Tween(node.scale).to({ x: 1.5, y: 1.5, z: 1.5 }, 500).easing(TWEEN.Easing.Elastic.Out).start();
            new TWEEN.Tween(camera.position).to(node.position.clone().add(new THREE.Vector3(0, 0, 15)), 1000).easing(TWEEN.Easing.Quadratic.InOut).start();
        }
    }

    // --- UI & Speech Helper Functions ---
    function addUserMessage(text) {
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message user';
        msgEl.textContent = text;
        chatMessages.appendChild(msgEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addBotMessage(text) {
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message bot';
        msgEl.innerHTML = text + '<span class="blinking-cursor">▋</span>';
        chatMessages.appendChild(msgEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return msgEl;
    }

    function speakText(text) {
        stopBotSpeaking();
        chatInputArea.classList.add('bot-speaking');
        stopBtn.classList.remove('hidden');
        micBtn.classList.add('hidden');
        sendBtn.classList.add('hidden');

        fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        })
            .then(response => response.blob())
            .then(audioBlob => {
                const audioUrl = URL.createObjectURL(audioBlob);
                currentAudio = new Audio(audioUrl);
                currentAudio.play();
                currentAudio.onended = () => stopBotSpeaking();
            })
            .catch(error => {
                console.error('TTS error:', error);
                stopBotSpeaking();
            });
    }

    function stopBotSpeaking() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        stopBtn.classList.add('hidden');
        micBtn.classList.remove('hidden');
    }

    function toggleMic() {
        if (micBtn.classList.contains('listening')) {
            recognition.stop();
        } else {
            recognition.start();
        }
    }

    window.addEventListener('resize', () => {