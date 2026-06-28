// Teachable Machine - Self-contained
(function() {
  if (typeof window.tmImage !== 'undefined') return;

  class Webcam {
    constructor(width = 640, height = 480, flip = true) {
      this.width = width;
      this.height = height;
      this.flip = flip;
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx = this.canvas.getContext('2d');
      this.video = null;
      this.isRunning = false;
    }
    
    async setup() {
      this.video = document.createElement('video');
      this.video.width = this.width;
      this.video.height = this.height;
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.muted = true;
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: this.width }, height: { ideal: this.height } } 
      });
      this.video.srcObject = stream;
      
      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          this.isRunning = true;
          this._drawLoop();
          resolve();
        };
      });
    }
    
    _drawLoop() {
      if (!this.isRunning || !this.video) return;
      if (this.video.readyState >= 2) {
        if (this.flip) {
          this.ctx.save();
          this.ctx.translate(this.width, 0);
          this.ctx.scale(-1, 1);
          this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
          this.ctx.restore();
        } else {
          this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
        }
      }
      requestAnimationFrame(() => this._drawLoop());
    }
    
    async play() {
      if (this.video) {
        await this.video.play();
        this.isRunning = true;
      }
    }
    
    stop() {
      this.isRunning = false;
      if (this.video && this.video.srcObject) {
        this.video.srcObject.getTracks().forEach(track => track.stop());
        this.video.srcObject = null;
      }
    }
  }

  window.tmImage = {
    load: async function(modelURL, metadataURL) {
      console.log('📥 Loading model from:', modelURL);
      
      // Wait for tf
      let attempts = 0;
      while (typeof tf === 'undefined' && attempts < 30) {
        await new Promise(r => setTimeout(r, 300));
        attempts++;
      }
      
      if (typeof tf === 'undefined') {
        console.log('⏳ Loading TensorFlow.js...');
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tensorflow/4.10.0/tf.min.js';
        document.head.appendChild(script);
        await new Promise(r => setTimeout(r, 2000));
      }
      
      console.log('✅ TensorFlow.js loaded');
      
      // Load metadata
      const response = await fetch(metadataURL);
      const metadata = await response.json();
      const labels = metadata.labels || ['Hello', 'Stand'];
      
      console.log('📋 Labels:', labels);
      
      // FIX: Use loadLayersModel for this model format
      const model = await tf.loadLayersModel(modelURL);
      console.log('✅ Model loaded successfully!');
      
      return {
        predict: async function(image) {
          let tensor = tf.browser.fromPixels(image)
            .resizeNearestNeighbor([224, 224])
            .toFloat()
            .div(255.0)
            .expandDims(0);
          
          const prediction = await model.predict(tensor);
          const data = await prediction.data();
          
          const results = [];
          for (let i = 0; i < data.length && i < labels.length; i++) {
            results.push({
              className: labels[i],
              probability: data[i]
            });
          }
          
          tensor.dispose();
          prediction.dispose();
          
          return results;
        }
      };
    },
    Webcam: Webcam
  };

  console.log('✅ tmImage loaded from public folder!');
})();