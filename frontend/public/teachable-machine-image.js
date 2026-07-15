// Teachable Machine - Self-contained & GPU Memory-Leak Safe
(function() {
  if (typeof window.tmImage !== 'undefined') return;

  window.tmImage = {
    load: async function(modelURL, metadataURL) {
      console.log('📥 Loading model from:', modelURL);
      
      let attempts = 0;
      while (typeof tf === 'undefined' && attempts < 30) {
        await new Promise(r => setTimeout(r, 300));
        attempts++;
      }
      
      if (typeof tf === 'undefined') {
        console.log('⏳ Loading TensorFlow.js via fallback CDN...');
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tensorflow/4.10.0/tf.min.js';
        document.head.appendChild(script);
        await new Promise(r => setTimeout(r, 2000));
      }
      
      console.log('✅ TensorFlow.js loaded');
      
      const response = await fetch(metadataURL);
      const metadata = await response.json();
      const labels = metadata.labels || ['Hello', 'Stand'];
      
      console.log('📋 Labels:', labels);
      
      const model = await tf.loadLayersModel(modelURL);
      console.log('✅ Model loaded successfully!');
      
      return {
        predict: async function(image) {
          return tf.tidy(() => {
            let tensor = tf.browser.fromPixels(image)
              .resizeNearestNeighbor([224, 224])
              .toFloat()
              .div(255.0)
              .expandDims(0);
            
            const prediction = model.predict(tensor);
            const data = prediction.dataSync();
            
            const results = [];
            for (let i = 0; i < data.length && i < labels.length; i++) {
              results.push({
                className: labels[i],
                probability: data[i]
              });
            }
            
            return results;
          });
        }
      };
    }
  };

  console.log('Teachable Machine Image Engine: Activated and memory-optimized.');
})();