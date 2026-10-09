(function (global) {
    'use strict';

    class VoskSpeechClient {
        constructor(options) {
            this.url = options.url;
            this.phraseList = options.phraseList;
            this.onStatus = options.onStatus || function () {};
            this.onFinal = options.onFinal || function () {};
            this.socket = null;
            this.stream = null;
            this.context = null;
            this.source = null;
            this.processor = null;
            this.silentGain = null;
            this.stopped = false;
            this.configured = false;
        }

        async start() {
            this.stopped = false;
            this.onStatus('starting');
            try {
                await this.connect();
            } catch (error) {
                this.cleanup();
                this.onStatus('unavailable');
                throw error;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (this.stopped) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                this.stream = stream;
            } catch (error) {
                this.cleanup();
                this.onStatus(error && error.name === 'NotAllowedError' ? 'permission' : 'error');
                throw error;
            }

            try {
                if (this.stopped) return;
                const AudioContextClass = global.AudioContext || global.webkitAudioContext;
                if (!AudioContextClass) throw new Error('Web Audio is not supported');
                this.context = new AudioContextClass();
                await this.context.resume();
                this.source = this.context.createMediaStreamSource(this.stream);
                this.processor = this.context.createScriptProcessor(4096, 1, 1);
                this.silentGain = this.context.createGain();
                this.silentGain.gain.value = 0;
                this.processor.onaudioprocess = event => this.sendAudio(event.inputBuffer.getChannelData(0));
                this.source.connect(this.processor);
                this.processor.connect(this.silentGain);
                this.silentGain.connect(this.context.destination);
                this.onStatus('listening');
            } catch (error) {
                this.cleanup();
                this.onStatus('unavailable');
                throw error;
            }
        }

        connect() {
            return new Promise((resolve, reject) => {
                const socket = new WebSocket(this.url);
                this.socket = socket;
                socket.binaryType = 'arraybuffer';
                socket.onopen = () => {
                    if (this.stopped) {
                        socket.close();
                        reject(new Error('Voice was stopped before connecting'));
                        return;
                    }
                    socket.send(JSON.stringify({
                        config: {
                            sample_rate: 16000,
                            phrase_list: this.phraseList
                        }
                    }));
                    this.configured = true;
                    resolve();
                };
                socket.onmessage = event => this.handleMessage(event.data);
                socket.onerror = () => {
                    if (!this.configured) reject(new Error('Could not connect to the local Vosk service'));
                };
                socket.onclose = () => {
                    if (!this.stopped) {
                        this.cleanup();
                        this.onStatus('unavailable');
                    }
                };
            });
        }

        handleMessage(data) {
            let result;
            try {
                result = JSON.parse(data);
            } catch (error) {
                return;
            }
            if (typeof result.text === 'string' && result.text.trim()) {
                this.onFinal(result.text.trim());
            }
        }

        sendAudio(input) {
            if (!this.configured || !this.socket || this.socket.readyState !== WebSocket.OPEN
                || this.socket.bufferedAmount > 65536) return;
            const ratio = this.context.sampleRate / 16000;
            const length = Math.floor(input.length / ratio);
            if (!length) return;
            const pcm = new Int16Array(length);
            for (let i = 0; i < length; i += 1) {
                const first = Math.floor(i * ratio);
                const last = Math.min(input.length, Math.floor((i + 1) * ratio));
                let sum = 0;
                for (let j = first; j < last; j += 1) sum += input[j];
                const sample = Math.max(-1, Math.min(1, sum / Math.max(1, last - first)));
                pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
            }
            this.socket.send(pcm.buffer);
        }

        stop() {
            if (this.stopped) return;
            this.stopped = true;
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                try { this.socket.send('{"eof" : 1}'); } catch (error) {}
            }
            this.cleanup();
            this.onStatus('stopped');
        }

        cleanup() {
            if (this.processor) {
                this.processor.onaudioprocess = null;
                try { this.processor.disconnect(); } catch (error) {}
                this.processor = null;
            }
            if (this.source) {
                try { this.source.disconnect(); } catch (error) {}
                this.source = null;
            }
            if (this.silentGain) {
                try { this.silentGain.disconnect(); } catch (error) {}
                this.silentGain = null;
            }
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            if (this.context) {
                this.context.close().catch(function () {});
                this.context = null;
            }
            if (this.socket) {
                const socket = this.socket;
                this.socket = null;
                if (socket.readyState < WebSocket.CLOSING) socket.close();
            }
            this.configured = false;
        }
    }

    global.VoskSpeechClient = VoskSpeechClient;
}(window));
